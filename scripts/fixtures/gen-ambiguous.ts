/**
 * 耐性チェック用「種別あやふや」フィクスチャ生成スクリプト
 *
 * 目的:
 *  - 書類種別（detected_type）の判定が割れるよう、わざと表題を中立化し、
 *    複数書類種別のキー項目を同居させた紛らわしいPDFを4枚生成する。
 *  - 照合エンジンが紛らわしい入力に対して「無理に断定して誤判定」せず、
 *    confidence を素直に下げて振る舞えるか（耐性）を観察するための弾。
 *
 * 注意:
 *  - 文字自体は鮮明に保つ（今回の対象は「種別あやふや」系。文字不鮮明系は別途）。
 *  - 実在企業名・実在B/L番号は使わない（CLAUDE.md 作業の進め方）。
 *  - 日本語フォントは Windows 標準の MS Gothic を埋め込む（この環境前提）。
 *
 * 実行: npm run gen:ambiguous
 */

import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

// --- 日本語フォント（Windows標準）。環境に無ければ候補を順に試す。 ---
const FONT_CANDIDATES = [
  { path: "C:/Windows/Fonts/msgothic.ttc", family: "MS Gothic" },
  { path: "C:/Windows/Fonts/YuGothM.ttc", family: "Yu Gothic Medium" },
  { path: "C:/Windows/Fonts/meiryo.ttc", family: "Meiryo" },
];

function resolveFont(): { path: string; family: string } {
  for (const c of FONT_CANDIDATES) {
    if (fs.existsSync(c.path)) return c;
  }
  throw new Error(
    "日本語フォントが見つかりません。FONT_CANDIDATES を環境に合わせて調整してください。"
  );
}

const OUT_DIR = path.resolve(process.cwd(), "fixtures");

type Row = string[];

interface DocSpec {
  file: string;
  /** 中立的な表題（種別を明示しない）。 */
  title: string;
  /** 紛らわしさの意図（生成物には出さず、ログ用）。 */
  intent: string;
  /** ヘッダの「種別を匂わせる」見出し群。複数種別の特徴を混在させる。 */
  metaLines: string[];
  tableHeader: Row;
  tableRows: Row[];
  /** 末尾の注記（宣言文・署名欄など、種別の手がかりを更にぼかす）。 */
  footerLines: string[];
}

const SPECS: DocSpec[] = [
  {
    file: "ambiguous_1.pdf",
    title: "SHIPMENT DETAIL SHEET / 出荷明細",
    intent: "invoice ↔ packing_list（金額欄と数量・重量・個数欄を同居）",
    metaLines: [
      "No.: SDS-2026-0413        Date: 2026-04-13",
      "Seller / 売主: Aoba Trading Co., Ltd.",
      "Buyer / 買主: Marudai Import K.K.",
      "Terms / 建値: CIF Tokyo        Currency / 通貨: USD",
    ],
    tableHeader: ["No", "Description / 品名", "Qty", "Net/Gross kg", "Pkgs", "Amount"],
    tableRows: [
      ["1", "Stainless bolt M8 / ステンレスボルト", "12,000 pcs", "240 / 268", "20 ctn", "3,600.00"],
      ["2", "Rubber gasket 60mm / ゴムガスケット", "8,000 pcs", "96 / 110", "16 ctn", "2,240.00"],
      ["3", "Aluminum bracket / アルミ製ブラケット", "1,500 pcs", "375 / 402", "30 ctn", "5,250.00"],
    ],
    footerLines: [
      "Total Packages / 総個数: 66 ctn      Total Gross / 総重量: 780 kg",
      "Total Amount / 合計金額: USD 11,090.00",
      "※本書面は出荷内容の確認用です。",
    ],
  },
  {
    file: "ambiguous_2.pdf",
    title: "TRANSPORT & GOODS NOTE / 運送貨物通知",
    intent: "bill_of_lading ↔ invoice（船名・B/L番号・港＋品目価格を同居）",
    metaLines: [
      "Document No.: TGN-7785-26",
      "Vessel / 積載船: MV HARBOR STAR   Voyage: 014E",
      "B/L No.: HRBR-2026-55180",
      "Port of Loading / 積港: Busan      Port of Discharge / 揚港: Nagoya",
      "Shipper / 荷送人: Hanil Components Ltd.",
      "Consignee / 荷受人: Tokai Parts Co., Ltd.",
    ],
    tableHeader: ["Marks", "Description / 品名", "Qty", "Gross kg", "Value USD"],
    tableRows: [
      ["TPC-01", "Electric motor 1.5kW / 電動モーター", "200 units", "1,400", "18,000.00"],
      ["TPC-02", "Control panel / 制御盤", "50 units", "620", "9,500.00"],
    ],
    footerLines: [
      "Freight / 運賃: USD 1,250.00 (Prepaid)",
      "Total Value / 価額合計: USD 27,500.00",
      "Shipped on board in apparent good order and condition.",
    ],
  },
  {
    file: "ambiguous_3.pdf",
    title: "ORIGIN & VALUE STATEMENT / 原産・価額申述書",
    intent: "certificate_of_origin ↔ invoice（原産国・宣言文・署名欄＋品目価格を同居）",
    metaLines: [
      "Reference: OVS-2026-0092       Issue Date: 2026-03-28",
      "Exporter / 輸出者: Lotus Textile Mfg.",
      "Importer / 輸入者: Yamato Apparel K.K.",
      "Country of Origin / 原産国: Viet Nam",
      "Invoice No. / インボイス番号: LT-INV-3391",
    ],
    tableHeader: ["No", "Goods / 品名", "HS Code", "Qty", "Unit Price", "Amount"],
    tableRows: [
      ["1", "Cotton T-shirt / 綿Tシャツ", "6109.10", "5,000 pcs", "2.10", "10,500.00"],
      ["2", "Knit cardigan / ニットカーディガン", "6110.20", "1,200 pcs", "7.80", "9,360.00"],
    ],
    footerLines: [
      "Total / 合計: USD 19,860.00",
      "We hereby declare that the goods originate in the country stated above.",
      "Authorized Signature / 署名: ____________________   Stamp / 印: [   ]",
    ],
  },
  {
    file: "ambiguous_4.pdf",
    title: "IMPORT WORKSHEET（社内用）/ 輸入ワークシート",
    intent: "declaration_form ↔ invoice ↔ other（申告欄と価格欄を半端に同居した社内フォーム）",
    metaLines: [
      "整理番号: IW-26-0571        作成日: 2026-05-09",
      "申告等種別: （未記入）        輸入者コード: 1234567890",
      "輸入者名: Sakura Foods Co., Ltd.",
      "仕出人 / Exporter: Green Valley Produce",
      "インボイス番号: GVP-2026-118      建値: FOB",
    ],
    tableHeader: ["欄", "項目 / Item", "申告値 / Declared", "資料値 / Source"],
    tableRows: [
      ["01", "貨物個数 / Packages", "（空欄）", "320 CT"],
      ["02", "貨物重量 / Gross", "（空欄）", "4,150 kg"],
      ["03", "インボイス価格 / Value", "（空欄）", "USD 23,400.00"],
      ["04", "原産地 / Origin", "（空欄）", "Thailand"],
    ],
    footerLines: [
      "※本シートは申告前の下書きです。正式な申告帳票ではありません。",
      "備考: 数値は添付インボイスから転記予定。担当者確認待ち。",
    ],
  },
];

function drawDoc(font: { path: string; family: string }, spec: DocSpec): void {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.registerFont("jp", font.path, font.family);
  doc.font("jp");

  const outPath = path.join(OUT_DIR, spec.file);
  doc.pipe(fs.createWriteStream(outPath));

  // 中立的な表題（あえて「INVOICE」等の明示的な種別語を避ける）
  doc.fontSize(15).text(spec.title, { align: "center" });
  doc.moveDown(0.5);
  doc
    .fontSize(8)
    .fillColor("#666")
    .text("— 書類種別を明示しない様式（耐性チェック用フィクスチャ）—", { align: "center" });
  doc.fillColor("#000");
  doc.moveDown(1);

  // メタ情報（複数種別の特徴を混在）
  doc.fontSize(9.5);
  for (const line of spec.metaLines) {
    doc.text(line);
  }
  doc.moveDown(1);

  // 明細テーブル（簡易グリッド）
  const startX = doc.x;
  let y = doc.y;
  const colWidths = computeColWidths(spec.tableHeader.length);
  const rowH = 20;

  // ヘッダ行
  drawRow(doc, startX, y, colWidths, rowH, spec.tableHeader, true);
  y += rowH;
  for (const row of spec.tableRows) {
    drawRow(doc, startX, y, colWidths, rowH, row, false);
    y += rowH;
  }

  doc.y = y + 16;
  doc.x = startX;

  // フッター注記
  doc.fontSize(9.5);
  for (const line of spec.footerLines) {
    doc.text(line);
    doc.moveDown(0.2);
  }

  doc.end();
}

// A4(595pt) - margin*2(100) ≒ 495pt を列数で按分（先頭列はやや狭く）
function computeColWidths(n: number): number[] {
  const total = 495;
  if (n <= 1) return [total];
  const first = 36;
  const rest = (total - first) / (n - 1);
  return [first, ...Array(n - 1).fill(rest)];
}

function drawRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  colWidths: number[],
  rowH: number,
  cells: string[],
  isHeader: boolean
): void {
  let cx = x;
  if (isHeader) {
    doc.rect(x, y, colWidths.reduce((a, b) => a + b, 0), rowH).fill("#eee");
    doc.fillColor("#000");
  }
  doc.fontSize(8.5);
  for (let i = 0; i < cells.length; i++) {
    const w = colWidths[i];
    doc.rect(cx, y, w, rowH).strokeColor("#999").lineWidth(0.5).stroke();
    doc.fillColor("#000").text(cells[i] ?? "", cx + 3, y + 6, {
      width: w - 6,
      height: rowH - 4,
      ellipsis: true,
      lineBreak: false,
    });
    cx += w;
  }
}

function main(): void {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const font = resolveFont();
  console.log(`使用フォント: ${font.family} (${font.path})`);
  for (const spec of SPECS) {
    drawDoc(font, spec);
    console.log(`生成: fixtures/${spec.file}  — 紛らわしさ: ${spec.intent}`);
  }
  console.log("完了: 種別あやふや系フィクスチャ4枚を生成しました。");
}

main();
