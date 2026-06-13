/**
 * 照合エンジンの実APIスモークテスト。
 * fixtures/ のサンプルPDF3枚を runCheck() に通し、実際にClaude APIで照合させて結果を表示する。
 *
 * 使い方: npx tsx scripts/engine-smoke.ts
 * 前提: 先に `node scripts/make-fixtures.mjs` でサンプルPDFを生成しておくこと。
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runCheck } from "../src/lib/engine/index";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// .env.local を読み込んで ANTHROPIC_API_KEY を process.env に載せる
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

function pdf(name: string) {
  return {
    base64: readFileSync(join(projectRoot, "fixtures", name)).toString("base64"),
    filename: name,
  };
}

async function main() {
  loadEnvLocal();

  console.log("Claude APIに照合を依頼中...（数十秒かかる場合があります）\n");
  const out = await runCheck({
    checkId: "chk_smoke_0001",
    mode: "post",
    pdfs: [pdf("declaration.pdf"), pdf("invoice.pdf"), pdf("packing_list.pdf")],
  });

  const r = out.result;
  console.log("=== サマリ ===");
  console.log(`verdict: ${r.summary.verdict} / ${r.summary.headline}`);
  console.log(
    `high=${r.summary.high} medium=${r.summary.medium} low=${r.summary.low} ` +
      `unverified=${r.summary.unverified} clarifications_open=${r.summary.clarifications_open}`
  );

  console.log("\n=== 検出された書類 ===");
  for (const d of r.documents) {
    console.log(`  [${d.detected_type}] ${d.detected_type_label} (conf ${d.confidence}) — ${d.summary}`);
  }

  console.log("\n=== findings ===");
  for (const f of r.findings) {
    console.log(`  (${f.risk}/${f.category}) ${f.field_label}: 申告=${f.declared_value} 資料=${f.source_value}`);
    console.log(`      理由: ${f.reason}`);
  }

  if (r.unverified.length) {
    console.log("\n=== unverified（照合できず）===");
    for (const u of r.unverified) console.log(`  ${u.field_label}: ${u.reason}`);
  }
  if (r.clarifications.length) {
    console.log("\n=== clarifications（要確認）===");
    for (const c of r.clarifications) console.log(`  ${c.field_label}: ${c.question} (候補 ${c.candidates.join(" / ")})`);
  }

  console.log(`\nモデル: ${out.model}`);
  console.log("\n--- 全結果JSON ---");
  console.log(JSON.stringify(r, null, 2));
}

main().catch((err) => {
  console.error("スモークテスト失敗:", err?.message ?? err);
  process.exit(1);
});
