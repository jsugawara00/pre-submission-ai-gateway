/**
 * PDFのバリデーションと暗号化保存（CLAUDE.md 第6章）。
 *
 * - 受理はPDFのみ。MIMEタイプ＋マジックバイト検証、サイズ上限20MB/ファイル。
 * - PDF原本はDBに入れない。AES-256-GCMで暗号化したうえで Vercel Blob（private）に保存し、
 *   DBにはBlob URLとSHA-256ハッシュのみ持つ（applications.documents に記録）。
 * - ストレージはローカル・本番ともVercel Blobに統一する（DBのTiDB統一と同じ思想。
 *   環境差による不具合を防ぐため）。トークンは環境変数 BLOB_READ_WRITE_TOKEN。
 * - 暗号化鍵はサーバーサイドの環境変数 STORAGE_ENCRYPTION_KEY（32バイト=64桁hex）。
 *   Blobをprivateにしたうえで暗号文を置く二重防御。
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { put, get } from "@vercel/blob";

export const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20MB/ファイル

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM推奨
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.STORAGE_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("STORAGE_ENCRYPTION_KEY が設定されていません（.env.local を確認してください）");
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("STORAGE_ENCRYPTION_KEY は32バイト（64桁の16進）である必要があります");
  }
  return key;
}

export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export type PdfValidation = { ok: true } | { ok: false; reason: string };

/** PDFのマジックバイト・MIME・サイズを検証する。 */
export function validatePdf(data: Buffer, declaredMime: string): PdfValidation {
  if (data.length === 0) return { ok: false, reason: "ファイルが空です。" };
  if (data.length > MAX_PDF_BYTES) {
    return { ok: false, reason: "ファイルサイズが上限（20MB）を超えています。" };
  }
  // マジックバイト: PDFは必ず "%PDF-" で始まる
  if (data.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return { ok: false, reason: "PDFファイルではありません（ファイル形式が不正です）。" };
  }
  // MIMEは付いていればPDFであることを確認（ブラウザが付けない場合もあるため空は許容）
  if (declaredMime && declaredMime !== "application/pdf") {
    return { ok: false, reason: "PDF以外のファイルは受け付けられません。" };
  }
  return { ok: true };
}

export interface StoredFile {
  /** 取得に使うBlob URL。DBの stored_path に保存する。 */
  storedPath: string;
  sha256: string;
}

/**
 * PDFを暗号化して Vercel Blob（private）に保存し、Blob URLとSHA-256ハッシュを返す。
 * 暗号文の形式: [IV(12B)] + [認証タグ(16B)] + [暗号文]
 */
export async function savePdfEncrypted(data: Buffer, scopeId: string, index: number): Promise<StoredFile> {
  const sha256 = sha256Hex(data);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, tag, encrypted]);

  // addRandomSuffix: パス衝突を避け、URLからの推測も困難にする。
  const result = await put(`uploads/${scopeId}/${index}.pdf.enc`, blob, {
    access: "private",
    addRandomSuffix: true,
    contentType: "application/octet-stream",
  });

  return { storedPath: result.url, sha256 };
}

/** 暗号化済みPDFをBlobから取得・復号して原本のバイト列を返す（レポートでの画像表示等で使用）。 */
export async function readPdfDecrypted(storedPath: string): Promise<Buffer> {
  const result = await get(storedPath, { access: "private" });
  if (!result || result.statusCode !== 200) {
    throw new Error("保存済みファイルの取得に失敗しました。");
  }
  const blob = Buffer.from(await new Response(result.stream).arrayBuffer());
  const iv = blob.subarray(0, IV_LENGTH);
  const tag = blob.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = blob.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
