/**
 * 照合エンジンのエントリポイント。
 * 流れ: プロンプト組み立て → Claude API → JSON解析 → zod検証 →（失敗なら1回だけリトライ）→ verdict確定。
 *
 * 失敗形式は勝手に緩めない。zod検証に最終的に失敗したら EngineError を投げる（CLAUDE.md 第5章）。
 * Claude API 呼び出しの一時的障害（過負荷・タイムアウト・接続断など）は数回リトライし、
 * それでも復旧しなければ EngineUnavailableError を投げる（route 側で 503 を返す）。
 */

import Anthropic from "@anthropic-ai/sdk";
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

/** zod検証に最終的に失敗した場合のエラー（出力形式の不正）。 */
export class EngineError extends Error {
  constructor(message: string, readonly rawResponse: string) {
    super(message);
    this.name = "EngineError";
  }
}

/** Claude API が一時的に利用できなかった場合のエラー（過負荷・タイムアウト・接続断など）。 */
export class EngineUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "EngineUnavailableError";
  }
}

/** API呼び出しの例外がリトライで回復しうる一時的なものか判定する。 */
function isRetryableApiError(e: unknown): boolean {
  // 接続断・タイムアウトなどネットワーク系
  if (e instanceof Anthropic.APIConnectionError) return true;
  // HTTPステータス系（429=レート制限 / 408,409=競合・タイムアウト / 5xx=サーバー側 / 529=過負荷）
  if (e instanceof Anthropic.APIError) {
    const s = (e as { status?: number }).status;
    return s === 408 || s === 409 || s === 429 || (typeof s === "number" && s >= 500);
  }
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  const MAX_ATTEMPTS = 3;
  let lastRaw = "";
  let lastApiError: unknown = null;
  // 直前の試行が「JSON解析/スキーマ検証の失敗」だったときだけ、出力厳守の追記を付ける。
  let needRetryInstruction = false;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const userText = needRetryInstruction ? baseUserText + RETRY_INSTRUCTION : baseUserText;

    let text: string;
    let model: string;
    try {
      ({ text, model } = await callClaude({ system, userText, pdfs: input.pdfs }));
    } catch (e) {
      // API一時障害はバックオフして再試行。回復不能ならサービス不可として投げる。
      lastApiError = e;
      if (isRetryableApiError(e) && attempt < MAX_ATTEMPTS - 1) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      throw new EngineUnavailableError("照合サービスに接続できませんでした。", e);
    }

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
    // 解析または検証に失敗 → 次の試行で出力厳守を強める
    needRetryInstruction = true;
  }

  // ここに来るのは「APIは応答したが形式が最後まで不正だった」場合。
  void lastApiError;
  throw new EngineError("照合結果の形式が不正です（スキーマ検証に失敗）。", lastRaw);
}
