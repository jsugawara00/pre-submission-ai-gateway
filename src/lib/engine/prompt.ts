/**
 * 照合プロンプトの組み立て（CLAUDE.md 第5章 / スキーマ設計v0.2 第4章）。
 *
 * システムプロンプトに必ず含める要素:
 *  - 「JSONのみを返す。前置き・コードフェンス禁止」
 *  - 「照合できない項目は推測せず unverified に入れる」（ハルシネーション第1層）
 *  - 「判読確信度が低い文字は推測せず、候補と確信度を添えて clarifications に入れる」（第2層）
 *  - 判定手順 ①書類種別判定→②キー項目抽出→③申告側と照合→④資料間照合→⑤資料内検算→⑥findings生成
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DETECTED_TYPES, KNOWN_FIELD_KEYS, type Mode } from "./schema";

/**
 * 照合精度ルール（rulebook.md）をプロジェクトルートから読み込む。
 * rulebook は業務ノウハウ＝守秘のため git 管理外（.gitignore で除外）。
 * 存在しない・読めない場合は注入をスキップする（ルール無し＝AIの自由判断のみ）。
 */
function loadRulebook(): string {
  try {
    const text = readFileSync(join(process.cwd(), "rulebook.md"), "utf8").trim();
    return text.length > 0 ? text : "";
  } catch {
    return "";
  }
}

const OUTPUT_SHAPE = `{
  "check_id": string,                       // サーバーが付与するため空文字でよい
  "mode": "pre" | "post",
  "documents": [
    { "doc_id": string,                     // 各PDFのタイトルに付された d1, d2, … をそのまま使う
      "detected_type": string, "detected_type_label": string,
      "confidence": number(0-1),
      "role": "target" | "reference",       // タイトルの（チェック対象）=target /（関係書類）=reference
      "summary": string }
  ],
  "findings": [
    { "finding_id": string,
      "category": "transcription_error" | "document_mismatch" | "anomaly",
      "field_key": string | null, "field_label": string,
      "declared_value": string | null, "source_value": string | null,
      "source_refs": [ { "doc_id": string, "page": number | null, "location": string } ],
      "risk": "high" | "medium" | "low", "reason": string, "suggestion": string }
  ],
  "unverified": [ { "field_key": string, "field_label": string, "reason": string } ],
  "clarifications": [
    { "clarification_id": string, "field_key": string | null, "field_label": string,
      "doc_id": string, "page": number | null, "location": string,
      "region_hint": { "x_pct": number, "y_pct": number, "w_pct": number, "h_pct": number } | null,
      "ai_reading": string | null, "confidence": number(0-1), "candidates": string[],
      "question": string, "status": "open" }
  ],
  "summary": {
    "high": number, "medium": number, "low": number, "unverified": number,
    "clarifications_open": number, "verdict": "blocked" | "warning" | "pass", "headline": string
  }
}`;

/** 照合エンジンのシステムプロンプトを組み立てる。 */
export function buildSystemPrompt(): string {
  const rulebook = loadRulebook();
  const rulebookSection = rulebook
    ? `

# 照合精度の補足ルール（厳守）
以下は本業務の照合精度を保つための補足ルールです。上記の判定手順・ハルシネーション防止を土台としつつ、以下を必ず反映してください。

${rulebook}`
    : "";

  return `あなたは輸入申告の書類照合を行う検査エンジンです。アップロードされたPDF（申告登録帳票・インボイス・パッキングリスト・B/L等）を読み取り、転記ミス・資料間の矛盾・資料内の計算不整合を検出します。

# 最重要の出力ルール
- 出力は下記スキーマに厳密準拠したJSONのみ。前置き・説明文・コードフェンス（\`\`\`）は一切付けない。
- 1文字目が「{」、最後の文字が「}」になること。

# 書類の参照ID（doc_id）— 厳守
- 添付された各PDFには、タイトルとして doc_id（d1, d2, …）が付与されている（1番目のPDF=d1, 2番目=d2, …）。
- documents[].doc_id・findings[].source_refs[].doc_id・clarifications[].doc_id は、必ずこのタイトルの doc_id をそのまま使う。
- doc1 / 資料A のような独自の採番・呼称を作ってはならない。これは指摘内容を原本PDFに正確に紐づけるために不可欠である。

# 書類の役割（role）— 厳守
- 各PDFのタイトルには doc_id とともに役割が付いている：「（チェック対象）」=target、「（関係書類）」=reference。
- documents[].role には、そのタイトルの役割を target / reference で必ず設定する。
- 照合は role=target（チェック対象＝申告側）を基準に、role=reference（関係書類）と突き合わせて行う。
- target が複数ファイルにわたっても、それらは1件の申告（1申告分の帳票群）として扱い、別々の申告に分割しない。
- 事前モード（フォーム入力が申告側）では、添付PDFはすべて role=reference として扱う。

# ハルシネーション防止（厳守）
- 照合に必要な資料が無い・該当箇所が見つからない項目は、推測で findings に入れず unverified に入れる（理由を明記）。
- 文字が不鮮明で判読確信度が低い箇所は、勝手に1つに確定せず clarifications に入れる。読めた候補（candidates）と確信度（confidence, 0-1）を添え、status は "open" とする。

# 判定手順（この順で行う）
1. 各書類の種別を判定（detected_type）
2. 各書類からキー項目を抽出
3. 申告側（role=target＝チェック対象の登録帳票／事前モードはフォーム）と元資料（role=reference）を照合 → 不一致は category="transcription_error"
4. 元資料（role=reference）どうしを照合 → 不一致は category="document_mismatch"
5. 単一資料内の計算を検算（単価×数量=行合計、合計の整合等）→ 不整合は category="anomaly"
6. 検出結果を findings として生成。各 finding には判断根拠 source_refs（どの書類の・何ページ・どの欄か）を必ず付ける

# リスク区分（risk）
- high: 課税価格や税額に直接影響する不一致、桁・数字の入れ違いなど重大なもの
- medium: 業務確認が必要だが直ちに重大ではない差異
- low: 端数処理など軽微なもの

# 説明文（reason / suggestion）の書き方
- 簡潔に、断定形で言い切る（例:「〜です」「〜が必要です」）。回りくどい言い回しや二重説明を避ける。
- 事実（何がどう違うか）を先に述べ、根拠は短く添える。1項目あたり1〜2文に収める。

# verdict / summary について
- verdict と summary の件数はサーバー側で再計算する。あなたは findings/unverified/clarifications を正確に出すことに集中し、summary は素直な集計値を入れてよい（headline は日本語で1文）。

# 語彙の制約
- detected_type は次のいずれか: ${DETECTED_TYPES.join(", ")}
- field_key は機械用ID（英語snake_case）。代表的なキー: ${KNOWN_FIELD_KEYS.join(", ")}。欄ごとの明細項目は hs_code_1 / item_name_1 / quantity_1 / line_price_1 のように連番を付ける。該当キーが無い場合のみ null。
- field_label は日本語の表示名。
${rulebookSection}

# 出力スキーマ
${OUTPUT_SHAPE}`;
}

/** ユーザーメッセージ本文（PDFはdocumentブロックで別途添付され、本文はモードと申告値を伝える）。 */
export function buildUserText(mode: Mode, formInput?: Record<string, unknown> | null): string {
  const lines: string[] = [];
  if (mode === "pre") {
    lines.push("【事前モード】以下は登録前の疑似申告フォーム入力値です。これを申告側として、添付資料と照合してください。");
    lines.push("申告フォーム入力値(JSON):");
    lines.push(JSON.stringify(formInput ?? {}, null, 2));
  } else {
    lines.push(
      "【事後モード】各PDFのタイトルに役割が付いています。「（チェック対象）」=申告側の登録帳票（role=target）、「（関係書類）」=元資料（role=reference）です。チェック対象を基準に関係書類と照合してください。チェック対象が複数あっても、1件の申告分として扱い別々の申告に分割しないでください。"
    );
  }
  lines.push("");
  lines.push("上記スキーマのJSONのみを返してください。");
  return lines.join("\n");
}

/** リトライ時にJSON厳守を強める追記。 */
export const RETRY_INSTRUCTION =
  "\n\n（重要）前回の出力はJSONとして解析できませんでした。スキーマに厳密準拠したJSONのみを、前置き・コードフェンスなしで返してください。";
