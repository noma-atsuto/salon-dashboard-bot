# 池袋店ダッシュボード 自動更新

日本時間 10:00〜22:00 の毎正時（＋20:30）に、ビューティーメリットからデータを取得して
公開ページ https://noma-atsuto.github.io/ikebukuro-kpi/ を更新します。

このリポジトリは**非公開**です。公開されるのは、出来上がったページだけです。

## シークレット（Settings → Secrets and variables → Actions）

| 名前 | 中身 |
|---|---|
| `BM_LOGIN_ID` | ビューティーメリットのログインID |
| `BM_PASSWORD` | 同 パスワード |
| `DEPLOY_KEY` | 公開リポジトリへ書き込むための秘密鍵 |

## 手動で動かす

Actions タブ →「データ更新」→ Run workflow

## 頻度を変える

`.github/workflows/daily.yml` の `cron` を編集してください。時刻はUTC（日本時間 −9時間）です。
非公開リポジトリの無料枠は月2,000分。1回あたり約1〜2分かかります。
