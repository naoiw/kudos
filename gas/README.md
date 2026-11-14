# Kudos — Google Apps Script ingestion

このディレクトリには、管理者所有の **Google Drive → Google Sheets** GPX/TCX取り込み基盤があります。公開中の `naoiw.github.io/kudos` へは、手動でユーザー名・アクティビティ・GPX/TCX経路を出力できます。**公開リポジトリのため、書き出したGPS経路と表示名は誰でも閲覧可能です。** 現状のデータがテスト用であることを確認して実行してください。

## 全体設計

```text
Private Google Drive
├── user-a/    ← user-a にこのフォルダだけ共有
│   ├── ride.gpx
│   └── run.gpx
└── user-b/    ← user-b にこのフォルダだけ共有
    └── activity.gpx
           │
           ▼
Standalone Apps Script (owner account; scheduled)
           │ parse, checksum, deduplicate, classify
           ▼
Private Google Sheets (owner only)
├── Users
├── Activities
├── ImportLog
├── Settings
└── SyncLog
```

- ファイル名は自由です。GPX/TCXのXMLルート要素から形式を判定します。
- 誰の活動かは、ファイル内の氏名やファイル名ではなく **フォルダID** から判定します。
- 管理シートは **1ファイルのみ**。ユーザーごとに `user_id` を付けて行を分けます。
- 生のGPX/TCXはDriveに保持し、シートには統計と管理メタデータを保存します。
- 手動公開時はDriveの元GPX/TCXから経路座標を再取得し、表示用のGoogle encoded polylineに変換してJSONに含めます。

## 1. 管理シートの準備

管理者のGoogleアカウントで、空のGoogleスプレッドシートを1つ作成します。

ブラウザURLの `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit` の部分がIDです。**このIDや実際のフォルダID、メールアドレスをGitHubへコミットしないでください。**

## 2. GASプロジェクトの作成

<https://script.google.com/> で **スタンドアロンのApps Scriptプロジェクト** を新規作成します。Google Sheets側に紐づくスクリプトでも使える設計ですが、配布・更新を考慮してスタンドアロンを推奨します。

`gas/*.gs` をそれぞれ同名でApps Scriptへコピーし、`gas/appsscript.json` のマニフェスト内容も登録してください。必要な権限はDrive読み取り、Sheets編集、トリガー作成のみです。

CLIによる更新を使う場合は [clasp](https://github.com/google/clasp) を利用できます。リポジトリルートに自分専用の `.clasp.json` を置き、`scriptId` と `rootDir: "gas"` を設定して `clasp push` してください。Script IDや認証情報はコミットしないでください。

Apps Scriptの **プロジェクトの設定 → スクリプト プロパティ** に以下を登録します。

| キー | 値 |
| --- | --- |
| `KUDOS_SPREADSHEET_ID` | 管理スプレッドシートのID |

GPXの取り込みだけならこのプロパティのみで動作します。統計プレビューをGitHubへ明示的に公開する場合だけ、後述の `KUDOS_GITHUB_TOKEN` が必要です。

## 3. シート初期化とユーザー登録

Apps Scriptのエディターから **`setupSheets()`** を一度実行します。これで5つのタブと各列見出し、Settingsの初期値が生成されます。既存のシートが想定外の列を持つ場合は上書きせずエラーになります。

`Users` タブに2人を登録します。次の例のフォルダID・メールアドレスは架空の値です。

| user_id | display_name | email | drive_folder_id | timezone | enabled |
| --- | --- | --- | --- | --- | --- |
| user-a | User A | user-a@example.com | FOLDER_ID_FOR_A | Asia/Tokyo | TRUE |
| user-b | User B | user-b@example.com | FOLDER_ID_FOR_B | Asia/Tokyo | TRUE |

- `user_id`：英小文字・数字・`_`・`-` のみ。URLにも利用するため後から変更しない
- `drive_folder_id`：各ユーザーのGPXフォルダを開いたURL末尾のフォルダID
- `enabled`：`TRUE` のユーザーだけ取り込む
- `timezone`：活動日時の現地表示用。まずは `Asia/Tokyo` でよい
- `email`：将来のGoogleログイン用。今回の取り込み処理では使用しない

管理者のアカウントで各フォルダにアクセスできる必要があります。親フォルダを全員に共有せず、ユーザー本人には**その人専用のサブフォルダだけを共有**してください。ユーザーにSheetsの共有権限は不要です。

`checkKudosSetup()` を実行すると、フォルダへのアクセスを確認できます。

## 4. 手動取り込み

**`syncAllActivities()`** を一度実行して、次のタブを確認します。

| タブ | 用途 |
| --- | --- |
| `Users` | ユーザーID、名前、メール、DriveフォルダID、タイムゾーン、有効／無効 |
| `Activities` | 1行1アクティビティ。日時・距離(m)・運動時間(s)・標高差(m)・HR・種目 |
| `ImportLog` | ユーザー×DriveファイルID別の取り込み状況、ハッシュ、エラー |
| `Settings` | 1回の処理件数上限、サイズ上限、移動速度閾値など |
| `SyncLog` | 実行履歴、取り込み件数、エラー件数 |

同じユーザーが同じGPXを別名で再アップロードした場合、SHA-256ハッシュで重複判定します。ファイル名は識別に利用しません。異なるユーザーの記録は別々の活動として扱います。

`sport_detected` はGPX/TCXの種目属性があればそれを優先し、無ければ移動速度で `Run` / `Ride` / `Unknown` を暫定判定します。曖昧な活動は **`Unknown`** として残します。

間違っていたら `Activities.sport_override` に `Run` または `Ride` と入力し、**`applyActivityOverrides()`** を実行してください（定期同期時にも自動実行されます）。`name_override` と `prefecture_override` は将来の表示用に予約した手動編集列です。

`ImportLog.status` は `imported`、`duplicate`、`unsupported`、`rejected`、`error` のいずれかです。解析エラーは同一ファイルに最大3回試行します。再試行したい場合はその行の `attempts` を0へ戻してください。

### 未取り込みGPXの手動一括処理（定期実行なし）

大量のGPXがある場合は、GASエディタで次の関数を順に利用してください。

1. `showImportProgress()`：`ImportLog` のユーザー別 `imported / duplicate / error` 件数をログで確認
2. `importNextManualBatch()`：**1回分の取り込み**を実行。既存の `syncAllActivities()` と同じ処理だが結果を明示
3. まだ未処理のファイルがある場合は、`importNextManualBatch()` を手動で再実行
4. `SyncLog.notes` に `Paused at the runtime/file budget` が出なくなり、`ImportLog` の件数がDriveのGPX/TCXファイル数に達するまで繰り返す
5. 完了後に `publishApprovedPublicPreview()` を**手動実行**してページに反映

- 既定値は **1回あたり最大30ファイル・240秒**。Google Apps Scriptの実行上限のため、全件を一度に取り込むとは限りません。ファイル数50件や120件でも複数回必要になり得ます
- `DriveApp.FileIterator` の継続トークンをスクリプトプロパティへ保存するため、次回は途中から再開します。継続トークンの期限が切れたときは最初から走査しますが、既存ファイルは重複登録しません
- 通常のGPXは専用の高速解析を使用し、大きなXML全体を `XmlService` でオブジェクト化しないようにします。TCXや特殊なGPXでは従来のパーサーにフォールバックします
- 件数を確認するにはDriveの各ユーザー専用フォルダのファイル数を参照してください。**`showImportProgress()` はDrive総ファイル数を調べず、取り込み済み件数を表示する関数です**
- 現段階では `installSyncTriggers()` は実行不要です。**定期実行は無効のまま**、動作確認がすべて終わってから設定します
- `ImportLog.status=unsupported/rejected/error` のファイルは `Activities` に表示されない場合があります。その場合はエラーを確認してください

## 5. 定期実行

**`installSyncTriggers()`** を実行すると、Apps Scriptトリガーを3つ設定します。

- 毎日21時台に1回
- 土曜13時台に追加で1回
- 日曜13時台に追加で1回

Googleの時間トリガーは実行時刻に幅があります。**平日は1回、土日は2回**です。停止するときは `removeSyncTriggers()` を実行してください。

Apps Scriptは1回あたりの実行時間に上限があります。既定では1実行30ファイル／240秒で処理を切り上げ、次回の定期実行で未処理ファイルを続けます。ユーザーの処理順を巡回ごとに交替させ、人数が増えても処理が偏らないようにしています。

## 6. 注意事項

1. データはすべて**管理者用の非公開Sheets**に入ります。GPS生データを公開リポジトリへ入れないでください。
2. 移動距離・移動時間・獲得標高はGPX/TCXの地点から計算する暫定値で、Garmin/Strava側の補正結果と多少異なる場合があります。
3. `location_country` 相当の都道府県自動判別は今後対応します。現在の経路出力は起終点を含み、マスキングしません。
4. 既存の活動ファイルをDriveから削除しても、Activitiesの行は自動では削除しません。管理者が履歴と対応を確認して整理してください。
5. `Users` の `enabled` をFALSEにすると新規取り込みが停止します。既存のActivitiesを削除する処理ではありません。

## Security / privacy

Do not commit Google Drive IDs, email addresses, or tokens. Exported preview.json intentionally contains encoded GPS coordinates and display names after an explicit manual publish. The repository is currently public, so do not publish private routes.


## 7. ウェブ画面へ名前・活動・GPS経路を反映する（手動エクスポート）

**現状の `naoiw/kudos` はPublicリポジトリです。** この操作はGoogle Sheetsの表示名・活動情報、およびDriveのGPX/TCXを変換したGPS経路を `public/data/preview.json` にコミットします。**このファイルと経路は誰でも閲覧できます。** 今はテスト用GPXで動作確認し、実際の非公開データについてはPrivateリポジトリや認証対応を先に実施してください。

### 7-1. 更新ファイル

既にGASをセットアップした場合、追加・更新するのは次のファイルです。

- **更新**：`gas/05_PublicPreview.gs`（元GPX/TCXからの経路抽出・display_name反映）
- `gas/appsscript.json` は既に `script.external_request` を含んでおり、今回は変更不要です。

GASエディターで `05_PublicPreview.gs` を最新版に置き換えてください。**シート列の変更はないため、`setupSheets()` の再実行は不要です。**

### 7-2. 明示的に公開を承認する

`Settings` の項目を確認します。最初は必ず公開禁止です。

| key | 初期値 | 公開に向けた指定 |
| --- | --- | --- |
| `public_preview_export_approval` | `disabled` | 公開すると決めたときのみ `I_APPROVE_PUBLIC_STATS` |
| `public_preview_user_ids` | 空欄 | 公開用データとして承認するユーザーID（例：`user_02`、複数はカンマ区切り） |
| `public_preview_date_precision` | `month` | 原則 `month` のまま。各活動の正確な日時を架空の日に置き換える |
| `public_preview_exact_dates_approval` | `disabled` | `exact` を選ぶ場合だけ別途 `I_APPROVE_EXACT_DATES` が必要 |

**重要**：`month` は日付を架空の日へ置き換えるだけで、GPS経路は含みます。GPSを表示する場合、地図から地域を特定できるため、この設定は匿名化の保証ではありません。

サイトのユーザー名は **`Users.display_name`** を使用し、アクティビティ名も `Activities.name_override` または `Activities.name` を反映します。ユーザーIDは従来通り `u01`、`u02` などの表示用別IDを使用します。`Run` / `Ride` として確定した活動だけを対象にします。

GPS経路は `Activities.drive_file_id` に紐づくDriveのGPX/TCXを再解析して生成し、複数トラックセグメントは別々に保持します。欠けたDriveファイルや無効な経路がある場合は、エクスポートがエラーを返します。Sheets自体へのGPX座標の追加は不要です。

### 7-3. GitHubへの接続

GitHubの **Settings → Developer settings → Personal access tokens → Fine-grained tokens** で、次の設定のトークンを作成します。

- Repository access: **Only select repositories** → `naoiw/kudos`
- Repository permissions: **Contents → Read and write**
- 有効期限は必要最小限。トークンは公開しないこと。

Apps Scriptのプロジェクト設定にある **スクリプト プロパティ**へ `KUDOS_GITHUB_TOKEN` として保存します。**Google SheetsやGitHubのファイルには書かないでください。**

### 7-4. 大量GPXの分割公開（2026年11月更新）

管理シートの活動件数が多い場合でもGASの実行時間制限（1回6分）を超えないよう、**公開処理も分割・途中再開式**になっています。

**GASエディタで更新が必要なファイル：**

- `gas/05_PublicPreview.gs` を最新版に置き換える
- `gas/06_BatchedPublish.gs` を**新規追加**する（2026年11月時点で導入）
- `appsscript.json` は変更不要。`script.external_request` は既に定義済み
- `setupSheets()` も不要（シート列は変更しない）
- `installSyncTriggers()` はまだ実行しない。**スケジュールは無効のまま**

**実行手順：**

1. `Settings.public_preview_export_approval` と `public_preview_user_ids` を確認する
2. `inspectApprovedPublicPreview()` または `showPublicPreviewProgress()` を実行する。**元GPXは読み込まず、公開対象の件数だけ確認する**
3. `publishApprovedPublicPreview()` を実行する。**1回では全件公開しない**。1回あたり最大8件（または180秒の処理予算）を変換し、GitHubへ作業用のBlobとして保存する
4. `showPublicPreviewProgress()` で `processed` / `total` / `chunks` / `needs_reset` を確認する
5. **`published: true` と表示されるまで `publishApprovedPublicPreview()` を手動で繰り返す**。進捗はGASのスクリプトプロパティに保持され、次回は続きから処理される
6. 完了した時点で `public/data/preview.json` と `public/data/exports/<ジョブID>/chunk-XXXX.json` が**1回のGitコミットで** `main` に反映され、Pagesのデプロイが開始される
7. <https://naoiw.github.io/kudos/> で反映を確認する

公開用データは新しい **schema_version=2** です。`preview.json` にユーザー情報と統計、および `route_chunks`（経路JSONのパス一覧）を収めます。ルートマップ・足跡マップはブラウザ側で経路チャンクを読み込みます。従来のschema_version=1も読み込めます。

- **途中のバッチはmainへ反映しません**。作業用Git Blobがそろうまで現在の公開サイトはそのままです。最終コミットは1回だけ行います
- 大きなGPXを処理中に例外が発生した場合、完了済みチャンクの進捗を保持して停止します。同じ関数を再実行してください
- `Users` / `Activities` / `Settings` をバッチ途中で変更した場合は、意図しないデータ混在を防ぐためエラーになります。`resetPublicPreviewBatch()` で途中の状態を破棄し、先頭から公開し直してください。**現在の公開サイトは変更されません**
- 本方式は **公開済みの全アクティビティのGPXをバッチごとに読み出します**。初回に全件分のGPS経路をSheetsへ保存する必要はありません
- 現状は最大8件/回・処理予算180秒をコードで定義しています。GASの6分制限に余裕を持たせていますが、**1つのGPXの解析だけで6分を超える場合は別途さらに対策が必要**です
- 多数のファイルを扱うとGitHubへの公開データが数MBになることがあります。データ送信の対象と公開範囲を確認してください
- **GitHubはPublicリポジトリ**です。JSONに含めたGPS座標は公開されます。将来Vercel/Cloudflareに移行しても、公開アクセスを止めるにはホスティング側でも認証が必要です

### 7-5. 公開を止める

`Settings.public_preview_export_approval` を `disabled` に戻すだけでは、**既にGitHubへ公開したJSONは消えません**。公開を終了する場合は、`public/data/preview.json` を無効化したダミーJSONへ置き換え、GitHub Pagesの再デプロイを確認してください。過去にコミットしたGPS経路や表示名はGit履歴に残り得るため、将来リポジトリをPrivateに切り替える場合もそれ以前の公開状態を考慮してください。

## 8. 足跡マップと都道府県フォーカス

Webアプリは `public/data/preview.json` の `summary_polyline` / `route_segments` を日本47都道府県のGeoJSONと照合して、**経路が通過したすべての都道府県**を訪問済みとして色付けします。GPXからGPS座標をSheetsへ追加する必要はありません。

都道府県をクリックすると、その都道府県を通過するアクティビティに絞り込み、ルートマップではその県内にある経路部分の範囲にフォーカスします。都道府県の輪郭だけではなく、実際の走行地点を優先します。

`prefecture_override` に都道府県を入力している場合は、その都道府県も候補として含めます。地図に経路がないレコードには引き続き手動設定が利用できます。

**公開サイト上のEncoded Polylineには実際のGPS座標が含まれます。** リポジトリや配信先をPrivateにする計画があっても、現時点でPublicなGitHub Pagesに出力した経路は一般公開されます。

## 9. アクティビティ種目の判定（サイクリング・ウォーキング・ゴルフ）

Webアプリの種目は次の3種類に統一します。画面上の選択肢と表示順は **サイクリング → ウォーキング → ゴルフ** です。

| 内部種目 | UI表示名 | アクティビティ名からの判定例 |
| --- | --- | --- |
| `Ride` | サイクリング | サイクリング、ライド、自転車、ポタリング、cycling、bike、ride |
| `Walk` | ウォーキング | ハイキング、ランニング、ジョギング、ウォーキング、ウォーク、散歩、walking、running、hiking |
| `Golf` | ゴルフ | ゴルフ、golf |

**判定優先順位：** `Activities.sport_override`（管理者が明示指定）→ `name_override` または `name` のキーワード → GPX/TCXの種目属性と速度による推定。

従来の `Run` は `Walk` に変換されます。未分類 `Unknown` は引き続き確認対象です。手動指定に使える値は `Ride`、`Walk`、`Golf`。旧 `Run` の手動指定も互換扱いで `Walk` に変換されます。

**すでに取り込み済みの活動を再判定するには：** GASの `00_Config.gs`、`01_Sheets.gs`、`02_Parser.gs`、`05_PublicPreview.gs` を更新して `applyActivityOverrides()` を1回実行してください。既存GPXの再取り込みは不要です。

Webアプリ側でも旧形式の公開JSONについてタイトルを用いた互換判定を行うため、**既に公開した経路データをすべて再Publishしなくても種目のフィルタ表示を更新できます**。今後 `publishApprovedPublicPreview()` を実行した際は、GAS側が判定した種目と手動指定を尊重するため `genre_version: 1` が公開JSONに付与されます。

定期実行を有効化するものではありません。スケジュールは開発完了まで無効のままにしてください。
