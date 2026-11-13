# Kudos

ランニング・サイクリングのアクティビティを記録・表示するWebアプリです。

**公開予定URL:** https://naoiw.github.io/kudos/

## 現在の開発範囲

- [x] Running Page の Dashboard をベースにしたReact/TypeScriptフロントエンド
- [x] 日本語UI、英語のソースコードコメント
- [x] GitHub Pages のプロジェクトパス `/kudos/` 対応
- [x] 架空のサンプルデータ（実際のGPS・個人情報は含まない）
- [ ] Google Drive + Apps ScriptでGPX/TCXを同期
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
