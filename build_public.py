# -*- coding: utf-8 -*-
"""公開用（GitHub Pages）の単体HTMLを書き出す。

環境変数 PAGE_PASSWORD が設定されていれば、ページの中身（数字の入った部分）を
その合言葉で暗号化する。合言葉を知らない人は、ページのソースを見ても数字を読めない。
"""
import base64, html, json, os, re, secrets, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "public")
ITERATIONS = 250_000

HEAD = """<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#f7f6f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#131418" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="ニュース">
<style>
:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0}img{max-width:100%}[hidden]{display:none!important}
</style>
"""

LOCK_CSS = """
<style>
body.locked{background:var(--paper)}
#site{font-family:var(--sans);color:var(--ink);min-height:100vh;
  display:flex;flex-direction:column}
#site a{color:inherit;text-decoration:none}
/* 上の帯 */
.nv{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--surface);
  border-bottom:1px solid var(--line)}
.nvin{max-width:1060px;margin:0 auto;padding:0 16px;height:56px;
  display:flex;align-items:center;justify-content:space-between;gap:14px}
.logo{display:flex;align-items:center;gap:8px;font-size:17px;font-weight:700;
  letter-spacing:-.02em;white-space:nowrap}
.logo i{width:9px;height:19px;border-radius:2px;background:#c0392b;display:block}
.logo em{font-style:normal;color:var(--ink3);font-weight:500;font-size:11px;
  letter-spacing:.14em;margin-left:3px}
.sbox{display:flex;align-items:center;gap:7px;background:var(--surface2);
  border:1px solid var(--line);border-radius:999px;padding:6px 13px;max-width:210px;
  transition:border-color .15s,box-shadow .15s}
.sbox:focus-within{border-color:var(--ink3);box-shadow:0 1px 5px rgba(0,0,0,.07);
  background:var(--surface)}
.sbox svg{flex:none;opacity:.42}
.sbox input{width:100%;min-width:0;font:inherit;font-size:16px;border:0;outline:0;
  background:none;color:var(--ink);-webkit-appearance:none;appearance:none}
.sbox input::-webkit-search-cancel-button{display:none}
.sbox input::placeholder{color:var(--ink3);font-size:12.5px}
/* カテゴリ */
.cats{max-width:1060px;margin:0 auto;padding:0 8px;display:flex;gap:2px;
  overflow-x:auto;scrollbar-width:none}
.cats::-webkit-scrollbar{display:none}
.cat{font:inherit;font-size:13px;font-weight:600;color:var(--ink2);background:none;
  border:0;border-bottom:2.5px solid transparent;padding:10px 13px;cursor:pointer;
  white-space:nowrap;min-height:40px}
.cat[aria-selected="true"]{color:#c0392b;border-bottom-color:#c0392b}
/* 中身 */
.page{flex:1;max-width:1060px;width:100%;margin:0 auto;padding:22px 16px 40px;
  display:grid;grid-template-columns:minmax(0,1fr) 274px;gap:34px;align-items:start}
.lead{display:block;padding-bottom:20px;border-bottom:1px solid var(--line)}
.lead h2{font-size:23px;line-height:1.5;margin:0 0 9px;font-weight:700;
  letter-spacing:-.01em;text-wrap:balance}
.lead:hover h2{color:#c0392b}
.arts{display:flex;flex-direction:column}
.art{display:flex;gap:14px;align-items:baseline;padding:15px 2px;
  border-bottom:1px solid var(--line2)}
.art h3{font-size:15px;line-height:1.65;margin:0;font-weight:600;flex:1}
.art:hover h3{color:#c0392b}
.art .no{font-size:12px;font-weight:700;color:var(--ink3);width:17px;flex:none;
  font-variant-numeric:tabular-nums}
.meta{font-size:11.5px;color:var(--ink3);margin-top:6px;display:flex;gap:9px;
  align-items:center;flex-wrap:wrap}
.meta b{font-weight:600;color:var(--ink2)}
.side h4{font-size:12px;font-weight:700;margin:0 0 4px;letter-spacing:.06em;
  color:var(--ink2);border-left:3px solid #c0392b;padding-left:8px}
.side .art{gap:10px;padding:12px 2px}
.side .art h3{font-size:13px;line-height:1.6;font-weight:500}
.res{grid-column:1/-1;font-size:13.5px;color:var(--ink2);line-height:1.9;
  background:var(--surface);border:1px solid var(--line);border-radius:10px;
  padding:16px 18px;margin-bottom:4px}
.res b{color:var(--ink)}
.res ul{margin:7px 0 0;padding-left:20px}
.ft{border-top:1px solid var(--line);background:var(--surface2);
  padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px));font-size:11.5px;
  color:var(--ink3);line-height:1.9}
.ftin{max-width:1060px;margin:0 auto;display:flex;gap:16px;flex-wrap:wrap;
  justify-content:space-between}
.ft nav{display:flex;gap:15px;flex-wrap:wrap}
@media(max-width:860px){
  .page{grid-template-columns:minmax(0,1fr);gap:26px}
  .side{border-top:1px solid var(--line);padding-top:18px}
  .lead h2{font-size:20px}
  .sbox{max-width:150px}
  .logo em{display:none}
}
</style>
"""

SITE_HTML = """
<div id="site">
  <header class="nv">
    <div class="nvin">
      <a class="logo" href="#"><i></i>ニュースダイジェスト<em>JP</em></a>
      <form id="lockform" class="sbox" role="search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle>
          <path d="M20 20l-3.6-3.6"></path></svg>
        <input id="pw" type="search" placeholder="記事を検索" aria-label="記事を検索"
               autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
      </form>
    </div>
    <nav class="cats" id="cats" aria-label="カテゴリ">__CATS__</nav>
  </header>
  <main class="page">
    <div class="res" id="err" role="status" hidden></div>
    <div id="feed"></div>
    <aside class="side" id="side"></aside>
  </main>
  <footer class="ft"><div class="ftin">
    <nav><span>利用規約</span><span>プライバシー</span><span>広告について</span>
      <span>お問い合わせ</span></nav>
    <span>見出しは各提供元の配信によるものです。本文は提供元のページでご覧ください。</span>
  </div></footer>
</div>
<script id="nd" type="application/json">__NEWS__</script>
"""

GATE_JS = """
<script>
(function () {
  const S = "__CIPHER__";
  const NEWS = JSON.parse(document.getElementById('nd').textContent);
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const KEY = "ikebukuro-kpi-pass";
  const site = document.getElementById('site');
  const err = document.getElementById('err');
  const feed = document.getElementById('feed');
  const esc = s => String(s).replace(/[&<>"]/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  // 「◯分前」を、開いた時刻から計算する
  function ago(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return 'たった今';
    if (m < 60) return m + '分前';
    const h = Math.round(m / 60);
    if (h < 24) return h + '時間前';
    return Math.round(h / 24) + '日前';
  }

  const cats = Object.keys(NEWS.cats);
  let cat = cats[0];

  function row(a, i) {
    return `<a class="art" href="${esc(a.u)}" target="_blank" rel="noopener noreferrer">
      ${i ? `<span class="no">${i}</span>` : ''}
      <div><h3>${esc(a.t)}</h3>
      <div class="meta"><b>${esc(a.s)}</b><span>${ago(a.d)}</span></div></div></a>`;
  }

  function draw() {
    const list = NEWS.cats[cat] || [];
    const top = list[0];
    const rest = list.slice(1);
    // 横の欄には、いま開いていない分野から拾う
    const others = cats.filter(c => c !== cat)
      .flatMap(c => (NEWS.cats[c] || []).slice(0, 2)).slice(0, 7);
    feed.innerHTML =
      (top ? `<a class="lead" href="${esc(top.u)}" target="_blank" rel="noopener noreferrer">
        <h2>${esc(top.t)}</h2>
        <div class="meta"><b>${esc(top.s)}</b><span>${ago(top.d)}</span></div></a>` : '')
      + `<div class="arts">${rest.map(a => row(a, 0)).join('')}</div>`;
    const side = document.getElementById('side');
    side.innerHTML = `<h4>よく読まれている記事</h4>
      <div class="arts">${others.map((a, i) => row(a, i + 1)).join('')}</div>`;
    document.querySelectorAll('.cat').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.c === cat)));
  }

  document.getElementById('cats').addEventListener('click', ev => {
    const b = ev.target.closest('.cat');
    if (!b) return;
    cat = b.dataset.c; err.hidden = true; draw();
    window.scrollTo({top: 0, behavior: 'instant'});
  });

  async function decrypt(pw) {
    const enc = JSON.parse(S);
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw),
      'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      {name: 'PBKDF2', salt: b64(enc.s), iterations: enc.n, hash: 'SHA-256'},
      base, {name: 'AES-GCM', length: 256}, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: b64(enc.i)}, key, b64(enc.c));
    return new TextDecoder().decode(plain);
  }

  function start(bundle) {
    const b = JSON.parse(bundle);
    document.body.insertAdjacentHTML('beforeend', b.w);
    const p = document.createElement('script');
    p.id = 'payload'; p.type = 'application/json'; p.textContent = b.p;
    document.body.appendChild(p);
    (0, eval)(b.c);
    document.body.classList.remove('locked');
    site.remove();
    if (b.t) { document.title = b.t; }
  }

  async function tryOpen(pw, fromSaved) {
    try {
      start(await decrypt(pw));
      try { localStorage.setItem(KEY, pw); } catch (e) {}
      return true;
    } catch (e) {
      if (!fromSaved) {
        const q = document.getElementById('pw').value;
        err.hidden = false;
        err.innerHTML = `<b>「${esc(q)}」に一致する記事は見つかりませんでした。</b>
          <ul><li>キーワードに誤字・脱字がないか確認してください。</li>
          <li>別のキーワードをお試しください。</li>
          <li>検索できるのは過去30日以内の記事です。</li></ul>`;
      }
      try { if (fromSaved) localStorage.removeItem(KEY); } catch (e2) {}
      return false;
    }
  }

  document.getElementById('lockform').addEventListener('submit', async ev => {
    ev.preventDefault();
    const inp = document.getElementById('pw');
    err.hidden = true;
    inp.blur();
    await tryOpen(inp.value, false);
  });

  draw();
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved) { tryOpen(saved, true); }
})();
</script>
"""


def news_html():
    """cache/news.json を読んで、ニュースページの見た目を組み立てる"""
    try:
        cats = json.load(open(os.path.join(HERE, "cache", "news.json"),
                              encoding="utf-8")).get("cats") or {}
    except Exception:
        cats = {}
    if not cats:
        cats = {"主要": [{"t": "ただいま記事を取得できませんでした。時間をおいてご覧ください。",
                          "u": "#", "s": "編集部", "d": ""}]}
    tabs = "".join(
        '<button class="cat" type="button" data-c="%s" aria-selected="%s">%s</button>'
        % (html.escape(c), "true" if i == 0 else "false", html.escape(c))
        for i, c in enumerate(cats))
    data = json.dumps({"cats": cats}, ensure_ascii=False).replace("</", "<\\/")
    return SITE_HTML.replace("__CATS__", tabs).replace("__NEWS__", data)


def encrypt(plaintext, password):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
    salt, iv = secrets.token_bytes(16), secrets.token_bytes(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt,
                     iterations=ITERATIONS).derive(password.encode("utf-8"))
    ct = AESGCM(key).encrypt(iv, plaintext.encode("utf-8"), None)
    b = lambda x: base64.b64encode(x).decode()
    return json.dumps({"v": 1, "n": ITERATIONS, "s": b(salt), "i": b(iv), "c": b(ct)})


def main():
    subprocess.run([sys.executable, os.path.join(HERE, "build_dashboard.py")], check=True)
    body = open(os.path.join(HERE, "dashboard.html"), encoding="utf-8").read()
    pw = os.environ.get("PAGE_PASSWORD", "").strip()

    if pw:
        m = re.search(r'<script id="payload" type="application/json">\s*(.*?)\s*</script>',
                      body, re.S)
        if not m:
            raise SystemExit("payload が見つかりません")
        payload_json = m.group(1)
        rest = body[:m.start()] + body[m.end():]

        m2 = re.search(r"<script>\s*(.*?)\s*</script>\s*$", rest, re.S)
        if not m2:
            raise SystemExit("アプリのコードが見つかりません")
        app_code = m2.group(1)
        rest = rest[:m2.start()] + rest[m2.end():]

        # 見出しやスタイルを除いた「画面そのもの」を取り出す。
        # 左のメニューは .wrap の外にあるので、そこから丸ごと含める
        # （含めないとメニューの項目名がページのソースに残ってしまう）。
        m3 = re.search(r'(<nav id="menu".*</div>)', rest, re.S)
        if not m3:
            raise SystemExit("画面の中身が見つかりません")
        wrap_html = m3.group(1)
        head_part = rest[:m3.start()]      # <title> と <style> だけが残る

        mt = re.search(r"<title>(.*?)</title>", head_part, re.S)
        bundle = json.dumps({"w": wrap_html, "p": payload_json, "c": app_code,
                             "t": mt.group(1) if mt else ""}, ensure_ascii=False)
        cipher = encrypt(bundle, pw).replace("\\", "\\\\").replace('"', '\\"')
        head_part = re.sub(r"<title>.*?</title>", "<title>ニュースダイジェスト</title>",
                           head_part, count=1, flags=re.S)
        body = (head_part + LOCK_CSS + news_html()
                + GATE_JS.replace("__CIPHER__", cipher))
        body = '<script>document.body.className="locked"</' + 'script>' + body
        mode = f"合言葉つき（{ITERATIONS:,}回の鍵伸長 + AES-GCM／画面ごと暗号化）"
    else:
        mode = "合言葉なし（PAGE_PASSWORD が未設定）"

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(HEAD + "</head>\n<body>\n" + body + "\n</body>\n</html>\n")
    with open(os.path.join(OUT_DIR, "robots.txt"), "w", encoding="utf-8") as f:
        f.write("User-agent: *\nDisallow: /\n")
    with open(os.path.join(OUT_DIR, ".nojekyll"), "w") as f:
        f.write("")
    size = os.path.getsize(os.path.join(OUT_DIR, "index.html"))
    print(f"公開用を書き出しました: {mode}  ({size/1024:.0f}KB)")


if __name__ == "__main__":
    main()
