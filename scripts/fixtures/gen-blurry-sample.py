# -*- coding: utf-8 -*-
"""
SAMPLE-DOCUMENT と「データを揃えた」文字不鮮明フィクスチャ生成スクリプト

目的:
  - sample-document/ の一式（Saigon Textile / Tokyo Apparel / INV-2026-0418 /
    綿Tシャツ5,000枚 / GW 1,150kg / FOB USD22,500）とデータを一致させた
    「関係書類」を、キー値だけ判読困難にして生成する。
  - 申告帳票(07_Import_Declaration.pdf)を target、本スクリプトの2枚を reference として
    投入すると、AIが不鮮明な値を断定せず clarifications（聞き返し）に入れる挙動を撮影できる。
  - 真の値は正しい（22,500.00 / 1,150.0kg）まま、見た目だけにじませる＝確定すれば申告と一致。

なぜ画像で作るか:
  - PDFにテキストレイヤーが残るとAIが普通に読めてしまうため、文字を画像化して
    キー領域だけ劣化させ、テキストレイヤーを持たせない。

実行: npm run gen:blurry-sample （= python scripts/fixtures/gen-blurry-sample.py）
出力: fixtures/blurry_sample_invoice.pdf / fixtures/blurry_sample_packing.pdf
"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

OUT_DIR = os.path.join(os.getcwd(), "fixtures")
DPI = 200
W, H = 1654, 2339
MARGIN = 130
FONT_EN = "C:/Windows/Fonts/arial.ttf"
FONT_JP = "C:/Windows/Fonts/msgothic.ttc"

# --- SAMPLE-DOCUMENT と一致する共通データ ---
EXPORTER = "Saigon Textile Export Co., Ltd."
CONSIGNEE = "Tokyo Apparel Import K.K."
INV_NO = "INV-2026-0418"
INV_DATE = "2026-04-18"
BL_NO = "SGNTYO260418"
VESSEL = "OCEAN HARMONY V.025E"
ITEM = "Men's Cotton T-Shirt (Style CT-100)"
HS = "6109.10"
PCS = "5,000"
CARTONS = "100"
NW = "1,000.0"
GW = "1,150.0"  # ← パッキングリストでにじませる真値
UNIT = "4.50"
TOTAL = "22,500.00"  # ← インボイスでにじませる真値


def font_en(size):
    return ImageFont.truetype(FONT_EN, size)


def font_jp(size):
    return ImageFont.truetype(FONT_JP, size, index=0)


def degrade_region(img, box, mode="blur"):
    region = img.crop(box).convert("RGB")
    w, h = region.size
    if mode == "blur":
        region = region.filter(ImageFilter.GaussianBlur(radius=3.2))
    elif mode == "smear":
        small = region.resize((max(1, w // 6), max(1, h // 6)), Image.BILINEAR)
        region = small.resize((w, h), Image.BILINEAR)
        region = region.filter(ImageFilter.GaussianBlur(radius=1.4))
    elif mode == "faint":
        white = Image.new("RGB", (w, h), (255, 255, 255))
        region = Image.blend(region, white, alpha=0.62)
        region = region.filter(ImageFilter.GaussianBlur(radius=1.0))
    noise = Image.effect_noise((w, h), 26).convert("L")
    noise_rgb = Image.merge("RGB", (noise, noise, noise))
    region = Image.blend(region, noise_rgb, alpha=0.18)
    img.paste(region, box)


def draw_value(draw, img, xy, text, fnt, mode, pad=6):
    x, y = xy
    bbox = draw.textbbox((x, y), text, font=fnt)
    draw.text((x, y), text, fill=(0, 0, 0), font=fnt)
    box = (bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad)
    degrade_region(img, box, mode)


def new_page():
    img = Image.new("RGB", (W, H), (255, 255, 255))
    return img, ImageDraw.Draw(img)


def line(d, x, y, text, fnt, fill=(0, 0, 0)):
    d.text((x, y), text, fill=fill, font=fnt)


def build_invoice_blurry():
    """blurry_sample_invoice: TOTAL 22,500.00 をにじませる（blur）。"""
    img, d = new_page()
    x, y = MARGIN, MARGIN
    line(d, x, y, "COMMERCIAL INVOICE", font_en(54)); y += 90
    d.line((x, y, W - MARGIN, y), fill=(120, 120, 120), width=2); y += 30
    for m in [
        f"Invoice No: {INV_NO}        Date: {INV_DATE}",
        f"Exporter: {EXPORTER}",
        f"Consignee: {CONSIGNEE}",
        f"Vessel: {VESSEL}        B/L No: {BL_NO}",
        "Incoterms: FOB Ho Chi Minh City        Currency: USD",
    ]:
        line(d, x, y, m, font_en(32)); y += 50
    y += 30
    line(d, x, y, "HS Code     Description / Style              Qty(pcs)   Unit    Amount", font_en(30)); y += 50
    line(d, x, y, f"{HS}    {ITEM}", font_en(28)); y += 44
    line(d, x, y, f"            {PCS} pcs   @ {UNIT}   = {TOTAL} USD", font_en(28)); y += 70
    # キー: 合計金額をにじませる
    line(d, x, y, "TOTAL: USD ", font_en(42))
    draw_value(d, img, (x + 270, y), TOTAL, font_en(42), "blur")
    y += 90
    line(d, x, y, f"Total packages: {CARTONS} cartons", font_en(30)); y += 46
    line(d, x, y, f"Net weight: {NW} kg / Gross weight: {GW} kg", font_en(30)); y += 70
    line(d, x, y, "(金額はFAX由来のためにじみがあります。原本でご確認ください)", font_jp(24))
    return img, "blurry_sample_invoice.pdf", f"インボイス: TOTAL {TOTAL} をにじませ（blur）"


def build_packing_blurry():
    """blurry_sample_packing: Gross Weight 1,150.0 をかすれさせる（faint）。"""
    img, d = new_page()
    x, y = MARGIN, MARGIN
    line(d, x, y, "PACKING LIST", font_en(54)); y += 90
    d.line((x, y, W - MARGIN, y), fill=(120, 120, 120), width=2); y += 30
    for m in [
        f"Invoice No: {INV_NO}        Date: {INV_DATE}",
        f"Exporter: {EXPORTER}",
        f"Consignee: {CONSIGNEE}",
        f"Vessel: {VESSEL}        B/L No: {BL_NO}",
    ]:
        line(d, x, y, m, font_en(32)); y += 50
    y += 30
    line(d, x, y, f"Description: {ITEM}", font_en(30)); y += 50
    line(d, x, y, f"HS Code: {HS}        Total Cartons: {CARTONS} CT", font_en(30)); y += 50
    line(d, x, y, f"Total Pcs: {PCS}        Net Weight: {NW} kg", font_en(30)); y += 70
    # キー: 総重量をかすれさせる
    line(d, x, y, "Gross Weight: ", font_en(42))
    draw_value(d, img, (x + 320, y), f"{GW} KG", font_en(42), "faint")
    y += 100
    line(d, x, y, "(総重量の印字がかすれています。原本でご確認ください)", font_jp(24))
    return img, "blurry_sample_packing.pdf", f"パッキングリスト: Gross Weight {GW} をかすれさせ（faint）"


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("SAMPLE-DOCUMENT 揃いの文字不鮮明フィクスチャを生成します")
    for b in (build_invoice_blurry, build_packing_blurry):
        img, fname, intent = b()
        img.save(os.path.join(OUT_DIR, fname), "PDF", resolution=DPI)
        print(f"生成: fixtures/{fname}  — 狙い: {intent}")
    print("完了。target=sample-document/07_Import_Declaration.pdf と一緒に投入してください。")


if __name__ == "__main__":
    main()
