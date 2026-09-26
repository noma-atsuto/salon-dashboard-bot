# AIチャットの中継役（Cloudflare Worker）

ダッシュボードの「AIに聞く」から質問を受け取り、Cloudflare Workers AI に渡して
答えを返すだけの小さなプログラムです。**設定は済んでいます。**

## いまの設定

| 項目 | 値 |
|---|---|
| アドレス | `https://salon-chat.noma-a.workers.dev` |
| 使っているAI | `@cf/openai/gpt-oss-120b` |
| 使えるのは | `https://noma-atsuto.github.io` から開いたページだけ |
| 1日の無料枠 | 10,000ニューロン（**およそ108回**・日本時間の朝9時にリセット） |

- **AIのAPIキーは使っていません。** Cloudflare の中でAIまで完結します。
- **Workers の無料プランなので、枠を使い切った時点でその日は止まるだけ**です。
  超過して請求が来ることはありません。
- 送った内容が **AIの学習に使われることはありません**（Cloudflare 公式の方針）。

## モデルを選んだ理由

同じ質問を実際に6つのモデルへ投げて比べた結果です。

| モデル | 結果 |
|---|---|
| **gpt-oss-120b** | **採用。**いちばん正確で速い（約5秒）。1日およそ108回 |
| gpt-oss-20b | 正確。少し浅いが安い。1日およそ227回 |
| qwen3-30b-a3b | 速いが、店販の数字を取り違えた |
| gemma-4-26b | 答えが空で返ってくる（考えるだけで終わる）。使えない |
| glm-4.7-flash | 同上。使えない |
| llama-3.1-8b | **実在しない数字を作った。使ってはいけない** |

## 直したいとき

**AIを変える** — `wrangler.toml` の `MODEL` を書き換えて、下を実行します。

```bash
cd ~/workspace/tools/salon-dashboard/worker && npx wrangler deploy
```

**使用量を見る** — Cloudflare の画面 → コンピュート → Workers & Pages → salon-chat

**AIチャットを消す** — GitHub の設定を消して、ページを作り直します。

```bash
gh secret delete CHAT_URL --repo noma-atsuto/salon-dashboard-bot
```

## 安全のしくみ

3つの鍵がかかっています。

1. **決めたアドレスからしか使えない**（`ALLOW_ORIGIN`）。他のサイトからは弾かれます。
2. **合言葉が要る**（`CHAT_TOKEN`）。Cloudflare側に登録してあり、外からは見えません。
3. 合言葉は**暗号化されたページの中**にだけ入っています。
   ページの合言葉（`aitokyo1102`）を知らない人には取り出せません。

いずれも実際に試して、弾かれることを確認済みです。

> **注意**：逆に言うと、**ページの合言葉を知っている人は誰でもAIチャットを使えます。**
> URLと合言葉の共有範囲にご注意ください。

## もう一度設定し直すとき

```bash
cd ~/workspace/tools/salon-dashboard/worker && npx wrangler login
```

```bash
cd ~/workspace/tools/salon-dashboard/worker && npx wrangler deploy
```

```bash
cd ~/workspace/tools/salon-dashboard/worker && npx wrangler secret put CHAT_TOKEN
```

GitHub側（`CHAT_URL` と `CHAT_TOKEN`）も同じ値で登録し直してください。
