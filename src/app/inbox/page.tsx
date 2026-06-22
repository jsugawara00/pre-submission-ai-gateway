/**
 * 受信トレイ（メール取込み Phase 3）。
 * 専用アドレスへ転送され Webhook で受信した書類（inbound_documents の pending）を一覧し、
 * 人が「チェック対象（target）／関係書類（reference）」を割り当てて照合にかける。
 * 照合は既存エンジン・既存レポートUIを流用する（設計の核＝モード分岐を持ち込まない）。
 *
 * 認証は proxy（アクセスコード Cookie）で保護。一覧取得はサーバー側で行う。
 */
import Link from "next/link";
import { listPendingInboundDocuments } from "@/lib/db/queries";
import InboxClient, { type InboxItem } from "@/components/inbox/InboxClient";
import styles from "./inbox.module.css";

export const dynamic = "force-dynamic"; // 受信トレイは常に最新を表示する

export default async function InboxPage() {
  const rows = await listPendingInboundDocuments();
  const items: InboxItem[] = rows.map((r) => ({
    id: r.id,
    batchId: r.batch_id,
    sender: r.sender,
    subject: r.subject,
    originalName: r.original_name,
    sizeBytes: r.size_bytes,
    receivedAt: r.received_at instanceof Date ? r.received_at.toISOString() : String(r.received_at),
  }));

  return (
    <div className={styles.container}>
      <Link href="/" className={styles.back}>
        ← トップへ
      </Link>
      <h1 className={styles.title}>受信トレイ（メール取込み）</h1>
      <p className={styles.lead}>
        資料メールを<strong>取込み用アドレスへ転送</strong>すると、添付PDFがここに届きます。各書類に
        <strong>「チェック対象（申告帳票）」</strong>か<strong>「関係書類（元資料）」</strong>を割り当てて、照合を実行してください。
        照合結果は通常のレポートと同じ画面で表示されます。
      </p>

      <p className={styles.note}>
        ※ メール転送による自動取込みは実装済み・疑似検証済みです。実際のメール受信を有効化するには専用ドメインの設定が必要なため、本番デモでは受信トレイが空の場合があります（独自ドメイン取得後に稼働します）。
      </p>

      <div className={styles.card}>
        <InboxClient items={items} />
      </div>
    </div>
  );
}
