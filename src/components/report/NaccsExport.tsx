"use client";
/**
 * NACCS（IDA）疑似サマリ出力パネル（共通レポートの一部。モード別の分岐を持たない）。
 * ボタン押下で /api/checks/[id]/naccs を呼び、出力テキストを表示・コピーできる。
 * 出力可否はサーバーが form_input の有無で判断するため、ここではモードを見ない。
 */
import { useState } from "react";
import styles from "./NaccsExport.module.css";

export function NaccsExport({ checkId }: { checkId: string }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleExport() {
    setLoading(true);
    setMessage(null);
    setText(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/checks/${checkId}/naccs`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "出力に失敗しました。");
      if (data.available) {
        setText(data.text as string);
      } else {
        setMessage(data.message ?? "出力できる申告データがありません。");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* クリップボードが使えない環境では何もしない */
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h2 className={styles.title}>NACCS形式で出力</h2>
        <button className={styles.button} onClick={handleExport} disabled={loading}>
          {loading ? "生成中…" : text ? "再生成" : "NACCS（IDA）疑似サマリを生成"}
        </button>
      </div>

      {message && <p className={styles.message}>{message}</p>}

      {text && (
        <div className={styles.result}>
          <div className={styles.resultBar}>
            <button className={styles.copyButton} onClick={handleCopy}>
              {copied ? "コピーしました" : "コピー"}
            </button>
          </div>
          <pre className={styles.pre}>{text}</pre>
        </div>
      )}
    </div>
  );
}
