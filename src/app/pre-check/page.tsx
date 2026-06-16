"use client";

/**
 * 事前モード（組み込み型）: 疑似申告フォームへ入力し、資料PDFを添付して登録前に照合する。
 * 結果は findings を field_key でフォームのフィールドにマッピングしてインラインエラー表示し、
 * verdict で「登録」ボタンを制御する。詳細は共通レポートへリンクする（事後モードと同一エンジン）。
 */

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { CheckResult, Finding, Verdict } from "@/lib/engine/schema";
import { RiskBadge } from "@/components/report/RiskBadge";
import ScanningIndicator from "@/components/ScanningIndicator/ScanningIndicator";
import { CORE_FIELDS, LINE_FIELDS, LINE_ITEM_COUNT, lineKey } from "./fields";
import styles from "./pre-check.module.css";

const MAX_MB = 20;
const VERDICT_LABEL: Record<Verdict, string> = { blocked: "登録不可", warning: "要注意", pass: "問題なし" };

export default function PreCheckPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checkId, setCheckId] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);

  // field_key → findings のマッピング（インラインエラー用）
  const findingsByKey = useMemo(() => {
    const map = new Map<string, Finding[]>();
    if (!result) return map;
    for (const f of result.findings) {
      if (!f.field_key) continue;
      const arr = map.get(f.field_key) ?? [];
      arr.push(f);
      map.set(f.field_key, arr);
    }
    return map;
  }, [result]);

  // どのフィールドにも紐づかない findings（field_key=null や明細外）
  const otherFindings = useMemo(() => {
    if (!result) return [];
    const formKeys = new Set<string>([
      ...CORE_FIELDS.map((f) => f.key),
      ...Array.from({ length: LINE_ITEM_COUNT }, (_, i) =>
        LINE_FIELDS.map((lf) => lineKey(lf.suffix, i + 1))
      ).flat(),
    ]);
    return result.findings.filter((f) => !f.field_key || !formKeys.has(f.field_key));
  }, [result]);

  function setValue(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    setError(null);
    const next = [...files];
    for (const f of Array.from(incoming)) {
      if (f.type && f.type !== "application/pdf") {
        setError("PDFファイルのみ添付できます。");
        continue;
      }
      if (f.size > MAX_MB * 1024 * 1024) {
        setError(`「${f.name}」は${MAX_MB}MBを超えています。`);
        continue;
      }
      if (!next.some((e) => e.name === f.name && e.size === f.size)) next.push(f);
    }
    setFiles(next);
  }

  async function handleSubmit() {
    const formInput: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v.trim()) formInput[k] = v.trim();
    }
    if (Object.keys(formInput).length === 0) {
      setError("申告内容を1項目以上入力してください。");
      return;
    }
    if (files.length === 0) {
      setError("照合する元資料のPDFを1つ以上添付してください。");
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    setRegistered(false);
    try {
      const body = new FormData();
      body.append("mode", "pre");
      body.append("form_input", JSON.stringify(formInput));
      // 事前モードの申告側はフォーム入力（target相当）。添付PDFはすべて関係書類=reference として送る。
      for (const f of files) body.append("reference_files", f);

      const res = await fetch("/api/checks", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "照合に失敗しました。");
        setSubmitting(false);
        return;
      }
      // 結果を取得してインラインエラー表示
      const r = await fetch(`/api/checks/${data.checkId}`);
      const cr = (await r.json()) as CheckResult;
      setResult(cr);
      setCheckId(data.checkId);
      setSubmitting(false);
    } catch {
      setError("通信エラーが発生しました。");
      setSubmitting(false);
    }
  }

  function renderField(key: string, label: string, placeholder?: string) {
    const findings = findingsByKey.get(key);
    const hasError = Boolean(findings?.length);
    return (
      <div className={styles.field} key={key}>
        <label className={styles.label}>{label}</label>
        <input
          className={`${styles.input} ${hasError ? styles.inputError : ""}`}
          value={values[key] ?? ""}
          placeholder={placeholder}
          onChange={(e) => setValue(key, e.target.value)}
        />
        {findings?.map((f) => (
          <div key={f.finding_id} className={styles.inlineError}>
            <RiskBadge risk={f.risk} />
            <span className={styles.inlineErrorText}>
              {f.reason}
              {f.source_value ? `（資料: ${f.source_value}）` : ""}
            </span>
          </div>
        ))}
      </div>
    );
  }

  const verdict = result?.summary.verdict;

  return (
    <div className={styles.container}>
      <Link href="/" className={styles.back}>← トップへ</Link>
      <h1 className={styles.title}>事前チェック（登録前の照合）</h1>
      <p className={styles.lead}>
        疑似申告フォームに入力し、元資料（インボイス等）のPDFを添付して「照合」を押すと、登録前に転記ミスや資料との不一致をインラインで指摘します。
      </p>

      {/* 判定バナー（照合後） */}
      {result && verdict && (
        <div className={`${styles.banner} ${verdict === "blocked" ? styles.bannerBlocked : verdict === "warning" ? styles.bannerWarning : styles.bannerPass}`}>
          <span className={`${styles.bannerLabel} ${verdict === "blocked" ? styles.lblBlocked : verdict === "warning" ? styles.lblWarning : styles.lblPass}`}>
            {VERDICT_LABEL[verdict]}
          </span>
          <p>{result.summary.headline}</p>
          {checkId && (
            <Link href={`/report/${checkId}`} className={styles.detailLink}>
              詳細レポートを見る（照合できなかった項目・要確認を含む）→
            </Link>
          )}
        </div>
      )}

      {/* 共通部 */}
      <div className={styles.card}>
        <div className={styles.sectionTitle}>申告共通部</div>
        <div className={styles.grid}>{CORE_FIELDS.map((f) => renderField(f.key, f.label, f.placeholder))}</div>
      </div>

      {/* 明細欄 */}
      <div className={styles.card}>
        <div className={styles.sectionTitle}>品目明細</div>
        {Array.from({ length: LINE_ITEM_COUNT }, (_, i) => i + 1).map((row) => (
          <div key={row} className={styles.lineRow}>
            <div className={styles.lineRowTitle}>欄 {row}</div>
            <div className={styles.grid}>
              {LINE_FIELDS.map((lf) => renderField(lineKey(lf.suffix, row), `${lf.label}（欄${row}）`, lf.placeholder))}
            </div>
          </div>
        ))}
      </div>

      {/* 元資料の添付 */}
      <div className={styles.card}>
        <div className={styles.sectionTitle}>元資料の添付（PDF）</div>
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
          <div className={styles.dropHint}>インボイス・パッキングリスト・B/L等。PDFのみ・最大{MAX_MB}MB</div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            className={styles.hidden}
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
                <button type="button" className={styles.removeBtn} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* フィールド外の指摘 */}
      {otherFindings.length > 0 && (
        <div className={styles.card}>
          <div className={styles.sectionTitle}>その他の指摘</div>
          {otherFindings.map((f) => (
            <div key={f.finding_id} className={styles.inlineError} style={{ marginBottom: 8 }}>
              <RiskBadge risk={f.risk} />
              <span className={styles.inlineErrorText}>
                <strong>{f.field_label}</strong>：{f.reason}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}
      {submitting && <ScanningIndicator label="照合中" note="AIが資料を読み取っています。数十秒かかる場合があります。" />}

      <button type="button" className={styles.submit} onClick={handleSubmit} disabled={submitting}>
        {submitting ? "照合中…" : result ? "再照合する" : "照合する"}
      </button>

      {/* 登録（verdictで制御。本システムは疑似登録） */}
      {result && verdict && (
        <>
          <div className={styles.registerRow}>
            <button
              type="button"
              className={styles.register}
              disabled={verdict === "blocked" || registered}
              onClick={() => setRegistered(true)}
            >
              この内容で登録する
            </button>
            <span className={styles.registerNote}>
              {verdict === "blocked"
                ? "高リスクの不一致または未解決の確認があるため登録できません。指摘を修正してください。"
                : verdict === "warning"
                ? "注意点があります。内容を確認のうえ登録してください。"
                : "重大な不一致はありません。登録できます。"}
            </span>
          </div>
          {registered && <p className={styles.registered}>✓ 登録しました（疑似）。実際のNACCS送信は行いません。</p>}
        </>
      )}
    </div>
  );
}
