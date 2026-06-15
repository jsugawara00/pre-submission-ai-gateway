/**
 * 照合エンジンの出力スキーマ（照合エンジン_JSONスキーマ設計_v0.2 準拠）
 *
 * 設計方針:
 *  - zod スキーマを「型の正本」とし、TypeScript 型は z.infer で導出する
 *    （スキーマと型の二重管理による乖離を防ぐため）
 *  - この CheckResult 型ひとつが、事前モード（インラインエラー）と
 *    事後モード（レポート）の両 UI に給電する（設計書 v0.3「両モード同一エンジン」）
 *  - Claude API の生レスポンスはこのスキーマで検証する。不正形式はリトライ1回。
 *
 * 参照: docs/照合エンジン_JSONスキーマ設計_v0.2.md（第5章 TypeScript型定義 / 第1章 全体構造）
 */

import { z } from "zod";

// --- 語彙の定義（プロンプト組み立て・参照用にエクスポート） ---

/**
 * 書類種別の語彙（スキーマ設計v0.2 第3章末尾）。
 * detected_type 自体は文字列だが、AI に許可する値の正本としてここで一元管理する。
 */
export const DETECTED_TYPES = [
  "declaration_form", // 申告登録帳票
  "invoice", // インボイス
  "packing_list", // パッキングリスト
  "bill_of_lading", // B/L（船荷証券）
  "certificate_of_origin", // 原産地証明書
  "insurance_statement", // 保険明細
  "analysis_report", // 分析報告書
  "other", // その他
] as const;

/**
 * field_key の既知の一覧（スキーマ設計v0.2 第3章）。
 * 欄ごとに連番が付くもの（hs_code_1, item_name_2 ...）は接尾辞が可変のため、
 * field_key 自体は文字列として扱う。本配列は照合・検証時の参照用。
 */
export const KNOWN_FIELD_KEYS = [
  "declaration_type", // 申告等種別
  "importer_name", // 輸入者名／コード
  "exporter_name", // 仕出人（輸出者）名
  "bl_number", // B/L番号（AWB番号）
  "vessel_name", // 積載船（機）名
  "package_count", // 貨物個数
  "gross_weight", // 貨物重量（グロス）
  "invoice_number", // インボイス番号
  "incoterms", // インボイス価格条件（建値）
  "invoice_currency", // インボイス通貨コード
  "invoice_price", // インボイス価格
  "freight", // 運賃
  "insurance_amount", // 保険金額
  "origin_country", // 原産地コード
  // 欄ごとの連番項目: hs_code_N / item_name_N / quantity_N / line_price_N
] as const;

// --- 基本列挙型 ---

export const riskSchema = z.enum(["high", "medium", "low"]);

export const categorySchema = z.enum([
  "transcription_error", // 転記ミス（申告側 vs 元資料）
  "document_mismatch", // 資料間矛盾（元資料 vs 元資料）
  "anomaly", // 不審箇所（単一資料内の計算不整合・乖離）
]);

export const verdictSchema = z.enum(["blocked", "warning", "pass"]);

export const modeSchema = z.enum(["pre", "post"]);

// --- 構成要素のスキーマ ---

/** 判断根拠の出典（どの書類の・何ページの・どの欄か）。監査可能性の担保。 */
export const sourceRefSchema = z.object({
  doc_id: z.string(),
  page: z.number().int().nullable(),
  location: z.string(),
});

/** AI が判定した各書類の種別と要約。 */
export const detectedDocumentSchema = z.object({
  doc_id: z.string(),
  detected_type: z.string(),
  detected_type_label: z.string(),
  confidence: z.number().min(0).max(1),
  // role（改訂1）: 照合の基準＝target（チェック対象/申告側）か reference（関係書類）か。
  // 既存DBデータ（role無し）との後方互換のため default("reference") を付ける。
  role: z.enum(["target", "reference"]).default("reference"),
  summary: z.string(),
});

/** 検出された不一致・不審箇所（1つのフラット配列が両 UI に給電する）。 */
export const findingSchema = z.object({
  finding_id: z.string(),
  category: categorySchema,
  field_key: z.string().nullable(),
  field_label: z.string(),
  declared_value: z.string().nullable(),
  source_value: z.string().nullable(),
  source_refs: z.array(sourceRefSchema),
  risk: riskSchema,
  reason: z.string(),
  suggestion: z.string(),
});

/** 照合できなかった項目（「問題なし」に混ぜず明示的に分離する＝エンジンの誠実さ）。 */
export const unverifiedSchema = z.object({
  field_key: z.string(),
  field_label: z.string(),
  reason: z.string(),
});

/** ページ内のおおよその位置（パーセント指定）。UI が画像切り抜きに使う。 */
export const regionHintSchema = z.object({
  x_pct: z.number().min(0).max(100),
  y_pct: z.number().min(0).max(100),
  w_pct: z.number().min(0).max(100),
  h_pct: z.number().min(0).max(100),
});

/** 聞き返し（要確認）。判読確信度が低い文字を推測せず候補付きで提示する（ハルシネーション第2層）。 */
export const clarificationSchema = z.object({
  clarification_id: z.string(),
  field_key: z.string().nullable(),
  field_label: z.string(),
  doc_id: z.string(),
  page: z.number().int().nullable(),
  location: z.string(),
  region_hint: regionHintSchema.nullable(),
  ai_reading: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  candidates: z.array(z.string()),
  question: z.string(),
  status: z.enum(["open", "resolved"]),
});

/**
 * 聞き返しの解決記録（Phase 1.5 の確認チャットで使用）。
 * AI 出力スキーマには含まれず、サーバー側で確定値・確定者・日時を記録するための型。
 */
export const clarificationResolutionSchema = z.object({
  clarification_id: z.string(),
  confirmed_value: z.string(),
  confirmed_by: z.string(),
  confirmed_at: z.string(),
  conversation_log: z.array(
    z.object({
      role: z.enum(["ai", "human"]),
      text: z.string(),
    })
  ),
});

/** 集計＋判定。verdict と件数は最終的にサーバー側（verdict.ts）で算出・上書きする。 */
export const summarySchema = z.object({
  high: z.number().int().min(0),
  medium: z.number().int().min(0),
  low: z.number().int().min(0),
  unverified: z.number().int().min(0),
  clarifications_open: z.number().int().min(0),
  verdict: verdictSchema,
  headline: z.string(),
});

/** 照合結果の最上位スキーマ。AI 出力の検証はこのスキーマで行う。 */
export const checkResultSchema = z.object({
  check_id: z.string(),
  mode: modeSchema,
  documents: z.array(detectedDocumentSchema),
  findings: z.array(findingSchema),
  unverified: z.array(unverifiedSchema),
  clarifications: z.array(clarificationSchema),
  summary: summarySchema,
});

// --- TypeScript 型（zod スキーマから導出） ---

export type Risk = z.infer<typeof riskSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type Mode = z.infer<typeof modeSchema>;
export type SourceRef = z.infer<typeof sourceRefSchema>;
export type DetectedDocument = z.infer<typeof detectedDocumentSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type Unverified = z.infer<typeof unverifiedSchema>;
export type RegionHint = z.infer<typeof regionHintSchema>;
export type Clarification = z.infer<typeof clarificationSchema>;
export type ClarificationResolution = z.infer<typeof clarificationResolutionSchema>;
export type CheckResult = z.infer<typeof checkResultSchema>;
