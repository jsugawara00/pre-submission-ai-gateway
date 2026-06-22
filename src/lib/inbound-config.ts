/**
 * メール取込み Webhook（/api/inbound-email）の認証設定（CLAUDE.md 第6章）。
 *
 * メール受信は機械対機械（M2M）の入口で、ブラウザのアクセスコード Cookie は通らない。
 * 代わりに2段で守る:
 *  1. 共有シークレット（INBOUND_WEBHOOK_SECRET）— 受信解析サービスだけが知るヘッダ値。
 *     実プロバイダ導入時は、ここを各社の Webhook 署名検証に差し替える想定。
 *  2. 送信元許可（INBOUND_ALLOWED_SENDERS）— 取込みを許す From アドレスの許可リスト（任意）。
 *
 * いずれも環境変数で与える（リポジトリに値を置かない）。
 */

import { timingSafeEqual } from "node:crypto";

/** 設定された共有シークレット（未設定なら null）。 */
export function getInboundSecret(): string | null {
  const s = process.env.INBOUND_WEBHOOK_SECRET;
  return s && s.trim() ? s.trim() : null;
}

/** 受信リクエストの共有シークレットを定数時間比較で検証する。未設定時は受け付けない（安全側）。 */
export function verifyInboundSecret(provided: string | null): boolean {
  const expected = getInboundSecret();
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * 送信元（From）が許可されているか。INBOUND_ALLOWED_SENDERS（カンマ区切り）に列挙する。
 * 未設定なら制限しない（共有シークレットで保護されているため）。
 */
export function isSenderAllowed(sender: string | null): boolean {
  const raw = process.env.INBOUND_ALLOWED_SENDERS ?? "";
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return true;
  if (!sender) return false;
  return list.includes(sender.trim().toLowerCase());
}
