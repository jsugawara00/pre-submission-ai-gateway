/**
 * 動作確認デバッグ: ブラウザ事後モードと同じ7枚で runCheck → route と同じDB保存シーケンスを再現し、
 * どの段階で例外になるかを表示する。
 * 使い方: npx tsx scripts/debug-check.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runCheck } from "../src/lib/engine/index";
import {
  createApplication, updateApplicationDocuments, updateApplicationStatus,
  createCheckResult, insertAuditLog, generateCheckId, type DocumentMeta,
} from "../src/lib/db/queries";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(projectRoot, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("="); if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let value = t.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {}
}

const DESK = join(projectRoot, "sample-document");
function pdf(path: string, role: "target" | "reference", filename: string) {
  const buf = readFileSync(path);
  return { base64: buf.toString("base64"), filename, role, bytes: buf.length };
}

async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    const r = await fn();
    console.log(`  ✅ ${label}`);
    return r;
  } catch (err: any) {
    console.error(`  ❌ ${label} で例外`);
    console.error("     name:", err?.name, "| code:", err?.code, "| errno:", err?.errno);
    console.error("     message:", err?.message);
    if (err?.sqlMessage) console.error("     sqlMessage:", err.sqlMessage);
    if (err?.sql) console.error("     sql:", String(err.sql).slice(0, 200));
    throw err;
  }
}

async function main() {
  loadEnvLocal();
  const pdfs = [
    pdf(join(projectRoot, "sample-document", "07_Import_Declaration.pdf"), "target", "07_Import_Declaration.pdf"),
    pdf(join(DESK, "01_Commercial_Invoice.pdf"), "reference", "01_Commercial_Invoice.pdf"),
    pdf(join(DESK, "02_Packing_List.pdf"), "reference", "02_Packing_List.pdf"),
    pdf(join(DESK, "03_Bill_of_Lading.pdf"), "reference", "03_Bill_of_Lading.pdf"),
    pdf(join(DESK, "04_Certificate_of_Origin.pdf"), "reference", "04_Certificate_of_Origin.pdf"),
    pdf(join(DESK, "05_Freight_Debit_Note.pdf"), "reference", "05_Freight_Debit_Note.pdf"),
    pdf(join(DESK, "06_Insurance_Policy.pdf"), "reference", "06_Insurance_Policy.pdf"),
  ];

  let appId: string | null = null;
  try {
    appId = await step("createApplication", () =>
      createApplication({ mode: "post", formInput: null, status: "checking" }));

    const documents: DocumentMeta[] = pdfs.map((p, i) => ({
      doc_id: `d${i + 1}`, original_name: p.filename, stored_path: `dummy/${appId}_${i}.pdf.enc`,
      sha256: "0".repeat(64), size_bytes: p.bytes, mime: "application/pdf", role: p.role,
    }));
    await step("updateApplicationDocuments", () => updateApplicationDocuments(appId!, documents));
    await step("insertAuditLog(upload)", () => insertAuditLog({ action: "upload", applicationId: appId!, detail: { file_count: documents.length } }));

    const checkId = await step("generateCheckId", () => generateCheckId());
    console.log("     checkId =", checkId);

    console.log("  ⏳ runCheck（API 数十秒）...");
    const { result, rawResponse, model } = await runCheck({ checkId, mode: "post", pdfs });
    console.log(`  ✅ runCheck verdict=${result.summary.verdict} findings=${result.findings.length} rawLen=${rawResponse.length}`);

    await step("createCheckResult", () => createCheckResult({ applicationId: appId!, result, rawResponse, model }));
    await step("updateApplicationStatus(checked)", () => updateApplicationStatus(appId!, "checked"));
    await step("insertAuditLog(check)", () => insertAuditLog({ action: "check", applicationId: appId!, checkId, detail: { verdict: result.summary.verdict } }));

    console.log("\n🎉 全シーケンス成功。checkId =", checkId);
  } catch (err: any) {
    console.error("\n=== 失敗。上記の段階が原因 ===");
    console.error(err?.stack?.split("\n").slice(0, 5).join("\n"));
    if (appId) { try { await updateApplicationStatus(appId, "failed"); } catch {} }
  }
  process.exit(0);
}
main();
