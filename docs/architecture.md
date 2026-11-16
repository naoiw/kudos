# Kudos アーキテクチャ（現行`main`）

この文書は、画面の振る舞いと変更箇所を対応付けるための開発者向け案内です。実際の公開データとGoogleの非公開情報を混同しないよう、入力元から表示までを分けて管理します。

## 全体構成

```text
Private Google Drive (GPX / TCX)
      │
      ▼
gas/  (Apps Script: 手動取り込み・Sheets管理)
      │
      ▼
Private Google Sheets
      │ 手動承認＋分割Publish
      ▼
public/data/preview.json  (manifest schema v2, users, activity metadata)
public/data/exports/<job-id>/chunk-XXXX.json  (encoded GPS routes)
      │
      ▼
src/core/hooks/useActivities.ts + src/core/routeChunks.ts
      │
      ▼
src/themes/dashboard/index.tsx
      ├── Home: StatsCards / ProfileCard / ContributionHeatmap / ActivityLog
      │          JapanMap / WorldMap / RouteMap / CalendarWidget
      ├── TracksPage
      └── SummaryPage
```

- `src/static/activities.json`は未公開時の架空デモ用です。承認済み`preview.json`を読み込める場合はそちらを優先します。
- v2のGPSチャンクは並列取得数に上限を設け、パス・形式・重複ID・取得失敗を検証します。壊れた公開v2データを架空の経路に置換することはしません。
- GitHub Pagesは`main`のpush、または`develop`のCI成功で本番・プレビューをまとめて再デプロイします。GASのソース同期・データPublishとは独立しています。

## 表示・状態の責務

| ファイル | 主な役割 |
| --- | --- |
| `src/themes/dashboard/index.tsx` | ユーザー、種目、年、足跡マップ範囲、選択中の経路、集計期間の共有状態。ヘッダー／各画面へのprops供給 |
| `src/components/UserPicker.tsx` | ユーザー切り替えの表示部品。選択・URL反映はDashboard側 |
| `src/core/activityFilters.ts` | ユーザー／種目／年ごとの活動抽出 |
| `src/core/sports.ts` | 共有JSONルールから活動種目を正規化。分類ルールの正本は`shared/sport-rules.json` |
| `src/core/sportMetrics.ts` | 種目別の適切な統計・単位。異種目の平均ペースやゴルフのスコアを作らない |
| `src/core/activityDays.ts` | 開始日時文字列のローカル年月日で活動をグループ化。同日内は開始時刻の昇順 |
| `src/core/calendarMonthBounds.ts` | 表示ユーザーの全活動から最古月を求め、今月より未来へ移動しない |
| `src/core/heatmapGrid.ts` | 日付別グリッド・強度・活動時間。`activityDays.ts`を共用 |
| `src/components/CalendarWidget.tsx` | カレンダーUI、前後月移動、日付選択・同日内の活動選択 |
| `src/components/ContributionHeatmap.tsx` | ヒートマップUI、日付選択・画像書き出し |
| `src/utils/summary.ts` | 集計のLife／年／月の分類・グラフ用の距離バケット |
| `src/components/SummaryPage.tsx` | Life／年／月の期間選択と種目別統計・距離チャート |
| `src/core/prefectureRoutes.ts`、`src/core/countryRoutes.ts` | GPSと日本の都道府県／世界の国・地域境界の照合 |
| `src/components/RouteMapCanvas.tsx` | Leaflet地図と選択経路の描画、OpenStreetMapタイルの表示 |
| `src/core/trackGeometry.ts` | ルート一覧のEncoded Polyline→サムネイル形状生成 |
| `src/core/goals.ts` | 初期目標と`localStorage`のユーザー別目標の読み書き |

### フィルターと年またぎ

- 通常の初期種目は「すべて」、初期年は最新の活動年。集計ページではLife＋「すべての年」を初期選択し、Lifeを選ぶたび年を全期間に揃えます。
- 上部の年／種目を変えると各画面の活動対象が更新され、古い経路・地域選択は解除されます。
- `CalendarWidget`は表示ユーザーの全活動を受け取って最古月を決定します。月の前後移動によって年を越えた場合、Dashboardが上部の年フィルターを更新し、移動先の月を保持します。「すべての年」は年境界でも維持します。
- 日付選択時、カレンダーとヒートマップは同日の開始時刻が最も早い活動を選択し、地図へ渡します。別の活動も日別一覧から選択できます。
- 日付の`date_precision=month`時には実在する日付がないため、日別のカレンダーとヒートマップは表示しません。

## 公開JSONの取り扱い

- `schema_version=2`：`users`・`activities`・`route_chunks`を含むmanifestと、GPSを保管した別チャンクを使用します。`schema_version=1`も読み込み互換を保ちます。
- `genre_version=1`の活動種目はGAS側のoverride適用済みと判断して尊重し、古い形式では名前キーワードによる互換分類を行います。
- `id_version=1`の`run_id`は非公開`activity_id`をもとにした安定した48bit数値です。旧数値IDのデータもそのまま読み込めます。
- `date_precision=month`は`YYYY-MM`のみ。`exact`は活動ユーザーの設定タイムゾーンに基づく現地日時。公開サイトは現在`exact`データを保持しています。切替にはGAS承認と手動Publishが必要です。
- GPSはEncoded Polylineとして公開します。`location_country`が`null`でも足跡判定が可能ですが、簡略化された国境や小島では誤差が生じ得ます。
- `average_heartrate`は旧JSONとの互換フィールドとして残しますが、画面では使用しません。

## GitHub Pages本番／プレビュー構成

- `.github/workflows/check.yml`は`develop`のpushと`main`／`develop`宛のPRを検査します。`develop`が成功した時、デフォルトブランチ上の信頼されたデプロイWorkflowが`workflow_run`で起動します。
- `.github/workflows/deploy.yml`は両ブランチを別々にcheckoutし、Viteの`PATH_PREFIX`を本番`/kudos`・プレビュー`/kudos/develop`としてビルドします。`site/index.html`と`site/develop/index.html`を**同一Pages成果物**に格納するため、片方のデプロイがもう片方を消すことはありません。
- プレビューの`public/data/`は`main`の公開承認済みデータで上書きしてからビルドします。`develop`の未承認GPSファイルやPublish変更は本番／プレビューのデプロイに反映しません。ただし**developブランチ自体も公開GitHubリポジトリ上に存在する**ため、秘密のファイルをコミットしてはいけません。
- `public/404.html`はアクセスURLが`/kudos/develop/`で始まるとプレビューのindexへ戻し、sessionStorageの経路を復元します。
- `develop`に未公開機能が含まれる場合、`develop`ブランチ全体を`main`へマージする運用を禁止します。個別の承認済みPRだけを取り込みます。

## 開発と検証

```bash
corepack enable
pnpm install --frozen-lockfile
node scripts/generate-sport-rules.cjs --check
node scripts/verify-gas-sync.cjs
node --test gas/tests/*.test.cjs scripts/tests/*.test.cjs
PATH_PREFIX=/kudos pnpm build
```

- `scripts/tests/activity-days.test.cjs`：日付境界、同日複数活動、月だけの公開データを検証。
- `scripts/tests/calendar-month-range.test.cjs`、`calendar-cross-year.test.cjs`、`calendar-layout.test.cjs`：最古月・今月の制限、年またぎと活動選択。
- `scripts/tests/heatmap-multi-session.test.cjs`、`frontend-behavior.test.cjs`：ヒートマップのクリック、ユーザー選択、GPS・公開JSON互換。
- `scripts/tests/summary-period-selector.test.cjs`、`date-precision.test.cjs`、`sport-metrics.test.cjs`：集計選択、公開日付精度、種目別指標。
- ブラウザでの地図操作やスマートフォン表示は[手動回帰チェック](frontend-regression.md)も実施してください。

## 変更時の安全境界

UIのみのPRでは`gas/`、`public/data/`、GASのトリガーやScript Propertiesを変更する必要はありません。GASの変更が必要な場合は[clasp同期手順](gas-clasp-sync.md)で管理者が明示的に反映し、公開データの更新は[GAS運用手順](../gas/README.md)に従って別途承認・実行します。公開経路と名前は誰でも取得でき、Git履歴にも残り得るため、出力前のレビューを省略しないでください。
