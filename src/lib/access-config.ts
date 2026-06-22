/**
 * アクセスコード認証＋累計回数制限の運用設定。
 * 依存を持たない定数・純関数のみ（サーバー／クライアント両方から安全に import できる）。
 */

/** 認証済みアクセスコードを保持する Cookie 名（httpOnly で発行する）。 */
export const ACCESS_CODE_COOKIE = "ac_session";

/** コード発行時の既定の累計上限（回数）。標準はサンプル動作確認用に2回（API課金が絡むため）。 */
export const DEFAULT_MAX_USES = 2;

/** 照合をサーバー側で打ち切る理由。 */
export type AccessDenialReason = "not_found" | "disabled" | "limit_reached";

/** 拒否理由に応じてユーザーへ表示する案内文を返す。内部情報は含めない。 */
export function buildAccessDenialMessage(reason: AccessDenialReason): string {
  switch (reason) {
    case "not_found":
      return "アクセスコードが正しくありません。発行されたコードをご確認ください。";
    case "disabled":
      return "このアクセスコードは現在ご利用いただけません。発行元にお問い合わせください。";
    case "limit_reached":
      return "ご利用可能な照合回数の上限に達しました。発行元にお問い合わせください。";
  }
}

/** 残りの利用可能回数（0未満にはしない）。表示・事前判定用。 */
export function remainingUses(row: { max_uses: number; used_count: number }): number {
  return Math.max(row.max_uses - row.used_count, 0);
}

/** いま照合を消費できるか（無効化されておらず、累計上限未満）。表示・事前判定用。 */
export function canConsume(row: {
  max_uses: number;
  used_count: number;
  disabled: number | boolean;
}): boolean {
  const disabled = typeof row.disabled === "boolean" ? row.disabled : row.disabled !== 0;
  return !disabled && row.used_count < row.max_uses;
}
