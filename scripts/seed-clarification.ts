/**
 * 聞き返し機能の確認用シード。
 * 「FAX由来で末尾が不鮮明なグロス重量」のopen clarificationを1件持つ照合結果をDBに投入する。
 * 申告帳票のグロス重量は 3,420 KG として文脈に入れてあり、人間が 3,426 KG を確定すると
 * AIが資料間矛盾（new_finding）を検出することを確認できる。
 *
 * 使い方: npx tsx scripts/seed-clarification.ts
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { CheckResult } from "../src/lib/engine/schema";
import { finalizeCheckResult } from "../src/lib/engine/verdict";
import { createApplication, createCheckResult, generateCheckId } from "../src/lib/db/queries";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
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
}

async function main() {
  loadEnvLocal();

  const seed: CheckResult = {
    check_id: "",
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
    summary: { high: 0, medium: 0, low: 0, unverified: 0, clarifications_open: 0, verdict: "pass", headline: "" },
  };

  const applicationId = await createApplication({ mode: "post", status: "checked" });
  const checkId = await generateCheckId();
  const finalized = finalizeCheckResult({ ...seed, check_id: checkId });
  await createCheckResult({ applicationId, result: finalized, rawResponse: "(seed)", model: "seed" });

  console.log("シード投入完了:");
  console.log(`  checkId        = ${checkId}`);
  console.log(`  clarification  = c1 (gross_weight)`);
  console.log(`  verdict(初期)  = ${finalized.summary.verdict}（clarifications_open=${finalized.summary.clarifications_open}）`);
  console.log(`  レポートURL    = http://localhost:3000/report/${checkId}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("シード失敗:", e?.message ?? e);
  process.exit(1);
});
