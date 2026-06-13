/**
 * verdict（登録可否判定）と summary の確定をサーバー側で行う。
 *
 * 設計原則（CLAUDE.md 第5章 / スキーマ設計v0.2 §2.5・§2.6）:
 *  - verdict は AI に出させた値を使わず、ここで機械的に算出する
 *    （事実の検出はAI、業務判断はコードと人間、という責任分界）
 *  - 件数（high/medium/low/unverified/clarifications_open）も findings 等の
 *    実配列から再計算し、AI の自己申告に依存しない
 *
 * 判定ルール:
 *  - clarifications_open > 0 → blocked（未解決の聞き返しがある間は登録させない）
 *  - high ≧ 1            → blocked
 *  - medium のみ         → warning
 *  - それ以外            → pass
 */

import type { CheckResult, Verdict } from "./schema";

export interface VerdictInput {
  high: number;
  medium: number;
  clarificationsOpen: number;
}

export function computeVerdict(input: VerdictInput): Verdict {
  if (input.clarificationsOpen > 0) return "blocked";
  if (input.high >= 1) return "blocked";
  if (input.medium >= 1) return "warning";
  return "pass";
}

/**
 * AI 出力の CheckResult を受け取り、summary の件数と verdict を実配列から再計算して
 * 確定版を返す（headline は AI の文言を尊重し、空の場合のみ既定文を補う）。
 * 元オブジェクトは変更せず、新しいオブジェクトを返す。
 */
export function finalizeCheckResult(result: CheckResult): CheckResult {
  const high = result.findings.filter((f) => f.risk === "high").length;
  const medium = result.findings.filter((f) => f.risk === "medium").length;
  const low = result.findings.filter((f) => f.risk === "low").length;
  const unverified = result.unverified.length;
  const clarificationsOpen = result.clarifications.filter((c) => c.status === "open").length;

  const verdict = computeVerdict({ high, medium, clarificationsOpen });
  const headline = result.summary.headline?.trim()
    ? result.summary.headline
    : defaultHeadline(verdict, high, medium, clarificationsOpen);

  return {
    ...result,
    summary: {
      high,
      medium,
      low,
      unverified,
      clarifications_open: clarificationsOpen,
      verdict,
      headline,
    },
  };
}

function defaultHeadline(
  verdict: Verdict,
  high: number,
  medium: number,
  clarificationsOpen: number
): string {
  if (clarificationsOpen > 0) {
    return `確認が必要な項目が${clarificationsOpen}件あります。内容を確認してください。`;
  }
  if (verdict === "blocked") {
    return `高リスクの不一致が${high}件あります。内容を確認してください。`;
  }
  if (verdict === "warning") {
    return `中リスクの注意点が${medium}件あります。`;
  }
  return "重大な不一致は見つかりませんでした。";
}
