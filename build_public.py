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
<meta name="apple-mobile-web-app-title" content="池袋店の数字">
<style>
:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0}img{max-width:100%}[hidden]{display:none!important}
</style>
"""

LOCK_CSS = """
<style>
body.locked .wrap{display:none}
#lock{max-width:380px;margin:0 auto;padding:56px 20px 40px;font-family:var(--sans);color:var(--ink)}
#lock h1{font-size:19px;margin:0 0 4px;font-weight:700}
#lock p{font-size:13px;color:var(--ink2);margin:0 0 22px;line-height:1.7}
#lock form{display:flex;flex-direction:column;gap:10px}
#lock input{font:inherit;font-size:16px;padding:13px 14px;border-radius:11px;
  border:1px solid var(--line);background:var(--surface);color:var(--ink);min-height:48px}
#lock input:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
#lock button{font:inherit;font-size:15px;font-weight:700;padding:13px;border:0;border-radius:11px;
  background:var(--accent);color:#fff;cursor:pointer;min-height:48px}
#lock button:disabled{opacity:.55;cursor:default}
#lock .err{font-size:13px;color:var(--warn);min-height:20px;font-weight:600}
#lock .note{font-size:11.5px;color:var(--ink3);margin-top:20px;line-height:1.7}
</style>
"""

LOCK_HTML = """
<div id="lock">
  <h1>池袋店の数字</h1>
  <p>店舗とスタイリストの実績が入っています。<br>合言葉を入力してください。</p>
  <form id="lockform">
    <input id="pw" type="password" inputmode="text" autocomplete="current-password"
           placeholder="合言葉" aria-label="合言葉" autofocus>
    <button id="go" type="submit">開く</button>
    <div class="err" id="err" role="status"></div>
  </form>
  <p class="note">一度入力すると、この端末では次回から省略されます。<br>
    合言葉を知らない方には内容が表示されません。</p>
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

  function start(json) {
    const p = document.createElement('script');
    p.id = 'payload'; p.type = 'application/json'; p.textContent = json;
    document.body.appendChild(p);
    const code = document.getElementById('appcode').textContent;
    (0, eval)(code);
    document.body.classList.remove('locked');
    lock.remove();
  }

  async function tryOpen(pw, fromSaved) {
    try {
      const json = await decrypt(pw);
      try { localStorage.setItem(KEY, pw); } catch (e) {}
      start(json);
      return true;
    } catch (e) {
      if (!fromSaved) { err.textContent = '合言葉が違うようです。'; }
      try { if (fromSaved) localStorage.removeItem(KEY); } catch (e2) {}
      return false;
    }
  }

  document.getElementById('lockform').addEventListener('submit', async ev => {
    ev.preventDefault();
    err.textContent = ''; btn.disabled = true; btn.textContent = '確認中…';
    await tryOpen(document.getElementById('pw').value, false);
    btn.disabled = false; btn.textContent = '開く';
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
        body = body[:m.start()] + body[m.end():]

        m2 = re.search(r"<script>\s*(.*?)\s*</script>\s*$", body, re.S)
        if not m2:
            raise SystemExit("アプリのコードが見つかりません")
        app_code = m2.group(1)
        body = body[:m2.start()] + body[m2.end():]

        gate = GATE_JS.replace("__CIPHER__",
                               encrypt(payload_json, pw).replace("\\", "\\\\").replace('"', '\\"'))
        body = (LOCK_CSS + LOCK_HTML + body
                + '<script id="appcode" type="text/plain">' + app_code + "</script>" + gate)
        body = '<script>document.body.className="locked"</script>' + body
        mode = f"合言葉つき（{ITERATIONS:,}回の鍵伸長 + AES-GCM）"
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
