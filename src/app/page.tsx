/** トップ（コンセプト選択）。デザインB案「ライトテーブル照合」。事後＝Phase1／事前＝Phase2。 */
import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>申請前AI検問所</p>
          <h1 className={styles.title}>
            食い違いは、
            <br />
            <em>光る。</em>
          </h1>
          <p className={styles.lead}>
            登録の前でも、後でも。同じ照合エンジンが複数の書類を一枚の検査台に重ね、一致した値は静かに沈め、ズレた数字だけを発光させて結びます。あなたが探すのではなく、ズレが名乗り出る。
          </p>
        </div>

        {/* 照合レポート風サンプル（装飾／例示。読み上げ対象から除外） */}
        <div className={styles.stage} aria-hidden="true">
          <span className={styles.scan} />

          <div className={styles.reportCard}>
            <div className={styles.reportHead}>
              <span className={styles.reportTitle}>照合レポート</span>
              <span className={styles.verdictPill}>申告不可</span>
            </div>

            <div className={`${styles.finding} ${styles.fHigh}`}>
              <span className={styles.fBadge}>高リスク</span>
              <div className={styles.fBody}>
                <span className={styles.fField}>インボイス価格</span>
                <span className={styles.fVals}>
                  <span className={styles.fBad}>¥225,000</span>
                  <span className={styles.fArrow}>↔</span>$22,500
                </span>
              </div>
            </div>

            <div className={`${styles.finding} ${styles.fMedium}`}>
              <span className={`${styles.fBadge} ${styles.fBadgeMed}`}>中リスク</span>
              <div className={styles.fBody}>
                <span className={styles.fField}>貨物個数</span>
                <span className={styles.fVals}>
                  100 CT<span className={styles.fArrow}>↔</span>100 cases
                </span>
              </div>
            </div>

            <div className={`${styles.finding} ${styles.fLow}`}>
              <span className={`${styles.fBadge} ${styles.fBadgeLow}`}>低リスク</span>
              <div className={styles.fBody}>
                <span className={styles.fField}>仕出人名</span>
                <span className={styles.fVals}>
                  Saigon<span className={styles.fArrow}>↔</span>saigon
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.modes}>
        <div className={styles.modesHead}>
          <h2 className={styles.modesTitle}>ふたつの入口、ひとつの検問。</h2>
          <p className={styles.modesSub}>
            登録の前か、後か。タイミングが違うだけで、どちらも同じ照合エンジンと同じレポートにつながります。
            <strong>事後チェックは題材を選びません。</strong>「1件の申請（チェック対象）」と「その関係書類」さえ入れれば、輸入業務にかぎらずそのまま使えます。
            <strong>事前チェック</strong>は、わかりやすさのため<strong>輸入申告フォームを一例</strong>として用意しています。
          </p>
          <p className={styles.modesNote}>
            ※ システムの仕組み自体は業務を選びませんが、照合精度を支える専用ルールはここで一例とする輸入申告業務向けに用意しています。そのため輸入申告以外のチェックは正しい結果を保証できませんが、一定の精度でお試しいただけます。
          </p>
        </div>
        <div className={styles.modeGrid}>
          <Link href="/post-check" className={styles.mode}>
            <span className={styles.modeKey}>事後チェック</span>
            <span className={styles.modeTitle}>登録済みの帳票を照合する</span>
            <p className={styles.modeDesc}>
              チェック対象の帳票PDFと元資料を投入。転記ミスと資料間の矛盾を洗い出し、照合レポートにまとめます。
            </p>
            <span className={styles.modeGo}>このモードで検める →</span>
          </Link>

          <Link href="/pre-check" className={styles.mode}>
            <span className={styles.modeKey}>事前チェック</span>
            <span className={styles.modeTitle}>登録する前に警告を受け取る</span>
            <p className={styles.modeDesc}>
              疑似申告フォームへ入力し、添付資料と照合。登録ボタンを押す前に、その場で食い違いを知らせます。
            </p>
            <span className={styles.modeGo}>このモードで検める →</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
