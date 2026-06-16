"use client";

/**
 * 事後モード画面（改訂1: 入力分離）。
 * 「チェック対象（申告帳票=target）」と「関係書類（元資料=reference）」を別ゾーンで受け取り、
 * target_files / reference_files として送信する。照合後は共通レポート /report/[checkId] へ遷移。
 */

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ScanningIndicator from "@/components/ScanningIndicator/ScanningIndicator";
import styles from "./post-check.module.css";

const MAX_MB = 20;

type Zone = "target" | "reference";

export default function PostCheckPage() {
  const router = useRouter();
  const targetInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [targetFiles, setTargetFiles] = useState<File[]>([]);
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function addFiles(zone: Zone, incoming: FileList | null) {
    if (!incoming) return;
    setError(null);
    const current = zone === "target" ? targetFiles : referenceFiles;
    const next = [...current];
    for (const f of Array.from(incoming)) {
      if (f.type && f.type !== "application/pdf") {
        setError(`「${f.name}」はPDFではないため追加できません。PDFファイルのみ添付できます。`);
        continue;
      }
      if (f.size > MAX_MB * 1024 * 1024) {
        setError(`「${f.name}」は${MAX_MB}MBを超えています。`);
        continue;
      }
      // 同名・同サイズの重複は避ける
      if (!next.some((e) => e.name === f.name && e.size === f.size)) {
        next.push(f);
      }
    }
    (zone === "target" ? setTargetFiles : setReferenceFiles)(next);
  }

  function removeFile(zone: Zone, index: number) {
    if (zone === "target") setTargetFiles(targetFiles.filter((_, i) => i !== index));
    else setReferenceFiles(referenceFiles.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (targetFiles.length === 0) {
      setError("「チェック対象」に申告帳票を1つ以上追加してください。");
      return;
    }
    if (referenceFiles.length === 0) {
      setError("「関係書類」に元資料を1つ以上追加してください。");
      return;
    }
    // チェック対象が複数のとき、1申告分かを確認する（AI非関与の純粋なUI確認）。
    if (targetFiles.length >= 2) {
      const ok = window.confirm(
        `「チェック対象」に${targetFiles.length}件のファイルがあります。これらは1つの申告（1申告分の帳票群）ですか？\n\n別々の申告をまとめて照合することはできません。問題なければOKを押してください。`
      );
      if (!ok) return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("mode", "post");
      for (const f of targetFiles) body.append("target_files", f);
      for (const f of referenceFiles) body.append("reference_files", f);

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

  function renderZone(
    zone: Zone,
    files: File[],
    inputRef: RefObject<HTMLInputElement | null>,
    opts: { title: string; badge: string; badgeClass: string; hint: string }
  ) {
    return (
      <div className={styles.zone}>
        <div className={styles.zoneHead}>
          <span className={`${styles.zoneBadge} ${opts.badgeClass}`}>{opts.badge}</span>
          <span className={styles.zoneTitle}>{opts.title}</span>
        </div>
        <div
          className={styles.dropzone}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(zone, e.dataTransfer.files);
          }}
        >
          <div>📄 クリックまたはドラッグ＆ドロップ</div>
          <div className={styles.dropzoneHint}>{opts.hint}</div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            className={styles.hiddenInput}
            onChange={(e) => {
              addFiles(zone, e.target.files);
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
                  <button type="button" className={styles.removeBtn} onClick={() => removeFile(zone, i)}>
                    削除
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Link href="/" className={styles.back}>
        ← トップへ
      </Link>
      <h1 className={styles.title}>事後チェック（登録後の照合）</h1>
      <p className={styles.lead}>
        照合の<strong>基準となる申告帳票</strong>を「チェック対象」に、突き合わせる<strong>元資料</strong>を「関係書類」に分けて入れてください。AIがチェック対象を基準に転記ミスや資料間の矛盾を照合します。
      </p>

      <p className={styles.channelNote}>
        📥 <strong>取り込み元は問いません。</strong>メールの添付や複合機（scan to email）で受け取ったPDFも、いったん保存して以下の欄にドラッグ＆ドロップ、または欄をクリックして選択するだけで取り込めます。
      </p>

      <div className={styles.card}>
        <div className={styles.zones}>
          {renderZone("target", targetFiles, targetInputRef, {
            title: "チェック対象（申告帳票）",
            badge: "基準",
            badgeClass: styles.badgeTarget,
            hint: "登録済みのIDA帳票など。複数でも1申告分として扱います。",
          })}
          {renderZone("reference", referenceFiles, referenceInputRef, {
            title: "関係書類（元資料）",
            badge: "照合元",
            badgeClass: styles.badgeReference,
            hint: "インボイス・パッキングリスト・B/L等。PDFのみ・各最大20MB。",
          })}
        </div>

        {error && <p className={styles.error}>{error}</p>}
        {submitting && (
          <ScanningIndicator label="照合中" note="AIが書類を読み取っています。数十秒かかる場合があります。" />
        )}

        <button type="button" className={styles.submit} onClick={handleSubmit} disabled={submitting}>
          {submitting ? "照合中…" : "照合を実行する"}
        </button>
      </div>
    </div>
  );
}
