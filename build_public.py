# -*- coding: utf-8 -*-
"""公開用（GitHub Pages）の単体HTMLを書き出す。

環境変数 PAGE_PASSWORD が設定されていれば、ページの中身（数字の入った部分）を
その合言葉で暗号化する。合言葉を知らない人は、ページのソースを見ても数字を読めない。
"""
import base64, json, os, re, secrets, subprocess, sys

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
<meta name="apple-mobile-web-app-title" content="Sagasu">
<style>
:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0}img{max-width:100%}[hidden]{display:none!important}
</style>
"""

LOCK_CSS = """
<style>
body.locked{background:var(--surface)}
body.locked .wrap{display:none}
#lock{min-height:82vh;display:flex;flex-direction:column;align-items:center;
  justify-content:center;padding:32px 20px;font-family:var(--sans);color:var(--ink)}
#lock .mark{font-size:44px;font-weight:700;letter-spacing:-.045em;margin-bottom:26px;
  display:flex;align-items:center;gap:2px}
#lock .mark span:nth-child(1){color:#4a7fd4}
#lock .mark span:nth-child(2){color:#d9a13b}
#lock .mark span:nth-child(3){color:#4a7fd4}
#lock .mark span:nth-child(4){color:#57a86e}
#lock .mark span:nth-child(5){color:#d9a13b}
#lock .mark span:nth-child(6){color:#c25b4e}
#lock form{width:100%;max-width:540px}
#lock .field{display:flex;align-items:center;gap:11px;border:1px solid var(--line);
  border-radius:26px;padding:11px 19px;background:var(--surface);
  box-shadow:0 1px 5px rgba(0,0,0,.06);transition:box-shadow .15s}
#lock .field:focus-within{box-shadow:0 1px 9px rgba(0,0,0,.14);border-color:transparent}
#lock .field svg{flex:none;opacity:.45}
#lock input{flex:1;font:inherit;font-size:16px;border:0;outline:0;background:none;color:var(--ink);
  min-height:26px}
#lock .btns{display:flex;gap:11px;justify-content:center;margin-top:26px;flex-wrap:wrap}
#lock button{font:inherit;font-size:13.5px;padding:10px 19px;border:1px solid var(--line2);
  border-radius:5px;background:var(--surface2);color:var(--ink2);cursor:pointer;min-height:40px}
#lock button:hover{border-color:var(--line);box-shadow:0 1px 3px rgba(0,0,0,.08);color:var(--ink)}
#lock .res{width:100%;max-width:600px;margin-top:30px;font-size:13.5px;color:var(--ink2);
  line-height:1.9;min-height:24px}
#lock .res b{color:var(--ink)}
#lock .res ul{margin:8px 0 0;padding-left:20px}
#lock .foot{position:fixed;left:0;right:0;bottom:0;padding:13px 20px;background:var(--surface2);
  border-top:1px solid var(--line2);font-size:11.5px;color:var(--ink3);
  display:flex;gap:18px;justify-content:center;flex-wrap:wrap}
#lock .foot span{cursor:default}
@media(max-width:560px){#lock .mark{font-size:36px}#lock{min-height:78vh}}
</style>
"""

LOCK_HTML = """
<div id="lock">
  <div class="mark" aria-hidden="true">
    <span>S</span><span>a</span><span>g</span><span>a</span><span>s</span><span>u</span>
  </div>
  <form id="lockform" role="search">
    <div class="field">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle>
        <path d="M20 20l-3.5-3.5"></path></svg>
      <input id="pw" type="text" autocomplete="off" autocapitalize="off" autocorrect="off"
             spellcheck="false" aria-label="検索" autofocus>
    </div>
    <div class="btns">
      <button id="go" type="submit">検索</button>
      <button type="button" id="lucky">今日の天気</button>
    </div>
  </form>
  <div class="res" id="err" role="status"></div>
  <div class="foot"><span>ヘルプ</span><span>設定</span><span>プライバシー</span><span>規約</span></div>
</div>
"""

GATE_JS = """
<script>
(function () {
  const S = "__CIPHER__";
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const KEY = "ikebukuro-kpi-pass";
  const lock = document.getElementById('lock');
  const err = document.getElementById('err');
  const btn = document.getElementById('go');

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
    lock.remove();
    if (b.t) { document.title = b.t; }
  }

  async function tryOpen(pw, fromSaved) {
    try {
      const json = await decrypt(pw);
      try { localStorage.setItem(KEY, pw); } catch (e) {}
      start(json);
      return true;
    } catch (e) {
      if (!fromSaved) {
        const q = document.getElementById('pw').value;
        err.innerHTML = `<b>${q.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</b>
          に一致する情報は見つかりませんでした。
          <ul><li>キーワードに誤字・脱字がないか確認します。</li>
          <li>別のキーワードを試します。</li>
          <li>もっと一般的なキーワードに変えてみます。</li></ul>`;
      }
      try { if (fromSaved) localStorage.removeItem(KEY); } catch (e2) {}
      return false;
    }
  }

  document.getElementById('lockform').addEventListener('submit', async ev => {
    ev.preventDefault();
    err.textContent = ''; btn.disabled = true; btn.textContent = '検索中…';
    await tryOpen(document.getElementById('pw').value, false);
    btn.disabled = false; btn.textContent = '検索';
  });

  const lucky = document.getElementById('lucky');
  if (lucky) lucky.addEventListener('click', () => {
    err.innerHTML = '<b>今日の天気</b> — ただいま情報を取得できませんでした。'
      + '時間をおいてもう一度お試しください。';
  });

  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved) { tryOpen(saved, true); }
})();
</script>
"""


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
        head_part = re.sub(r"<title>.*?</title>", "<title>Sagasu</title>",
                           head_part, count=1, flags=re.S)
        body = (head_part + LOCK_CSS + LOCK_HTML
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
