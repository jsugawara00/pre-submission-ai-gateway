# -*- coding: utf-8 -*-
"""
耐性チェック用「文字不鮮明」フィクスチャ生成スクリプト

目的:
  - 書類全体は読めるが、特定のキー値（金額・重量・個数・番号）だけを
    わざと判読困難（かすれ・にじみ・つぶれ）にしたPDFを生成する。
  - 照合エンジンが不鮮明な値を「無理に推測して断定」せず、候補(candidates)と
    確信度(confidence)を添えて clarifications（聞き返し）に入れるか、を観察する弾。

なぜ画像で作るか:
  - PDFにテキストレイヤーが残ると、AIはそれを抽出して普通に読めてしまい、
    不鮮明化の意味がない。そこで文字を画像としてレンダリングし、キー領域だけ
    劣化させてからPDF化する（テキストレイヤーを持たせない）。

注意:
  - 実在企業名・実在B/L番号は使わない（CLAUDE.md 作業の進め方）。
  - 日本語は Windows 標準 MS Gothic（msgothic.ttc, index=0）を使う。
  - 劣化の強さは中程度。強すぎるとAIが全く読めず別挙動、弱いと普通に読む。
    最終調整は実APIで観察(A作業)してから行う前提。

実行: npm run gen:blurry  （= python scripts/fixtures/gen-blurry.py）
"""

import os
import sys
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# Windows既定の cp932 では日本語・em dash のprintが落ちるため標準出力をUTF-8に固定
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# --- 出力先 ---
OUT_DIR = os.path.join(os.getcwd(), "fixtures")

# --- A4 @ 200dpi 相当 ---
DPI = 200
W, H = 1654, 2339
MARGIN = 130

# --- フォント（Windows標準）---
FONT_EN = "C:/Windows/Fonts/arial.ttf"
FONT_JP = "C:/Windows/Fonts/msgothic.ttc"  # index=0 が MS-Gothic

random.seed(20260618)


def font_en(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_EN, size)


def font_jp(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_JP, size, index=0)


def degrade_region(img: Image.Image, box, mode: str = "blur") -> None:
    """
    指定矩形 box=(x0,y0,x1,y1) の領域だけを劣化させて貼り戻す。
      - blur : ガウシアンぼかし（にじみ）
      - smear: 大幅縮小→拡大でつぶす（解像度を落とした字つぶれ）
      - faint: 低コントラスト化（かすれ・薄れ）
    いずれも軽いガウスノイズを重ねて「光学的な不鮮明さ」に寄せる。
    """
    region = img.crop(box).convert("RGB")
    w, h = region.size

    if mode == "blur":
        region = region.filter(ImageFilter.GaussianBlur(radius=3.2))
    elif mode == "smear":
        small = region.resize((max(1, w // 6), max(1, h // 6)), Image.BILINEAR)
        region = small.resize((w, h), Image.BILINEAR)
        region = region.filter(ImageFilter.GaussianBlur(radius=1.4))
    elif mode == "faint":
        # 白に寄せて薄くする（かすれ）
        white = Image.new("RGB", (w, h), (255, 255, 255))
        region = Image.blend(region, white, alpha=0.62)
        region = region.filter(ImageFilter.GaussianBlur(radius=1.0))

    # 軽いノイズ（光学的なザラつき）
    noise = Image.effect_noise((w, h), 26).convert("L")
    noise_rgb = Image.merge("RGB", (noise, noise, noise))
    region = Image.blend(region, noise_rgb, alpha=0.18)

    img.paste(region, box)


def draw_value(draw, img, xy, text, fnt, mode, pad=6):
    """値テキストを描画し、その領域だけ劣化させる。劣化前のboxを返す。"""
    x, y = xy
    bbox = draw.textbbox((x, y), text, font=fnt)
    draw.text((x, y), text, fill=(0, 0, 0), font=fnt)
    box = (bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad)
    degrade_region(img, box, mode)
    return box


def new_page():
    img = Image.new("RGB", (W, H), (255, 255, 255))
    return img, ImageDraw.Draw(img)


def line(draw, x, y, text, fnt, fill=(0, 0, 0)):
    draw.text((x, y), text, fill=fill, font=fnt)


# ---------------------------------------------------------------------------
# 各書類の組み立て
# ---------------------------------------------------------------------------

def build_invoice_blurry():
    """blurry_1: インボイス。合計金額(TOTAL)がにじんで判読困難。"""
    img, d = new_page()
    x = MARGIN
    y = MARGIN

    line(d, x, y, "COMMERCIAL INVOICE", font_en(54)); y += 90
    d.line((x, y, W - MARGIN, y), fill=(120, 120, 120), width=2); y += 30

    meta = [
        "Invoice No: INV-7782",
        "Seller: HARBOR LINE SUPPLY CORP.",
        "Buyer: KITA TRADING CO., LTD.",
        "Incoterms: CIF        Currency: USD        Date: 2026-04-22",
    ]
    for m in meta:
        line(d, x, y, m, font_en(34)); y += 52
    y += 30

    line(d, x, y, "Description                         Qty        Unit       Amount", font_en(32)); y += 50
    rows = [
        "Ceramic tile 300x300       4,000 pcs   @ 9.80    = 39,200",
        "Adhesive mortar 25kg        600 bag    @ 18.50   = 11,100",
        "Grout filler 5kg            900 bag    @ 7.20    =  6,480",
    ]
    for r in rows:
        line(d, x, y, r, font_en(30)); y += 46
    y += 50

    # ここがキー: 合計金額をにじませる（56,780 が読み取りにくい）
    line(d, x, y, "TOTAL: USD ", font_en(40))
    draw_value(d, img, (x + 250, y), "56,780.00", font_en(40), "blur")
    y += 80
    line(d, x, y, "(金額は添付の支払明細と一致のこと)", font_jp(26))

    return img, "blurry_1.pdf", "インボイス: 合計金額 56,780.00 をにじませ（blur）"


def build_packing_blurry():
    """blurry_2: パッキングリスト。総重量の数字がかすれ。"""
    img, d = new_page()
    x = MARGIN
    y = MARGIN

    line(d, x, y, "PACKING LIST", font_en(54)); y += 90
    d.line((x, y, W - MARGIN, y), fill=(120, 120, 120), width=2); y += 30

    meta = [
        "Invoice No: INV-7782",
        "Shipper: HARBOR LINE SUPPLY CORP.",
        "Consignee: KITA TRADING CO., LTD.",
    ]
    for m in meta:
        line(d, x, y, m, font_en(34)); y += 52
    y += 30

    line(d, x, y, "Total Packages: 248 CT", font_en(38)); y += 64

    # ここがキー: 総重量をかすれさせる（faint）
    line(d, x, y, "Gross Weight: ", font_en(38))
    draw_value(d, img, (x + 300, y), "8,640 KG", font_en(38), "faint")
    y += 64

    line(d, x, y, "Net Weight: 8,120 KG", font_en(38)); y += 80
    line(d, x, y, "梱包明細:", font_jp(30)); y += 50
    for r in ["Ceramic tile      150 CT", "Adhesive mortar    60 CT", "Grout filler       38 CT"]:
        line(d, x, y, r, font_en(30)); y += 46

    return img, "blurry_2.pdf", "パッキングリスト: 総重量 8,640 KG をかすれさせ（faint）"


def build_declaration_blurry():
    """blurry_3: 申告帳票。個数とインボイス番号末尾がつぶれ。"""
    img, d = new_page()
    x = MARGIN
    y = MARGIN

    line(d, x, y, "IMPORT DECLARATION (Registered Copy)", font_en(40)); y += 76
    d.line((x, y, W - MARGIN, y), fill=(120, 120, 120), width=2); y += 30

    line(d, x, y, "Declaration Type: Import (IDA)", font_en(32)); y += 50
    line(d, x, y, "Importer: KITA TRADING CO., LTD.", font_en(32)); y += 50
    line(d, x, y, "Exporter: HARBOR LINE SUPPLY CORP.", font_en(32)); y += 50

    # キー1: インボイス番号の末尾がつぶれ（INV-77?? に見える）
    line(d, x, y, "Invoice No: ", font_en(32))
    draw_value(d, img, (x + 200, y), "INV-7782", font_en(32), "smear")
    y += 50

    line(d, x, y, "B/L No: HLSC2026099", font_en(32)); y += 50

    # キー2: 個数がつぶれて判読困難（248 が 2?8 に見える）
    line(d, x, y, "Package Count: ", font_en(32))
    draw_value(d, img, (x + 270, y), "248 CT", font_en(32), "smear")
    y += 50

    line(d, x, y, "Gross Weight: 8,640 KG", font_en(32)); y += 50
    line(d, x, y, "Invoice Price: USD 56,780", font_en(32)); y += 50
    line(d, x, y, "Origin: VN    Currency: USD    Incoterms: CIF", font_en(32)); y += 70
    line(d, x, y, "(不鮮明な欄は原本で要確認)", font_jp(26))

    return img, "blurry_3.pdf", "申告帳票: インボイス番号と個数 248 をつぶし（smear）"


def save_pdf(img: Image.Image, filename: str) -> None:
    path = os.path.join(OUT_DIR, filename)
    img.save(path, "PDF", resolution=DPI)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    builders = [build_invoice_blurry, build_packing_blurry, build_declaration_blurry]
    print("文字不鮮明系フィクスチャを生成します（画像化＋劣化、テキストレイヤーなし）")
    for b in builders:
        img, fname, intent = b()
        save_pdf(img, fname)
        print(f"生成: fixtures/{fname}  — 狙い: {intent}")
    print("完了: 文字不鮮明系フィクスチャ3枚を生成しました。")


if __name__ == "__main__":
    main()
