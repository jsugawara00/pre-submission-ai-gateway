/**
 * 聞き返しループ（確認チャット）の実APIスモークテスト。
 * resolveClarificationTurn() を直接叩き、DB・サーバーなしで以下のマルチターン挙動を検証する:
 *   ターン1: 不自然な回答（12 KG）→ AIが確定せず decision="needs_followup" で追加質問を返す
 *   ターン2: ターン1の文脈を引き継ぎ妥当な回答（3,426 KG）→ decision="accepted"、
 *            申告 3,420 KG との資料間矛盾を new_finding として検出
 *
 * 使い方: npx tsx scripts/clarify-smoke.ts
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { CheckResult } from "../src/lib/engine/schema";
import { resolveClarificationTurn } from "../src/lib/engine/clarify";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(projectRoot, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let value = t.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* .env.local が無ければ既存の環境変数に委ねる */
  }
}

// seed-clarification.ts と同じ文脈（申告グロス重量 3,420 KG / FAXで末尾不鮮明）。
const result: CheckResult = {
  check_id: "chk_clarify_smoke",
  mode: "post",
  documents: [
    {
      doc_id: "d1",
      detected_type: "declaration_form",
      detected_type_label: "輸入申告登録帳票",
      confidence: 0.97,
      summary: "輸入申告（IDA）。グロス重量 3,420 KG、貨物個数 125 CT、インボイス価格 USD 124,500。",
    },
    {
      doc_id: "d2",
      detected_type: "packing_list",
      detected_type_label: "パッキングリスト",
      confidence: 0.9,
      summary: "INV-4471。総梱包 125 CT。グロス重量はFAX由来で末尾の数字が不鮮明。",
    },
  ],
  findings: [],
  unverified: [],
  clarifications: [
    {
      clarification_id: "c1",
      field_key: "gross_weight",
      field_label: "貨物重量（グロス）",
      doc_id: "d2",
      page: 1,
      location: "GROSS WEIGHT欄",
      region_hint: { x_pct: 62, y_pct: 78, w_pct: 20, h_pct: 5 },
      ai_reading: "3,42? KG",
      confidence: 0.52,
      candidates: ["3,420 KG", "3,426 KG", "3,428 KG"],
      question: "FAX由来のため末尾の数字が不鮮明です。原本を確認して正しい値を入力してください。",
      status: "open",
    },
  ],
  summary: { high: 0, medium: 0, low: 0, unverified: 0, clarifications_open: 1, verdict: "blocked", headline: "" },
};

async function main() {
  loadEnvLocal();
  const clarification = result.clarifications[0];

  // ターン1: 不自然な回答 → needs_followup を期待
  console.log("=== ターン1: 不自然な回答「12 KG」を送信 ===");
  const t1 = await resolveClarificationTurn({ result, clarification, answer: "12 KG", history: [] });
  console.log(`  decision = ${t1.decision}`);
  console.log(`  message  = ${t1.message}`);
  console.log(t1.decision === "needs_followup" ? "  ✅ 期待どおり追加質問を返した" : "  ⚠️ needs_followup を期待したが別の判定");

  // ターン2: ターン1の文脈を引き継ぎ、妥当な回答 → accepted＋new_finding を期待
  console.log("\n=== ターン2: 妥当な回答「3,426 KG」を送信（ターン1を履歴に引き継ぎ）===");
  const t2 = await resolveClarificationTurn({
    result,
    clarification,
    answer: "3,426 KG",
    history: [
      { role: "human", text: "12 KG" },
      { role: "ai", text: t1.message },
    ],
  });
  console.log(`  decision        = ${t2.decision}`);
  console.log(`  confirmed_value = ${t2.confirmed_value}`);
  console.log(`  message         = ${t2.message}`);
  if (t2.new_finding) {
    const f = t2.new_finding;
    const refs = f.source_refs.map((s) => s.doc_id).join(", ");
    console.log(`  new_finding     = (${f.risk}/${f.category}) ${f.field_label}: 申告=${f.declared_value} 資料=${f.source_value} [参照: ${refs}]`);
    console.log(`      理由: ${f.reason}`);
  } else {
    console.log("  new_finding     = なし");
  }
  console.log(t2.decision === "accepted" ? "  ✅ 期待どおり受理した" : "  ⚠️ accepted を期待したが別の判定");
}

main().catch((err) => {
  console.error("clarifyスモーク失敗:", err?.message ?? err);
  process.exit(1);
});
