/**
 * 耐性チェック観察スクリプト（実Claude API・クレジット消費）
 *
 * 目的（A作業）:
 *  - 「種別あやふや」4枚: エンジンが無理に断定して誤判定せず、detected_type の
 *    confidence を素直に下げるか。
 *  - 「文字不鮮明」3枚: 不鮮明なキー値を推測で断定せず、candidates + confidence を
 *    添えて clarifications（聞き返し）に入れるか。
 *
 * 構成:
 *  - 不鮮明系は1チェック（target=declaration / reference=invoice,packing）で
 *    資料間照合と clarification を同時に観察。
 *  - あやふや系は種別判定の純度を見るため各1枚を単独 target で4チェック。
 *
 * 実行: npx tsx scripts/observe-resilience.ts
 * 前提: 先に `npm run gen:ambiguous` と `npm run gen:blurry` を実行しておくこと。
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runCheck } from "../src/lib/engine/index";

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

function pdf(name: string, role: "target" | "reference") {
  return {
    base64: readFileSync(join(projectRoot, "fixtures", name)).toString("base64"),
    filename: name,
    role,
  };
}

function printResult(label: string, r: any, model: string) {
  console.log(`\n========== ${label} ==========`);
  console.log(`verdict: ${r.summary.verdict} / ${r.summary.headline}`);
  console.log(
    `high=${r.summary.high} medium=${r.summary.medium} low=${r.summary.low} ` +
      `unverified=${r.summary.unverified} clarifications_open=${r.summary.clarifications_open}`
  );

  console.log("--- 検出された書類（種別判定の耐性）---");
  for (const d of r.documents) {
    console.log(`  ${d.doc_id}: [${d.detected_type}] ${d.detected_type_label} (conf ${d.confidence})`);
    console.log(`      要約: ${d.summary}`);
  }

  if (r.clarifications?.length) {
    console.log("--- clarifications（聞き返し＝不鮮明耐性の本命）---");
    for (const c of r.clarifications) {
      console.log(`  [${c.doc_id}] ${c.field_label}: ${c.question}`);
      console.log(`      候補: ${c.candidates.join(" / ")}  conf=${c.confidence ?? "-"}`);
    }
  } else {
    console.log("--- clarifications: なし ---");
  }

  if (r.findings?.length) {
    console.log("--- findings ---");
    for (const f of r.findings) {
      const refs = f.source_refs.map((s: any) => s.doc_id).join(", ");
      console.log(`  (${f.risk}/${f.category}) ${f.field_label}: 申告=${f.declared_value} 資料=${f.source_value} [${refs}]`);
    }
  }

  if (r.unverified?.length) {
    console.log("--- unverified（照合できず）---");
    for (const u of r.unverified) console.log(`  ${u.field_label}: ${u.reason}`);
  }

  console.log(`モデル: ${model}`);
}

async function runOne(label: string, checkId: string, pdfs: ReturnType<typeof pdf>[]) {
  try {
    const out = await runCheck({ checkId, mode: "post", pdfs });
    printResult(label, out.result, out.model);
  } catch (err: any) {
    console.error(`\n[${label}] 失敗:`, err?.message ?? err);
  }
}

async function main() {
  loadEnvLocal();
  // 実行範囲を引数で絞れる: "ambiguous"=あやふやのみ / "blurry"=不鮮明のみ / 無指定=全部
  const only = process.argv[2];
  const runBlurry = !only || only === "blurry";
  const runAmbiguous = !only || only === "ambiguous";
  const count = (runBlurry ? 1 : 0) + (runAmbiguous ? 4 : 0);
  console.log(`実APIで耐性チェックを実行します（Opus 4.8・クレジット消費・${count}チェック）\n`);

  // 1) 不鮮明系（1チェック）
  if (runBlurry) {
    await runOne("不鮮明系 [blurry 3枚]", "chk_obs_blurry", [
      pdf("blurry_3.pdf", "target"),
      pdf("blurry_1.pdf", "reference"),
      pdf("blurry_2.pdf", "reference"),
    ]);
  }

  // 2) あやふや系（各1枚を単独target、種別判定の純度を観察）
  if (runAmbiguous) {
    const ambiguous: Array<[string, string]> = [
      ["ambiguous_1.pdf", "invoice↔packing_list"],
      ["ambiguous_2.pdf", "bill_of_lading↔invoice"],
      ["ambiguous_3.pdf", "certificate_of_origin↔invoice"],
      ["ambiguous_4.pdf", "declaration_form↔invoice↔other"],
    ];
    for (const [file, intent] of ambiguous) {
      await runOne(`あやふや [${file} / 想定:${intent}]`, `chk_obs_${file}`, [pdf(file, "target")]);
    }
  }

  console.log("\n=== 観察完了 ===");
}

main().catch((err) => {
  console.error("観察スクリプト失敗:", err?.message ?? err);
  process.exit(1);
});
