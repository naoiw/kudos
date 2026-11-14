# 公開日時の精度と日別統計（Issue #17）

## 二つの公開モード

| `public_preview_date_precision` | 公開形式 | 表示可能な統計 |
| --- | --- | --- |
| `month`（デフォルト） | `YYYY-MM`（年月のみ） | 年/月別件数・距離・活動時間、種目別統計、経路など |
| `exact` | ユーザーの設定タイムゾーンによる `YYYY-MM-DDTHH:mm:ss` | 月別に加え、日別カレンダー、ヒートマップ、週別目標、連続記録、曜日・時間帯など |

`month`では架空の「1日・8日・15日・22日」などを作成せず、`start_date` / `start_date_local` を`YYYY-MM`として公開します。画面からは日・週レベルのコンポーネントと集計単位を除外します。既に公開された旧JSONの`date_precision=month`についても、読み込み時に見かけ上の日時を`YYYY-MM`へ正規化します。

`exact`ではGASの`kudosPreviewLocalDate_`がユーザー設定のタイムゾーンで原日時を変換し、そのまま公開します。UTC日付と日本時間で年・月・日が異なる例もテストに含めています。

## 公開・プライバシー

**正確な活動日時の公開は、公開対象となるすべてのユーザーから同意が得られた場合のみ選択してください。** GPS経路との組み合わせで生活パターンが推定される可能性があります。

- `Settings.public_preview_export_approval=I_APPROVE_PUBLIC_STATS` は従来どおり必要です。
- `Settings.public_preview_date_precision=exact` を選ぶ場合、**さらに** `Settings.public_preview_exact_dates_approval=I_APPROVE_EXACT_DATES` が必要です。
- `exact`設定をコードの変更だけで自動的に有効にはしません。リポジトリを公開済みのため、一度公開した正確な日時はGit履歴に残り得ます。
- 任意の公開モードでも、実GPS経路・活動名・表示名を公開している場合、年月匿名化だけで個人を完全に保護できません。

## 移行と確認

1. `main`の変更を取得し、`pnpm install --frozen-lockfile`、`node --test gas/tests/*.test.cjs scripts/tests/*.test.cjs`、`pnpm build` を実行。
2. `node scripts/verify-gas-sync.cjs` の成功後、管理者が手動で`clasp push`。トリガーは変更されません。
3. `showPublicPreviewProgress()`で進行中バッチがないことを確認。進行中の場合、**無断でresetしない**。
4. 公開対象の同意に基づき`month`のまま運用するか、明示的に`exact`と二重承認を設定する。
5. `inspectApprovedPublicPreview()`で件数・精度を確認し、必要なときだけ`publishApprovedPublicPreview()`を手動で最終完了まで実行。
6. `public/data/preview.json`の`date_precision`と日付フォーマットを確認。月単位では日付・時刻を含まないこと、正確日時の場合は原日時に一致することを確認。
7. Webでユーザー・種目・年を切り替え、月別集計と個別活動表示を確認。`exact`なら日別機能も確認。

**このIssueのコードマージ自体では実データの公開設定は変えません。** 現行公開JSONは `month` なので、ユーザーにテストしてもらう時点での公開日時は年月のみになります。
