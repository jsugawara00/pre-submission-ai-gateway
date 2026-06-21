# 照合エンジン JSONスキーマ設計 v0.3

作成日: 2026年6月12日（v0.2から改訂）
作成者: Jump(Junichi Sugawara) × Claude
対象: 申請前AI検問所システム（設計書v0.3準拠）

改訂履歴:
- v0.2: `clarifications`（要確認）ブロックと聞き返しループを追加
- v0.2-改訂1（2026/06/15）: `role`（target／reference）を追加。事後モードの入力ゾーン分離に対応
- v0.3（2026/06/19）: 実装（Phase 1〜1.5）に合わせて整理。照合ルール本文・閾値・プロンプト手順の細部は業務ノウハウのため非公開とし、本書は型・データ構造・設計方針に限定

本書は、Claude APIに書類照合を行わせる際の「出力JSONスキーマ」と「設計判断」を定義する。
このスキーマが事前モード（インラインエラー）と事後モード（レポート）の両方に給電する単一の型となる。型の正本はソースコード（`src/lib/engine/schema.ts`）であり、本書はその設計意図を説明する。

---

## 1. 全体構造

> 以下のJSONは出力構造を示すための**例**です。中の値（書類番号・金額・重量・理由文など）は、**AIが暫定的に作成したテスト用のダミーデータ**であり、実在の申告・企業・取引とは一切関係ありません。構造の理解だけを目的に読んでください（申告日・申告番号など実在しうる識別子は意図的に含めていません）。

```json
{
  "check_id": "chk_20260612_0001",
  "mode": "post",
  "documents": [
    {
      "doc_id": "d1",
      "role": "target",
      "detected_type": "declaration_form",
      "detected_type_label": "申告登録帳票",
      "confidence": 0.98,
      "summary": "IDA登録控。共通部および2欄の品目明細を含む。"
    },
    {
      "doc_id": "d2",
      "role": "reference",
      "detected_type": "invoice",
      "detected_type_label": "インボイス",
      "confidence": 0.97,
      "summary": "Invoice No. 4471。3品目、合計USD 124,500、CIF。"
    },
    {
      "doc_id": "d3",
      "role": "reference",
      "detected_type": "packing_list",
      "detected_type_label": "パッキングリスト",
      "confidence": 0.95,
      "summary": "125 CT、グロス重量 3,420 KG。"
    }
  ],
  "findings": [
    {
      "finding_id": "f1",
      "category": "transcription_error",
      "field_key": "invoice_price",
      "field_label": "インボイス価格",
      "declared_value": "USD 142,500",
      "source_value": "USD 124,500",
      "source_refs": [
        { "doc_id": "d2", "page": 1, "location": "明細合計欄（TOTAL）" }
      ],
      "risk": "high",
      "reason": "申告側とインボイス記載額に18,000の差。桁または数字の入れ違いの可能性が高く、課税価格に直接影響する。",
      "suggestion": "インボイス原本のTOTAL欄を確認し、124,500への修正を検討してください。"
    },
    {
      "finding_id": "f2",
      "category": "document_mismatch",
      "field_key": "package_count",
      "field_label": "貨物個数",
      "declared_value": "120 CT",
      "source_value": "125 CT",
      "source_refs": [
        { "doc_id": "d3", "page": 1, "location": "TOTAL PACKAGES" }
      ],
      "risk": "medium",
      "reason": "パッキングリストと5CTの差。分割船積みまたは仕分けの可能性がある。",
      "suggestion": "仕分けの有無を確認してください。"
    },
    {
      "finding_id": "f3",
      "category": "anomaly",
      "field_key": null,
      "field_label": "単価整合性",
      "declared_value": null,
      "source_value": null,
      "source_refs": [
        { "doc_id": "d2", "page": 1, "location": "明細2行目" }
      ],
      "risk": "low",
      "reason": "明細2行目の単価×数量が行合計と一致しない（差異 USD 12）。端数処理の可能性が高い。",
      "suggestion": "端数処理ルールを確認してください。"
    }
  ],
  "unverified": [
    {
      "field_key": "insurance_amount",
      "field_label": "保険金額",
      "reason": "保険料明細に該当する書類が添付されていないため照合できなかった。"
    }
  ],
  "clarifications": [
    {
      "clarification_id": "c1",
      "field_key": "gross_weight",
      "field_label": "貨物重量（グロス）",
      "doc_id": "d3",
      "page": 1,
      "location": "GROSS WEIGHT欄",
      "region_hint": { "x_pct": 62, "y_pct": 78, "w_pct": 20, "h_pct": 5 },
      "ai_reading": "3,420 KG",
      "confidence": 0.52,
      "candidates": ["3,420 KG", "3,426 KG", "3,428 KG"],
      "question": "FAX由来のため末尾の数字が不鮮明です。原本を確認して正しい値を入力してください。",
      "status": "open"
    }
  ],
  "summary": {
    "high": 1,
    "medium": 1,
    "low": 1,
    "unverified": 1,
    "clarifications_open": 1,
    "verdict": "blocked",
    "headline": "高リスクの不一致が1件あります。インボイス価格を確認してください。"
  }
}
```

---

## 2. 設計判断（なぜこの形か）

### 2.1 findingsは1つのフラット配列
事前モードはfindingsを`field_key`でフォームのフィールドにマッピングしてインラインエラーを出す。
事後モードは同じ配列をそのままレポートの一覧に描画する。
**1つの型が2つのUIに給電する**＝設計書v0.2「両モードは同一エンジン」の実装形。

### 2.2 categoryは3分類（設計書5章と対応）
- `transcription_error`: 転記ミス（申告側 vs 元資料）
- `document_mismatch`: 資料間矛盾（元資料 vs 元資料）
- `anomaly`: 不審箇所（単一資料内の計算不整合・乖離）

### 2.3 source_refsで判断根拠を必ず示す
どの書類の・何ページの・どの欄を根拠にしたかをAIに必ず出力させる。
ユーザーが最終確認する際の監査可能性（auditability）の担保であり、エンタープライズ導入で最も問われる点。
RAG型の企業導入が「出典の明示」を必須にしているのと同じ思想。

### 2.4 unverifiedブロック＝エンジンの誠実さ
照合できなかった項目を「問題なし」に混ぜず、明示的に分離する。
資料不足なのにpassを出すエンジンは実務では信用されない。
「チェックできなかったことを正直に言う」設計は差別化ポイントとしてREADMEにも書く。

### 2.5 verdictは3値で申告（登録）可否を制御
- `blocked`: highが1件以上、または未解決の聞き返しあり → 事前モードは登録（申告）ボタンを無効化／事後モードはレポートに「申告不可」を表示
- `warning`: mediumのみ → 申告可能だが警告表示（ユーザーの判断に委ねる）
- `pass`: low以下のみ → 申告可能
リスクと業務停止のバランスは実務感覚で調整可能なよう、判定ロジックはAIではなくサーバー側コードで持つ（high件数等から機械的に算出）。AIの役割は事実の検出まで、業務判断はコードとユーザー、という責任分界。

### 2.6 clarifications＝聞き返し機能（ハルシネーション第2・第3層）
判読確信度が低い文字は推測せず、読めた候補（candidates）と確信度を添えて`clarifications`に入れる。
`region_hint`はページ内のおおよその位置（パーセント指定）で、UIが該当領域の画像切り抜きを表示するために使う。
位置の精度はMVPでは厳密でなくてよい（該当ページ全体表示へのフォールバック可）。

解決フロー（聞き返しループ）:
1. UIが確認チャットパネルを起動（切り抜き画像＋question表示）
2. ユーザーが値を入力
3. AIが文脈と検算して受理可否を判断。不整合なら聞き返す（マルチターン会話）
4. 整合した時点で確定。確定値・確定者・日時を監査ログに記録
5. 確定値のみ差し替えた軽量再照合パスを実行（全書類の再読込はしない）

verdictの算出ルール: `clarifications_open > 0` の間は `blocked` とする（未解決のまま登録させない）。

### 2.7 field_keyは英語snake_case、field_labelは日本語
`field_key`はフォームのname属性・DBカラムと一致させる機械用ID。
`field_label`は表示用。多言語化や他業務テンプレート展開時もkeyは安定したまま差し替え可能。

---

## 3. field_key一覧（疑似フォーム18項目と対応）

| field_key | field_label |
|---|---|
| declaration_type | 申告等種別 |
| importer_name | 輸入者名／コード |
| exporter_name | 仕出人（輸出者）名 |
| bl_number | B/L番号（AWB番号） |
| vessel_name | 積載船（機）名 |
| package_count | 貨物個数 |
| gross_weight | 貨物重量（グロス） |
| invoice_number | インボイス番号 |
| incoterms | インボイス価格条件（建値） |
| invoice_currency | インボイス通貨コード |
| invoice_price | インボイス価格 |
| freight | 運賃 |
| insurance_amount | 保険金額 |
| origin_country | 原産地コード |
| hs_code_1 / hs_code_2 ... | 品目コード（欄N） |
| item_name_1 ... | 品名（欄N） |
| quantity_1 ... | 数量・単位（欄N） |
| line_price_1 ... | 欄ごとの価格（欄N） |

detected_typeの語彙: `declaration_form` / `invoice` / `packing_list` / `bill_of_lading` / `certificate_of_origin` / `insurance_statement` / `analysis_report` / `other`

※ 事前モードでは円換算用に `exchange_rate`（通貨レート）をフォーム入力として持つ（インボイス通貨がJPY以外のとき必須）。照合用 field_key としての正式化は円換算ロジック実装時に行う（現時点は事前フォーム入力のみ）。

---

## 4. 照合エンジンの実装方針（高レベル）

> 照合の具体的なルール・閾値・プロンプト本文は業務ノウハウのため非公開（ローカルで管理）。本章は公開できる設計方針のみを記す。

- **出力契約**: システムプロンプトで「本スキーマのJSONのみを返す（前置き・コードフェンス禁止）」を課す。
- **入力**: 書類PDF群をbase64のdocumentブロックで投入し、各書類のrole（target／reference）を併せて伝える。事前モードではフォーム入力値をtarget相当として併送する。
- **照合の基準**: role=targetを基準に、role=referenceと突き合わせる（targetが複数ファイルでも1件の申告として扱い、別申告に分割しない）。
- **ハルシネーション三層防御**（READMEと対応）:
  - 第1層: 照合できない項目は推測せず`unverified`へ。
  - 第2層: 判読確信度が低い文字は推測せず、候補と確信度を添えて`clarifications`へ。
  - 第3層: 聞き返しは別エンドポイントのマルチターン会話。回答を文脈・検算と突き合わせ、整合した時点で確定する。
- **責任分界**: AIは事実の検出まで。verdict（登録可否）はサーバー側コード（`verdict.ts`）が件数から機械的に算出し、最終判断はユーザーが行う。
- **検証と監査**: AIの生レスポンスはzodで検証（不正形式はリトライ1回 → 失敗時エラー）し、`check_results`に保存して再現性・監査を担保する。

---

## 5. TypeScript型定義（実装用）

```typescript
type Risk = "high" | "medium" | "low";
type Category = "transcription_error" | "document_mismatch" | "anomaly";
type Verdict = "blocked" | "warning" | "pass";

interface SourceRef {
  doc_id: string;
  page: number | null;
  location: string;
}

type DocRole = "target" | "reference";

interface DetectedDocument {
  doc_id: string;
  role: DocRole;
  detected_type: string;
  detected_type_label: string;
  confidence: number;
  summary: string;
}

interface Finding {
  finding_id: string;
  category: Category;
  field_key: string | null;
  field_label: string;
  declared_value: string | null;
  source_value: string | null;
  source_refs: SourceRef[];
  risk: Risk;
  reason: string;
  suggestion: string;
}

interface Unverified {
  field_key: string;
  field_label: string;
  reason: string;
}

interface RegionHint {
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
}

interface Clarification {
  clarification_id: string;
  field_key: string | null;
  field_label: string;
  doc_id: string;
  page: number | null;
  location: string;
  region_hint: RegionHint | null;
  ai_reading: string | null;
  confidence: number;
  candidates: string[];
  question: string;
  status: "open" | "resolved";
}

interface ClarificationResolution {
  clarification_id: string;
  confirmed_value: string;
  confirmed_by: string;
  confirmed_at: string;
  conversation_log: { role: "ai" | "human"; text: string }[];
}

interface CheckResult {
  check_id: string;
  mode: "pre" | "post";
  documents: DetectedDocument[];
  findings: Finding[];
  unverified: Unverified[];
  clarifications: Clarification[];
  summary: {
    high: number;
    medium: number;
    low: number;
    unverified: number;
    clarifications_open: number;
    verdict: Verdict;
    headline: string;
  };
}
```

---

*本スキーマ（v0.3）はPhase 1（事後モード）・Phase 1.5（聞き返し機能）として実装済み。型の正本はソースコード（`src/lib/engine/schema.ts`）であり、本書はその設計意図を説明する。*
