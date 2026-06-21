"use client";

/**
 * 照合中の進行表示（検査機風のスキャンライン）。
 * - 書類の上を走査線が上下にスイープ＋流れる不定プログレスバー。
 * - 経過秒数を表示し「フリーズしていない（処理が進んでいる）」ことを示す。
 * - 依存追加なし（素のReact＋CSS Modules、CLAUDE.md方針）。
 */

import { useEffect, useState } from "react";
import styles from "./ScanningIndicator.module.css";

export default function ScanningIndicator({
  label = "照合中",
  note = "AIが書類を読み取っています。数十秒かかる場合があります。",
}: {
  label?: string;
  note?: string;
}) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <div className={styles.scanner}>
        {/* 書類の行（読み取り対象のイメージ） */}
        <div className={styles.doc} aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className={styles.line} style={{ width: `${[92, 78, 88, 64, 84, 48][i]}%` }} />
          ))}
        </div>
        {/* 走査線 */}
        <div className={styles.beam} aria-hidden="true" />
      </div>

      <div className={styles.caption}>
        {/* label が空なら表示しない（呼び出し側のボタン等と「照合中…」が重複するのを避ける）。
            経過秒数のタイマーは「フリーズしていない」証明として残す。 */}
        {label ? <span className={styles.label}>{label}…</span> : null}
        <span className={styles.timer}>{sec}s</span>
      </div>

      <div className={styles.bar} aria-hidden="true">
        <div className={styles.barFill} />
      </div>

      <p className={styles.note}>{note}</p>
    </div>
  );
}
