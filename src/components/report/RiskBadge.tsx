/** リスク区分のバッジ（high/medium/low）。 */
import type { Risk } from "@/lib/engine/schema";
import styles from "./report.module.css";

const LABEL: Record<Risk, string> = {
  high: "高リスク",
  medium: "中リスク",
  low: "低リスク",
};

export function RiskBadge({ risk }: { risk: Risk }) {
  return <span className={`${styles.badge} ${styles[risk]}`}>{LABEL[risk]}</span>;
}
