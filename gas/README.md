# Kudos — Google Apps Script ingestion

このディレクトリには、管理者所有の **Google Drive → Google Sheets** GPX/TCX取り込み基盤があります。公開中の `naoiw.github.io/kudos` へは、管理者が明示的に許可した統計プレビューだけを手動で公開できます。**GPS経路・個人情報は書き出しません。初期状態では公開禁止です。**

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
- 生のGPX/TCXとGPS座標の配列はDriveに保持。シートには統計と管理メタデータだけを保存します。
- ルートを表示するための公開用JSON生成は未実装です。認証・公開範囲・経路マスキングが確定するまでデータ公開を行わないでください。

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
3. `location_country` 相当の都道府県自動判別とGPS公開経路加工は今後対応します。特に家の周辺の経路は別途マスキングが必要です。
4. 既存の活動ファイルをDriveから削除しても、Activitiesの行は自動では削除しません。管理者が履歴と対応を確認して整理してください。
5. `Users` の `enabled` をFALSEにすると新規取り込みが停止します。既存のActivitiesを削除する処理ではありません。

## Security / privacy

No Google Drive IDs, user emails, access tokens, raw GPX data or route coordinates are committed to the repository. Public GitHub Pages still serves synthetic demo data. Real activity publishing requires an authenticated, privacy-reviewed export flow that is outside this phase.


## 7. ウェブ画面へ統計プレビューを反映する（手動・公開許可制）

**最重要：`naoiw/kudos` のGitHub Pagesは誰でも閲覧できます。** この操作は非公開Sheetsから統計を抽出して、公開リポジトリの `public/data/preview.json` へ**コミット**します。承認した情報はログインなしで誰でも参照できます。公開前提のテスト記録だけで利用してください。実際のプライベートな活動データは認証対応後まで公開しないでください。

### 7-1. 更新ファイル

既にGASをセットアップした場合、追加・更新するのは次のファイルです。

- **追加**：`gas/05_PublicPreview.gs`
- **更新**：`gas/00_Config.gs`（公開承認用の設定項目を追加）
- **更新**：`gas/appsscript.json`（`script.external_request` 権限を追加）

GASエディターへ反映したあと **`setupSheets()` をもう一度実行** してください。既存のUsers・Activities・ImportLogは消えず、Settingsに新しい設定行が追加されます。

### 7-2. 明示的に公開を承認する

`Settings` の項目を確認します。最初は必ず公開禁止です。

| key | 初期値 | 公開に向けた指定 |
| --- | --- | --- |
| `public_preview_export_approval` | `disabled` | 公開すると決めたときのみ `I_APPROVE_PUBLIC_STATS` |
| `public_preview_user_ids` | 空欄 | 公開用データとして承認するユーザーID（例：`user_02`、複数はカンマ区切り） |
| `public_preview_date_precision` | `month` | 原則 `month` のまま。各活動の正確な日時を架空の日に置き換える |
| `public_preview_exact_dates_approval` | `disabled` | `exact` を選ぶ場合だけ別途 `I_APPROVE_EXACT_DATES` が必要 |

**重要**：`month` でも活動した**年月**・距離・運動時間・獲得標高・種目は公開されます。完全に匿名ではありません。日付を完全な架空データにしたい場合は、そもそもシートの元データをダミーにしてください。

公開用データから必ず除外する項目：ユーザーの実名・メール・DriveフォルダID・ファイル名・ファイルID・ハッシュ・GPX内の活動名・心拍数・GPS座標・エンコード済み経路・都道府県。

公開ユーザーは `u01`、`u02` といった別IDで表示し、表示名も「ユーザー 1」「ユーザー 2」に置換します。`Run` / `Ride` として確定した活動だけを表示します。`review_status=needs_review` の活動は公開しません。

### 7-3. GitHubへの接続

GitHubの **Settings → Developer settings → Personal access tokens → Fine-grained tokens** で、次の設定のトークンを作成します。

- Repository access: **Only select repositories** → `naoiw/kudos`
- Repository permissions: **Contents → Read and write**
- 有効期限は必要最小限。トークンは公開しないこと。

Apps Scriptのプロジェクト設定にある **スクリプト プロパティ**へ `KUDOS_GITHUB_TOKEN` として保存します。**Google SheetsやGitHubのファイルには書かないでください。**

### 7-4. 実行手順

1. `Settings` で承認項目・公開ユーザーを設定する。
2. Apps Scriptの関数一覧から **`inspectApprovedPublicPreview()`** を実行し、件数や日付公開方法を確認する。
3. 内容に問題がなければ **`publishApprovedPublicPreview()`** を手動実行する。
4. <https://github.com/naoiw/kudos/blob/main/public/data/preview.json> で公開データの内容を確認する。
5. GitHub ActionsのPagesデプロイ完了後、<https://naoiw.github.io/kudos/> でユーザー切り替えと集計を確認する。

公開用JSONが未作成・未公開のときは、サイトはこれまでの架空サンプル表示へ戻ります。現段階のルートマップ・足跡マップには実際のGPS経路が表示されません（座標を出力しないためです）。

既存の同期トリガーは**公開処理を呼び出しません**。新しいGPXを取り込んで表示を更新したいときは、`publishApprovedPublicPreview()` をもう一度実行してください。自動化は公開手順・公開許可を確認できたあとに追加します。

### 7-5. 公開を止める

`Settings.public_preview_export_approval` を `disabled` に戻すだけでは、**既にGitHubへ公開したJSONは消えません**。公開を終了する場合は、`public/data/preview.json` を無効化したダミーJSONへ置き換え、GitHub Pagesの再デプロイを確認してください。過去にコミットした情報はGit履歴に残り得るため、実際の私的情報を公開しないことが最重要です。
