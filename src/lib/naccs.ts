/**
 * NACCS形式出力（疑似サマリ）。
 *
 * 事前モードの申告フォーム入力値（applications.form_input）を、NACCS輸入申告事項登録
 * （IDA／業務項番5001）の入力項目を参考にした「疑似サマリ」テキストに整形する。
 *
 * 設計上の注意:
 *  - 項目順・ラベルは申告フォームの正本定義（src/app/pre-check/fields.ts）に従う。
 *    勝手な項目順・コード体系を発明しない（＝推測しない）。
 *  - これは実際のNACCS入力電文フォーマットそのものではなく、それを参考にした疑似出力である。
 */

import { CORE_FIELDS, LINE_FIELDS, LINE_ITEM_COUNT, lineKey } from "@/app/pre-check/fields";

const EMPTY = "（未入力）";

/** form_input から1項目の表示値を取り出す（未入力・空白は EMPTY 表記）。 */
function val(formInput: Record<string, unknown>, key: string): string {
  const v = formInput[key];
  if (v === undefined || v === null || String(v).trim() === "") return EMPTY;
  return String(v).trim();
}

/** NACCS出力の対象になる申告データがあるか（事後モードなど form_input が無い場合は false）。 */
export function hasExportableInput(formInput: Record<string, unknown> | null | undefined): boolean {
  if (!formInput) return false;
  return Object.values(formInput).some((v) => v !== null && v !== undefined && String(v).trim() !== "");
}

/** 申告フォーム入力値を NACCS（IDA）疑似サマリのテキストに整形する。 */
export function buildNaccsSummary(formInput: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push("═══════════════════════════════════════════════");
  lines.push("  輸入申告事項登録（IDA／業務項番5001）疑似サマリ");
  lines.push("═══════════════════════════════════════════════");
  lines.push("");

  lines.push("【共通部】");
  for (const f of CORE_FIELDS) {
    lines.push(`  ${f.label}：${val(formInput, f.key)}`);
  }
  lines.push("");

  lines.push("【繰返部（品目）】");
  for (let row = 1; row <= LINE_ITEM_COUNT; row++) {
    lines.push(`  〈第${row}欄〉`);
    for (const lf of LINE_FIELDS) {
      lines.push(`    ${lf.label}：${val(formInput, lineKey(lf.suffix, row))}`);
    }
  }
  lines.push("");

  lines.push("───────────────────────────────────────────────");
  lines.push("※ 本出力はNACCS輸入申告（IDA）の入力項目を参考にした疑似サマリです。");
  lines.push("　 実際のNACCS入力電文フォーマットそのものではありません。");
  return lines.join("\n");
}
