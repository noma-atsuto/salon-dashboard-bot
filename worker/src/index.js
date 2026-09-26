/**
 * AI TOKYO men's 池袋 ダッシュボード — AIチャットの中継役
 *
 * ダッシュボードのページから質問を受け取り、Cloudflare Workers AI に渡して、
 * 返ってきた答えをページに返します。
 *
 * ・AIのAPIキーは不要です（Cloudflare の中で完結するため）
 * ・合言葉（CHAT_TOKEN）を知っているページからしか使えません
 * ・決めたアドレス（ALLOW_ORIGIN）以外からは使えません
 */

const DEFAULT_MODEL = "@cf/openai/gpt-oss-120b";

const MAX_Q = 600;        // 質問文の上限（文字）
const MAX_CTX = 24000;    // 渡す数字データの上限（文字）
const MAX_TURNS = 6;      // さかのぼって覚えておく会話の数
const MAX_TOKENS = 1500; // 回答の長さの上限（考えている途中の分も含むため多めにとる）

const SYSTEM = `あなたは美容室「AI TOKYO men's 池袋」の店舗データを読み解くアシスタントです。
読むのは店長やスタイリストで、ITやデータ分析に詳しくない人もいます。

守ること:
- かならず日本語で答える。むずかしい言葉は使わず、短く読みやすくまとめる。
- 答えは「渡されたデータ」だけを根拠にする。データにない数字を作らない。
- データから読み取れないことを聞かれたら「このデータからは分かりません」と正直に言う。
- 金額は「1,234,567円」のように3桁区切りで書く。割合は小数第1位まで。
- データに書いてある割合（取得率・装着率・購入率など）は、そのまま引用する。
  自分で計算し直さない。計算し直すと違う数字になり、画面の表示と食い違う。
- 3〜6行程度か、箇条書き3〜5個にまとめる。前置きや挨拶はしない。
- 数字を並べるだけで終わらせず、「だから何をすればいいか」を最後に一言そえる。
- 集計途中の月は、途中であることを前提に話す。
- 税務・労務・法律・医療にあたる判断は断定しない。専門家への確認をすすめる。
- 特定のスタッフを責める書き方はしない。事実と改善策を書く。`;

const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

export default {
  async fetch(request, env) {
    const allow = String(env.ALLOW_ORIGIN || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get("Origin") || "";
    const okOrigin = allow.length === 0 || allow.includes(origin);

    const headers = {
      "Access-Control-Allow-Origin": okOrigin && origin ? origin : (allow[0] || "*"),
      "Access-Control-Allow-Headers": "content-type, authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return json({ e: "使い方が違います。" }, 405, headers);
    if (!okOrigin) return json({ e: "このページからは利用できません。" }, 403, headers);

    // 合言葉の確認（ページの暗号化された中身にだけ入っている）
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!env.CHAT_TOKEN || token !== env.CHAT_TOKEN) {
      return json({ e: "利用が許可されていません。ページを開き直してください。" }, 401, headers);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ e: "質問を読み取れませんでした。" }, 400, headers);
    }

    const q = String(body.q || "").trim().slice(0, MAX_Q);
    if (!q) return json({ e: "質問を入力してください。" }, 400, headers);

    const ctx = String(body.ctx || "").slice(0, MAX_CTX);
    const history = Array.isArray(body.history) ? body.history.slice(-MAX_TURNS) : [];

    const messages = [
      { role: "system", content: SYSTEM },
      { role: "system", content: `【いま画面に出ている数字】\n${ctx}` },
    ];
    for (const t of history) {
      const role = t && t.role === "assistant" ? "assistant" : "user";
      const content = String((t && t.content) || "").slice(0, 2000);
      if (content) messages.push({ role, content });
    }
    messages.push({ role: "user", content: q });

    const model = String(env.MODEL || DEFAULT_MODEL);

    try {
      const out = await env.AI.run(model, {
        messages,
        max_tokens: MAX_TOKENS,
        temperature: 0.3,
      });

      // モデルによって返ってくる形が違うので、どちらでも拾えるようにする
      let text = "";
      if (typeof out === "string") {
        text = out;
      } else if (out && typeof out.response === "string") {
        text = out.response;
      } else if (out && Array.isArray(out.choices) && out.choices[0]) {
        text = out.choices[0]?.message?.content ?? "";
      }
      // 考えている途中のメモが混ざることがあるので取り除く
      text = String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

      if (!text) return json({ e: "うまく答えられませんでした。聞き方を変えてみてください。" }, 502, headers);
      return json({ a: text }, 200, headers);
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      // 1日の無料枠を使い切ったとき
      if (/capacity|limit|quota|exceed|429/i.test(msg)) {
        return json({ e: "本日ぶんの利用枠を使い切りました。明日の朝9時にまた使えるようになります。" }, 429, headers);
      }
      return json({ e: "AIとの通信に失敗しました。少し時間をおいてお試しください。" }, 502, headers);
    }
  },
};
