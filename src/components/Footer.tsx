/** 全ページ共通フッター。About（開発意図の明文化）とGitHubへの導線を提供する。 */
import Link from "next/link";
import styles from "./Footer.module.css";

const GITHUB_URL = "https://github.com/jsugawara00/pre-submission-ai-gateway";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span className={styles.brand}>申請前AI検問所</span>
        <nav className={styles.links}>
          <Link href="/about">このシステムについて</Link>
          <span className={styles.sep} aria-hidden="true">
            ・
          </span>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </div>
      <p className={styles.disclaimer}>
        ※ 仕組み自体は業務を選びませんが、照合精度を支える専用ルールは一例の輸入申告業務向けです。輸入申告以外のチェックは正しい結果を保証できません（一定の精度でお試しいただけます）。
      </p>
    </footer>
  );
}
