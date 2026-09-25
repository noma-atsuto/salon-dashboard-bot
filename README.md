# 池袋店ダッシュボード 自動更新

毎日 20:30（日本時間）に、ビューティーメリットからデータを取得して
公開ページ https://noma-atsuto.github.io/ikebukuro-kpi/ を更新します。

このリポジトリは**非公開**です。公開されるのは、出来上がったページだけです。

## シークレット（Settings → Secrets and variables → Actions）

| 名前 | 中身 |
|---|---|
| `BM_LOGIN_ID` | ビューティーメリットのログインID |
| `BM_PASSWORD` | 同 パスワード |
| `DEPLOY_KEY` | 公開リポジトリへ書き込むための秘密鍵 |

## 手動で動かす

Actions タブ →「日次データ更新」→ Run workflow
