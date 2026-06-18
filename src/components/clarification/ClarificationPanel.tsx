"use client";

/**
 * 確認チャット（聞き返しループ）のUI。共通レポートの「要確認」セクションで使う。
 * open な clarification ごとに、人間が値を入力 → /api/clarifications/[id] でAIが受理可否を判断。
 * 受理されたらページを再取得して verdict 等を最新化する。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Clarification } from "@/lib/engine/schema";
import styles from "./clarification.module.css";

type Msg = { role: "ai" | "human"; text: string };

function ClarificationItem({ checkId, clarification }: { checkId: string; clarification: Clarification }) {
  const router = useRouter();
  // 書類種別の確認か（rulebook: field_key=null かつ field_label="書類種別"）。文言を切り替える。
  const isType = clarification.field_key === null && clarification.field_label === "書類種別";
  const [thread, setThread] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);

  if (clarification.status === "resolved") {
    return (
      <div className={styles.item}>
        <div className={styles.head}>
          <span className={styles.title}>{clarification.field_label}</span>
          <span className={styles.resolved}>✓ 確定済み</span>
        </div>
      </div>
    );
  }

  async function send() {
    const answer = input.trim();
    if (!answer || busy) return;
    setBusy(true);
    setError(null);
    const history = [...thread];
    setThread((t) => [...t, { role: "human", text: answer }]);
    setInput("");
    try {
      const res = await fetch(`/api/clarifications/${clarification.clarification_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkId, answer, history }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "確認に失敗しました。");
        setBusy(false);
        return;
      }
      setThread((t) => [...t, { role: "ai", text: data.message }]);
      if (data.decision === "accepted") {
        setAccepted(
          (isType
            ? `書類種別を「${data.confirmedValue}」で確定しました。`
            : `確定値「${data.confirmedValue}」を受理しました。`) +
            (data.newFindingAdded ? "（この確定により新たな確認事項を検出しました）" : "")
        );
        // 最新の verdict / 件数を反映するためサーバーコンポーネントを再取得
        router.refresh();
      }
      setBusy(false);
    } catch {
      setError("通信エラーが発生しました。");
      setBusy(false);
    }
  }

  return (
    <div className={styles.item}>
      <div className={styles.head}>
        <span className={styles.title}>{clarification.field_label}</span>
        <span className={styles.loc}>
          {clarification.doc_id}
          {clarification.page !== null ? ` p.${clarification.page}` : ""} ・ {clarification.location} ・ 確信度{" "}
          {Math.round(clarification.confidence * 100)}%
        </span>
      </div>
      <p className={styles.question}>{clarification.question}</p>

      {clarification.candidates.length > 0 && (
        <div className={styles.candidates}>
          {isType ? "種別の候補（クリックで選択）:" : "候補（クリックで入力）:"}{" "}
          {clarification.candidates.map((c, i) => (
            <span key={i} className={styles.candidate} onClick={() => setInput(c)}>
              {c}
            </span>
          ))}
        </div>
      )}

      {thread.length > 0 && (
        <div className={styles.thread}>
          {thread.map((m, i) => (
            <div key={i} className={m.role === "ai" ? styles.msgAi : styles.msgHuman}>
              {m.text}
            </div>
          ))}
        </div>
      )}

      {accepted ? (
        <p className={styles.accepted}>✓ {accepted}</p>
      ) : (
        <div className={styles.inputRow}>
          <input
            className={styles.input}
            value={input}
            placeholder={isType ? "候補から書類種別を選んでください" : "原本を確認した正しい値を入力"}
            disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
          />
          <button className={styles.send} onClick={send} disabled={busy || !input.trim()}>
            {busy ? "確認中…" : "送信"}
          </button>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

export function ClarificationPanel({
  checkId,
  clarifications,
}: {
  checkId: string;
  clarifications: Clarification[];
}) {
  return (
    <>
      {clarifications.map((c) => (
        <ClarificationItem key={c.clarification_id} checkId={checkId} clarification={c} />
      ))}
    </>
  );
}
