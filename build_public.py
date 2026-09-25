# -*- coding: utf-8 -*-
"""公開用（GitHub Pages）の単体HTMLを書き出す。
   ダッシュボード本体は build_dashboard.py と同じ中身に、
   ページとして成立するための head を足しただけのもの。"""
import os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "public")
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
TAIL = "\n</body>\n</html>\n"


def main():
    subprocess.run([sys.executable, os.path.join(HERE, "build_dashboard.py")], check=True)
    body = open(os.path.join(HERE, "dashboard.html"), encoding="utf-8").read()
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(HEAD + "</head>\n<body>\n" + body + TAIL)
    with open(os.path.join(OUT_DIR, "robots.txt"), "w", encoding="utf-8") as f:
        f.write("User-agent: *\nDisallow: /\n")
    with open(os.path.join(OUT_DIR, ".nojekyll"), "w") as f:
        f.write("")
    size = os.path.getsize(os.path.join(OUT_DIR, "index.html"))
    print(f"公開用を書き出しました: {OUT_DIR}/index.html  ({size/1024:.0f}KB)")


if __name__ == "__main__":
    main()
