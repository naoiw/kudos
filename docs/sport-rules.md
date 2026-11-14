# Kudos：種目判定の単一ルール（Issue #21）

## 変更箇所

- 正本：`shared/sport-rules.json`
- フロント：`src/core/sports.ts`（JSONを直接import）
- GAS：`gas/00_Config.gs`の`BEGIN/END GENERATED SPORT RULES`（生成物）
- 契約テスト：`shared/sport-contract-cases.json`、`scripts/tests/sport-contract.test.cjs`

`Ride / Walk / Golf`の表示順はそのままです。正規化ルールは`aliases`、名前中の部分一致は`titleKeywords`で管理します。`titlePriority`は名前に複数のキーワードが存在した場合の優先度（Golf → Ride → Walk）です。旧`Run`は`Walk`として正規化します。

## 解決順序

1. 有効な`sport_override`があれば最優先
2. `name_override`が空でなければそれを、なければアクティビティ名を調べ、`titlePriority`順に判定
3. GPX/TCX属性または速度ベースで既に検出された種目を`aliases`で正規化
4. どれも該当しなければ`Unknown`として手動確認待ち

既存公開JSONの`genre_version=1`はGAS側のoverride適用済みのため、フロントは`type`を信用して再分類しません。旧公開JSONではタイトルによる補正を継続します。`schema_version`、`genre_version`は変更しません。公開JSONの再Publishは不要です。

## ルール追加の手順

1. `shared/sport-rules.json`のキーワードまたは別名を変更する（小文字、重複なし）。
2. `shared/sport-contract-cases.json`に期待する判定を追加する。
3. 初回は`pnpm install --frozen-lockfile`を実行してTypeScriptなどの依存パッケージを導入する（Windowsでpnpmがない場合は`npx --yes pnpm@8.9.0 install --frozen-lockfile`）。
4. `node scripts/generate-sport-rules.cjs`を実行してGAS定義を再生成。
5. `node scripts/generate-sport-rules.cjs --check`と`node --test gas/tests/*.test.cjs scripts/tests/*.test.cjs`を実行。
6. PRのCIに合格したらmainにマージし、Apps Scriptへ反映が必要な場合のみ、[clasp手順](gas-clasp-sync.md)に従って管理者が手動でpushする。

*ルールの変更は既存シートの行を自動で書き換えません。* 既存の`Activities`を再分類する場合は`applyActivityOverrides()`を管理者が明示的に実行してください。手動`sport_override`は保持されます。

GASのトリガー設定やScript Properties、公開GPS経路は本対応で変更しません。
