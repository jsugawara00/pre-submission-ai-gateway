/**
 * 照合ステータス（verdict とは別軸）。
 * open な確認（チャットボット）が残っていれば「照合が確定していません」、
 * 全部解決で「照合が確定しました」。verdict（申告不可/要注意/問題なし）とは
 * 立ち位置が異なるため、両方を表示する。
 *
 * 表示するのはチャットボットが関わる照合のみ（呼び出し側で clarifications.length>0 を判定）。
 * CheckResult.summary のみに依存する（レポートの表示専用・モード分岐なし＝設計の核）。
 */
import type { CheckResult } from "@/lib/engine/schema";
import styles from "./report.module.css";

export function MatchStatusBanner({ summary }: { summary: CheckResult["summary"] }) {
  const confirmed = summary.clarifications_open === 0;
  return (
    <div className={`${styles.matchStatus} ${confirmed ? styles.matchConfirmed : styles.matchPending}`}>
      <span className={styles.matchIcon}>{confirmed ? "✓" : "⚠"}</span>
      <span className={styles.matchText}>
        {confirmed ? "照合が確定しました" : "照合が確定していません"}
      </span>
      {!confirmed && (
        <span className={styles.matchSub}>
          下の「要確認」で内容を確認・確定してください（残り {summary.clarifications_open} 件）
        </span>
      )}
    </div>
  );
}
