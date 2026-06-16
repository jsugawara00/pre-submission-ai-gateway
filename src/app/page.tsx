/** トップ（コンセプト選択）。デザインB案「ライトテーブル照合」。事後＝Phase1／事前＝Phase2。 */
import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>申請前AI検問システム</p>
          <h1 className={styles.title}>
            食い違いは、
            <br />
            <em>光る。</em>
          </h1>
          <p className={styles.lead}>
            登録の前でも、後でも。同じ照合エンジンが複数の書類を一枚の検査台に重ね、一致した値は静かに沈め、ズレた数字だけを発光させて結びます。あなたが探すのではなく、ズレが名乗り出る。
          </p>
        </div>

        {/* 照合デモ（装飾／例示。読み上げ対象から除外） */}
        <div className={styles.stage} aria-hidden="true">
          <span className={styles.scan} />

          <div className={`${styles.doc} ${styles.docInv}`}>
            <div className={styles.docHead}>INVOICE</div>
            <div className={styles.docRow}>
              <span className={styles.lab}>B/L No.</span>
              <span className={`${styles.val} ${styles.bad}`}>
                ABC-1234567<span className={`${styles.dot} ${styles.dotBad}`} />
              </span>
            </div>
            <div className={styles.docRow}>
              <span className={styles.lab}>Total Qty</span>
              <span className={`${styles.val} ${styles.match}`}>
                1,200 PCS<span className={`${styles.dot} ${styles.dotQuiet}`} />
              </span>
            </div>
            <div className={styles.docRow}>
              <span className={styles.lab}>Currency</span>
              <span className={`${styles.val} ${styles.match}`}>
                USD<span className={`${styles.dot} ${styles.dotQuiet}`} />
              </span>
            </div>
          </div>

          <div className={`${styles.doc} ${styles.docPkl}`}>
            <div className={styles.docHead}>PACKING LIST</div>
            <div className={styles.docRow}>
              <span className={styles.lab}>B/L No.</span>
              <span className={`${styles.val} ${styles.bad}`}>
                ABC-1234561<span className={`${styles.dot} ${styles.dotBad}`} />
              </span>
            </div>
            <div className={styles.docRow}>
              <span className={styles.lab}>Total Qty</span>
              <span className={`${styles.val} ${styles.match}`}>
                1,200 PCS<span className={`${styles.dot} ${styles.dotQuiet}`} />
              </span>
            </div>
            <div className={styles.docRow}>
              <span className={styles.lab}>Net Weight</span>
              <span className={`${styles.val} ${styles.match}`}>
                980 KG<span className={`${styles.dot} ${styles.dotQuiet}`} />
              </span>
            </div>
          </div>

          <svg className={styles.trace} viewBox="0 0 600 380" preserveAspectRatio="none">
            <path className={styles.traceLine} d="M 250 78 C 360 130, 240 250, 360 300" />
          </svg>
          <div className={styles.traceTag}>B/L No. 不一致 — 末尾 7 / 1</div>
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
