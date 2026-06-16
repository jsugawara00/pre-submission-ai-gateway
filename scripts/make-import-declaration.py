# -*- coding: utf-8 -*-
"""
輸入申告控（チェック対象=target）のPDFを生成する（テスト用）。
- NACCS「輸入申告控－Ａ」の帳票レイアウトを参考にした罫線帳票（表紙＋欄別明細の2ページ）。
- 値は sample-document の元資料（インボイス/PL/B/L/運賃請求書/保険証券）と完全一致させた原本。
- 申告年月日・申告番号・あて先税関・入港年月日は元資料に無いためテスト用の架空値。
出力: sample-document/07_Import_Declaration.pdf
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle,
                                Paragraph, Spacer, PageBreak)
from reportlab.lib.styles import ParagraphStyle

pdfmetrics.registerFont(TTFont("JP", "C:/Windows/Fonts/msgothic.ttc", subfontIndex=0))
FONT = "JP"

OUT = "sample-document/07_Import_Declaration.pdf"

title_st = ParagraphStyle("title", fontName=FONT, fontSize=12, leading=16, alignment=1)
sub_st   = ParagraphStyle("sub",   fontName=FONT, fontSize=9,  leading=12, alignment=0)
cell_st  = ParagraphStyle("cell",  fontName=FONT, fontSize=8.5, leading=11)
note_st  = ParagraphStyle("note",  fontName=FONT, fontSize=7,  leading=9, textColor=colors.grey)

def P(t):
    return Paragraph(str(t).replace("\n", "<br/>"), cell_st)

LABEL_BG = colors.Color(0.90, 0.90, 0.90)

def grid(data, col_widths, label_cols=()):
    """ラベル列に薄い背景を付けた罫線テーブルを作る。"""
    t = Table(data, colWidths=col_widths)
    style = [
        ("FONTNAME", (0, 0), (-1, -1), FONT),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for c in label_cols:
        style.append(("BACKGROUND", (c, 0), (c, -1), LABEL_BG))
    t.setStyle(TableStyle(style))
    return t

def build():
    doc = SimpleDocTemplate(OUT, pagesize=A4,
                            leftMargin=15*mm, rightMargin=15*mm,
                            topMargin=14*mm, bottomMargin=14*mm)
    W = doc.width
    elems = []

    # ===== 表紙 =====
    elems.append(Paragraph("輸入（納税）申告控（内国消費税等課税標準数量等申告控兼用）", title_st))
    elems.append(Spacer(1, 2*mm))
    elems.append(Paragraph("&lt;SEA/IMP&gt;　帳票タイトル：輸入申告控－Ａ", sub_st))
    elems.append(Spacer(1, 3*mm))

    # 申告ヘッダー
    hdr = [
        [P("申告等種別"), P("輸入（IDA）"), P("あて先税関／部門"), P("東京税関／通関第1部門"), P("申告番号"), P("1234567890-1")],
        [P("区分"), P("1（書類審査）"), P("申告年月日"), P("2026-04-22"), P("本申告"), P("＊")],
    ]
    elems.append(grid(hdr, [W*0.13, W*0.20, W*0.16, W*0.22, W*0.12, W*0.17],
                      label_cols=(0, 2, 4)))
    elems.append(Spacer(1, 2*mm))

    # 当事者
    party = [
        [P("輸入者"), P("Tokyo Apparel Import K.K.\n4-5-6 Nihonbashi, Chuo-ku, Tokyo 103-0027, Japan")],
        [P("仕出人"), P("Saigon Textile Export Co., Ltd.\n123 Nguyen Hue Blvd, District 1, Ho Chi Minh City, Vietnam")],
    ]
    elems.append(grid(party, [W*0.13, W*0.87], label_cols=(0,)))
    elems.append(Spacer(1, 2*mm))

    # 貨物
    cargo = [
        [P("B/L番号"), P("SGNTYO260418"), P("積載船（機）名"), P("OCEAN HARMONY V.025E")],
        [P("貨物個数"), P("100 CT"), P("貨物重量（グロス）"), P("1,150.0 KG")],
        [P("積出地"), P("Ho Chi Minh City, Vietnam"), P("船（取）卸港"), P("Tokyo, Japan")],
        [P("入港年月日"), P("2026-04-25"), P("原産地"), P("VN（Vietnam）")],
    ]
    elems.append(grid(cargo, [W*0.13, W*0.37, W*0.18, W*0.32], label_cols=(0, 2)))
    elems.append(Spacer(1, 2*mm))

    # 仕入書・価格
    price = [
        [P("仕入書番号"), P("INV-2026-0418"), P("価格条件（建値）"), P("FOB")],
        [P("インボイス通貨"), P("USD"), P("インボイス価格"), P("22,500.00")],
        [P("運賃"), P("USD 850.00"), P("保険金額"), P("USD 25,685.00")],
    ]
    elems.append(grid(price, [W*0.13, W*0.37, P_w := W*0.18, W*0.32], label_cols=(0, 2)))
    elems.append(Spacer(1, 3*mm))

    elems.append(Paragraph(
        "※ 申告年月日・申告番号・あて先税関・入港年月日はテスト用の架空値です。"
        "その他の項目は sample-document の元資料と一致しています。", note_st))

    elems.append(PageBreak())

    # ===== 2枚目: 欄別明細 =====
    elems.append(Paragraph("輸入申告控－Ａ（つづき）　＜欄別明細＞", title_st))
    elems.append(Spacer(1, 3*mm))

    detail = [
        [P("欄"), P("品目番号（HS）"), P("品名"), P("数量"), P("申告価格")],
        [P("01"), P("6109.10"),
         P("Men's Cotton T-Shirt (Style CT-100)"),
         P("5,000 PCS"), P("USD 22,500.00")],
    ]
    dt = grid(detail, [W*0.07, W*0.16, W*0.45, W*0.14, W*0.18], label_cols=())
    dt.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), FONT),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, 0), LABEL_BG),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elems.append(dt)
    elems.append(Spacer(1, 3*mm))

    summ = [
        [P("申告価格合計"), P("USD 22,500.00"), P("欄数"), P("1")],
    ]
    elems.append(grid(summ, [W*0.20, W*0.40, W*0.12, W*0.28], label_cols=(0, 2)))
    elems.append(Spacer(1, 6*mm))

    box = [[P("［税関記入欄］\n\n　審査印　　　　　　　許可・承認年月日")]]
    elems.append(grid(box, [W], label_cols=()))

    doc.build(elems)
    print("OK:", OUT)

if __name__ == "__main__":
    build()
