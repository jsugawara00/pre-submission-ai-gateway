/**
 * 動作確認用のサンプルPDFを fixtures/ に生成する（CLAUDE.md 第8章で許可）。
 * 実在企業名・実在B/L番号は使わない。エンジンが検出できるよう不一致を意図的に仕込む:
 *   - 申告帳票のインボイス価格 142,500 ／ 実際のインボイスTOTAL 124,500（転記ミス＝high想定）
 *   - 申告帳票の個数 120 CT ／ パッキングリスト 125 CT（資料間矛盾＝medium想定）
 * 依存を増やさないため、テキストのみの最小PDFを手作りで生成する（ASCII/英語）。
 *
 * 使い方: node scripts/make-fixtures.mjs
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(projectRoot, "fixtures");

function escapePdfText(s) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** テキスト行の配列から、Helveticaで描画した1ページのPDFを生成する。 */
function makePdf(lines) {
  let content = "BT\n/F1 11 Tf\n16 TL\n50 760 Td\n";
  lines.forEach((line, i) => {
    content += `(${escapePdfText(line)}) Tj\n`;
    if (i < lines.length - 1) content += "T*\n";
  });
  content += "ET";

  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objects[3] =
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>";
  objects[4] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(pdf, "latin1");
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) {
    pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

const declaration = [
  "IMPORT DECLARATION (Registered Copy)",
  "Declaration Type: Import (IDA)",
  "Importer: NEER TRADING CO., LTD.",
  "Exporter: PACIFIC SUPPLY PARTNERS",
  "B/L No: ABCD1234567",
  "Vessel: MV TEST CARRIER",
  "Package Count: 120 CT",
  "Gross Weight: 3,420 KG",
  "Invoice No: INV-4471",
  "Currency: USD",
  "Incoterms: CIF",
  "Invoice Price: USD 142,500",
  "Origin: CN",
  "Item 1: Cotton T-Shirts   HS 6109.10",
  "Item 2: Polyester Jackets HS 6201.40",
];

const invoice = [
  "COMMERCIAL INVOICE",
  "Invoice No: INV-4471",
  "Seller: PACIFIC SUPPLY PARTNERS",
  "Buyer: NEER TRADING CO., LTD.",
  "Incoterms: CIF",
  "Currency: USD",
  "Item 1: Cotton T-Shirts    5,000 pcs  @ 12.50  = 62,500",
  "Item 2: Polyester Jackets  2,000 pcs  @ 31.00  = 62,000",
  "TOTAL: USD 124,500",
];

const packingList = [
  "PACKING LIST",
  "Invoice No: INV-4471",
  "Total Packages: 125 CT",
  "Gross Weight: 3,420 KG",
  "Net Weight: 3,100 KG",
  "Item 1: Cotton T-Shirts    70 CT",
  "Item 2: Polyester Jackets  55 CT",
];

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "declaration.pdf"), makePdf(declaration));
writeFileSync(join(outDir, "invoice.pdf"), makePdf(invoice));
writeFileSync(join(outDir, "packing_list.pdf"), makePdf(packingList));

console.log("サンプルPDFを生成しました:");
console.log("  - fixtures/declaration.pdf （申告帳票: 価格142,500 / 個数120CT）");
console.log("  - fixtures/invoice.pdf     （インボイス: TOTAL 124,500）");
console.log("  - fixtures/packing_list.pdf（パッキングリスト: 125CT）");
