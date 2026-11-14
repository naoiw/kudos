# Kudos

ランニング・サイクリングのアクティビティを記録・表示するWebアプリです。

**公開予定URL:** https://naoiw.github.io/kudos/

## 現在の開発範囲

- [x] Running Page の Dashboard をベースにしたReact/TypeScriptフロントエンド
- [x] 日本語UI、英語のソースコードコメント
- [x] GitHub Pages のプロジェクトパス `/kudos/` 対応
- [x] 架空のサンプルデータ（実際のGPS・個人情報は含まない）
- [x] Google Drive + Apps ScriptのGPX/TCX取り込みコード（実際のDrive・Sheetsへの設定と稼働は未完了）
- [ ] ユーザー別データの読み込みとページ切替
- [ ] Google認証とユーザー単位の閲覧制限
- [ ] 公開経路のプライバシーフィルター

## ローカルで起動

Node.js 22以降とpnpm 8.xを使用します。

```bash
corepack enable
pnpm install
pnpm dev
```

## GitHub Pages

`main`へのpushで `.github/workflows/deploy.yml` がビルドとデプロイを行います。
GitHubリポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定してください。初回はリポジトリのPages設定が必要な場合があります。
ビルド時は `PATH_PREFIX=/kudos` により静的アセットの基準パスを設定します。

## データの扱い

`src/static/activities.json` は初期画面を確認するための完全な架空データです。
現段階では認証機能はありません。個人の実際のGPX・GPS軌跡・位置情報は**絶対に公開リポジトリへコミットしないでください**。

## 原著作物とライセンス

本プロジェクトの画面・コンポーネントは [yihong0618/running_page](https://github.com/yihong0618/running_page) を元に移植・改変しています。
元プロジェクトはMITライセンスです。著作権表示は `LICENSE` に保持しています。

## 地図ライブラリとクレジット

ルートマップは [Leaflet 1.9.4](https://leafletjs.com/)（BSD 2-Clauseライセンス）で表示し、地図画像には OpenStreetMap の標準タイルを利用しています。

- Leaflet: Copyright (c) 2010–2023 Volodymyr Agafonkin, Copyright (c) 2010–2011 CloudMade。原著作物のBSD 2-Clauseライセンスを適用します。
- OpenStreetMap: © OpenStreetMap contributors。地図中に出典を表示します。タイルの利用には [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) が適用されます。
- LeafletのJavaScript・CSSはバージョン固定のCDNから取得します。アプリのソース・ビルドに追加のnpm依存を持たせません。


## 日本地図（足跡マップ）

元の [running_page](https://github.com/yihong0618/running_page) の「足迹地图」と同様に、React + SVG で都道府県ごとの訪問状況を描画します。クリックすると対象都道府県のアクティビティに絞り込みます。

地図は中部地方を中心に初期表示し、ドラッグで移動、マウスホイール／タッチのピンチ操作と画面上の＋／－ボタンで拡大縮小できます。都道府県を選択すると（未訪問の都道府県を含む）主な陸地が中央へ移動し、ズーム操作中も表示中心を保ちます。「戻す」で絞り込みを解除して初期表示へ戻せます。

- 地図データ：[hfu/gmjpn21pref](https://github.com/hfu/gmjpn21pref) の日本47都道府県 GeoJSON（Unlicense / Public Domain）
- 原典：国土地理院「地球地図日本」（[国土地理院ウェブサイト](https://www.gsi.go.jp/kankyochiri/gm_jpn.html)）
- ランニングとサイクリングでフィルター可能
- 現在の件数判定：活動データの `location_country` に記載された都道府県名
- 将来対応予定：GPXの経路が通過した複数都道府県の自動集計

ルートマップの背景タイルはライト・ダークの両モードでグレースケール化します。経路色は種目に応じて残します。

## GPX/TCX取り込み基盤（Apps Script）

複数人のGoogle Driveフォルダを巡回して、1アクティビティ1行で非公開Google Sheetsへ取り込む仕組みを `gas/` に追加しています。初期セットアップと設定方法は [gas/README.md](gas/README.md) を参照してください。

**公開中のWebページは引き続きサンプルデータのみ**を使用しており、個人GPS記録は自動公開されません。

## Sheetsの統計プレビュー（ユーザー切り替え）

管理用Google Sheetsの活動をKudosへ表示するため、GASに `publishApprovedPublicPreview()` を用意しています。管理者が公開を承認すると、距離・種目・運動時間などの**統計のみ**を `public/data/preview.json` に書き出します。

- 公開サイトのユーザー切り替えは `?u=u01`、`?u=u02` などのURLで利用できます。
- 未承認の場合は従来の架空データを表示します。
- 公開する統計情報は**インターネット上の誰でも閲覧可能**です。
- ユーザー名やメール、GPSルートは含めません。日時は初期設定で月単位に匿名化します。
- 本物のGPS経路を複数ユーザーで閲覧する仕組みには、認証と権限制御が別途必要です。

詳細な設定は [GASセットアップ手順](gas/README.md#7-ウェブ画面へ統計プレビューを反映する手動公開許可制) を参照してください。
