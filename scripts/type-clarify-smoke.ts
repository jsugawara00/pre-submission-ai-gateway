/**
 * 種別確定（書類種別の聞き返し）の実APIスモークテスト。
 * DB・サーバー不要で resolveTypeClarificationTurn を直接実行する（clarify-smoke と同方式）。
 *
 * 流れ:
 *  1) ambiguous_4 を runCheck → 種別 clarification（field_label="書類種別"）を取得
 *  2) 正常回答「申告書（登録帳票）」→ accepted＋confirmed_type_key＋new_findings を確認
 *  3) 不自然回答「冷蔵庫」→ needs_followup で突き返すかを確認
 *
 * 実行: npx tsx scripts/type-clarify-smoke.ts   ※Claude API クレジットを消費する
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runCheck } from "../src/lib/engine/index";
import { resolveTypeClarificationTurn, isDocTypeClarification } from "../src/lib/engine/clarify";

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

async function main() {
  loadEnvLocal();

  console.log("【1】ambiguous_4 を照合して種別 clarification を取得します（runCheck・API 1回）\n");
  const out = await runCheck({
    checkId: "chk_typesmoke",
    mode: "post",
    pdfs: [pdf("ambiguous_4.pdf", "target")],
  });
  const result = out.result;

  const typeClar = result.clarifications.find(isDocTypeClarification);
  console.log(`種別 clarification: ${typeClar ? "あり" : "なし"}`);
  if (typeClar) {
    console.log(`  doc_id=${typeClar.doc_id} / 候補=[${typeClar.candidates.join(" / ")}]`);
    console.log(`  question=${typeClar.question}`);
  }
  if (!typeClar) {
    console.log("種別 clarification が出ませんでした。閾値や rulebook を確認してください。");
    return;
  }

  // 2) 正常回答（候補にある妥当な種別）
  console.log("\n【2】正常回答「申告書（登録帳票）」→ accepted を期待（API 1回）");
  const ok = await resolveTypeClarificationTurn({
    result,
    clarification: typeClar,
    answer: "申告書（登録帳票）",
    history: [],
  });
  console.log(`  decision=${ok.decision} / confirmed_type=${ok.confirmed_type} / key=${ok.confirmed_type_key} / excluded=${ok.excluded}`);
  console.log(`  message=${ok.message}`);
  console.log(`  new_findings=${ok.new_findings.length}件`);
  for (const f of ok.new_findings) {
    console.log(`    (${f.risk}/${f.category}) ${f.field_label}: 申告=${f.declared_value} 資料=${f.source_value}`);
  }

  // 3) 不自然な回答（候補に無い・内容と無関係）
  console.log("\n【3】不自然回答「冷蔵庫」→ needs_followup を期待（API 1回）");
  const ng = await resolveTypeClarificationTurn({
    result,
    clarification: typeClar,
    answer: "冷蔵庫",
    history: [],
  });
  console.log(`  decision=${ng.decision}`);
  console.log(`  message=${ng.message}`);

  console.log("\n=== スモーク完了 ===");
}

main().catch((err) => {
  console.error("スモーク失敗:", err?.message ?? err);
  process.exit(1);
});
