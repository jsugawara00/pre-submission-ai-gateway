/**
 * Aboutページ（設計書 v0.3 §4-6）。
 * 開発意図（NACCSギャップ分析・2モードの狙い・ハルシネーション三層防御・汎用化構想）を明文化し、
 * GitHub閲覧者・面接官への説明を画面内で完結させる。
 */
import type { Metadata } from "next";
import Link from "next/link";
import styles from "./about.module.css";

export const metadata: Metadata = {
  title: "このシステムについて — 申請前AI検問所",
  description: "申請前AI検問所の開発意図（NACCSギャップ分析・2モード構成・ハルシネーション三層防御・汎用化構想）。",
};

const REPO_URL = "https://github.com/jsugawara00/pre-submission-ai-gateway";

export default function AboutPage() {
  return (
    <main className={styles.container}>
      <Link href="/" className={styles.back}>
        ← トップへ戻る
      </Link>

      <h1 className={styles.title}>このシステムについて</h1>
      <p className={styles.lead}>
        申請・申告内容と元資料（インボイス、パッキングリスト、B/L等）をAIで照合し、転記ミス・資料間の矛盾・不審箇所を提出前に検出するシステムです。
        通関業務（NACCSの輸入申告事項登録）を参考にした疑似申告業務を題材としていますが、仕組みは特定業務に依存しません。
      </p>

      <section className={styles.section}>
        <h2 className={styles.h2}>なぜ作ったか — NACCSギャップ分析</h2>
        <p>
          既存の申告システム（NACCS等）は、入力欄数・桁数・コード形式といった<strong>形式チェック</strong>と、品目コードや担保番号がシステム内DBに存在するかという
          <strong>DB整合性チェック</strong>を行います。しかし、<strong>入力された値が元資料と合っているか</strong>、
          <strong>元資料どうしが矛盾していないか</strong>は構造的にチェックできません。
        </p>
        <p>
          インボイス価格の桁誤りも、通貨コードの取り違えも、数量の転記ミスも、形式が正しい限り素通りします。
          このため現行実務には「登録 → 帳票出力 → 印刷 → 人間がインボイス等と目視照合 → 申告送信」という人手工程が残り続けてきました。
        </p>
        <p className={styles.emphasis}>
          本システムは、その「人間の目視照合」工程をAIエージェントが担います。既存システムの再現ではなく、既存システムがやらない側の補完です。
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>2つの導入アプローチを、1つのエンジンで</h2>
        <p>本システムは同一の照合エンジンに対して2つの入口（モード）を持ち、それぞれ異なる導入アプローチの提案になっています。</p>
        <div className={styles.modeGrid}>
          <div className={styles.modeCard}>
            <div className={styles.modeName}>事前モード（組み込み型 / Built-in）</div>
            <p className={styles.modeDesc}>
              「既存の申請システムにAIチェックを融合すると、こうなる」を見せる組み込み型のリファレンス。
              疑似申告フォームに入力し資料を添付すると、登録前に該当フィールドへインラインでエラーを表示して差し戻します。
            </p>
          </div>
          <div className={styles.modeCard}>
            <div className={styles.modeName}>事後モード（後付け型 / Add-on）</div>
            <p className={styles.modeDesc}>
              「既存システムに一切触れなくても、間接的にAIチェックを導入できる」を見せる後付け型。
              出力済みの登録帳票PDFと元資料一式をアップロードすると、転記ミスと資料間矛盾を一括チェックしたレポートを返します。
            </p>
          </div>
        </div>
        <p className={styles.emphasis}>
          両モードは<strong>同一の照合エンジンと同一のレポートUI</strong>を共有します。入口が違っても同じ品質のチェックが出る——
          「導入形態は選べる。エンジンは一つでよい」という構成自体が、本プロジェクトのメッセージです。
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>ハルシネーション三層防御</h2>
        <p>
          AIの照合システムで最も危険なのは「読めないものを、それらしく読んでしまう」ことです。本システムは三層で防ぎ、これを信頼性設計の核としています。
        </p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>層</th>
              <th>仕組み</th>
              <th>防ぐ失敗</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>第1層</td>
              <td>
                照合できない項目は推測せず <code>unverified</code> として明示する
              </td>
              <td>資料不足の誤魔化し</td>
            </tr>
            <tr>
              <td>第2層</td>
              <td>
                判読確信度の低い文字は確定せず、候補を添えて <code>clarifications</code> として人間に質問する
              </td>
              <td>不鮮明文字の誤読</td>
            </tr>
            <tr>
              <td>第3層</td>
              <td>人間の回答も鵜呑みにせず、他の数値・文脈と検算してから受理する（聞き返しループ）</td>
              <td>人間側の入力ミス</td>
            </tr>
          </tbody>
        </table>
        <p>
          人間が確認・入力した値はすべて監査ログに記録され、「この値は誰が・いつ・原本を見て確定したか」という経緯が残ります。
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>汎用化構想</h2>
        <p>
          題材は通関業務ですが、特定システムの再現ではありません。<strong>「申請書 ＋ 添付書類 ＋ 照合」</strong>という構造を持つ業務——
          行政・金融・保険・法務など——に転用できる汎用リファレンス実装として設計しています。エンジンとレポートUIは業務に依存せず、
          照合対象の語彙（項目定義）を差し替えるだけで他分野へ展開できます。
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>技術スタックと設計ドキュメント</h2>
        <p>
          TypeScript（strict）／ Next.js（App Router）／ React ／ Claude API（PDFを直接読解しJSONで構造化出力）／ MySQL ／ zod。
          UIライブラリは使わず、素のReactとCSS Modulesで構築しています（依存最小化）。
        </p>
        <p className={styles.docLinks}>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHubリポジトリ
          </a>
          {" ／ "}
          <a href={`${REPO_URL}/blob/main/docs`} target="_blank" rel="noreferrer">
            設計書・JSONスキーマ（docs/）
          </a>
        </p>
      </section>

      <div className={styles.bottomNav}>
        <Link href="/post-check">事後チェックを試す →</Link>
        <Link href="/pre-check">事前チェックを試す →</Link>
      </div>
    </main>
  );
}
