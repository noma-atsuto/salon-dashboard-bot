# AIチャットの中継役（Cloudflare Worker）

ダッシュボードの「AIに聞く」から質問を受け取り、Cloudflare Workers AI に渡して
答えを返すだけの小さなプログラムです。

- **AIのAPIキーは要りません。** Cloudflare の中でAIまで完結します。
- **無料枠は 1日10,000ニューロン**（日本時間の朝9時にリセット）。
  標準モデルなら **1日およそ200回** 質問できます。
- **Workers の無料プランでは、使い切った時点でその日は止まるだけ**です。
  超過して請求が来ることはありません。
- 送った内容が **AIの学習に使われることはありません**（Cloudflare 公式の方針）。

---

## 1回だけやる設定

### ① Cloudflare の無料アカウントを作る

https://dash.cloudflare.com/sign-up

メールアドレスとパスワードだけで作れます。**クレジットカードは不要**です。

### ② Worker を置く

ターミナルで、下を1行ずつ実行します。

```bash
cd ~/workspace/tools/salon-dashboard/worker
```

```bash
npx wrangler login
```

ブラウザが開くので、①で作ったアカウントで「Allow」を押します。

```bash
npx wrangler deploy
```

最後に `https://salon-chat.○○○.workers.dev` というアドレスが出ます。
**このアドレスを控えてください。**

### ③ 合言葉を登録する

```bash
npx wrangler secret put CHAT_TOKEN
```

聞かれたら、GitHub に登録するのと**同じ合言葉**を貼り付けます。

### ④ GitHub 側に2つ登録する

```bash
gh secret set CHAT_URL --repo noma-atsuto/salon-dashboard-bot
```
→ ②で控えたアドレスを貼ります。

```bash
gh secret set CHAT_TOKEN --repo noma-atsuto/salon-dashboard-bot
```
→ ③と同じ合言葉を貼ります。

### ⑤ ページを作り直す

```bash
gh workflow run "データ更新" --repo noma-atsuto/salon-dashboard-bot
```

5分ほどでメニューに「AIに聞く」が出ます。

---

## あとから変えたいとき

**AIを賢いものに変える** — `wrangler.toml` の `MODEL` を書き換えて `npx wrangler deploy`。
消費が増えるぶん、1日に使える回数は減ります。

**AIチャットを消す** — GitHub の `CHAT_URL` を削除して更新し直せば、メニューから消えます。

```bash
gh secret delete CHAT_URL --repo noma-atsuto/salon-dashboard-bot
```

**使用量を見る** — Cloudflare の画面 → Workers & Pages → salon-chat

---

## 仕組みの安全面

- 中継役は、決めたアドレス（`ALLOW_ORIGIN`）からしか使えません。
- 合言葉（`CHAT_TOKEN`）は、**暗号化されたページの中**にだけ入っています。
  ページの合言葉（`aitokyo1102`）を知らない人には取り出せません。
- 逆に言うと、**ページの合言葉を知っている人は誰でもAIチャットを使えます**。
  スタッフ以外に URL と合言葉が漏れないよう、共有範囲にご注意ください。
