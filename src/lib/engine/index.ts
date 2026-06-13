/**
 * 照合エンジンのエントリポイント。
 * 流れ: プロンプト組み立て → Claude API → JSON解析 → zod検証 →（失敗なら1回だけリトライ）→ verdict確定。
 *
 * 失敗形式は勝手に緩めない。zod検証に2回失敗したら EngineError を投げる（CLAUDE.md 第5章）。
 */

import { checkResultSchema, type CheckResult, type Mode } from "./schema";
import { buildSystemPrompt, buildUserText, RETRY_INSTRUCTION } from "./prompt";
import { callClaude, type PdfInput } from "./claude";
import { finalizeCheckResult } from "./verdict";

export { ENGINE_MODEL } from "./claude";
export type { PdfInput } from "./claude";

export interface RunCheckInput {
  /** サーバー側で採番済みの check_id。AI出力の値は使わずこれで上書きする。 */
  checkId: string;
  mode: Mode;
  pdfs: PdfInput[];
  /** 事前モードの疑似申告フォーム入力値（事後モードでは null）。 */
  formInput?: Record<string, unknown> | null;
}

export interface RunCheckOutput {
  /** verdict・件数まで確定済みの照合結果。 */
  result: CheckResult;
  /** AIの生レスポンス本文（check_results に保存して監査・再現性を担保）。 */
  rawResponse: string;
  /** 使用モデルID。 */
  model: string;
}

/** zod検証に最終的に失敗した場合のエラー。 */
export class EngineError extends Error {
  constructor(message: string, readonly rawResponse: string) {
    super(message);
    this.name = "EngineError";
  }
}

/** コードフェンスや前後の余分なテキストを除去してJSON本体を取り出す（防御的処理）。 */
function extractJson(text: string): string {
  let s = text.trim();
  // ```json ... ``` のフェンスが付いていたら剥がす
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) s = fence[1].trim();
  // 最初の { から最後の } までを抜き出す
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  return s;
}

function tryParse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(extractJson(text)) };
  } catch {
    return { ok: false };
  }
}

export async function runCheck(input: RunCheckInput): Promise<RunCheckOutput> {
  const system = buildSystemPrompt();
  const baseUserText = buildUserText(input.mode, input.formInput);

  let lastRaw = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const userText = attempt === 0 ? baseUserText : baseUserText + RETRY_INSTRUCTION;
    const { text, model } = await callClaude({ system, userText, pdfs: input.pdfs });
    lastRaw = text;

    const parsed = tryParse(text);
    if (parsed.ok) {
      const validated = checkResultSchema.safeParse(parsed.value);
      if (validated.success) {
        // AI出力の check_id / mode はサーバー側の正しい値で上書きし、verdict・件数を確定する
        const finalized = finalizeCheckResult({
          ...validated.data,
          check_id: input.checkId,
          mode: input.mode,
        });
        return { result: finalized, rawResponse: text, model };
      }
    }
  }

  throw new EngineError("照合結果の形式が不正です（スキーマ検証に2回失敗）。", lastRaw);
}
