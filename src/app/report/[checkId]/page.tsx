/**
 * GET /report/[checkId] — 共通レポート画面（事前/事後で共有）。
 * サーバーコンポーネントとしてDBから結果を取得し、閲覧を監査ログに記録する。
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCheckResultById, insertAuditLog } from "@/lib/db/queries";
import { Report } from "@/components/report/Report";
import reportStyles from "@/components/report/report.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // 常に最新をDBから取得

export default async function ReportPage({
  params,
}: {
  params: Promise<{ checkId: string }>;
}) {
  const { checkId } = await params;
  const row = await getCheckResultById(checkId);
  if (!row) {
    notFound();
  }

  await insertAuditLog({
    action: "view",
    applicationId: row.application_id,
    checkId: row.id,
  });

  return (
    <>
      <header style={{ maxWidth: 880, margin: "0 auto", padding: "20px 20px 0" }}>
        <Link href="/post-check" className={reportStyles.screenOnly}>← 別の書類を照合する</Link>
        <h1 style={{ marginTop: 8, fontSize: "1.4rem" }}>照合レポート</h1>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>照合ID: {row.id}</p>
      </header>
      <Report result={row.result_json} checkId={row.id} />
    </>
  );
}
