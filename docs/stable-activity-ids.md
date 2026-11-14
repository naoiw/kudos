# 不変な公開アクティビティID（Issue #16）

## 変更の背景

従来、GASの`kudosBuildPublicPreview_`は`(ユーザー順 + 1) * 1,000,000 + そのユーザー内での日付順 + 1`を公開`run_id`としていました。過去日付の活動追加・ソート・ユーザー追加で既存IDが変わり、公開manifestとroute chunkに依存する機能や今後の差分Publishで不整合が起きます。

## 新しいID

`gas/01_Sheets.gs`の`kudosStablePublicRunId_(activity_id)`は、非公開`activity_id`にSHA-256を適用し、先頭12桁の16進数（48bit）をJavaScriptの安全な整数として返します。これは従来からSheetsの`Activities.run_id`に書き込まれていた値と同じ計算です。

- 入力の`activity_id`は、取り込み時にユーザーIDとDriveファイルIDから内部で生成されます。**公開出力には元ID、Drive ID、フォルダID、認証情報を含めません**。
- 公開用`run_id`は、名前、`name_override`、`sport_override`、日付、一覧の順番、公開対象ユーザーの選択順によらず一定です。
- 48bitであり`Number.MAX_SAFE_INTEGER`の範囲内です。ハッシュ衝突は確率的にゼロではないため、**同じ公開run_idが2件存在したら公開を拒否**します。また、活動IDの欠損も公開を拒否します。
- 既存の数値`run_id`型、`schema_version=2`、ルートchunk内の`run_id`結合、React key、選択中の経路との比較は変更不要です。追加した`id_version: 1`は新方式を示す任意の目印で、従来のJSONに無くても読めます。
- `genre_version`、公開データの許可設定、年月精度、手動トリガー運用はそのままです。

## 移行

この変更によって**既に公開されているJSONを自動的に変更しません**。公開済みv1/v2の旧数値IDとroute chunkは引き続き同じIDで結合されます。フロントエンドは新旧を数値として扱うため、過去の公開データを引き続き表示できます。

1. GitHubの`main`を更新し、`pnpm install --frozen-lockfile`、`node --test gas/tests/*.test.cjs scripts/tests/*.test.cjs`、`pnpm build`を実行します。
2. [GAS同期手順](gas-clasp-sync.md)に従って管理者が手動で`clasp push`します。**自動同期・時間主導トリガーの有効化は行いません**。
3. 進行中の公開バッチがないことを`showPublicPreviewProgress()`で確認します。旧方式でバッチ途中の場合は、必要性を判断したうえで`resetPublicPreviewBatch()`を明示的に実行します。
4. 準備が整ったら`inspectApprovedPublicPreview()`で公開対象件数・公開許可を確認し、`publishApprovedPublicPreview()`を手動で繰り返し実行して新しいIDのmanifestと対応chunkを**1回の最終コミットで同時公開**します。
5. 更新後に`preview.json`の`id_version: 1`、活動件数、全`run_id`の重複なし、chunkの経路総数・ID対応が一致することを確認してください。

初回再PublishではIDが旧方式から新方式へ一括で切り替わります。**過去の旧連番IDを恒久的に維持するものではありません**。次回以降は、新規・更新・削除・並び替えをしても既存活動のIDが変わりません。

## テスト

`gas/tests/ingestion.test.cjs`で追加・改名・override・時刻変化・複数ユーザーの同一日時・公開対象順変更・欠損・衝突・旧数値IDと新しいroute chunkの結合を検証しています。実際のGoogle Apps ScriptへのデプロイやPublishはCIでは実行しません。
