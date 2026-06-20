"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "./gate.module.css";

function GateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError("アクセスコードを入力してください。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      if (res.ok) {
        const next = params.get("next") || "/post-check";
        router.push(next);
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "認証に失敗しました。");
      }
    } catch {
      setError("通信エラーが発生しました。時間をおいて再度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={styles.card} onSubmit={onSubmit}>
      <h1 className={styles.title}>アクセスコードの入力</h1>
      <p className={styles.lead}>
        このサービスは利用企業向けの限定公開です。発行されたアクセスコードを入力してください。
      </p>
      <input
        className={styles.input}
        type="password"
        inputMode="text"
        autoComplete="off"
        placeholder="アクセスコード"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        disabled={loading}
        aria-label="アクセスコード"
      />
      {error && <p className={styles.error}>{error}</p>}
      <button className={styles.button} type="submit" disabled={loading}>
        {loading ? "確認中…" : "入室する"}
      </button>
      <Link className={styles.back} href="/">
        ← トップに戻る
      </Link>
    </form>
  );
}

export default function GatePage() {
  return (
    <main className={styles.wrap}>
      <Suspense fallback={<div className={styles.card}>読み込み中…</div>}>
        <GateForm />
      </Suspense>
    </main>
  );
}
