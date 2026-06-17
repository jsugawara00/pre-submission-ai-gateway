/** 1件の finding（不一致・不審箇所）を表示するカード。 */
import type { Category, Finding } from "@/lib/engine/schema";
import { RiskBadge } from "./RiskBadge";
import styles from "./report.module.css";

const CATEGORY_LABEL: Record<Category, string> = {
  transcription_error: "転記ミス（申告 vs 元資料）",
  document_mismatch: "資料間の矛盾",
  anomaly: "資料内の不整合",
};

export function FindingCard({ finding }: { finding: Finding }) {
  const hasValues = finding.declared_value !== null || finding.source_value !== null;
  // リスク別の発光（高=強め／中=弱め／低以下=なし）。トップの「発光」言語をレポートにも適用。
  const glow =
    finding.risk === "high" ? styles.glowHigh : finding.risk === "medium" ? styles.glowMedium : "";
  return (
    <div className={`${styles.card} ${glow}`}>
      <div className={styles.cardHead}>
        <RiskBadge risk={finding.risk} />
        <span className={styles.cardTitle}>{finding.field_label}</span>
        <span className={styles.category}>{CATEGORY_LABEL[finding.category]}</span>
      </div>

      {hasValues && (
        <div className={styles.values}>
          {finding.declared_value !== null && (
            <span>
              <span className={styles.valueLabel}>申告側</span>
              <span className={styles.declared}>{finding.declared_value}</span>
            </span>
          )}
          {finding.source_value !== null && (
            <span>
              <span className={styles.valueLabel}>元資料</span>
              <span className={styles.source}>{finding.source_value}</span>
            </span>
          )}
        </div>
      )}

      <p className={styles.reason}>{finding.reason}</p>
      {finding.suggestion && <p className={styles.suggestion}>💡 {finding.suggestion}</p>}

      {finding.source_refs.length > 0 && (
        <p className={styles.refs}>
          根拠:{" "}
          {finding.source_refs
            .map((r) => `${r.doc_id}${r.page !== null ? ` p.${r.page}` : ""}（${r.location}）`)
            .join(" / ")}
        </p>
      )}
    </div>
  );
}
