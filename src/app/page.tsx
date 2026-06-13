/** トップ（コンセプト選択）。事後モードはPhase 1、事前モードはPhase 2予定。 */
import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.container}>
      <h1 className={styles.title}>申請前AI検問所</h1>
      <p className={styles.lead}>
        申請・申告内容と元資料（インボイス、パッキングリスト、B/L等）をAIで照合し、転記ミス・資料間の矛盾・不審箇所を検出します。
      </p>

      <div className={styles.cards}>
        <Link href="/post-check" className={styles.card}>
          <div className={styles.cardTitle}>事後チェック</div>
          <p className={styles.cardDesc}>
            登録済みの帳票PDFと元資料をアップロードして照合し、照合レポートを表示します。
          </p>
        </Link>

        <Link href="/pre-check" className={styles.card}>
          <div className={styles.cardTitle}>事前チェック</div>
          <p className={styles.cardDesc}>
            登録前に疑似申告フォームへ入力し、資料と照合してインラインで警告します。
          </p>
        </Link>
      </div>
    </main>
  );
}
