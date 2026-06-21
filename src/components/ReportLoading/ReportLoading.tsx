/**
 * レポート準備中の待機画面（共通・穏やかな表示）。
 *
 * report/[checkId]/loading.tsx（サーバーセグメントの fallback）と
 * post-check の遷移ハンドオフ（クライアント）で同一の見た目を使い、
 * 「照合中 → 準備中 → レポート」を切れ目なく繋ぐ（前画面の残像・枠の位置ズレを防ぐ）。
 *
 * 照合中の ScanningIndicator（発光する走査線）は、短いレポート遷移では
 * 明るい発光要素が消える際に焼き付き（残像）を生みやすい。ここではそれを避けるため、
 * 発光・高速アニメの無い穏やかな脈動表示にする。
 * （照合中＝長い待ちはレーダーのまま。残像が問題になるのは短いレポート遷移だけ）
 */
import styles from "./ReportLoading.module.css";

export default function ReportLoading() {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <span className={styles.dot} aria-hidden="true" />
      <p className={styles.label}>照合レポートを準備しています</p>
      <div className={styles.bar} aria-hidden="true">
        <div className={styles.barFill} />
      </div>
      <p className={styles.note}>保存済みの照合結果を読み込んでいます。</p>
    </div>
  );
}
