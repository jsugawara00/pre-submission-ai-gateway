/**
 * POST /api/checks — 照合の実行。
 *
 * 流れ（CLAUDE.md 第6章のセキュリティ実装を含む）:
 *  1. multipart/form-data でPDFを受け取る（PDFのみ・MIME＋マジックバイト・20MB上限）
 *  2. applications レコード作成
 *  3. 各PDFを暗号化保存し、パス＋SHA-256ハッシュを applications.documents に記録
 *  4. 監査ログ（upload）
 *  5. 照合エンジン実行（runCheck）
 *  6. check_results 保存（AI生レスポンスも保存）＋監査ログ（check）
 *  7. checkId を返す
 *
 * エラーメッセージに内部パス・スタックトレースを露出させない。
 */

import { NextResponse } from "next/server";
import { validatePdf, savePdfEncrypted, MAX_PDF_BYTES } from "@/lib/storage";
import { runCheck, EngineError, EngineUnavailableError, type PdfInput } from "@/lib/engine";
import {
  createApplication,
  updateApplicationDocuments,
  updateApplicationStatus,
  createCheckResult,
  insertAuditLog,
  generateCheckId,
  type DocumentMeta,
} from "@/lib/db/queries";

export const runtime = "nodejs";
export const maxDuration = 120; // 照合に時間がかかるため延長

const MAX_FILES = 10;

export async function POST(request: Request): Promise<Response> {
  let applicationId: string | null = null;
  try {
    const form = await request.formData();

    const mode = form.get("mode") === "pre" ? "pre" : "post";

    // 入力ファイルを役割（target/reference）付きで受け取る（改訂1: 事後モードの2ゾーン化）。
    const isFile = (f: FormDataEntryValue): f is File => f instanceof File;
    const targetFiles = form.getAll("target_files").filter(isFile);
    const referenceFiles = form.getAll("reference_files").filter(isFile);
    const legacyFiles = form.getAll("files").filter(isFile); // 旧形式（単一ゾーン）との後方互換

    type RoledFile = { file: File; role: "target" | "reference" };
    let roledFiles: RoledFile[];
    if (mode === "pre") {
      // 事前モード: 申告側はフォーム入力。添付PDFはすべて reference として扱う。
      roledFiles = [...targetFiles, ...referenceFiles, ...legacyFiles].map((file) => ({
        file,
        role: "reference" as const,
      }));
    } else if (targetFiles.length > 0 || referenceFiles.length > 0) {
      // 事後モード・新形式（2ゾーン）: チェック対象=target / 関係書類=reference。
      roledFiles = [
        ...targetFiles.map((file) => ({ file, role: "target" as const })),
        ...referenceFiles.map((file) => ({ file, role: "reference" as const })),
      ];
    } else {
      // 事後モード・旧形式（files のみ）: 暫定で target 扱い。
      roledFiles = legacyFiles.map((file) => ({ file, role: "target" as const }));
    }

    if (roledFiles.length === 0) {
      return NextResponse.json({ error: "PDFファイルを1つ以上添付してください。" }, { status: 400 });
    }
    if (roledFiles.length > MAX_FILES) {
      return NextResponse.json({ error: `添付できるファイルは最大${MAX_FILES}件です。` }, { status: 400 });
    }
    // 合意事項: target 0件でも処理は止めず警告のみ（reference だけで照合する）。
    if (mode === "post" && !roledFiles.some((rf) => rf.role === "target")) {
      console.warn("[checks] 事後モードでチェック対象(target)が0件です。関係書類のみで照合します。");
    }

    // 事前モードのフォーム入力（任意。Phase 2で本格対応）
    let formInput: Record<string, unknown> | null = null;
    const formInputRaw = form.get("form_input");
    if (typeof formInputRaw === "string" && formInputRaw.trim()) {
      try {
        formInput = JSON.parse(formInputRaw);
      } catch {
        return NextResponse.json({ error: "フォーム入力値の形式が不正です。" }, { status: 400 });
      }
    }

    // 先に全ファイルを読み込み・検証（1つでもNGなら何も保存せず中断）
    const buffers: Buffer[] = [];
    for (const { file } of roledFiles) {
      if (file.size > MAX_PDF_BYTES) {
        return NextResponse.json(
          { error: `「${file.name}」はファイルサイズが上限（20MB）を超えています。` },
          { status: 400 }
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const v = validatePdf(buffer, file.type);
      if (!v.ok) {
        // どのファイルが不正かユーザーが分かるようファイル名を添える
        return NextResponse.json({ error: `「${file.name}」: ${v.reason}` }, { status: 400 });
      }
      buffers.push(buffer);
    }

    // applications 作成
    applicationId = await createApplication({ mode, formInput, status: "checking" });

    // 暗号化保存＋メタ生成
    const documents: DocumentMeta[] = [];
    const pdfInputs: PdfInput[] = [];
    for (let i = 0; i < buffers.length; i++) {
      const buffer = buffers[i];
      const { file, role } = roledFiles[i];
      const stored = await savePdfEncrypted(buffer, applicationId, i);
      const docId = `d${i + 1}`;
      documents.push({
        doc_id: docId,
        original_name: file.name,
        stored_path: stored.storedPath,
        sha256: stored.sha256,
        size_bytes: buffer.length,
        mime: "application/pdf",
        role,
      });
      // 同じ docId と role をエンジンにも渡し、AI出力の doc_id・roleをストレージ側と一致させる。
      pdfInputs.push({ base64: buffer.toString("base64"), filename: file.name, docId, role });
    }
    await updateApplicationDocuments(applicationId, documents);
    await insertAuditLog({
      action: "upload",
      applicationId,
      detail: { file_count: documents.length },
    });

    // 照合エンジン実行
    const checkId = await generateCheckId();
    const { result, rawResponse, model } = await runCheck({
      checkId,
      mode,
      pdfs: pdfInputs,
      formInput,
    });

    // 結果保存＋監査ログ
    await createCheckResult({ applicationId, result, rawResponse, model });
    await updateApplicationStatus(applicationId, "checked");
    await insertAuditLog({
      action: "check",
      applicationId,
      checkId,
      detail: { verdict: result.summary.verdict },
    });

    return NextResponse.json({ checkId, verdict: result.summary.verdict }, { status: 201 });
  } catch (err) {
    // サーバーログには原因を残す（レスポンスには露出させない）。運用・デバッグのため。
    console.error("[checks] 照合処理エラー:", err);
    if (applicationId) {
      // 失敗を記録（ベストエフォート。失敗時の後始末でさらに例外が出ても握り潰す）
      try {
        await updateApplicationStatus(applicationId, "failed");
        await insertAuditLog({ action: "check_failed", applicationId });
      } catch {
        /* noop */
      }
    }
    if (err instanceof EngineUnavailableError) {
      // Claude API の一時的障害（過負荷・タイムアウト等）。リトライ後も復旧せず。
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
    // 内部詳細は露出させない
    return NextResponse.json({ error: "照合処理中にエラーが発生しました。" }, { status: 500 });
  }
}
