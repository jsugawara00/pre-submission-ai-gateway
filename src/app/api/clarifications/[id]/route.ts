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
import {
  resolveClarificationTurn,
  resolveTypeClarificationTurn,
  isDocTypeClarification,
  ClarifyError,
} from "@/lib/engine/clarify";
import { MAX_RECONFIRM, buildReconfirmLimitMessage } from "@/lib/engine/clarify-config";
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

    // 再確認の上限ガード（堅牢性のためサーバー側で強制）。history の AI 突き返し回数が上限に達していたら、
    // これ以上は精査せず（APIも呼ばず）打ち切り、レポート確認＋やり直しを促す。種別/値の両パス共通。
    const priorReconfirm = history.filter((h) => h.role === "ai").length;
    if (priorReconfirm >= MAX_RECONFIRM) {
      return NextResponse.json({ decision: "limit_reached", message: buildReconfirmLimitMessage() });
    }

    // 書類種別の確認は「値の確定」と別物（確定後にその種別で照合を見直す）。専用パスで処理する。
    if (isDocTypeClarification(clarification)) {
      const reply = await resolveTypeClarificationTurn({ result, clarification, answer, history });

      if (reply.decision === "needs_followup") {
        return NextResponse.json({ decision: "needs_followup", message: reply.message });
      }

      // accepted: 確定種別を該当書類に反映し、種別前提で判明した不一致(new_findings)を追加（軽量再照合）
      const confirmedLabel = reply.excluded
        ? "該当なし（照合から除外）"
        : reply.confirmed_type ?? answer;
      const typeKey = reply.excluded ? "other" : reply.confirmed_type_key ?? "other";
      // AIが accepted で message を空にすることがあるためフォールバックを用意（空の吹き出し防止）。
      const resolveMessage =
        reply.message?.trim() || `書類種別を「${confirmedLabel}」で確定しました。`;

      const updated: CheckResult = {
        ...result,
        documents: result.documents.map((d) =>
          d.doc_id === clarification.doc_id
            ? {
                ...d,
                detected_type: typeKey,
                detected_type_label: reply.excluded
                  ? `${d.detected_type_label}（照合から除外）`
                  : confirmedLabel,
                confidence: 1,
                summary: reply.excluded
                  ? `${d.summary}（人間の確認により照合対象から除外）`
                  : d.summary,
              }
            : d
        ),
        clarifications: result.clarifications.map((c) =>
          c.clarification_id === clarificationId ? { ...c, status: "resolved" as const } : c
        ),
        findings: [...result.findings, ...reply.new_findings],
      };
      // 確定後は headline を作り直す（初回照合時の「種別確認が必要」等の文言が残らないように）
      const finalized = finalizeCheckResult(updated, { regenerateHeadline: true });
      await updateCheckResult(finalized);

      await insertAuditLog({
        action: "clarification_resolve",
        applicationId: row.application_id,
        checkId,
        detail: {
          clarification_id: clarificationId,
          clarification_kind: "doc_type",
          confirmed_value: confirmedLabel,
          confirmed_type_key: typeKey,
          excluded: reply.excluded,
          confirmed_by: confirmedBy,
          confirmed_at: new Date().toISOString(),
          new_finding_added: reply.new_findings.length > 0,
          conversation_log: [
            ...history,
            { role: "human" as const, text: answer },
            { role: "ai" as const, text: resolveMessage },
          ],
        },
      });

      return NextResponse.json({
        decision: "accepted",
        message: resolveMessage,
        confirmedValue: confirmedLabel,
        newFindingAdded: reply.new_findings.length > 0,
        summary: finalized.summary,
      });
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
    // 確定後は headline を作り直す（初回照合時の「確認が必要」等の文言が残らないように）
    const finalized = finalizeCheckResult(updated, { regenerateHeadline: true });
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
