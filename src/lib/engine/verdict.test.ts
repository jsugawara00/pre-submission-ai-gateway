/**
 * verdict.ts のユニットテスト（CLAUDE.md 第7章: verdict算出は必ずテスト）。
 */

import { describe, it, expect } from "vitest";
import { computeVerdict, finalizeCheckResult } from "./verdict";
import type { CheckResult, Finding } from "./schema";

describe("computeVerdict", () => {
  it("clarifications_open > 0 なら他が0でも blocked", () => {
    expect(computeVerdict({ high: 0, medium: 0, clarificationsOpen: 1 })).toBe("blocked");
  });

  it("clarifications_open は high より優先（どちらも blocked だが優先順位を確認）", () => {
    expect(computeVerdict({ high: 3, medium: 2, clarificationsOpen: 2 })).toBe("blocked");
  });

  it("high ≧ 1 なら blocked", () => {
    expect(computeVerdict({ high: 1, medium: 0, clarificationsOpen: 0 })).toBe("blocked");
  });

  it("medium のみなら warning", () => {
    expect(computeVerdict({ high: 0, medium: 2, clarificationsOpen: 0 })).toBe("warning");
  });

  it("すべて0なら pass", () => {
    expect(computeVerdict({ high: 0, medium: 0, clarificationsOpen: 0 })).toBe("pass");
  });
});

// テスト用の最小 Finding 生成
function finding(risk: Finding["risk"]): Finding {
  return {
    finding_id: `f_${Math.random().toString(36).slice(2)}`,
    category: "transcription_error",
    field_key: "invoice_price",
    field_label: "インボイス価格",
    declared_value: null,
    source_value: null,
    source_refs: [],
    risk,
    reason: "テスト",
    suggestion: "テスト",
  };
}

function baseResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    check_id: "chk_test",
    mode: "post",
    documents: [],
    findings: [],
    unverified: [],
    clarifications: [],
    summary: {
      high: 99, // わざと誤った値を入れ、再計算で上書きされることを確認
      medium: 99,
      low: 99,
      unverified: 99,
      clarifications_open: 99,
      verdict: "pass", // AIの自己申告。サーバー側で上書きされるべき
      headline: "",
    },
    ...overrides,
  };
}

describe("finalizeCheckResult", () => {
  it("件数を実配列から再計算し、AIの自己申告値を上書きする", () => {
    const result = baseResult({
      findings: [finding("high"), finding("medium"), finding("medium"), finding("low")],
      unverified: [{ field_key: "freight", field_label: "運賃", reason: "資料なし" }],
    });
    const finalized = finalizeCheckResult(result);
    expect(finalized.summary.high).toBe(1);
    expect(finalized.summary.medium).toBe(2);
    expect(finalized.summary.low).toBe(1);
    expect(finalized.summary.unverified).toBe(1);
    expect(finalized.summary.clarifications_open).toBe(0);
    expect(finalized.summary.verdict).toBe("blocked"); // high=1
  });

  it("open な clarification があれば blocked、resolved は数えない", () => {
    const result = baseResult({
      clarifications: [
        {
          clarification_id: "c1",
          field_key: "gross_weight",
          field_label: "貨物重量",
          doc_id: "d1",
          page: 1,
          location: "欄",
          region_hint: null,
          ai_reading: null,
          confidence: 0.5,
          candidates: [],
          question: "確認してください",
          status: "open",
        },
        {
          clarification_id: "c2",
          field_key: null,
          field_label: "個数",
          doc_id: "d1",
          page: 1,
          location: "欄",
          region_hint: null,
          ai_reading: null,
          confidence: 0.9,
          candidates: [],
          question: "確認済み",
          status: "resolved",
        },
      ],
    });
    const finalized = finalizeCheckResult(result);
    expect(finalized.summary.clarifications_open).toBe(1);
    expect(finalized.summary.verdict).toBe("blocked");
  });

  it("不一致なしなら pass、headline が空なら既定文を補う", () => {
    const finalized = finalizeCheckResult(baseResult());
    expect(finalized.summary.verdict).toBe("pass");
    expect(finalized.summary.headline).toContain("見つかりませんでした");
  });

  it("AIのheadlineが非空ならそれを保持する", () => {
    const result = baseResult();
    result.summary.headline = "独自の見出し";
    const finalized = finalizeCheckResult(result);
    expect(finalized.summary.headline).toBe("独自の見出し");
  });

  it("regenerateHeadline=true なら古い headline を温存せず新状態の既定文に作り直す", () => {
    // 確定後の再計算を模す: clarification は resolved、残りは medium のみ。
    // 初回照合時の「書類種別確認が必要」という headline が残らないことを検証する。
    const result = baseResult({
      findings: [finding("medium")],
      clarifications: [
        {
          clarification_id: "c1",
          field_key: null,
          field_label: "書類種別",
          doc_id: "d4",
          page: 1,
          location: "欄",
          region_hint: null,
          ai_reading: null,
          confidence: 0.9,
          candidates: [],
          question: "確認済み",
          status: "resolved",
        },
      ],
    });
    result.summary.headline = "d4の書類種別確認が必要です。";
    const finalized = finalizeCheckResult(result, { regenerateHeadline: true });
    expect(finalized.summary.clarifications_open).toBe(0);
    expect(finalized.summary.verdict).toBe("warning");
    expect(finalized.summary.headline).not.toContain("書類種別確認が必要");
    expect(finalized.summary.headline).toContain("中リスク");
  });

  it("元オブジェクトを変更しない（純粋関数）", () => {
    const result = baseResult({ findings: [finding("high")] });
    finalizeCheckResult(result);
    expect(result.summary.high).toBe(99); // 元は変わらない
  });
});
