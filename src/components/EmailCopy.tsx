"use client";

/**
 * 問い合わせメールアドレスを「コピー」で渡すための小さなクライアント部品。
 * mailto: リンクは利用者の環境で意図しない（未設定の）メールソフトを起動しうるため使わず、
 * アドレスを明示表示し、シンプルなコピーアイコンでクリップボードへ取得できるようにする。
 */
import { useState } from "react";
import styles from "./EmailCopy.module.css";

export default function EmailCopy({ email, label = "お問い合わせ" }: { email: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // クリップボード API が使えない環境では何もしない（アドレスは表示されているため手動選択で対応可能）
    }
  }

  return (
    <span className={styles.wrap}>
      <span className={styles.label}>{label}</span>
      <span className={styles.email}>{email}</span>
      <button
        type="button"
        className={styles.btn}
        onClick={handleCopy}
        aria-label="メールアドレスをコピー"
        title="コピー"
      >
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
      <span className={styles.feedback} role="status" aria-live="polite">
        {copied ? "コピーしました" : ""}
      </span>
    </span>
  );
}
