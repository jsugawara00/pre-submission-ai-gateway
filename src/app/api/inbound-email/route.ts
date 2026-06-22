/**
 * POST /api/inbound-email — メール取込みの受信 Webhook（メール取込み Phase 3）。
 *
 * 想定する流れ:
 *   利用者が資料メールを専用アドレスへ転送 → 受信解析サービス（SendGrid Inbound Parse /
 *   Cloudflare Email Workers 等）が添付PDFを抽出して、ここへ POST する。
 *
 * セキュリティ（CLAUDE.md 第6章）:
 *  - 認証は共有シークレット（ヘッダ x-inbound-secret）＋送信元許可。Cookie 認証は通さない（M2M）。
 *  - 受理はPDFのみ。MIME＋マジックバイト検証・20MB上限（validatePdf）。PDF以外の添付はスキップ。
 *  - 原本はDBに入れず暗号化してストレージ保存し、DBにはパスとSHA-256のみ。
 *  - メール本文・件名・送信元は「データ」として扱い、指示として解釈しない（照合AIには既存の
 *    インジェクション防御プロンプトが効く。ここではAIを呼ばず保管するだけ）。
 *  - エラーに内部詳細を出さない。
 *
 * このルートは認証 proxy の matcher 外（M2M のため）。受信トレイ画面・照合APIは認証内に置く。
 */

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { validatePdf, savePdfEncrypted } from "@/lib/storage";
import { verifyInboundSecret, isSenderAllowed } from "@/lib/inbound-config";
import { insertInboundDocument, insertAuditLog } from "@/lib/db/queries";

export const runtime = "nodejs";

interface InboundAttachment {
  filename?: string;
  content_base64?: string;
}
interface InboundPayload {
  sender?: string;
  subject?: string;
  attachments?: InboundAttachment[];
}

function stamp(): string {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${n.getUTCFullYear()}${p(n.getUTCMonth() + 1)}${p(n.getUTCDate())}`;
}

export async function POST(request: Request): Promise<Response> {
  try {
    // 1. 共有シークレット検証（M2M）
    if (!verifyInboundSecret(request.headers.get("x-inbound-secret"))) {
      return NextResponse.json({ error: "認証に失敗しました。" }, { status: 401 });
    }

    // 2. ペイロード解析
    let payload: InboundPayload;
    try {
      payload = (await request.json()) as InboundPayload;
    } catch {
      return NextResponse.json({ error: "ペイロードの形式が不正です。" }, { status: 400 });
    }

    const sender = typeof payload.sender === "string" ? payload.sender : null;
    const subject = typeof payload.subject === "string" ? payload.subject.slice(0, 500) : null;

    // 3. 送信元許可
    if (!isSenderAllowed(sender)) {
      return NextResponse.json({ error: "許可されていない送信元です。" }, { status: 403 });
    }

    const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
    if (attachments.length === 0) {
      return NextResponse.json({ error: "添付ファイルがありません。" }, { status: 400 });
    }

    // 1メール = 1バッチ。受信トレイで同一メール由来をまとめて見せるためのID。
    const batchId = `eml_${stamp()}_${randomBytes(4).toString("hex")}`;
    let received = 0;
    let skipped = 0;

    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      const name =
        typeof att.filename === "string" && att.filename ? att.filename : `attachment_${i + 1}.pdf`;
      if (typeof att.content_base64 !== "string" || !att.content_base64) {
        skipped++;
        continue;
      }
      let buffer: Buffer;
      try {
        buffer = Buffer.from(att.content_base64, "base64");
      } catch {
        skipped++;
        continue;
      }
      // メールには画像・署名など他の添付も来うる。PDF以外はスキップ（エラーにしない）。
      const v = validatePdf(buffer, "application/pdf");
      if (!v.ok) {
        skipped++;
        continue;
      }
      const stored = await savePdfEncrypted(buffer, batchId, i);
      await insertInboundDocument({
        batchId,
        sender,
        subject,
        originalName: name,
        storedPath: stored.storedPath,
        sha256: stored.sha256,
        sizeBytes: buffer.length,
      });
      received++;
    }

    if (received === 0) {
      return NextResponse.json(
        { error: "受理できるPDF添付がありませんでした。", batchId, received, skipped },
        { status: 400 }
      );
    }

    await insertAuditLog({
      action: "inbound_receive",
      actor: sender,
      detail: { batch_id: batchId, received, skipped, subject },
    });

    return NextResponse.json({ ok: true, batchId, received, skipped }, { status: 201 });
  } catch (err) {
    console.error("[inbound-email] 受信処理エラー:", err);
    return NextResponse.json({ error: "受信処理中にエラーが発生しました。" }, { status: 500 });
  }
}
