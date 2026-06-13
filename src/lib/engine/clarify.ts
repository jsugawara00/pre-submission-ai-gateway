/**
 * 聞き返しループ（確認チャット）の判定ロジック（スキーマ設計v0.2 §2.6 / ハルシネーション第3層）。
 *
 * 人間が入力した確定値候補を、AIが文脈・他資料・検算と突き合わせて受理可否を判断する。
 * 不整合なら聞き返し（needs_followup）、整合すれば受理（accepted）。
 * 受理時、確定値が新たな不一致を生む場合は new_finding を返す（確定値での軽量再照合）。
 */

import { z } from "zod";
import { findingSchema, type CheckResult, type Clarification } from "./schema";
import { callClaude } from "./claude";

/** 確認チャットでAIが返す1ターン分の応答スキーマ。 */
export const clarifyReplySchema = z.object({
  decision: z.enum(["accepted", "needs_followup"]),
  message: z.string(),
  confirmed_value: z.string().nullable(),
  new_finding: findingSchema.nullable(),
});

export type ClarifyReply = z.infer<typeof clarifyReplySchema>;

export interface ClarifyTurnInput {
  /** 対象の照合結果（文脈として書類要約・findings等を渡す）。 */
  result: CheckResult;
  /** 解決対象の clarification。 */
  clarification: Clarification;
  /** 今回の人間の回答。 */
  answer: string;
  /** これまでの会話履歴（ai/human の交互。最初は空でよい）。 */
  history: { role: "ai" | "human"; text: string }[];
}

export class ClarifyError extends Error {
  constructor(message: string, readonly rawResponse: string) {
    super(message);
    this.name = "ClarifyError";
  }
}

function buildSystem(): string {
  return `あなたは輸入申告書類の照合エンジンの「確認担当」です。判読確信度が低かった項目について、人間が確認して入力した値を受け取り、文脈・他資料・検算と突き合わせて受理してよいか判断します。

# 判断ルール
- 入力値が候補や文脈と整合し、計算（単価×数量=行合計、合計の整合など）とも矛盾しなければ decision="accepted"。
- 入力値が不自然・他資料や検算と矛盾する・候補から大きく外れる場合は decision="needs_followup" とし、message に具体的な確認質問を1つ書く。
- accepted のとき、その確定値が申告側や他資料と新たに矛盾する場合のみ new_finding を1件返す（無ければ null）。new_finding の category は transcription_error / document_mismatch / anomaly のいずれか、risk は high/medium/low。
- 推測で受理しない。確信が持てなければ needs_followup にする。

# 出力（JSONのみ。前置き・コードフェンス禁止）
{
  "decision": "accepted" | "needs_followup",
  "message": string,                 // 人間への返答（受理理由 または 追加の確認質問）
  "confirmed_value": string | null,  // accepted のとき確定値、それ以外は null
  "new_finding": null | {            // 確定値が新たな不一致を生む場合のみ
    "finding_id": string, "category": string, "field_key": string|null, "field_label": string,
    "declared_value": string|null, "source_value": string|null,
    "source_refs": [ { "doc_id": string, "page": number|null, "location": string } ],
    "risk": "high"|"medium"|"low", "reason": string, "suggestion": string
  }
}`;
}

function buildUser(input: ClarifyTurnInput): string {
  const context = {
    documents: input.result.documents,
    findings: input.result.findings,
    clarification: input.clarification,
  };
  const lines = [
    "# 照合の文脈（書類要約・既存の検出事項・対象の確認項目）",
    JSON.stringify(context, null, 2),
    "",
    "# これまでの会話",
    input.history.length ? input.history.map((h) => `${h.role === "ai" ? "確認担当" : "人間"}: ${h.text}`).join("\n") : "（なし）",
    "",
    `# 人間が入力した値（field_key=${input.clarification.field_key ?? "(なし)"} / ${input.clarification.field_label}）`,
    input.answer,
    "",
    "上記スキーマのJSONのみを返してください。",
  ];
  return lines.join("\n");
}

function extractJson(text: string): string {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) s = fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
  return s;
}

/** 確認チャットの1ターンを実行する。zod検証失敗は1回リトライ、再失敗で ClarifyError。 */
export async function resolveClarificationTurn(input: ClarifyTurnInput): Promise<ClarifyReply> {
  const system = buildSystem();
  const userText = buildUser(input);

  let lastRaw = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = (
      await callClaude({
        system,
        userText: attempt === 0 ? userText : userText + "\n\n（重要）JSONのみを返してください。",
        pdfs: [],
      })
    ).text;
    lastRaw = text;
    try {
      const parsed = clarifyReplySchema.safeParse(JSON.parse(extractJson(text)));
      if (parsed.success) return parsed.data;
    } catch {
      /* 次の試行へ */
    }
  }
  throw new ClarifyError("確認応答の形式が不正です。", lastRaw);
}
