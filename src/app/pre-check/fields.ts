/**
 * 事前モードの疑似申告フォーム定義。
 * key はスキーマ設計v0.2 §3 の field_key と完全一致させる（勝手に追加・改名しない）。
 * findings はこの key でフォームのフィールドにマッピングしてインラインエラーを出す。
 */

export interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
}

/** コア項目（NACCS IDA/5001を参考にした疑似項目）。 */
export const CORE_FIELDS: FieldDef[] = [
  { key: "declaration_type", label: "申告等種別", placeholder: "例: 輸入（IDA）" },
  { key: "importer_name", label: "輸入者名／コード", placeholder: "例: 〇〇貿易株式会社" },
  { key: "exporter_name", label: "仕出人（輸出者）名", placeholder: "例: PACIFIC SUPPLY PARTNERS" },
  { key: "bl_number", label: "B/L番号（AWB番号）", placeholder: "例: ABCD1234567" },
  { key: "vessel_name", label: "積載船（機）名", placeholder: "例: MV TEST CARRIER" },
  { key: "package_count", label: "貨物個数", placeholder: "例: 125 CT" },
  { key: "gross_weight", label: "貨物重量（グロス）", placeholder: "例: 3,420 KG" },
  { key: "invoice_number", label: "インボイス番号", placeholder: "例: INV-4471" },
  { key: "incoterms", label: "インボイス価格条件（建値）", placeholder: "例: CIF" },
  { key: "invoice_currency", label: "インボイス通貨コード", placeholder: "例: USD" },
  { key: "invoice_price", label: "インボイス価格", placeholder: "例: 124,500" },
  { key: "freight", label: "運賃", placeholder: "例: 2,000" },
  { key: "insurance_amount", label: "保険金額", placeholder: "例: 500" },
  { key: "origin_country", label: "原産地コード", placeholder: "例: CN" },
];

/** 明細欄の項目（欄ごとに連番。key は hs_code_1, item_name_1, ...）。 */
export const LINE_FIELDS: { suffix: string; label: string; placeholder?: string }[] = [
  { suffix: "hs_code", label: "品目コード", placeholder: "例: 6109.10" },
  { suffix: "item_name", label: "品名", placeholder: "例: Cotton T-Shirts" },
  { suffix: "quantity", label: "数量・単位", placeholder: "例: 5,000 pcs" },
  { suffix: "line_price", label: "欄価格", placeholder: "例: 62,500" },
];

/** 明細の行数（MVPは2行）。 */
export const LINE_ITEM_COUNT = 2;

/** 明細フィールドの field_key を組み立てる（例: hs_code_1）。 */
export function lineKey(suffix: string, row: number): string {
  return `${suffix}_${row}`;
}
