import { describe, it, expect } from "vitest";
import { buildAccessDenialMessage, remainingUses, canConsume } from "./access-config";

describe("access-config", () => {
  describe("remainingUses", () => {
    it("残回数を返す", () => {
      expect(remainingUses({ max_uses: 30, used_count: 10 })).toBe(20);
    });
    it("上限到達なら0", () => {
      expect(remainingUses({ max_uses: 30, used_count: 30 })).toBe(0);
    });
    it("超過しても0未満にならない", () => {
      expect(remainingUses({ max_uses: 30, used_count: 35 })).toBe(0);
    });
  });

  describe("canConsume", () => {
    it("有効かつ上限未満なら消費可", () => {
      expect(canConsume({ max_uses: 30, used_count: 29, disabled: 0 })).toBe(true);
    });
    it("上限到達なら不可", () => {
      expect(canConsume({ max_uses: 30, used_count: 30, disabled: 0 })).toBe(false);
    });
    it("無効化されていれば残回数があっても不可（数値・真偽値とも）", () => {
      expect(canConsume({ max_uses: 30, used_count: 0, disabled: 1 })).toBe(false);
      expect(canConsume({ max_uses: 30, used_count: 0, disabled: true })).toBe(false);
    });
  });

  describe("buildAccessDenialMessage", () => {
    it("理由ごとに適切な文言を返す", () => {
      expect(buildAccessDenialMessage("not_found")).toContain("正しくありません");
      expect(buildAccessDenialMessage("disabled")).toContain("ご利用いただけません");
      expect(buildAccessDenialMessage("limit_reached")).toContain("上限");
    });
  });
});
