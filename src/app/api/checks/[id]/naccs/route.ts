/**
 * GET /api/checks/[id]/naccs — 照合済み申告の NACCS（IDA）疑似サマリ出力。
 *
 * - [id] は check_id。対応する applications.form_input を元に整形する。
 * - form_input が無い照合（事後モード等）は available:false を返す（UI側でモード分岐しないため、
 *   出力可否はサーバーが form_input の有無で判断する）。
 * - 出力は「操作」なので audit_logs に naccs_export として記録する（CLAUDE.md 第6章）。
 * - 内部パス・スタックトレースはレスポンスに出さない。
 */

import { NextResponse } from "next/server";
import { getCheckResultById, getApplicationById, insertAuditLog } from "@/lib/db/queries";
import { buildNaccsSummary, hasExportableInput } from "@/lib/naccs";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id: checkId } = await params;

    const check = await getCheckResultById(checkId);
    if (!check) {
      return NextResponse.json({ error: "照合結果が見つかりません。" }, { status: 404 });
    }

    const application = await getApplicationById(check.application_id);
    const formInput = application?.form_input ?? null;

    if (!hasExportableInput(formInput)) {
      return NextResponse.json({
        available: false,
        message:
          "この照合にはNACCS形式で出力できる申告フォームの入力値がありません（事前モードの申告で利用できます）。",
      });
    }

    const text = buildNaccsSummary(formInput!);

    await insertAuditLog({
      action: "naccs_export",
      applicationId: check.application_id,
      checkId,
      detail: { format: "pseudo_summary" },
    });

    return NextResponse.json({ available: true, text });
  } catch {
    return NextResponse.json({ error: "NACCS出力の生成中にエラーが発生しました。" }, { status: 500 });
  }
}
