"use client";

/**
 * お試し回数（標準2回）の上限に達した時に出す案内ダイアログ。
 * 照合API が 429（limit_reached）を返したときにクライアントから表示する。
 * 確認（閉じる）／× で消すだけのシンプルなモーダル。
 */
import { useEffect } from "react";
import EmailCopy from "./EmailCopy";
import styles from "./TrialLimitDialog.module.css";

export default function TrialLimitDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // Esc キーでも閉じられるように
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="trial-limit-title"
      onClick={onClose}
    >
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.close} aria-label="閉じる" onClick={onClose}>
          ×
        </button>
        <h2 id="trial-limit-title" className={styles.title}>
          お試しの制限回数（2回）に達しました
        </h2>
        <p className={styles.body}>お試しのご確認、ありがとうございました。</p>
        <p className={styles.body}>
          もし動作で気になった点・うまく動かなかった点などございましたら、メールでお知らせいただけると嬉しいです。
          <strong>スクリーンショットを添えていただける</strong>と、とても助かります。
        </p>
        <p className={styles.body}>
          いただいたご意見は照合精度の向上に活用させていただきます。何卒ご協力のほどお願いいたします。
        </p>
        <div className={styles.contact}>
          <EmailCopy email="jumpdevelop00@gmail.com" label="ご連絡先" />
        </div>
        <button type="button" className={styles.confirm} onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
