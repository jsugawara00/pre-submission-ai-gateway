/**
 * 【事前モードの一気通貫テスト】route(POST mode=pre) と同じDB保存シーケンスを再現し、
 * さらに GET 相当(getCheckResultById)で結果を取り出して、pre-check 画面のクライアント処理
 * （field_key→findings マッピング・otherFindings 抽出）まで再現して system error が出ないか確認する。
 *
 * 事後モードと共有する部分（engine/DB/report）はそのまま、事前モード固有の差分だけ検証する:
 *  - 添付PDFはすべて reference / 申告側はフォーム入力(form_input)
 *  - runCheck(mode="pre", formInput)
 *  - 結果の findings を field_key でフォーム欄へマッピング
 *
 * 使い方: npx tsx scripts/debug-check-pre.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runCheck } from "../src/lib/engine/index";
import { checkResultSchema } from "../src/lib/engine/schema";
import {
  createApplication, updateApplicationDocuments, updateApplicationStatus,
  createCheckResult, insertAuditLog, generateCheckId, getCheckResultById,
  type DocumentMeta,
} from "../src/lib/db/queries";
import { CORE_FIELDS, LINE_FIELDS, LINE_ITEM_COUNT, lineKey } from "../src/app/pre-check/fields";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const DESK = join(projectRoot, "sample-document");

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

function refPdf(name: string) {
  const buf = readFileSync(join(DESK, name));
  return { base64: buf.toString("base64"), filename: name, role: "reference" as const, bytes: buf.length };
}

// 事前モードの関係書類（sample-document の整合 FOB セット 01-06）
const REFS = [
  "01_Commercial_Invoice.pdf", "02_Packing_List.pdf", "03_Bill_of_Lading.pdf",
  "04_Certificate_of_Origin.pdf", "05_Freight_Debit_Note.pdf", "06_Insurance_Policy.pdf",
];

/** pre-check 画面のクライアント処理を再現して、描画段階で例外が出ないか確認する。 */
function simulateClient(result: any) {
  // findingsByKey（インラインエラー用マッピング）
  const map = new Map<string, any[]>();
  for (const f of result.findings) {
    if (!f.field_key) continue;
    const arr = map.get(f.field_key) ?? []; arr.push(f); map.set(f.field_key, arr);
  }
  // otherFindings（フォーム欄に紐づかない指摘）
  const formKeys = new Set<string>([
    ...CORE_FIELDS.map((f) => f.key),
    ...Array.from({ length: LINE_ITEM_COUNT }, (_, i) => LINE_FIELDS.map((lf) => lineKey(lf.suffix, i + 1))).flat(),
  ]);
  const other = result.findings.filter((f: any) => !f.field_key || !formKeys.has(f.field_key));
  const mappedKeys = Array.from(map.keys());
  return { mappedKeys, otherCount: other.length };
}

async function runScenario(label: string, formInput: Record<string, string>) {
  console.log(`\n========== シナリオ: ${label} ==========`);
  console.log("form_input:", JSON.stringify(formInput));
  const pdfs = REFS.map(refPdf);

  let appId: string | null = null;
  try {
    // ---- route(POST mode=pre) と同じシーケンス ----
    appId = await createApplication({ mode: "pre", formInput, status: "checking" });
    const documents: DocumentMeta[] = pdfs.map((p, i) => ({
      doc_id: `d${i + 1}`, original_name: p.filename, stored_path: `dummy/${appId}_${i}.pdf.enc`,
      sha256: "0".repeat(64), size_bytes: p.bytes, mime: "application/pdf", role: p.role,
    }));
    await updateApplicationDocuments(appId, documents);
    await insertAuditLog({ action: "upload", applicationId: appId, detail: { file_count: documents.length } });

    const checkId = await generateCheckId();
    console.log("⏳ runCheck(mode=pre, formInput)（API 数十秒）...");
    const { result, rawResponse, model } = await runCheck({ checkId, mode: "pre", pdfs, formInput });
    await createCheckResult({ applicationId: appId, result, rawResponse, model });
    await updateApplicationStatus(appId, "checked");
    await insertAuditLog({ action: "check", applicationId: appId, checkId, detail: { verdict: result.summary.verdict } });

    // ---- GET(/api/checks/[id]) 相当: DBから取り直し ----
    const row = await getCheckResultById(checkId);
    if (!row) throw new Error("getCheckResultById が null");
    // クライアントは result_json を CheckResult としてそのまま使う。形が壊れていないか zod で再検証。
    const reparsed = checkResultSchema.safeParse(row.result_json);
    if (!reparsed.success) throw new Error("DB往復後の result_json が CheckResult スキーマに不適合");

    // ---- pre-check 画面のマッピング再現 ----
    const { mappedKeys, otherCount } = simulateClient(row.result_json);

    console.log(`✅ 照合完了 checkId=${checkId} model=${model}`);
    console.log(`   verdict=${result.summary.verdict} | high=${result.summary.high} medium=${result.summary.medium} low=${result.summary.low} unverified=${result.summary.unverified} clarif=${result.summary.clarifications_open}`);
    console.log(`   findings=${result.findings.length} → インライン化される field_key: [${mappedKeys.join(", ")}]`);
    console.log(`   フォーム欄外の指摘(otherFindings)=${otherCount} / clarifications=${result.clarifications.length} / unverified=${result.unverified.length}`);
    for (const f of result.findings) {
      console.log(`     [${f.risk}] ${f.field_label}(${f.field_key ?? "—"}) declared=${JSON.stringify(f.declared_value)} source=${JSON.stringify(f.source_value)}`);
    }
    console.log(`🎉 シナリオ「${label}」: system error なしで完了`);
    return true;
  } catch (err: any) {
    console.error(`❌ シナリオ「${label}」で例外: ${err?.name} ${err?.message}`);
    if (err?.sqlMessage) console.error("   sqlMessage:", err.sqlMessage);
    console.error(err?.stack?.split("\n").slice(0, 4).join("\n"));
    if (appId) { try { await updateApplicationStatus(appId, "failed"); } catch {} }
    return false;
  }
}

async function main() {
  loadEnvLocal();

  // シナリオA: 不一致あり（通貨と価格を誤入力）→ findings が invoice_currency/invoice_price に紐づき blocked になるはず
  const mismatch: Record<string, string> = {
    declaration_type: "輸入（IDA）",
    importer_name: "Tokyo Apparel Import K.K.",
    exporter_name: "Saigon Textile Export Co., Ltd.",
    bl_number: "SGNTYO260418",
    vessel_name: "OCEAN HARMONY V.025E",
    package_count: "100 CT",
    gross_weight: "1,150.0 KG",
    invoice_number: "INV-2026-0418",
    incoterms: "FOB",
    invoice_currency: "JPY",          // ← 誤り（正: USD）
    invoice_price: "225,000.00",      // ← 誤り（正: 22,500.00）
    freight: "USD 850.00",
    insurance_amount: "USD 64.21",
    origin_country: "VN",
    hs_code_1: "6109.10",
    item_name_1: "Men's Cotton T-Shirt (Style CT-100)",
    quantity_1: "5,000 PCS",
    line_price_1: "USD 22,500.00",
  };

  // シナリオB: 整合（資料と一致）→ 重大な不一致なし（pass か warning）で完了するはず
  const matched: Record<string, string> = {
    ...mismatch,
    invoice_currency: "USD",
    invoice_price: "22,500.00",
  };

  const a = await runScenario("A: 不一致あり（通貨・価格 誤入力）", mismatch);
  const b = await runScenario("B: 整合（資料と一致）", matched);

  console.log("\n==================== 総括 ====================");
  console.log(`シナリオA(不一致): ${a ? "OK" : "NG"} / シナリオB(整合): ${b ? "OK" : "NG"}`);
  console.log(a && b ? "✅ 事前モードは system error なしで照合完了（事後モードと同一エンジン・DB・レポートを共有）" : "⚠ 失敗あり。上記ログ参照");
  process.exit(0);
}
main();
