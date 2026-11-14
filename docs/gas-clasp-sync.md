# Google Apps Scriptソース同期（Issue #23）

既存のApps ScriptプロジェクトのソースをGitHubの`main`で管理し、必要なときだけ`clasp push`で反映します。WebアプリのPagesデプロイやGPSデータ公開とは独立しています。

## 重要な安全条件

- **GitHubがソースの正本**です。Apps Scriptエディターで直接編集した変更は次回のpushで失われる可能性があります。
- `clasp push`はApps Scriptプロジェクトの**コード全体を置換**します。初回は必ず既存コードとの比較・バックアップを行ってください。
- 同期対象は`gas/00_Config.gs`から`gas/06_BatchedPublish.gs`までの7個の`.gs`と`gas/appsscript.json`だけです。`scripts/verify-gas-sync.cjs`と`clasp show-file-status --json`でファイル一覧・構文を検証します。
- `Script Properties`、Google Sheets、Google Drive、インストール型トリガー、公開用JSONは同期対象外です。`clasp push`はGAS関数を呼び出さず、新しい時間トリガーも追加しません。
- `GAS_SCRIPT_ID`、OAuth認証情報、Sheets/Drive ID、PAT等をコミット・Issue・CIログ・チャットに掲載しないでください。

## 初回セットアップ（管理者が操作）

1. [Google Apps Scriptのユーザー設定](https://script.google.com/home/usersettings)で**Apps Script API**を有効にします。
2. Node.js 22以降の環境でリポジトリをcloneし、`pnpm install --frozen-lockfile`を実行します。
3. リポジトリルートで`cp gas/.clasp.json.example .clasp.json`を実行します。Windows PowerShellは`Copy-Item gas/.clasp.json.example .clasp.json`を使います。`scriptId`を既存GASプロジェクトの「プロジェクトの設定 → スクリプトID」に置き換えます。`rootDir: "gas"`は変更しません。
4. リポジトリルートで`npx --yes @google/clasp@3.4.1 login`を実行し、既存のGASプロジェクトへアクセスできるGoogleアカウントでブラウザ認証します。認証情報は通常`~/.clasprc.json`に保存されます。
5. **初回のpush前に**、GASエディターの現行コードを別途バックアップしてください。cloneした**使い捨ての作業コピー**で同じ`.clasp.json`を設定して`npx --yes @google/clasp@3.4.1 pull`を実行し、GitHubの7ファイル・マニフェストと比較します。`pull`はローカルファイルを上書きするため、編集中の作業ディレクトリでは実行しないでください。GASにのみ存在するコードは先にGitHubへ取り込みます。

## ローカルから手動反映

最新の`main`で次を実行します。`clasp-status.tmp.json`は確認後に削除してください。

```bash
node scripts/verify-gas-sync.cjs
node --test gas/tests/*.test.cjs scripts/tests/*.test.cjs
pnpm build
npx --yes @google/clasp@3.4.1 show-file-status --json > clasp-status.tmp.json
node scripts/verify-gas-sync.cjs clasp-status.tmp.json
npx --yes @google/clasp@3.4.1 push --force
```

`--force`はマニフェスト差分確認を省くためのオプションです。**事前にリモートとGitHubの差分を確認したときだけ**実行してください。終了後にApps Scriptエディターで反映を確認します。

## GitHub Actionsから手動反映

GitHubの**Settings → Secrets and variables → Actions**で以下をRepository Secretsに登録してください。値をチャットやIssueに貼らないでください。

| Secret | 登録する値 |
| --- | --- |
| `GAS_SCRIPT_ID` | 既存のApps ScriptのスクリプトID |
| `CLASPRC_JSON` | `clasp login`で作成した`~/.clasprc.json`ファイル全体 |

**Settings → Environments**で`gas-production`を設定し、可能ならRequired reviewersを指定してください。

1. **Actions → Sync Kudos Apps Script source → Run workflow**を開きます。
2. ブランチを`main`に指定し、確認欄に`PUSH`と入力します。
3. ワークフローはテスト・ビルド・送信対象の照合に成功した場合だけ、Apps Scriptへソースをpushします。`main`以外のブランチは拒否します。GASの関数実行・トリガー設定はしません。
4. Apps Scriptエディターで7つのファイルとマニフェストを確認します。

## pull・ロールバック・認証情報

- `clasp pull`はApps Script→ローカルの取得です。GitHubへ自動コミットしません。GitHubの既存ソースを破壊しないよう、使い捨て作業コピーで比較します。
- 戻すときは過去のGitコミットのソースをチェックアウトし、検証後に手動pushします。Script Properties・Sheets・トリガー・実行履歴は戻りません。
- OAuthリフレッシュトークンは強い権限を持つため、漏洩が疑われたらGoogleアカウントでアクセスを取り消し、Secretsを更新してください。
- **GAS定期トリガーは無効のままにしてください**。データ取り込み・Publishの完全自動化は別Issue #15で扱います。
