/**
 * 共通レポート（事前モード・事後モードで共有する。モード別の分岐を入れないこと＝設計の核）。
 * 入力は CheckResult のみ。表示専用のサーバーコンポーネント。
 */
import type { CheckResult } from "@/lib/engine/schema";
import { VerdictBanner } from "./VerdictBanner";
import { MatchStatusBanner } from "./MatchStatusBanner";
import { FindingCard } from "./FindingCard";
import { ClarificationPanel } from "@/components/clarification/ClarificationPanel";
import { NaccsExport } from "./NaccsExport";
import styles from "./report.module.css";

export function Report({ result, checkId }: { result: CheckResult; checkId: string }) {
  return (
    <main className={styles.container}>
      {/* 照合ステータス（verdictとは別軸）。チャットボットが関わる照合でのみヘッダに出す */}
      {result.clarifications.length > 0 && <MatchStatusBanner summary={result.summary} />}
      <VerdictBanner summary={result.summary} />

      {/* 検出された書類 */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>検出された書類（{result.documents.length}）</h2>
        {result.documents.map((d) => {
          // 種別末尾の()補足は表示しない（d番号で識別できるため）
          const typeLabel = d.detected_type_label.replace(/\s*[（(][^）)]*[）)]\s*$/, "").trim();
          return (
            <div key={d.doc_id} className={styles.row}>
              <div className={styles.rowHead}>
                <span className={styles.docId}>（{d.doc_id}）</span>
                <strong>{typeLabel}</strong>
                <span className={styles.docType}>確信度 {Math.round(d.confidence * 100)}%</span>
              </div>
              <p className={styles.reason}>{d.summary}</p>
            </div>
          );
        })}
      </section>

      {/* 検出された不一致・不審箇所 */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>検出事項（{result.findings.length}）</h2>
        {result.findings.length === 0 ? (
          <p className={styles.empty}>重大な不一致は検出されませんでした。</p>
        ) : (
          result.findings.map((f) => <FindingCard key={f.finding_id} finding={f} />)
        )}
      </section>

      {/* 要確認（聞き返し）— 確認チャットで人間が確定でき、確定すると verdict が再計算される */}
      {result.clarifications.length > 0 && (
        <section className={styles.section}>
          <h2 className={`${styles.sectionTitle} ${styles.sectionTitleAlert}`}>要確認（{result.clarifications.length}）</h2>
          <ClarificationPanel checkId={checkId} clarifications={result.clarifications} />
        </section>
      )}

      {/* 照合できなかった項目（エンジンの誠実さ） */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>照合できなかった項目（{result.unverified.length}）</h2>
        {result.unverified.length === 0 ? (
          <p className={styles.empty}>すべての対象項目を照合できました。</p>
        ) : (
          result.unverified.map((u) => (
            <div key={u.field_key} className={styles.row}>
              <div className={styles.rowHead}>
                <strong>{u.field_label}</strong>
              </div>
              <p className={styles.reason}>{u.reason}</p>
            </div>
          ))
        )}
      </section>

      {/* NACCS（IDA）疑似サマリ出力（両モード共通。form_inputが無ければサーバーが出力対象なしを返す） */}
      <NaccsExport checkId={checkId} />

      <p className={styles.disclaimer}>
        ※ 照合精度を支える専用ルールは、ここで一例とする輸入申告業務向けに用意しています。輸入申告以外のチェックでは正しい結果を保証できませんが、仕組み自体は汎用のため一定の精度でお試しいただけます。
      </p>
    </main>
  );
}
