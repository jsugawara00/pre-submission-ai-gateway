/** 判定（verdict）と集計のバナー。CheckResult.summary のみに依存する。 */
import type { CheckResult, Verdict } from "@/lib/engine/schema";
import styles from "./report.module.css";

const VERDICT_LABEL: Record<Verdict, string> = {
  blocked: "申告不可",
  warning: "要注意",
  pass: "問題なし",
};

const BANNER_CLASS: Record<Verdict, string> = {
  blocked: styles.bannerBlocked,
  warning: styles.bannerWarning,
  pass: styles.bannerPass,
};

const LABEL_CLASS: Record<Verdict, string> = {
  blocked: styles.verdictBlocked,
  warning: styles.verdictWarning,
  pass: styles.verdictPass,
};

export function VerdictBanner({ summary }: { summary: CheckResult["summary"] }) {
  const { verdict } = summary;
  return (
    <div className={`${styles.banner} ${BANNER_CLASS[verdict]}`}>
      <div className={styles.bannerTop}>
        <span className={`${styles.verdictLabel} ${LABEL_CLASS[verdict]}`}>{VERDICT_LABEL[verdict]}</span>
      </div>
      <p
        className={`${styles.headline}${
          summary.clarifications_open > 0 ? ` ${styles.headlineAlert}` : ""
        }`}
      >
        {summary.headline}
      </p>
      <div className={styles.counts}>
        <span>高リスク <strong>{summary.high}</strong></span>
        <span>中リスク <strong>{summary.medium}</strong></span>
        <span>低リスク <strong>{summary.low}</strong></span>
        <span>照合できず <strong>{summary.unverified}</strong></span>
        <span>要確認 <strong>{summary.clarifications_open}</strong></span>
      </div>
    </div>
  );
}
