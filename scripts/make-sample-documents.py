# -*- coding: utf-8 -*-
"""
関係書類(reference)6種を reportlab で直接PDF生成する（テスト用の原本）。
- Excel/Word→LibreOffice変換ではデータが化ける事例があったため、テキストPDFを直接生成する。
- 1取引（ベトナム→日本／綿Tシャツ5,000枚／INV-2026-0418／FOB USD22,500）で全書類を整合。
出力: sample-document/01..06_*.pdf
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import ParagraphStyle

OUT = "sample-document"
FONT = "Helvetica"
FONT_B = "Helvetica-Bold"

title_st = ParagraphStyle("t", fontName=FONT_B, fontSize=14, leading=18, alignment=1)
note_st  = ParagraphStyle("n", fontName=FONT, fontSize=7.5, leading=10, textColor=colors.grey)
body_st  = ParagraphStyle("b", fontName=FONT, fontSize=9, leading=12)
cell_st  = ParagraphStyle("c", fontName=FONT, fontSize=8.5, leading=11)
cellb_st = ParagraphStyle("cb", fontName=FONT_B, fontSize=8.5, leading=11)

def P(t, st=cell_st):
    return Paragraph(str(t), st)

# 共通データ
C = dict(
    invoice_no="INV-2026-0418", invoice_date="2026-04-18",
    bl_no="SGNTYO260418", bl_date="2026-04-20",
    vessel="OCEAN HARMONY V.025E",
    pol="Ho Chi Minh City, Vietnam", pod="Tokyo, Japan",
    exporter="Saigon Textile Export Co., Ltd.",
    exporter_addr="123 Nguyen Hue Blvd, District 1, Ho Chi Minh City, Vietnam",
    consignee="Tokyo Apparel Import K.K.",
    consignee_addr="4-5-6 Nihonbashi, Chuo-ku, Tokyo 103-0027, Japan",
    incoterms="FOB Ho Chi Minh City",
    hs="6109.10", item="Men's Cotton T-Shirt (Style CT-100)",
    pcs="5,000", cartons="100", nw="1,000.0", gw="1,150.0", cbm="8.5",
    origin="Vietnam",
)

def info_table(pairs, W):
    """[(label,value),...] を 4列(label|value|label|value) の薄罫線テーブルにする。"""
    rows, cur = [], []
    for label, value in pairs:
        cur += [P(label, cellb_st), P(value)]
        if len(cur) == 4:
            rows.append(cur); cur = []
    if cur:
        cur += [P(""), P("")] * 0
        while len(cur) < 4:
            cur.append(P(""))
        rows.append(cur)
    t = Table(rows, colWidths=[W*0.16, W*0.34, W*0.16, W*0.34])
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.Color(0.7, 0.7, 0.7)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, -1), colors.Color(0.94, 0.94, 0.94)),
        ("BACKGROUND", (2, 0), (2, -1), colors.Color(0.94, 0.94, 0.94)),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t

def grid_table(data, widths):
    t = Table(data, colWidths=widths)
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.Color(0.90, 0.90, 0.90)),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t

def doc(name):
    return SimpleDocTemplate(f"{OUT}/{name}", pagesize=A4,
                             leftMargin=15*mm, rightMargin=15*mm, topMargin=16*mm, bottomMargin=16*mm)

def build_invoice():
    d = doc("01_Commercial_Invoice.pdf"); W = d.width; e = []
    e += [Paragraph("COMMERCIAL INVOICE", title_st), Spacer(1, 4*mm)]
    e += [info_table([
        ("Exporter", C["exporter"]), ("Invoice No", C["invoice_no"]),
        ("Address", C["exporter_addr"]), ("Invoice Date", C["invoice_date"]),
        ("Consignee", C["consignee"]), ("P/O No", "PO-TA-26-0331"),
        ("Address", C["consignee_addr"]), ("Payment", "T/T 30 days after B/L date"),
        ("Vessel", C["vessel"]), ("Incoterms", C["incoterms"]),
        ("Port of Loading", C["pol"]), ("B/L No", C["bl_no"]),
        ("Port of Discharge", C["pod"]), ("Country of Origin", C["origin"]),
    ], W), Spacer(1, 4*mm)]
    e += [grid_table([
        [P("HS Code", cellb_st), P("Description / Style", cellb_st), P("Quantity (pcs)", cellb_st),
         P("Unit Price", cellb_st), P("Amount", cellb_st), P("Currency", cellb_st)],
        [P(C["hs"]), P(C["item"]), P(C["pcs"]), P("4.50"), P("22,500.00"), P("USD")],
        [P(""), P("TOTAL", cellb_st), P(""), P(""), P("22,500.00", cellb_st), P("USD", cellb_st)],
    ], [W*0.12, W*0.40, W*0.14, W*0.12, W*0.14, W*0.08]), Spacer(1, 4*mm)]
    e += [Paragraph(f"Total packages: {C['cartons']} cartons", body_st),
          Paragraph(f"Net weight: {C['nw']} kg / Gross weight: {C['gw']} kg", body_st),
          Spacer(1, 6*mm),
          Paragraph(C["exporter"], body_st), Paragraph("Authorized Signature", body_st)]
    d.build(e)

def build_packing():
    d = doc("02_Packing_List.pdf"); W = d.width; e = []
    e += [Paragraph("PACKING LIST", title_st), Spacer(1, 4*mm)]
    e += [info_table([
        ("Exporter", C["exporter"]), ("Invoice No", C["invoice_no"]),
        ("Consignee", C["consignee"]), ("Invoice Date", C["invoice_date"]),
        ("Vessel", C["vessel"]), ("B/L No", C["bl_no"]),
        ("Port of Loading", C["pol"]), ("Port of Discharge", C["pod"]),
    ], W), Spacer(1, 4*mm)]
    e += [grid_table([
        [P("Carton No", cellb_st), P("Description / Style", cellb_st), P("Qty/Ctn", cellb_st),
         P("Cartons", cellb_st), P("Total Pcs", cellb_st), P("N.W. (kg)", cellb_st), P("G.W. (kg)", cellb_st)],
        [P("1-100"), P(C["item"]), P("50"), P(C["cartons"]), P(C["pcs"]), P(C["nw"]), P(C["gw"])],
        [P(""), P("TOTAL", cellb_st), P(""), P(C["cartons"], cellb_st), P(C["pcs"], cellb_st),
         P(C["nw"], cellb_st), P(C["gw"], cellb_st)],
    ], [W*0.12, W*0.34, W*0.10, W*0.11, W*0.11, W*0.11, W*0.11]), Spacer(1, 4*mm)]
    e += [Paragraph(f"Total measurement: {C['cbm']} CBM", body_st), Spacer(1, 6*mm),
          Paragraph(C["exporter"], body_st), Paragraph("Authorized Signature", body_st)]
    d.build(e)

def build_bl():
    d = doc("03_Bill_of_Lading.pdf"); W = d.width; e = []
    e += [Paragraph("BILL OF LADING", title_st),
          Paragraph("(Non-negotiable copy - for sample / testing use only)", note_st), Spacer(1, 4*mm)]
    e += [info_table([
        ("B/L No", C["bl_no"]), ("B/L Date", C["bl_date"]),
        ("Shipper", C["exporter"]), ("Ocean Vessel / Voyage", C["vessel"]),
        ("Consignee", C["consignee"]), ("Place of Delivery", C["pod"]),
        ("Notify Party", C["consignee"]), ("No. of Original B/L", "THREE (3)"),
        ("Port of Loading", C["pol"]), ("Freight", "FOB Ho Chi Minh City (Freight Collect)"),
        ("Port of Discharge", C["pod"]), ("", ""),
    ], W), Spacer(1, 4*mm)]
    e += [grid_table([
        [P("Marks & Numbers", cellb_st), P("No. of Pkgs", cellb_st),
         P("Description of Goods", cellb_st), P("Gross Weight / Meas.", cellb_st)],
        [P(f"{C['consignee']}<br/>{C['invoice_no']}<br/>MADE IN VIETNAM"),
         P(f"{C['cartons']} CARTONS"),
         P(f"{C['item']}<br/>{C['pcs']} PCS<br/>HS Code: {C['hs']}"),
         P(f"{C['gw']} KG<br/>{C['cbm']} CBM")],
    ], [W*0.26, W*0.16, W*0.36, W*0.22]), Spacer(1, 4*mm)]
    e += [Paragraph("SHIPPED on board the vessel named above in apparent good order and condition.", body_st),
          Spacer(1, 6*mm), Paragraph("For the Carrier", body_st)]
    d.build(e)

def build_co():
    d = doc("04_Certificate_of_Origin.pdf"); W = d.width; e = []
    e += [Paragraph("CERTIFICATE OF ORIGIN", title_st),
          Paragraph("(Sample / testing use only)", note_st), Spacer(1, 4*mm)]
    e += [info_table([
        ("Certificate No", "CO-INV-2026-0418"), ("Country of Origin", C["origin"]),
        ("Exporter", C["exporter"]), ("Means of Transport", f"By sea - {C['vessel']}"),
        ("Consignee", C["consignee"]), ("Invoice No / Date", f"{C['invoice_no']} / {C['invoice_date']}"),
        ("Port of Loading", C["pol"]), ("Port of Discharge", C["pod"]),
    ], W), Spacer(1, 4*mm)]
    e += [grid_table([
        [P("Item", cellb_st), P("Marks & Nos", cellb_st), P("Description of Goods", cellb_st),
         P("HS Code", cellb_st), P("Quantity", cellb_st)],
        [P("1"), P(f"{C['cartons']} CARTONS"), P(C["item"]), P(C["hs"]), P(f"{C['pcs']} PCS")],
    ], [W*0.08, W*0.20, W*0.42, W*0.14, W*0.16]), Spacer(1, 4*mm)]
    e += [Paragraph("It is hereby certified that the goods described above are of Vietnam origin.", body_st),
          Paragraph("Place and Date: Ho Chi Minh City, 2026-04-18", body_st),
          Spacer(1, 6*mm), Paragraph("Authorized Signature / Stamp", body_st)]
    d.build(e)

def build_freight():
    d = doc("05_Freight_Debit_Note.pdf"); W = d.width; e = []
    e += [Paragraph("FREIGHT DEBIT NOTE", title_st),
          Paragraph("(Sample / testing use only)", note_st), Spacer(1, 4*mm)]
    e += [info_table([
        ("Issued by", "Tokyo Global Logistics Co., Ltd."), ("Debit Note No", "FDN-2026-0418"),
        ("Address", "2-3-1 Kaigan, Minato-ku, Tokyo 105-0022, Japan"), ("Date", "2026-04-21"),
        ("Debtor", C["consignee"]), ("Invoice No", C["invoice_no"]),
        ("Address", C["consignee_addr"]), ("B/L No", C["bl_no"]),
        ("Vessel", C["vessel"]), ("Incoterms", C["incoterms"]),
        ("Port of Loading", C["pol"]), ("Freight Term", "Freight Collect"),
        ("Port of Discharge", C["pod"]), ("Shipment", f"{C['cartons']} cartons / {C['cbm']} CBM"),
        ("Exchange Rate", "USD 1 = JPY 150.00 (assumed)"), ("", ""),
    ], W), Spacer(1, 4*mm)]
    e += [grid_table([
        [P("Description of Charges", cellb_st), P("Currency", cellb_st), P("Amount (USD)", cellb_st),
         P("Rate (USD1=JPY)", cellb_st), P("Amount (JPY)", cellb_st)],
        [P("Ocean Freight (Ho Chi Minh City - Tokyo)"), P("USD"), P("850.00"), P("150.00"), P("127,500")],
        [P("TOTAL", cellb_st), P("USD", cellb_st), P("850.00", cellb_st), P(""), P("127,500", cellb_st)],
    ], [W*0.40, W*0.12, W*0.16, W*0.16, W*0.16]), Spacer(1, 4*mm)]
    e += [Paragraph("Remarks: Ocean freight billed on Freight Collect basis under FOB Ho Chi Minh City terms. "
                    "JPY amounts converted at the assumed rate USD 1 = JPY 150.00.", body_st),
          Spacer(1, 6*mm), Paragraph("Tokyo Global Logistics Co., Ltd.", body_st),
          Paragraph("Authorized Signature", body_st)]
    d.build(e)

def build_insurance():
    d = doc("06_Insurance_Policy.pdf"); W = d.width; e = []
    e += [Paragraph("MARINE CARGO INSURANCE POLICY", title_st),
          Paragraph("(Sample / testing use only)", note_st), Spacer(1, 4*mm)]
    e += [info_table([
        ("Insurer", "Shinwa Marine & Fire Insurance Co., Ltd."), ("Policy No", "MAR-2026-0418"),
        ("Address", "1-2-3 Marunouchi, Chiyoda-ku, Tokyo 100-0005, Japan"), ("Issue Date / Place", "2026-04-19, Tokyo, Japan"),
        ("Assured", C["consignee"]), ("Ref Invoice No / Date", f"{C['invoice_no']} / {C['invoice_date']}"),
        ("B/L No", C["bl_no"]), ("Vessel / Voyage", C["vessel"]),
        ("From / To", f"{C['pol']} to {C['pod']}"), ("Trade Terms", "FOB Ho Chi Minh City"),
        ("Conditions", "Institute Cargo Clauses (A)"), ("Exchange Rate", "USD 1 = JPY 150.00 (assumed)"),
    ], W), Spacer(1, 3*mm)]
    e += [grid_table([
        [P("Item", cellb_st), P("Value", cellb_st)],
        [P("CIF Basis"), P("FOB USD 22,500.00 + Ocean Freight USD 850.00 = USD 23,350.00")],
        [P("Insured Amount"), P("USD 25,685.00  (= CIF USD 23,350.00 x 110%)  /  JPY 3,852,750")],
        [P("Premium Rate"), P("0.25%")],
        [P("Premium"), P("USD 64.21  /  JPY 9,632")],
    ], [W*0.22, W*0.78]), Spacer(1, 3*mm)]
    e += [grid_table([
        [P("Subject Matter Insured", cellb_st), P("Quantity", cellb_st), P("Packages", cellb_st),
         P("Country of Origin", cellb_st), P("HS Code", cellb_st)],
        [P(C["item"]), P(f"{C['pcs']} PCS"), P(f"{C['cartons']} cartons"), P(C["origin"]), P(C["hs"])],
    ], [W*0.36, W*0.16, W*0.16, W*0.18, W*0.14]), Spacer(1, 4*mm)]
    e += [Paragraph("We, the Insurer, in consideration of the premium stated above, insure the goods described "
                    "herein against the risks covered by the conditions specified, for the voyage indicated.", body_st),
          Spacer(1, 5*mm), Paragraph("Shinwa Marine & Fire Insurance Co., Ltd.", body_st),
          Paragraph("Authorized Signature / Stamp", body_st)]
    d.build(e)

if __name__ == "__main__":
    build_invoice(); build_packing(); build_bl(); build_co(); build_freight(); build_insurance()
    print("OK: 01-06 を sample-document/ に生成しました")
