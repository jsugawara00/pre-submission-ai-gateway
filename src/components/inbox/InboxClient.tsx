"use client";

/**
 * 受信トレイのクライアント部品。届いた書類に役割（チェック対象/関係書類/使わない）を割り当て、
 * /api/inbox/check へ送って照合する。照合後は共通レポート /report/[checkId] へ遷移。
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ScanningIndicator from "@/components/ScanningIndicator/ScanningIndicator";
import ReportLoading from "@/components/ReportLoading/ReportLoading";
import styles from "@/app/inbox/inbox.module.css";

export interface InboxItem {
  id: string;
  batchId: string;
  sender: string | null;
  subject: string | null;
  originalName: string;
  sizeBytes: number;
  receivedAt: string;
}

type Role = "none" | "target" | "reference";

const ROLE_LABEL: Record<Role, string> = {
  target: "チェック対象",
  reference: "関係書類",
  none: "使わない",
};

export default function InboxClient({ items }: { items: InboxItem[] }) {
  const router = useRouter();
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [navigating, setNavigating] = useState(false);

  // 同一メール（batch）ごとにまとめて表示する
  const batches = useMemo(() => {
    const m = new Map<string, InboxItem[]>();
    for (const it of items) {
      const arr = m.get(it.batchId);
      if (arr) arr.push(it);
      else m.set(it.batchId, [it]);
    }
    return Array.from(m.entries());
  }, [items]);

  const assignedCount = items.filter(
    (it) => roles[it.id] === "target" || roles[it.id] === "reference"
  ).length;

  function setRole(id: string, role: Role) {
    setError(null);
    setRoles((prev) => ({ ...prev, [id]: role }));
  }

  async function handleSubmit() {
    const payload = items
      .filter((it) => roles[it.id] === "target" || roles[it.id] === "reference")
      .map((it) => ({ id: it.id, role: roles[it.id] as "target" | "reference" }));
    if (payload.length === 0) {
      setError("照合する書類を選び、役割を割り当ててください。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/inbox/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "照合に失敗しました。時間をおいて再度お試しください。");
        setSubmitting(false);
        return;
      }
      setNavigating(true);
      router.push(`/report/${data.checkId}`);
    } catch {
      setError("通信エラーが発生しました。接続を確認してください。");
      setSubmitting(false);
    }
  }

  if (navigating) return <ReportLoading />;

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>受信トレイは空です。</p>
        <p className={styles.emptyHint}>
          資料メールを取込み用アドレスへ転送すると、添付PDFがここに並びます。
        </p>
        <button type="button" className={styles.refresh} onClick={() => router.refresh()}>
          ↻ 受信トレイを更新
        </button>
      </div>
    );
  }

  return (
    <>
      <div className={styles.toolbar}>
        <button type="button" className={styles.refresh} onClick={() => router.refresh()}>
          ↻ 更新
        </button>
        <span className={styles.count}>割当済み {assignedCount} 件</span>
      </div>

      {batches.map(([batchId, list]) => (
        <div key={batchId} className={styles.batch}>
          <div className={styles.batchHead}>
            <span className={styles.batchIcon} aria-hidden="true">
              ✉
            </span>
            <span className={styles.batchMeta}>
              {list[0].subject ?? "(件名なし)"}
              {list[0].sender ? <span className={styles.batchSender}>{list[0].sender}</span> : null}
            </span>
          </div>
          <ul className={styles.fileList}>
            {list.map((it) => {
              const current = roles[it.id] ?? "none";
              return (
                <li key={it.id} className={styles.fileItem}>
                  <span className={styles.fileName}>
                    📄 {it.originalName}
                    <span className={styles.fileSize}>{(it.sizeBytes / 1024).toFixed(0)} KB</span>
                  </span>
                  <span className={styles.roleGroup} role="group" aria-label="役割の割り当て">
                    {(["target", "reference", "none"] as Role[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={[
                          styles.roleBtn,
                          current === r ? styles.roleBtnActive : "",
                          current === r && r === "target" ? styles.roleTarget : "",
                          current === r && r === "reference" ? styles.roleReference : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-pressed={current === r}
                        onClick={() => setRole(it.id, r)}
                      >
                        {ROLE_LABEL[r]}
                      </button>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {error && <p className={styles.error}>{error}</p>}
      {submitting && (
        <ScanningIndicator label="" note="AIが書類を読み取っています（資料が多いと数十秒）。" />
      )}

      <button type="button" className={styles.submit} onClick={handleSubmit} disabled={submitting}>
        {submitting ? "照合中…" : "選んだ書類で照合する"}
      </button>
    </>
  );
}
