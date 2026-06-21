"use client";

/**
 * レポート印刷ボタン。押すとブラウザの印刷ダイアログを開く（window.print()）。
 * 印刷時は report.module.css の @media print で button が非表示になるため、
 * このボタン自体は紙には出ない（操作UIはかがみに残さない）。
 */
import styles from "./report.module.css";

export function PrintButton() {
  return (
    <div className={styles.printBar}>
      <button type="button" className={styles.printButton} onClick={() => window.print()}>
        🖨 このレポートを印刷
      </button>
    </div>
  );
}
