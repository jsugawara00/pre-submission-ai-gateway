/**
 * schema.ts のユニットテスト。
 * 設計書v0.2「第1章 全体構造」に掲載された例JSONがそのまま通ることを検証し、
 * スキーマが設計の正本と一致していることを保証する。
 */

import { describe, it, expect } from "vitest";
import { checkResultSchema } from "./schema";

// 設計書v0.2 第1章の例JSON（そのまま転記）
const designExample = {
  check_id: "chk_20260612_0001",
  mode: "post",
  documents: [
    {
      doc_id: "d1",
      detected_type: "declaration_form",
      detected_type_label: "申告登録帳票",
      confidence: 0.98,
      summary: "IDA登録控。共通部および2欄の品目明細を含む。",
    },
    {
      doc_id: "d2",
      detected_type: "invoice",
      detected_type_label: "インボイス",
      confidence: 0.97,
      summary: "Invoice No. 4471。3品目、合計USD 124,500、CIF。",
    },
    {
      doc_id: "d3",
      detected_type: "packing_list",
      detected_type_label: "パッキングリスト",
      confidence: 0.95,
      summary: "125 CT、グロス重量 3,420 KG。",
    },
  ],
  findings: [
    {
      finding_id: "f1",
      category: "transcription_error",
      field_key: "invoice_price",
      field_label: "インボイス価格",
      declared_value: "USD 142,500",
      source_value: "USD 124,500",
      source_refs: [{ doc_id: "d2", page: 1, location: "明細合計欄（TOTAL）" }],
      risk: "high",
      reason: "申告側とインボイス記載額に18,000の差。桁または数字の入れ違いの可能性が高く、課税価格に直接影響する。",
      suggestion: "インボイス原本のTOTAL欄を確認し、124,500への修正を検討してください。",
    },
    {
      finding_id: "f2",
      category: "document_mismatch",
      field_key: "package_count",
      field_label: "貨物個数",
      declared_value: "120 CT",
      source_value: "125 CT",
      source_refs: [{ doc_id: "d3", page: 1, location: "TOTAL PACKAGES" }],
      risk: "medium",
      reason: "パッキングリストと5CTの差。分割船積みまたは仕分けの可能性がある。",
      suggestion: "仕分けの有無を確認してください。",
    },
    {
      finding_id: "f3",
      category: "anomaly",
      field_key: null,
      field_label: "単価整合性",
      declared_value: null,
      source_value: null,
      source_refs: [{ doc_id: "d2", page: 1, location: "明細2行目" }],
      risk: "low",
      reason: "明細2行目の単価×数量が行合計と一致しない（差異 USD 12）。端数処理の可能性が高い。",
      suggestion: "端数処理ルールを確認してください。",
    },
  ],
  unverified: [
    {
      field_key: "insurance_amount",
      field_label: "保険金額",
      reason: "保険料明細に該当する書類が添付されていないため照合できなかった。",
    },
  ],
  clarifications: [
    {
      clarification_id: "c1",
      field_key: "gross_weight",
      field_label: "貨物重量（グロス）",
      doc_id: "d3",
      page: 1,
      location: "GROSS WEIGHT欄",
      region_hint: { x_pct: 62, y_pct: 78, w_pct: 20, h_pct: 5 },
      ai_reading: "3,420 KG",
      confidence: 0.52,
      candidates: ["3,420 KG", "3,426 KG", "3,428 KG"],
      question: "FAX由来のため末尾の数字が不鮮明です。原本を確認して正しい値を入力してください。",
      status: "open",
    },
  ],
  summary: {
    high: 1,
    medium: 1,
    low: 1,
    unverified: 1,
    clarifications_open: 1,
    verdict: "blocked",
    headline: "高リスクの不一致が1件あります。インボイス価格を確認してください。",
  },
};

describe("checkResultSchema", () => {
  it("設計書v0.2の例JSONをそのまま受理する", () => {
    const result = checkResultSchema.safeParse(designExample);
    expect(result.success).toBe(true);
  });

  it("field_key が null の finding（anomaly）を許容する", () => {
    const result = checkResultSchema.safeParse(designExample);
    expect(result.success).toBe(true);
    if (result.success) {
      const anomaly = result.data.findings.find((f) => f.category === "anomaly");
      expect(anomaly?.field_key).toBeNull();
    }
  });

  // 不正値の注入用: 構造を深くコピーして any 扱いで自由に改変する
  const cloneAsAny = (): any => JSON.parse(JSON.stringify(designExample));

  it("risk が未定義の値だと拒否する", () => {
    const invalid = cloneAsAny();
    invalid.findings[0].risk = "critical";
    const result = checkResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("必須フィールド（summary.verdict）の欠落を拒否する", () => {
    const invalid = cloneAsAny();
    delete invalid.summary.verdict;
    const result = checkResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("confidence が範囲外（>1）だと拒否する", () => {
    const invalid = cloneAsAny();
    invalid.documents[0].confidence = 1.5;
    const result = checkResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  // --- role（改訂1） ---

  it("documents に role が無くても通り、default で reference になる（後方互換）", () => {
    const result = checkResultSchema.safeParse(designExample);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.documents.every((d) => d.role === "reference")).toBe(true);
    }
  });

  it("documents に role=target / reference を明示した場合はその値を保持する", () => {
    const withRole = cloneAsAny();
    withRole.documents[0].role = "target";
    withRole.documents[1].role = "reference";
    const result = checkResultSchema.safeParse(withRole);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.documents[0].role).toBe("target");
      expect(result.data.documents[1].role).toBe("reference");
    }
  });

  it("role に未定義の値（target/reference 以外）を拒否する", () => {
    const invalid = cloneAsAny();
    invalid.documents[0].role = "primary";
    const result = checkResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
