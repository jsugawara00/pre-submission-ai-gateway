import { describe, it, expect } from "vitest";
import { buildNaccsSummary, hasExportableInput } from "./naccs";

describe("hasExportableInput", () => {
  it("値が1つでもあれば true", () => {
    expect(hasExportableInput({ importer_name: "サンプル商事" })).toBe(true);
  });
  it("null / 空オブジェクト / 空文字のみは false", () => {
    expect(hasExportableInput(null)).toBe(false);
    expect(hasExportableInput(undefined)).toBe(false);
    expect(hasExportableInput({})).toBe(false);
    expect(hasExportableInput({ importer_name: "", bl_number: "   " })).toBe(false);
  });
});

describe("buildNaccsSummary", () => {
  const formInput = {
    declaration_type: "輸入（IDA）",
    importer_name: "サンプル商事株式会社",
    invoice_price: "124,500",
    invoice_currency: "USD",
    hs_code_1: "6109.10",
    item_name_1: "Cotton T-Shirts",
  };
  const text = buildNaccsSummary(formInput);

  it("コア項目のラベルと入力値を含む", () => {
    expect(text).toContain("輸入者名／コード：サンプル商事株式会社");
    expect(text).toContain("インボイス価格：124,500");
    expect(text).toContain("インボイス通貨コード：USD");
  });

  it("未入力のコア項目は（未入力）と表記する", () => {
    expect(text).toContain("B/L番号（AWB番号）：（未入力）");
  });

  it("繰返部（品目）を欄ごとに出力する", () => {
    expect(text).toContain("〈第1欄〉");
    expect(text).toContain("〈第2欄〉");
    expect(text).toContain("品目コード：6109.10");
    expect(text).toContain("品名：Cotton T-Shirts");
  });

  it("疑似サマリである旨の注記を含む", () => {
    expect(text).toContain("疑似サマリ");
  });
});
