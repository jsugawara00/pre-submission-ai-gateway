/**
 * GET /api/checks/[id] — 照合結果（CheckResult）の取得。
 * 共通レポート画面（事前/事後で共通）が参照する。閲覧操作も監査ログに記録する。
 */

import { NextResponse } from "next/server";
import { getCheckResultById, insertAuditLog } from "@/lib/db/queries";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await params;
    const row = await getCheckResultById(id);
    if (!row) {
      return NextResponse.json({ error: "指定された照合結果は見つかりませんでした。" }, { status: 404 });
    }

    await insertAuditLog({
      action: "view",
      applicationId: row.application_id,
      checkId: row.id,
    });

    return NextResponse.json(row.result_json);
  } catch (err) {
    console.error("[checks/[id]] 結果取得エラー:", err);
    return NextResponse.json({ error: "結果の取得中にエラーが発生しました。" }, { status: 500 });
  }
}
