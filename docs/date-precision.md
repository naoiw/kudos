# 公開日時の精度と日別表示

Kudosは管理者が承認した活動・GPS情報を公開JSONへ書き出します。日付の公開精度はGoogle Sheetsの`Settings.public_preview_date_precision`で指定します。**この設定だけで公開済みJSONが自動更新されることはありません。**

## 公開形式

| 設定 | 公開する`start_date`・`start_date_local` | UIへの影響 |
| --- | --- | --- |
| `month`（GAS初期設定） | `YYYY-MM`（年月のみ） | Life／年／月の集計と種目別統計、経路、足跡マップを表示。日別ヒートマップ・カレンダーは非表示。月ごとの日別グラフも非表示 |
| `exact` | ユーザーの設定タイムゾーンによる`YYYY-MM-DDTHH:mm:ss` | 上記に加え、日別カレンダー、ヒートマップ、開始時刻、日付を使う指標などを表示 |

**現在のリポジトリの`public/data/preview.json`は`schema_version=2`、`date_precision=exact`です。** GASの初期値が`month`であることと混同しないでください。現行の公開日時を変更するには、管理者が設定と承認状況を確認し、手動で再Publishする必要があります。

集計ページの期間ボタンは両モードとも**Life → 年 → 月**の3つだけです。以前の週・日ボタンは実装されていません。`month`で月を選択した場合は、実際の日付が無いため日別の棒グラフを出しません。

## 年月のみの取り扱い

- `month`では架空の「1日」「8日」「15日」「22日」や時刻を生成**しません**。年月そのものを公開します。
- 旧形式のJSONに年月公開のための見かけ上の日付が含まれていても、Webアプリが`YYYY-MM`へ正規化します。
- `src/core/activityDays.ts`のローカル日付グルーピングでは`YYYY-MM`を日付のある活動として扱いません。
- `exact`ではApps Scriptの`kudosPreviewLocalDate_()`が利用者の設定タイムゾーンへ日時を変換します。ブラウザのタイムゾーンに依存して年・月・日が変わらないよう、主要なフィルターは公開文字列の年月日を利用します。
- 月別の距離・活動数は集計できますが、年月だけのデータから連続活動日数や曜日・時刻の実績を推測しません。

## 公開の安全条件

**正確な日時を公開する前に、公開対象ユーザー全員の同意を確認してください。** GPS経路、活動名、日時、表示名を組み合わせると生活パターンが推定される可能性があります。

| 設定 | 内容 |
| --- | --- |
| `public_preview_export_approval` | `I_APPROVE_PUBLIC_STATS`が無いとエクスポート不可 |
| `public_preview_user_ids` | 公開対象の管理用ユーザーIDをカンマ区切りで指定 |
| `public_preview_date_precision` | `month`または`exact` |
| `public_preview_exact_dates_approval` | `exact`を利用する場合だけ`I_APPROVE_EXACT_DATES`も必須 |

`month`もGPSの地理的位置を隠しません。既に公開したデータはGit履歴や第三者の保存先に残り得るため、設定変更後の再Publishだけで完全に非公開にはなりません。

## 管理者の確認手順

1. 変更が`gas/`のコードに必要な場合のみ、[claspソース同期手順](gas-clasp-sync.md)に従って検証後に手動同期します。**フロントエンドだけの修正なら同期不要**です。
2. `showPublicPreviewProgress()`で公開途中のバッチがないか確認します。途中の場合、意図を確認せずに`resetPublicPreviewBatch()`を呼び出さないでください。
3. 公開対象と同意を確認し、`Settings`で公開許可と希望する日付精度を指定します。
4. `inspectApprovedPublicPreview()`でユーザー数・活動数・`date_precision`を事前確認します。
5. 必要なときだけ`publishApprovedPublicPreview()`を手動で繰り返し実行します。各回の進捗は`showPublicPreviewProgress()`で確認し、完了時の`published: true`を待ちます。
6. 最終的な`public/data/preview.json`と経路チャンクが同時に更新され、Pagesへのデプロイが完了したら、公開日時・表示名・GPSが承認範囲内であることを確認します。
7. Webの表示ユーザー・種目・年を切り替え、`month`なら日別UIが無いこと、`exact`ならカレンダー・ヒートマップ・開始時刻が正しいことを確認します。

詳細は[GASの取り込み・公開運用](../gas/README.md)と[フロントエンド回帰確認](frontend-regression.md)を参照してください。

```bash
pnpm install --frozen-lockfile
node --test gas/tests/*.test.cjs scripts/tests/*.test.cjs
PATH_PREFIX=/kudos pnpm build
```
