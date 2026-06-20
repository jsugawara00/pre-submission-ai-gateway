-- 申請前AI検問所 — テーブル定義（設計書v0.3 第8章 / CLAUDE.md 第3・6章準拠）
--
-- テーブルは3つ: applications / check_results / audit_logs
-- 文字コードは utf8mb4、エンジンは InnoDB（外部キー制約を使うため）。
-- PDF原本はDBに入れない。暗号化してストレージ保存し、DBにはパスとSHA-256ハッシュのみ
-- （applications.documents に JSON で保持）。

-- 1) applications（申請）
CREATE TABLE IF NOT EXISTS applications (
  id           VARCHAR(40)  NOT NULL,                 -- 例: app_20260613_0001
  mode         ENUM('pre','post') NOT NULL,           -- 事前/事後モード
  applicant    VARCHAR(255) NULL,                      -- 申請者（認証導入までは任意）
  form_input   JSON         NULL,                      -- 疑似申告フォーム入力値（事前モードのみ）
  documents    JSON         NULL,                      -- アップPDFのメタ配列 [{doc_id, original_name, stored_path, sha256, size_bytes, mime}]
  status       VARCHAR(32)  NOT NULL DEFAULT 'created',-- created / checking / checked / failed など
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_applications_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2) check_results（照合結果）
CREATE TABLE IF NOT EXISTS check_results (
  id                  VARCHAR(40)  NOT NULL,           -- 例: chk_20260613_0001（= CheckResult.check_id）
  application_id      VARCHAR(40)  NOT NULL,           -- applications.id への参照
  result_json        JSON         NOT NULL,           -- CheckResult 全体（verdict はサーバー側算出済みの最終値）
  raw_response        LONGTEXT     NOT NULL,           -- AIの生レスポンス（監査・再現性のため必ず保存）
  verdict             ENUM('blocked','warning','pass') NOT NULL, -- 検索・一覧用に非正規化
  high_count          INT          NOT NULL DEFAULT 0,
  medium_count        INT          NOT NULL DEFAULT 0,
  low_count           INT          NOT NULL DEFAULT 0,
  unverified_count    INT          NOT NULL DEFAULT 0,
  clarifications_open INT          NOT NULL DEFAULT 0,
  model               VARCHAR(64)  NULL,              -- 使用したClaudeモデルID（再現性）
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_check_results_application_id (application_id),
  KEY idx_check_results_created_at (created_at),
  CONSTRAINT fk_check_results_application
    FOREIGN KEY (application_id) REFERENCES applications (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4) access_codes（アクセスコード）— B案認証＋累計回数制限
-- 企業ごとにコードを発行し、コード単位で照合回数の累計上限を強制する。
-- 上限到達・無効化はサーバー側で照合実行前に判定し、Claude APIを消費せず打ち切る。
CREATE TABLE IF NOT EXISTS access_codes (
  code        VARCHAR(64)  NOT NULL,                  -- アクセスコード（企業ごとに発行）
  label       VARCHAR(255) NULL,                       -- 企業名などのメモ（運用識別用）
  max_uses    INT          NOT NULL DEFAULT 30,        -- 累計上限（照合回数）
  used_count  INT          NOT NULL DEFAULT 0,         -- 使用済み回数
  disabled    TINYINT(1)   NOT NULL DEFAULT 0,         -- 無効化フラグ（1で即時停止）
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3) audit_logs（監査ログ）— 誰が・いつ・何を
CREATE TABLE IF NOT EXISTS audit_logs (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  application_id  VARCHAR(40)  NULL,                  -- 関連する申請（あれば）
  check_id        VARCHAR(40)  NULL,                  -- 関連する照合結果（あれば）
  action          VARCHAR(48)  NOT NULL,              -- upload / check / view / clarification_resolve など
  actor           VARCHAR(255) NULL,                  -- 操作者（認証導入までは任意）
  detail          JSON         NULL,                  -- 操作の付随情報
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_logs_application_id (application_id),
  KEY idx_audit_logs_check_id (check_id),
  KEY idx_audit_logs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
