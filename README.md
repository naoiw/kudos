# Kudos

サイクリング・ウォーキング・ゴルフの活動履歴を、複数ユーザーで閲覧・比較するWebアプリです。React／TypeScriptで構築し、GitHub Pagesで公開しています。

**公開サイト：** https://naoiw.github.io/kudos/

**オンラインプレビュー（develop）：** https://naoiw.github.io/kudos/develop/

### ブランチとオンラインプレビュー

| ブランチ | URL | 用途 |
| --- | --- | --- |
| `main` | https://naoiw.github.io/kudos/ | 本番公開。承認済み変更のみ |
| `develop` | https://naoiw.github.io/kudos/develop/ | ブラウザから変更を確認するためのプレビュー |

- `develop`にpushするとCI（`Validate Kudos`）が実行され、成功後に**本番とプレビューを一つのGitHub Pagesとして再デプロイ**します。手動でGitHub Actionsの`Deploy Kudos to GitHub Pages`を実行することもできます。
- 各画面（例：`/kudos/develop/tracks`、`/kudos/develop/summary`）はプレビュー内を遷移します。直接アクセス・再読み込みは共通の404リダイレクトで復帰します。
- **プレビューも認証のない公開ページ**です。`develop`の画面は**`main`で公開承認済みの`public/data/`のみ**を参照し、未承認データや非公開のGPSを使いません。ユーザー比較PR #54など、公開方針が決まっていない機能は`develop`に取り込まないでください。
- `develop`の機能は自動的に`main`へマージされません。必要な機能だけを個別PRで`main`に反映し、`develop`を丸ごと本番にマージしないでください。


> **公開データについて：** サイトは認証なしで閲覧できます。現在の`public/data/preview.json`には、承認された表示名・活動日時・統計・GPS経路が含まれます。公開経路は誰でも取得できます。`src/static/activities.json`の架空デモデータとは別物です。

## 主な機能

| 画面・機能 | 内容 |
| --- | --- |
| ホーム | 活動数・距離・目標進捗・プロフィール・活動履歴・ヒートマップ・ルートマップ・足跡マップ・カレンダー |
| ルート一覧 | GPS経路のサムネイル、グルーピング、並び替えと活動詳細 |
| 集計 | **Life → 年 → 月**の3単位で記録と距離グラフを表示 |
| ユーザー切り替え | 公開JSONに含まれるユーザーを選択。`?u=u01`などのURLクエリにも対応 |
| フィルター | 全種目／サイクリング／ウォーキング／ゴルフ、および特定年／すべての年 |
| 足跡マップ | 日本の都道府県と世界の国・地域を切り替え、GPS経路の通過地域で絞り込み |
| GPS経路密度 | ルートマップの「通常／密度」切替。選択ユーザー・種目・年・地域に一致する経路の通過頻度を可視化 |
| 目標設定 | ユーザー・ブラウザごとの年間／月間距離目標を`localStorage`に保存 |
| 表示 | 日本語・英語、ライト／ダークテーマ |

### 種目と表示指標

| 選択 | 主な指標 | 速度・ペース |
| --- | --- | --- |
| サイクリング（`Ride`） | 回数、距離、時間、獲得標高、目標進捗 | 平均速度（km/h） |
| ウォーキング（`Walk`） | 回数、距離、時間、連続活動日数、目標進捗 | 平均ペース（分/km） |
| ゴルフ（`Golf`） | 活動回数、記録された移動・歩行距離、活動時間、目標進捗 | 表示しない |
| すべて | 合計と種目別回数 | 異なる種目を混ぜた平均速度・ペースは表示しない |

ゴルフのスコアやラウンド数は記録していないため推測しません。心拍数も画面に表示しません。従来の`Run`は`Walk`として正規化し、判定ルールは[共通種目ルール](docs/sport-rules.md)で管理します。

### 年フィルターと集計

- ホーム・ルート一覧は、表示ユーザーの**最新の活動年**が初期値です。年を指定しない「すべての年」も選べます。
- 集計ページに入ると**Life＋すべての年**を選びます。Lifeを再選択した場合も年フィルターを「すべての年」にします。
- Life表示中に上部の特定年を選択すると、集計単位は「年」に切り替わります。
- 年・種目の選択はホームの統計、活動履歴、GPS経路、足跡マップ、カレンダー等に共通で適用されます。
- 活動日時の公開精度が`month`の場合、月内の日別グラフは表示しません。

### 日付と経路の連動

- 日別カレンダーとヒートマップは、**`date_precision=exact`のときのみ**表示します。
- 1日に複数の活動がある場合は、日付を押すと**開始時刻が最も早い活動**の経路を表示します。下の一覧からその日のほかの活動も選べます。
- 今年のヒートマップは**今日までを通常表示、明日以降を薄く表示して選択不可**とします。年全体の配置は維持し、過去年と全期間表示中の過去年には影響しません。
- カレンダーで移動できるのは、**表示中ユーザーの最古の活動月から今月まで**です。最古月と今月は含みます。移動範囲は種目や地域の絞り込みに左右されません。
- カレンダーで年をまたぐと、上部の年フィルターも移動先の年に連動します。「すべての年」が選ばれている場合は維持します。

### GPS経路密度マップ

- ホームの「ルートマップ」にある「通常／密度」を切り替えます。**現在選択中のユーザーのみ**が対象で、上部の種目・年と足跡マップの地域フィルターがそのまま適用されます。個別活動を選択している間は通常ルート表示になり、解除すると密度表示に戻ります。
- 地図上の区画ごとに、その区画を通過した**異なる活動の数**を表示します。1活動内で同じ場所を往復しても1回であり、GPS点の密度で数を水増ししません。色は青=1回、橙=2〜3回、赤=4回以上です。
- 複数トラックセグメントを別経路として扱い、計算はWeb Worker、地図への描画は操作を妨げないCanvas上で行います。GPS欠損、GPSの飛び、地図データの位置精度により近似です。
- **プライバシー：** 通過頻度は公開済みGPS経路から推定しており、自宅・勤務先や生活圏が見えやすくなります。第三者に公開してよい経路かを再確認してください。アクセス制御を追加する機能ではありません。
- Issue #19のデータ遅延読み込みや#20の事前計算は未実装です。この機能は既存の読み込み方式を使い、スプレッドシート・Apps Script・公開manifestを変更しません。

詳しい確認項目は[フロントエンド回帰確認](docs/frontend-regression.md)を参照してください。

## 起動とテスト

Node.js **22**（GitHub Actionsと同じバージョン）および`package.json`で指定したpnpm 8.9.0を推奨します。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

変更を確認する場合：

```bash
node scripts/generate-sport-rules.cjs --check
node scripts/verify-gas-sync.cjs
node --test gas/tests/*.test.cjs scripts/tests/*.test.cjs
PATH_PREFIX=/kudos pnpm build
```

Windows PowerShellで環境変数を指定する場合は、`$env:PATH_PREFIX='/kudos'; pnpm build`を利用してください。`pnpm build`はViteの静的サイトを`dist/`に生成します。

## 公開とブランチ運用

- 本番ブランチは`main`、オンライン検証用ブランチは`develop`です。機能ブランチ→検証用`develop`→個別機能PRで`main`への反映を基本とし、未承認機能を本番へまとめてマージしません。
- PRでは[`Validate Kudos`](.github/workflows/check.yml)がLinuxのViteビルド、GASソース安全検査、Nodeテスト、実際のclasp送信対象検査と、Windowsの種目ルール／CRLF検査を行います。
- `main`へのpush、または`develop`のCI成功後に[`Deploy Kudos to GitHub Pages`](.github/workflows/deploy.yml)が`main`を`/kudos/`、`develop`を`/kudos/develop/`へビルドし、単一のPages成果物として公開します。リポジトリのPages Sourceは**GitHub Actions**を選びます。
- **Pagesのデプロイ、GASコード同期、活動データのPublishは別操作です。** フロントエンドだけの変更ではGAS同期もGPSデータの再Publishも不要です。

## データ構成と更新

```text
Google Drive (private GPX/TCX)
          │ 手動インポート（Apps Script）
          ▼
Google Sheets (private: Users / Activities / Settings ほか)
          │ 管理者による承認・分割Publish
          ▼
public/data/preview.json ── public/data/exports/<job-id>/chunk-XXXX.json
          │
          ▼
GitHub Pages → Kudos (users / activities / GPS)
```

- `gas/`はGoogle Drive→Sheetsの取り込み、共通種目判定、公開データの準備と分割Publishを担当します。
- **現行の公開manifestは`schema_version=2`**で、ユーザーと活動の統計は`public/data/preview.json`、経路は複数の`route_chunks`に分かれています。旧`schema_version=1`も読み込み可能です。
- 公開JSONが無い・未承認などの場合は、`src/static/activities.json`の**架空デモ**へフォールバックします。一方、v2の経路チャンクが欠落・破損した場合はデータ不整合をエラーとして扱い、黙って架空経路に置き換えません。
- 管理者の明示操作なしにGPX/TCXをサイトへ再公開することはありません。公開データの`run_id`は非公開の`activity_id`に基づく安定IDです。
- 日付の公開設定は`month`（年月のみ）または`exact`（現地日時）。**現在リポジトリに配置されている公開JSONは`exact`**です。初期設定のデフォルト`month`とは異なります。公開日時の変更には承認と**手動再Publish**が必要です。
- GAS定期取り込みトリガーは自動作成されません。利用する場合に限り管理者が明示的に設定します。GASコードは手動`clasp push`または手動GitHub Actionsで同期します。

**管理者向け手順：** [GASセットアップ・取り込み・公開](gas/README.md) ／ [GASソース同期](docs/gas-clasp-sync.md) ／ [公開日時とプライバシー](docs/date-precision.md) ／ [公開ID](docs/stable-activity-ids.md)

## 地図データ・出典

- **経路マップ：** [Leaflet 1.9.4](https://leafletjs.com/)（BSD 2-Clause）を`index.html`のバージョン固定CDNから読み込み、[OpenStreetMap](https://www.openstreetmap.org/copyright)の標準タイルを表示します。通常表示では地図下部のフッター、全画面表示では地図右下にリンク付きの「© OpenStreetMap contributors」を表示し、[OSMタイル利用ポリシー](https://operations.osmfoundation.org/policies/tiles/)に従います。ライト／ダーク両モードで背景タイルをグレースケール化します。
- **日本の足跡マップ：** [hfu/gmjpn21pref](https://github.com/hfu/gmjpn21pref)の都道府県GeoJSONを利用したSVG。ドラッグ、ホイール／ピンチズーム、選択地域へのフォーカスに対応します。訪問実績は`prefecturesForActivity()`が公開GPS経路と必要に応じて地域メタデータから判定します。
- **世界の足跡マップ：** Natural Earth 1:110m国境データと1:50m小地域の補助点（Public Domain）を`src/assets/world-countries.json`に収録。`countriesForActivity()`がGPS経路から国・地域を推定し、`location_country`を補助情報として参照します。国境や小島などは概略判定のため誤差があります。
- 原プロジェクトは[yihong0618/running_page](https://github.com/yihong0618/running_page)（MIT）です。著作権表示や改変したコードの条件は[LICENSE](LICENSE)を参照してください。

## 目標設定

`config.yml`の初期値は次のとおりです。ブラウザ上の「目標設定」からユーザーごとに変更できます。

| 種目 | 年間目標 | 月間目標 |
| --- | ---: | ---: |
| サイクリング | 2,000 km | 150 km |
| ウォーキング | 250 km | 20 km |
| ゴルフ | 10 km | 1 km |
| **すべて（合算）** | **2,260 km** | **171 km** |

保存先は`localStorage`（ブラウザ・表示ユーザー単位）で、Google Sheets、公開JSON、他ユーザーの設定や別端末には同期しません。週間目標は月間目標から`×12÷52`で算出する参考値です。

## ディレクトリ

| 場所 | 役割 |
| --- | --- |
| `src/themes/dashboard/` | 各画面共通のフィルター、ユーザー選択、ナビゲーション、状態管理 |
| `src/components/` | 統計カード、ヒートマップ、カレンダー、ルート・足跡マップ、集計画面 |
| `src/core/` | 日付、種目、活動フィルター、GPS判定、種目別統計、公開JSONの読み込み |
| `src/utils/summary.ts` | Life／年／月の集計グルーピングとグラフデータ |
| `gas/` | Google Drive／Sheets／GitHub公開向けApps Script |
| `shared/` | フロントエンドとGASが共有する種目判定ルール・契約ケース |
| `scripts/tests/`、`gas/tests/` | Node.jsによる回帰・契約テスト |
| `docs/` | 開発運用、プライバシー、データ互換性、画面の検証手順 |

実装構成と変更時の責務については[アーキテクチャ](docs/architecture.md)も参照してください。

## 公開上の注意

本リポジトリとGitHub Pagesは公開状態です。**公開前にGPS経路・日時・表示名・活動名を必ず確認してください。** 年月だけに制限しても、GPS経路から生活圏が推測される可能性があります。メールアドレス、Google DriveのID、Google SheetsのID、GAS認証情報、GitHub PATをコミットしないでください。公開停止後もGit履歴に過去のデータが残り得ます。
