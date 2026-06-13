"use client";

/**
 * 事後モード画面: 登録済み帳票＋元資料のPDFをアップロードして照合を実行する。
 * 成功したら共通レポート画面 /report/[checkId] へ遷移する。
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./post-check.module.css";

const MAX_MB = 20;

export default function PostCheckPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    setError(null);
    const next: File[] = [...files];
    for (const f of Array.from(incoming)) {
      if (f.type && f.type !== "application/pdf") {
        setError("PDFファイルのみ添付できます。");
        continue;
      }
      if (f.size > MAX_MB * 1024 * 1024) {
        setError(`「${f.name}」は${MAX_MB}MBを超えています。`);
        continue;
      }
      // 同名の重複は避ける
      if (!next.some((e) => e.name === f.name && e.size === f.size)) {
        next.push(f);
      }
    }
    setFiles(next);
  }

  function removeFile(index: number) {
    setFiles(files.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (files.length === 0) {
      setError("照合するPDFを1つ以上添付してください。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("mode", "post");
      for (const f of files) body.append("files", f);

      const res = await fetch("/api/checks", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "照合に失敗しました。時間をおいて再度お試しください。");
        setSubmitting(false);
        return;
      }
      router.push(`/report/${data.checkId}`);
    } catch {
      setError("通信エラーが発生しました。接続を確認してください。");
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      <Link href="/" className={styles.back}>
        ← トップへ
      </Link>
      <h1 className={styles.title}>事後チェック（登録後の照合）</h1>
      <p className={styles.lead}>
        登録済みの申告帳票と、インボイス・パッキングリスト・B/L等の元資料（PDF）をアップロードしてください。AIが転記ミスや資料間の矛盾を照合します。
      </p>

      <div className={styles.card}>
        <div
          className={styles.dropzone}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        >
          <div>📄 クリックまたはドラッグ＆ドロップでPDFを追加</div>
          <div className={styles.dropzoneHint}>PDFのみ・1ファイル最大{MAX_MB}MB</div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            className={styles.hiddenInput}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {files.length > 0 && (
          <ul className={styles.fileList}>
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className={styles.fileItem}>
                <span>{f.name}</span>
                <span>
                  <span className={styles.fileSize}>{(f.size / 1024).toFixed(0)} KB</span>{" "}
                  <button type="button" className={styles.removeBtn} onClick={() => removeFile(i)}>
                    削除
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {error && <p className={styles.error}>{error}</p>}
        {submitting && <p className={styles.progress}>照合中です…（AIが書類を読み取っています。数十秒かかる場合があります）</p>}

        <button type="button" className={styles.submit} onClick={handleSubmit} disabled={submitting}>
          {submitting ? "照合中…" : "照合を実行する"}
        </button>
      </div>
    </div>
  );
}
