/**
 * Claude API 呼び出しのラッパー（@anthropic-ai/sdk）。
 *
 * - APIキーはサーバーサイドのみ（process.env.ANTHROPIC_API_KEY）。NEXT_PUBLIC_ に置かない。
 * - PDFは base64 の document ブロックで直接投入する（OCRライブラリは使わない）。
 * - 複雑な照合・検算を伴うため adaptive thinking を有効化する。
 */

import Anthropic from "@anthropic-ai/sdk";

/** 使用モデル。最新かつ最も高性能なClaudeを既定とする。 */
export const ENGINE_MODEL = "claude-opus-4-8";

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY が設定されていません（.env.local を確認してください）");
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

/** 1書類分のPDF（base64エンコード済み）。 */
export interface PdfInput {
  base64: string;
  filename?: string;
  /**
   * この書類の doc_id（d1, d2, …）。documentブロックの title に入れてAIに伝え、
   * 出力の source_refs / clarifications の doc_id をストレージ側（applications.documents）と
   * 一致させるために使う。省略時は渡された順に d1, d2, … を自動採番する。
   */
  docId?: string;
  /**
   * この書類の役割（改訂1）。target=チェック対象（申告側の基準）／reference=関係書類。
   * title に「（チェック対象）／（関係書類）」として埋め込み、AIに照合の基準を伝える。
   */
  role?: "target" | "reference";
}

export interface ClaudeCallInput {
  system: string;
  userText: string;
  pdfs: PdfInput[];
}

export interface ClaudeCallResult {
  /** 応答中のテキストブロックを連結したもの（= モデルの生レスポンス本文）。 */
  text: string;
  /** 実際に応答したモデルID（監査・再現性のため記録）。 */
  model: string;
}

export async function callClaude(input: ClaudeCallInput): Promise<ClaudeCallResult> {
  const content: Anthropic.ContentBlockParam[] = input.pdfs.map((pdf, i) => {
    const docId = pdf.docId ?? `d${i + 1}`;
    // title に doc_id と役割を入れ、AIが各PDFを d1, d2, … として参照でき、
    // かつ照合の基準（チェック対象/関係書類）を把握できるようにする。
    const roleLabel =
      pdf.role === "target" ? "チェック対象" : pdf.role === "reference" ? "関係書類" : null;
    return {
      type: "document" as const,
      title: roleLabel ? `${docId}（${roleLabel}）` : docId,
      source: {
        type: "base64" as const,
        media_type: "application/pdf" as const,
        data: pdf.base64,
      },
    };
  });
  content.push({ type: "text", text: input.userText });

  const response = await getClient().messages.create({
    model: ENGINE_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: input.system,
    messages: [{ role: "user", content }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return { text, model: response.model };
}
