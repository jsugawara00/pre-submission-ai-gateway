/**
 * ブラウザ実画面E2E用のシード: 種別 clarification が出る照合結果をDBに投入する。
 * ambiguous_4（種別あやふや）を単独 target で runCheck し、route と同じDB保存シーケンスを再現する。
 * 投入後、dev サーバで /report/<checkId> を開くと種別選択UI（ClarificationPanel）が出る。
 *
 * 使い方: npx tsx scripts/seed-type-clarification.ts   ※Claude API を1回消費する
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runCheck } from "../src/lib/engine/index";
import {
  createApplication,
  updateApplicationDocuments,
  updateApplicationStatus,
  createCheckResult,
  insertAuditLog,
  generateCheckId,
  type DocumentMeta,
} from "../src/lib/db/queries";

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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {}
}

async function main() {
  loadEnvLocal();
  const buf = readFileSync(join(projectRoot, "fixtures", "ambiguous_4.pdf"));
  const pdfs = [{ base64: buf.toString("base64"), filename: "ambiguous_4.pdf", role: "target" as const, bytes: buf.length }];

  const appId = await createApplication({ mode: "post", formInput: null, status: "checking" });
  const documents: DocumentMeta[] = pdfs.map((p, i) => ({
    doc_id: `d${i + 1}`,
    original_name: p.filename,
    stored_path: `dummy/${appId}_${i}.pdf.enc`,
    sha256: "0".repeat(64),
    size_bytes: p.bytes,
    mime: "application/pdf",
    role: p.role,
  }));
  await updateApplicationDocuments(appId, documents);
  await insertAuditLog({ action: "upload", applicationId: appId, detail: { file_count: documents.length } });

  const checkId = await generateCheckId();
  console.log("⏳ runCheck（API・数十秒）...");
  const { result, rawResponse, model } = await runCheck({ checkId, mode: "post", pdfs });
  await createCheckResult({ applicationId: appId, result, rawResponse, model });
  await updateApplicationStatus(appId, "checked");
  await insertAuditLog({ action: "check", applicationId: appId, checkId, detail: { verdict: result.summary.verdict } });

  const typeClar = result.clarifications.find((c) => c.field_key === null && c.field_label === "書類種別");
  console.log("\n🎉 投入成功");
  console.log("  checkId         =", checkId);
  console.log("  verdict         =", result.summary.verdict);
  console.log("  種別clarification =", typeClar ? `あり (id=${typeClar.clarification_id})` : "なし");
  if (typeClar) console.log("  候補            =", typeClar.candidates.join(" / "));
  console.log(`\n  → dev起動後: http://localhost:3000/report/${checkId}`);
  process.exit(0);
}
main().catch((e) => {
  console.error("投入失敗:", e?.message ?? e);
  process.exit(1);
});
