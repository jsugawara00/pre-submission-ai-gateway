/**
 * POST /api/clarifications/[id] — 聞き返し（確認チャット）の1ターン。
 * [id] は clarification_id。body に checkId・人間の回答・会話履歴を含む。
 *
 * 流れ（スキーマ設計v0.2 §2.6）:
 *  - AIが回答を文脈・検算と突き合わせ → needs_followup（聞き返し）または accepted（確定）
 *  - accepted のとき: 当該 clarification を resolved に、必要なら new_finding を追加、
 *    verdict・件数を再計算して保存。確定値・確定者・日時・会話を監査ログに記録（軽量再照合）。
 */

import { NextResponse } from "next/server";
import {
  getCheckResultById,
  updateCheckResult,
  insertAuditLog,
} from "@/lib/db/queries";
import { finalizeCheckResult } from "@/lib/engine/verdict";
import { resolveClarificationTurn, ClarifyError } from "@/lib/engine/clarify";
import type { CheckResult } from "@/lib/engine/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Body {
  checkId?: string;
  answer?: string;
  history?: { role: "ai" | "human"; text: string }[];
  confirmedBy?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id: clarificationId } = await params;
    const body = (await request.json().catch(() => ({}))) as Body;
    const checkId = body.checkId?.trim();
    const answer = body.answer?.trim();
    const history = Array.isArray(body.history) ? body.history : [];
    const confirmedBy = body.confirmedBy?.trim() || "anonymous";

    if (!checkId || !answer) {
      return NextResponse.json({ error: "checkId と回答（answer）は必須です。" }, { status: 400 });
    }

    const row = await getCheckResultById(checkId);
    if (!row) {
      return NextResponse.json({ error: "照合結果が見つかりません。" }, { status: 404 });
    }

    const result: CheckResult = row.result_json;
    const clarification = result.clarifications.find((c) => c.clarification_id === clarificationId);
    if (!clarification) {
      return NextResponse.json({ error: "対象の確認項目が見つかりません。" }, { status: 404 });
    }
    if (clarification.status === "resolved") {
      return NextResponse.json({ error: "この確認項目はすでに確定済みです。" }, { status: 409 });
    }

    const reply = await resolveClarificationTurn({ result, clarification, answer, history });

    if (reply.decision === "needs_followup") {
      // 確定せず、AIの追加質問を返す（クライアントが会話を継続）
      return NextResponse.json({ decision: "needs_followup", message: reply.message });
    }

    // accepted: 確定処理
    const confirmedValue = reply.confirmed_value ?? answer;
    const updated: CheckResult = {
      ...result,
      clarifications: result.clarifications.map((c) =>
        c.clarification_id === clarificationId ? { ...c, status: "resolved" as const } : c
      ),
      findings: reply.new_finding ? [...result.findings, reply.new_finding] : result.findings,
    };
    const finalized = finalizeCheckResult(updated);
    await updateCheckResult(finalized);

    const conversationLog = [
      ...history,
      { role: "human" as const, text: answer },
      { role: "ai" as const, text: reply.message },
    ];
    await insertAuditLog({
      action: "clarification_resolve",
      applicationId: row.application_id,
      checkId,
      detail: {
        clarification_id: clarificationId,
        confirmed_value: confirmedValue,
        confirmed_by: confirmedBy,
        confirmed_at: new Date().toISOString(),
        new_finding_added: Boolean(reply.new_finding),
        conversation_log: conversationLog,
      },
    });

    return NextResponse.json({
      decision: "accepted",
      message: reply.message,
      confirmedValue,
      newFindingAdded: Boolean(reply.new_finding),
      summary: finalized.summary,
    });
  } catch (err) {
    if (err instanceof ClarifyError) {
      return NextResponse.json(
        { error: "確認応答を正しく取得できませんでした。時間をおいて再度お試しください。" },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: "確認処理中にエラーが発生しました。" }, { status: 500 });
  }
}
