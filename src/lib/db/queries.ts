/**
 * SQL関数群。すべてプレースホルダ（prepared statement）で実行する（CLAUDE.md 第6章）。
 * 文字列連結でSQLを組まない。テーブル名はコード内リテラルのみ（外部入力を渡さない）。
 */

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "./client";
import type { CheckResult, Mode, Verdict } from "../engine/schema";

// --- 保存用の補助型 ---

/** applications.documents に格納する1書類分のメタ情報（PDF原本はストレージ側）。 */
export interface DocumentMeta {
  doc_id: string;
  original_name: string;
  stored_path: string; // 暗号化済みファイルの保存パス
  sha256: string;
  size_bytes: number;
  mime: string;
  role: "target" | "reference"; // 改訂1: チェック対象 / 関係書類
}

export interface ApplicationRow {
  id: string;
  mode: Mode;
  applicant: string | null;
  form_input: Record<string, unknown> | null;
  documents: DocumentMeta[] | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface CheckResultRow {
  id: string;
  application_id: string;
  result_json: CheckResult;
  raw_response: string;
  verdict: Verdict;
  high_count: number;
  medium_count: number;
  low_count: number;
  unverified_count: number;
  clarifications_open: number;
  model: string | null;
  created_at: Date;
}

// --- ID生成（chk_YYYYMMDD_0001 形式。スキーマ設計v0.2の例に準拠） ---

function todayStamp(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * 当日分の連番IDを生成する。MVPでは同時実行が稀なためCOUNTで採番する
 * （厳密な一意採番が必要になればシーケンステーブル等へ移行）。
 */
async function generateDailyId(
  table: "applications" | "check_results" | "inbound_documents",
  prefix: string
): Promise<string> {
  const stamp = todayStamp();
  const like = `${prefix}_${stamp}_%`;
  const sql = `SELECT COUNT(*) AS c FROM ${table} WHERE id LIKE ?`;
  const [rows] = await getPool().execute<RowDataPacket[]>(sql, [like]);
  const seq = Number(rows[0]?.c ?? 0) + 1;
  return `${prefix}_${stamp}_${String(seq).padStart(4, "0")}`;
}

/** 新しい check_id を採番する（エンジン側で result に設定してから保存するため公開）。 */
export function generateCheckId(): Promise<string> {
  return generateDailyId("check_results", "chk");
}

// --- JSON列の読み出し補助（mysql2のバージョン差を吸収） ---

function parseJsonColumn<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

// --- applications ---

export interface CreateApplicationInput {
  mode: Mode;
  applicant?: string | null;
  formInput?: Record<string, unknown> | null;
  documents?: DocumentMeta[] | null;
  status?: string;
}

export async function createApplication(input: CreateApplicationInput): Promise<string> {
  const id = await generateDailyId("applications", "app");
  const sql = `
    INSERT INTO applications (id, mode, applicant, form_input, documents, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  await getPool().execute(sql, [
    id,
    input.mode,
    input.applicant ?? null,
    input.formInput != null ? JSON.stringify(input.formInput) : null,
    input.documents != null ? JSON.stringify(input.documents) : null,
    input.status ?? "created",
  ]);
  return id;
}

export async function getApplicationById(id: string): Promise<ApplicationRow | null> {
  const sql = `SELECT * FROM applications WHERE id = ? LIMIT 1`;
  const [rows] = await getPool().execute<RowDataPacket[]>(sql, [id]);
  const row = rows[0];
  if (!row) return null;
  return {
    ...(row as ApplicationRow),
    form_input: parseJsonColumn(row.form_input),
    documents: parseJsonColumn(row.documents),
  };
}

export async function updateApplicationDocuments(id: string, documents: DocumentMeta[]): Promise<void> {
  const sql = `UPDATE applications SET documents = ? WHERE id = ?`;
  await getPool().execute(sql, [JSON.stringify(documents), id]);
}

export async function updateApplicationStatus(id: string, status: string): Promise<void> {
  const sql = `UPDATE applications SET status = ? WHERE id = ?`;
  await getPool().execute(sql, [status, id]);
}

// --- check_results ---

export interface CreateCheckResultInput {
  applicationId: string;
  /** verdict・件数はサーバー側（verdict.ts）で算出済みの最終 CheckResult を渡す。check_id を id に使う。 */
  result: CheckResult;
  rawResponse: string;
  model?: string | null;
}

export async function createCheckResult(input: CreateCheckResultInput): Promise<string> {
  const { result } = input;
  const s = result.summary;
  const sql = `
    INSERT INTO check_results
      (id, application_id, result_json, raw_response, verdict,
       high_count, medium_count, low_count, unverified_count, clarifications_open, model)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await getPool().execute(sql, [
    result.check_id,
    input.applicationId,
    JSON.stringify(result),
    input.rawResponse,
    s.verdict,
    s.high,
    s.medium,
    s.low,
    s.unverified,
    s.clarifications_open,
    input.model ?? null,
  ]);
  return result.check_id;
}

/**
 * 既存の照合結果を確定後の内容で更新する（聞き返し解決後の result_json と verdict・件数）。
 * result.check_id を主キーとして上書きする。
 */
export async function updateCheckResult(result: CheckResult): Promise<void> {
  const s = result.summary;
  const sql = `
    UPDATE check_results
    SET result_json = ?, verdict = ?, high_count = ?, medium_count = ?, low_count = ?,
        unverified_count = ?, clarifications_open = ?
    WHERE id = ?
  `;
  await getPool().execute(sql, [
    JSON.stringify(result),
    s.verdict,
    s.high,
    s.medium,
    s.low,
    s.unverified,
    s.clarifications_open,
    result.check_id,
  ]);
}

/** mutateCheckResultAtomic 用のエラー。route 側で 404/409 にマップする。 */
export class CheckResultNotFoundError extends Error {
  constructor() {
    super("照合結果が見つかりません。");
    this.name = "CheckResultNotFoundError";
  }
}

/** 確定の適用が衝突した（既に確定済み等）。route 側で 409 にマップする。 */
export class CheckResultConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckResultConflictError";
  }
}

/**
 * check_results の result_json を「最新状態を読み直してから」原子的に更新する。
 * 同一 check_id への同時更新（複数の聞き返し確定が間髪入れず走るケース）での
 * ロストアップデートを防ぐ。
 *
 * - 1本のトランザクション内で `SELECT … FOR UPDATE` により行ロックを取り、
 *   最新の result_json を mutate に渡す。mutate は最新状態に確定を適用し、
 *   finalize 済み（summary を埋めた）の CheckResult を返す。
 * - これにより2件目の確定は1件目の確定済み状態の上に積まれ、両方が合成される。
 * - mutate が投げた例外はロールバックして伝播する（既に確定済み等の判定に使う）。
 * - AI 呼び出し等の時間のかかる処理は必ずこの関数の外で済ませ、ロック保持を最短にすること。
 */
export async function mutateCheckResultAtomic(
  checkId: string,
  mutate: (latest: CheckResult) => CheckResult
): Promise<CheckResult> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT result_json FROM check_results WHERE id = ? LIMIT 1 FOR UPDATE`,
      [checkId]
    );
    const row = rows[0];
    if (!row) {
      await conn.rollback();
      throw new CheckResultNotFoundError();
    }
    const latest = parseJsonColumn<CheckResult>(row.result_json)!;
    const updated = mutate(latest);
    const s = updated.summary;
    await conn.execute(
      `UPDATE check_results
       SET result_json = ?, verdict = ?, high_count = ?, medium_count = ?, low_count = ?,
           unverified_count = ?, clarifications_open = ?
       WHERE id = ?`,
      [
        JSON.stringify(updated),
        s.verdict,
        s.high,
        s.medium,
        s.low,
        s.unverified,
        s.clarifications_open,
        checkId,
      ]
    );
    await conn.commit();
    return updated;
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* ロールバック自体の失敗は握り潰す（元のエラーを優先して伝播） */
    }
    throw e;
  } finally {
    conn.release();
  }
}

export async function getCheckResultById(checkId: string): Promise<CheckResultRow | null> {
  const sql = `SELECT * FROM check_results WHERE id = ? LIMIT 1`;
  const [rows] = await getPool().execute<RowDataPacket[]>(sql, [checkId]);
  const row = rows[0];
  if (!row) return null;
  return {
    ...(row as CheckResultRow),
    result_json: parseJsonColumn<CheckResult>(row.result_json)!,
  };
}

export async function getLatestCheckResultByApplication(applicationId: string): Promise<CheckResultRow | null> {
  const sql = `SELECT * FROM check_results WHERE application_id = ? ORDER BY created_at DESC LIMIT 1`;
  const [rows] = await getPool().execute<RowDataPacket[]>(sql, [applicationId]);
  const row = rows[0];
  if (!row) return null;
  return {
    ...(row as CheckResultRow),
    result_json: parseJsonColumn<CheckResult>(row.result_json)!,
  };
}

// --- audit_logs ---

export interface AuditLogInput {
  action: string; // upload / check / view / clarification_resolve など
  applicationId?: string | null;
  checkId?: string | null;
  actor?: string | null;
  detail?: Record<string, unknown> | null;
}

export async function insertAuditLog(input: AuditLogInput): Promise<number> {
  const sql = `
    INSERT INTO audit_logs (application_id, check_id, action, actor, detail)
    VALUES (?, ?, ?, ?, ?)
  `;
  const [result] = await getPool().execute<ResultSetHeader>(sql, [
    input.applicationId ?? null,
    input.checkId ?? null,
    input.action,
    input.actor ?? null,
    input.detail != null ? JSON.stringify(input.detail) : null,
  ]);
  return result.insertId;
}

// --- access_codes（B案認証＋累計回数制限） ---

export interface AccessCodeRow {
  code: string;
  label: string | null;
  max_uses: number;
  used_count: number;
  disabled: number; // 0/1（MySQL の TINYINT）
  created_at: Date;
  updated_at: Date;
}

export async function getAccessCode(code: string): Promise<AccessCodeRow | null> {
  const sql = `SELECT * FROM access_codes WHERE code = ? LIMIT 1`;
  const [rows] = await getPool().execute<RowDataPacket[]>(sql, [code]);
  const row = rows[0];
  return row ? (row as AccessCodeRow) : null;
}

/** 認証ゲート用: コードが存在し、無効化されていなければ有効とみなす（残回数は照合実行時に判定）。 */
export async function isAccessCodeActive(code: string): Promise<boolean> {
  const row = await getAccessCode(code);
  return !!row && row.disabled === 0;
}

export type ConsumeAccessResult =
  | { ok: true; row: AccessCodeRow }
  | { ok: false; reason: "not_found" | "disabled" | "limit_reached" };

/**
 * 照合1回ぶんを消費する（used_count を +1）。上限・無効化はこの1本のUPDATEで原子的に判定し、
 * 同時実行でも上限を超えないようにする（条件に合致しなければ affectedRows=0）。
 * 失敗時は理由を判別して返す。実際にClaude APIを呼ぶ前にこれを通す。
 */
export async function consumeAccessCode(code: string): Promise<ConsumeAccessResult> {
  const sql = `
    UPDATE access_codes
    SET used_count = used_count + 1
    WHERE code = ? AND disabled = 0 AND used_count < max_uses
  `;
  const [res] = await getPool().execute<ResultSetHeader>(sql, [code]);
  if (res.affectedRows === 1) {
    const row = await getAccessCode(code);
    return { ok: true, row: row! };
  }
  // 消費できなかった理由を判別する。
  const row = await getAccessCode(code);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.disabled !== 0) return { ok: false, reason: "disabled" };
  return { ok: false, reason: "limit_reached" };
}

/** 照合がエラーで失敗したときに消費を取り消す（返金。0未満にはしない）。 */
export async function releaseAccessCode(code: string): Promise<void> {
  const sql = `UPDATE access_codes SET used_count = GREATEST(used_count - 1, 0) WHERE code = ?`;
  await getPool().execute(sql, [code]);
}

// --- 運用（発行・一覧・変更）。発行スクリプトから使う ---

export interface CreateAccessCodeInput {
  code: string;
  label?: string | null;
  maxUses: number;
}

export async function createAccessCode(input: CreateAccessCodeInput): Promise<void> {
  const sql = `INSERT INTO access_codes (code, label, max_uses) VALUES (?, ?, ?)`;
  await getPool().execute(sql, [input.code, input.label ?? null, input.maxUses]);
}

export async function listAccessCodes(): Promise<AccessCodeRow[]> {
  const sql = `SELECT * FROM access_codes ORDER BY created_at DESC`;
  const [rows] = await getPool().execute<RowDataPacket[]>(sql);
  return rows as AccessCodeRow[];
}

/** 累計上限を変更する（増減どちらも可）。存在しなければ false。 */
export async function setAccessCodeMaxUses(code: string, maxUses: number): Promise<boolean> {
  const sql = `UPDATE access_codes SET max_uses = ? WHERE code = ?`;
  const [res] = await getPool().execute<ResultSetHeader>(sql, [maxUses, code]);
  return res.affectedRows === 1;
}

/** コードの有効/無効を切り替える。存在しなければ false。 */
export async function setAccessCodeDisabled(code: string, disabled: boolean): Promise<boolean> {
  const sql = `UPDATE access_codes SET disabled = ? WHERE code = ?`;
  const [res] = await getPool().execute<ResultSetHeader>(sql, [disabled ? 1 : 0, code]);
  return res.affectedRows === 1;
}

// --- inbound_documents（メール取込み Phase 3） ---

export interface InboundDocumentRow {
  id: string;
  batch_id: string;
  sender: string | null;
  subject: string | null;
  original_name: string;
  stored_path: string;
  sha256: string;
  size_bytes: number;
  role: "target" | "reference" | null;
  status: string; // pending / assigned / checked / discarded
  application_id: string | null;
  received_at: Date;
  updated_at: Date;
}

export interface InsertInboundDocumentInput {
  batchId: string;
  sender?: string | null;
  subject?: string | null;
  originalName: string;
  storedPath: string;
  sha256: string;
  sizeBytes: number;
}

/** 受信した添付PDF1件を保存する（原本はストレージ側・ここはメタのみ）。採番した id を返す。 */
export async function insertInboundDocument(input: InsertInboundDocumentInput): Promise<string> {
  const id = await generateDailyId("inbound_documents", "inb");
  const sql = `
    INSERT INTO inbound_documents
      (id, batch_id, sender, subject, original_name, stored_path, sha256, size_bytes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await getPool().execute(sql, [
    id,
    input.batchId,
    input.sender ?? null,
    input.subject ?? null,
    input.originalName,
    input.storedPath,
    input.sha256,
    input.sizeBytes,
  ]);
  return id;
}

/** 受信トレイ用: 未処理（pending）の受信物を受信順に返す。 */
export async function listPendingInboundDocuments(): Promise<InboundDocumentRow[]> {
  const sql = `SELECT * FROM inbound_documents WHERE status = 'pending' ORDER BY received_at ASC, id ASC`;
  const [rows] = await getPool().execute<RowDataPacket[]>(sql);
  return rows as InboundDocumentRow[];
}

/** 指定IDの受信物を取得する（照合実行時に原本を読み出すため）。 */
export async function getInboundDocumentsByIds(ids: string[]): Promise<InboundDocumentRow[]> {
  if (ids.length === 0) return [];
  // プレースホルダはID件数ぶんの "?" のみを動的生成（値は必ずパラメータで渡す＝SQLインジェクション安全）。
  const placeholders = ids.map(() => "?").join(", ");
  const sql = `SELECT * FROM inbound_documents WHERE id IN (${placeholders})`;
  const [rows] = await getPool().execute<RowDataPacket[]>(sql, ids);
  return rows as InboundDocumentRow[];
}

/** 受信物を照合に回した状態に更新する（役割確定＋status=checked＋application紐付け）。 */
export async function markInboundChecked(
  id: string,
  role: "target" | "reference",
  applicationId: string
): Promise<void> {
  const sql = `UPDATE inbound_documents SET role = ?, status = 'checked', application_id = ? WHERE id = ?`;
  await getPool().execute(sql, [role, applicationId, id]);
}

/** 受信物を破棄（照合に使わない）。受信トレイの掃除用。 */
export async function discardInboundDocument(id: string): Promise<void> {
  const sql = `UPDATE inbound_documents SET status = 'discarded' WHERE id = ?`;
  await getPool().execute(sql, [id]);
}
