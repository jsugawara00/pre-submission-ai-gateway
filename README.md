# 申請前AI検問所 — Pre-submission Validation Gateway

**30年の貿易実務で見てきた書類ミスの痛みを、AIエージェントで解消する。**

申請・申告の内容と元資料（インボイス、パッキングリスト、B/L等）をAIが照合し、転記ミス・資料間矛盾・不審箇所を提出前に検出するWebアプリケーションです。題材には通関業務（NACCSの輸入申告事項登録）を参考にした疑似申告業務を採用していますが、仕組みは特定業務に依存せず、申請書と添付書類を扱うあらゆる業務に展開できます。

<!-- スクリーンショット: 撮影後に docs/images/demo.gif を配置するとここに表示されます -->
<!-- ![デモ](docs/images/demo.gif) -->

## なぜ作ったか

既存の申告システム（NACCS等）は入力の形式やシステム内DBとの整合性をチェックします。しかし、**入力された値が元資料と合っているか**は構造的にチェックできません。インボイス価格の桁誤りも、通貨の取り違えも、形式が正しければ素通りします。だから現場には「登録内容を印刷して、人間が元資料と目視で突き合わせる」工程が残り続けてきました。

本システムは、その「人間の目視照合」をAIエージェントが担います。既存システムの再現ではなく、既存システムがやらない側の補完です。

## 2つの導入アプローチを1つのエンジンで

| モード | 想定する導入形態 |
|---|---|
| **事前モード（Built-in）** | 申請システムにAIチェックを融合するとこうなる、という組み込み型のリファレンス。フォーム入力＋資料添付で、登録前に該当フィールドへインラインエラーを表示 |
| **事後モード（Add-on）** | 既存システムに一切触れず、出力された帳票PDFと元資料から後付けでAIチェックを始められる、という非侵襲導入の証明 |

両モードは**同一の照合エンジンと同一のレポートUI**を共有します。導入形態は選べる、エンジンは一つでよい——この構成自体が本プロジェクトのメッセージです。

```mermaid
flowchart TB
    A["事前モード（Built-in）<br/>疑似申告フォーム ＋ 資料PDF"] --> E
    B["事後モード（Add-on）<br/>登録帳票PDF ＋ 資料PDF"] --> E
    E["照合エンジン<br/>Claude API（PDF直接読解）<br/>→ zod検証 → verdict算出（サーバー側）"] --> R["共通レポートUI<br/>（モード分岐なし）"]
    E -. 判読不能・要確認 .-> C["聞き返し（確認チャット）"]
    C -- 人間の確定値で軽量再照合 --> E
```

## ハルシネーション三層防御

AIの照合システムで最も危険なのは「読めないものを、それらしく読んでしまう」ことです。本システムは三層で防ぎます。

1. **unverified** — 資料が足りず照合できない項目は「問題なし」に混ぜず、照合できなかったと明示する
2. **clarifications（聞き返し機能）** — FAX由来の不鮮明な文字などは推測せず、該当箇所のテキストと候補を添えて人間に質問する
3. **検算ループ** — 人間の回答も鵜呑みにせず、他の数値・文脈と突き合わせて整合した時点で確定する。確定の経緯は監査ログに記録される

## スクリーンショット

> 撮影した画像を `docs/images/` に置き、各行のコメントアウトを外すと表示されます。

<!-- ### 事後モード（PDFアップロード → 照合レポート） -->
<!-- ![事後モード](docs/images/post-check.png) -->

<!-- ### 事前モード（フォーム入力 → インラインエラー） -->
<!-- ![事前モード](docs/images/pre-check.png) -->

<!-- ### 聞き返し（確認チャット） -->
<!-- ![確認チャット](docs/images/clarification.png) -->

## 技術スタック

TypeScript（strict）/ Next.js 16（App Router）/ React 19 / Claude API（`claude-opus-4-8`、PDFをbase64で直接読解・JSON構造化出力）/ MySQL 8（mysql2・生SQL）/ zod / vitest

UIライブラリは使わず、素のReact＋CSS Modulesで構築しています（依存最小化方針）。

## セキュリティ設計

- APIキーはサーバーサイドのみ。クライアントに露出しない
- アップロードはMIME＋マジックバイト検証、原本はAES-256-GCMで暗号化保存しDBにはパスとSHA-256ハッシュのみ
- 全操作（アップロード／照合／閲覧／確定）の監査ログ（誰が・いつ・何を）
- SQLはすべてプレースホルダ（prepared statement）
- AIの役割は事実の検出まで。登録可否の判定（verdict）はサーバー側コードが算出し、最終判断は人間が行う

## セットアップ

### 前提

- Node.js 20 以上
- MySQL 8 系（ローカルで可）
- Claude APIキー（https://console.anthropic.com/ で取得）

### 手順

```bash
# 1. クローン＆依存インストール
git clone https://github.com/jsugawara00/pre-submission-ai-gateway.git
cd pre-submission-ai-gateway
npm install

# 2. 環境変数ファイルを作成
cp .env.example .env.local
#   .env.local を編集し、以下を設定する:
#   - ANTHROPIC_API_KEY        … Claude APIキー
#   - DATABASE_URL             … mysql://root:password@localhost:3306/ai_gateway
#   - STORAGE_ENCRYPTION_KEY   … 暗号化鍵。次のコマンドで生成した64桁hexを貼る:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. データベースを作成（MySQL側で一度だけ）
#   mysql -u root -p -e "CREATE DATABASE ai_gateway CHARACTER SET utf8mb4;"

# 4. テーブルを作成（冪等。何度実行してもOK）
npm run db:migrate

# 5. 開発サーバー起動 → http://localhost:3000/
npm run dev
```

### 動作確認

```bash
# ユニットテスト（schema検証・verdict算出）
npx vitest run

# 架空のサンプルPDF3枚（インボイス／パッキングリスト／帳票）を fixtures/ に生成
#   ※価格・個数に不一致を仕込んであり、照合の検出を確認できる
node scripts/make-fixtures.mjs

# 照合エンジンを実APIで通すスモークテスト（要 ANTHROPIC_API_KEY）
npx tsx scripts/engine-smoke.ts
```

起動後は、トップページから事後モード（PDFアップロード）／事前モード（フォーム入力）を試せます。`fixtures/` のサンプルPDFをそのままアップロードに使えます。

## ロードマップ

- [x] 設計（設計書v0.3 / 照合エンジンJSONスキーマv0.2 / ワイヤーフレーム5画面）
- [x] **Phase 1**: 照合エンジン＋事後モード
- [x] **Phase 1.5**: 聞き返し機能（確認チャット）— 確定→軽量再照合→verdict再計算まで
- [x] **Phase 2**: 事前モード（フォーム入力→インラインエラー→登録ボタン制御）＋ About画面
- [ ] Phase 3: メール／複合機（scan to email）からの自動取り込み
- [x] **Phase 4**: NACCS（IDA）入力フォーマット対応出力
- [ ] Phase 4 残り: 他業界テンプレート
- [ ] デザイン修正（UI／レイアウトの調整）
- [ ] 動作確認（全機能の通し確認）

> 進行中の残課題・未検証項目は [TODO.md](TODO.md) に整理しています。

## 設計ドキュメント

- [docs/設計書_v0.3.md](docs/設計書_v0.3.md) — システム設計の正本
- [docs/照合エンジン_JSONスキーマ設計_v0.2.md](docs/照合エンジン_JSONスキーマ設計_v0.2.md) — データ構造の正本

## 作者

貿易・物流の実務に約30年従事。現在はAI×ドメイン知識を軸にITエンジニアへ転身中。
