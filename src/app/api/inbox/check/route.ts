/**
 * POST /api/inbox/check — 受信トレイから役割を割り当てた受信物を照合する（メール取込み Phase 3）。
 *
 * 受信トレイで人が target/reference を割り当てた受信物（inbound_documents）を読み出し、
 * 暗号化保存された原本を復号して、既存の照合エンジン（runCheck）にかける。
 * 結果は applications / check_results に保存し、受信物は status=checked にする。
 *
 * 設計の核（CLAUDE.md）:
 *  - レポートUIは事前/事後共通（モード分岐を持ち込まない）。ここは mode='post' として既存経路を流用。
 *  - verdict はサーバー側（verdict.ts）で算出（runCheck 内で確定済み）。
 *  - 認証＝アクセスコード（proxy＋本ルートで二重確認）。照合1回ぶんの回数を消費。
 *  - SQLはプレースホルダ。エラーに内部詳細を出さない。
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readPdfDecrypted } from "@/lib/storage";
import { ACCESS_CODE_COOKIE, buildAccessDenialMessage } from "@/lib/access-config";
import { runCheck, EngineError, EngineUnavailableError, type PdfInput } from "@/lib/engine";
import {
  createApplication,
  updateApplicationDocuments,
  updateApplicationStatus,
  createCheckResult,
  insertAuditLog,
  generateCheckId,
  consumeAccessCode,
  releaseAccessCode,
  getInboundDocumentsByIds,
  markInboundChecked,
  type DocumentMeta,
} from "@/lib/db/queries";

export const runtime = "nodejs";
export const maxDuration = 300; // 照合（重いスキャンPDFのvision処理）に時間がかかるため上限まで延長

const MAX_FILES = 10;

interface AssignItem {
  id: string;
  role: "target" | "reference";
}

export async function POST(request: Request): Promise<Response> {
  let applicationId: string | null = null;
  let consumedCode: string | null = null;
  try {
    const accessCode = (await cookies()).get(ACCESS_CODE_COOKIE)?.value ?? null;
    if (!accessCode) {
      return NextResponse.json({ error: "アクセスコードでの認証が必要です。" }, { status: 401 });
    }

    let body: { items?: AssignItem[] };
    try {
      body = (await request.json()) as { items?: AssignItem[] };
    } catch {
      return NextResponse.json({ error: "リクエストの形式が不正です。" }, { status: 400 });
    }

    // 役割割当の検証（target/reference のみ・重複ID除去）
    const seen = new Set<string>();
    const items: AssignItem[] = [];
    for (const it of body.items ?? []) {
      if (!it || typeof it.id !== "string") continue;
      if (it.role !== "target" && it.role !== "reference") continue;
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      items.push({ id: it.id, role: it.role });
    }
    if (items.length === 0) {
      return NextResponse.json({ error: "照合する書類を1つ以上選び、役割を割り当ててください。" }, { status: 400 });
    }
    if (items.length > MAX_FILES) {
      return NextResponse.json({ error: `一度に照合できるのは最大${MAX_FILES}件です。` }, { status: 400 });
    }

    // 受信物を取得（存在＆未処理を確認）
    const rows = await getInboundDocumentsByIds(items.map((i) => i.id));
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const it of items) {
      const row = byId.get(it.id);
      if (!row) {
        return NextResponse.json({ error: "選択した受信物が見つかりません。" }, { status: 404 });
      }
      if (row.status !== "pending") {
        return NextResponse.json({ error: "既に処理済みの受信物が含まれています。受信トレイを更新してください。" }, { status: 409 });
      }
    }

    // 回数消費（APIを呼ぶ前に弾く）
    const consume = await consumeAccessCode(accessCode);
    if (!consume.ok) {
      const status = consume.reason === "limit_reached" ? 429 : 403;
      return NextResponse.json({ error: buildAccessDenialMessage(consume.reason) }, { status });
    }
    consumedCode = accessCode;

    applicationId = await createApplication({ mode: "post", status: "checking" });

    // 暗号化保存済みの原本を復号して、メタ＋エンジン入力を組み立てる
    const documents: DocumentMeta[] = [];
    const pdfInputs: PdfInput[] = [];
    for (let i = 0; i < items.length; i++) {
      const { id, role } = items[i];
      const row = byId.get(id)!;
      const buffer = await readPdfDecrypted(row.stored_path);
      const docId = `d${i + 1}`;
      documents.push({
        doc_id: docId,
        original_name: row.original_name,
        stored_path: row.stored_path, // 受信時に保存済みの暗号化ファイルをそのまま参照
        sha256: row.sha256,
        size_bytes: row.size_bytes,
        mime: "application/pdf",
        role,
      });
      pdfInputs.push({ base64: buffer.toString("base64"), filename: row.original_name, docId, role });
    }
    await updateApplicationDocuments(applicationId, documents);
    await insertAuditLog({
      action: "upload",
      applicationId,
      actor: consumedCode,
      detail: { source: "inbound", file_count: documents.length, inbound_ids: items.map((i) => i.id) },
    });

    // 照合エンジン実行
    const checkId = await generateCheckId();
    const { result, rawResponse, model } = await runCheck({ checkId, mode: "post", pdfs: pdfInputs });

    await createCheckResult({ applicationId, result, rawResponse, model });
    await updateApplicationStatus(applicationId, "checked");
    await insertAuditLog({
      action: "check",
      applicationId,
      checkId,
      actor: consumedCode,
      detail: { verdict: result.summary.verdict, source: "inbound" },
    });

    // 受信物を処理済みに（役割確定＋application紐付け）
    for (const { id, role } of items) {
      await markInboundChecked(id, role, applicationId);
    }

    return NextResponse.json({ checkId, verdict: result.summary.verdict }, { status: 201 });
  } catch (err) {
    console.error("[inbox/check] 照合処理エラー:", err);
    if (consumedCode) {
      try {
        await releaseAccessCode(consumedCode);
      } catch {
        /* noop */
      }
    }
    if (applicationId) {
      try {
        await updateApplicationStatus(applicationId, "failed");
        await insertAuditLog({ action: "check_failed", applicationId });
      } catch {
        /* noop */
      }
    }
    if (err instanceof EngineUnavailableError) {
      return NextResponse.json(
        { error: "照合サービスが混み合っているか接続できませんでした。時間をおいて再度お試しください。" },
        { status: 503 }
      );
    }
    if (err instanceof EngineError) {
      return NextResponse.json(
        { error: "照合結果を正しく取得できませんでした。時間をおいて再度お試しください。" },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: "照合処理中にエラーが発生しました。" }, { status: 500 });
  }
}
