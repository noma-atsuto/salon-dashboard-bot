# 池袋店ダッシュボード 自動更新

営業時間中の毎正時（平日11〜21時／土日10〜20時）に、ビューティーメリットからデータを取得して
公開ページ https://noma-atsuto.github.io/ikebukuro-kpi/ を更新します。

このリポジトリは**非公開**です。公開されるのは、出来上がったページだけです。

## シークレット（Settings → Secrets and variables → Actions）

| 名前 | 中身 |
|---|---|
| `BM_LOGIN_ID` | ビューティーメリットのログインID |
| `BM_PASSWORD` | 同 パスワード |
| `DEPLOY_KEY` | 公開リポジトリへ書き込むための秘密鍵 |
| `PAGE_PASSWORD` | ページを開くときの合言葉（これで中身を暗号化します） |

## 手動で動かす

Actions タブ →「データ更新」→ Run workflow

## 頻度を変える

`.github/workflows/daily.yml` の `cron` を編集してください。時刻はUTC（日本時間 −9時間）です。
非公開リポジトリの無料枠は月2,000分。1回あたり約1〜2分かかります。

## 合言葉を変えるには

```
gh secret set PAGE_PASSWORD --repo noma-atsuto/salon-dashboard-bot
```

入力後、Actions から手動実行すれば新しい合言葉で作り直されます。
古い合言葉は使えなくなります。
