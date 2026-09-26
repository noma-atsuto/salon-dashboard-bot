# -*- coding: utf-8 -*-
"""ダミーのニュースページ用に、実際のニュース見出しを取ってくる。

Googleニュースの RSS（鍵も登録も不要）から見出しだけを取り、cache/news.json に貯める。
取得に失敗したときは、前回取れたものをそのまま残す（ページが真っ白にならないように）。
"""
import json, os, re, sys, urllib.request, xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "cache", "news.json")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36"

BASE = "https://news.google.com/rss"
Q = "hl=ja&gl=JP&ceid=JP:ja"
FEEDS = [
    ("主要",        f"{BASE}?{Q}"),
    ("国内",        f"{BASE}/headlines/section/topic/NATION?{Q}"),
    ("経済",        f"{BASE}/headlines/section/topic/BUSINESS?{Q}"),
    ("テクノロジー", f"{BASE}/headlines/section/topic/TECHNOLOGY?{Q}"),
    ("スポーツ",    f"{BASE}/headlines/section/topic/SPORTS?{Q}"),
    ("エンタメ",    f"{BASE}/headlines/section/topic/ENTERTAINMENT?{Q}"),
]
PER_FEED = 14


def clean(title, source):
    """「見出し - 出典名」の末尾の出典を落とす（出典は別で出すため）"""
    t = re.sub(r"\s+", " ", (title or "").strip())
    if source:
        t = re.sub(r"\s*[-–—]\s*" + re.escape(source) + r"\s*$", "", t)
    return re.sub(r"\s*[-–—]\s*[^-–—]{2,20}$", "", t) if t.endswith(("ニュース", "新聞")) else t


def grab(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    root = ET.fromstring(urllib.request.urlopen(req, timeout=25).read())
    out = []
    for it in root.findall(".//item")[:PER_FEED]:
        src = it.find("{*}source")
        if src is None:
            src = it.find("source")
        source = (src.text or "").strip() if src is not None else ""
        title = clean(it.findtext("title"), source)
        link = (it.findtext("link") or "").strip()
        when = ""
        try:
            when = parsedate_to_datetime(it.findtext("pubDate")).astimezone().isoformat()
        except Exception:
            pass
        if title and link:
            out.append({"t": title, "u": link, "s": source or "提供元", "d": when})
    return out


def main():
    old = {}
    if os.path.exists(OUT):
        try:
            old = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            old = {}

    cats, ok = {}, 0
    for name, url in FEEDS:
        try:
            items = grab(url)
            if items:
                cats[name] = items
                ok += 1
                print(f"[{name}] {len(items)}件")
            else:
                raise ValueError("0件")
        except Exception as e:
            keep = (old.get("cats") or {}).get(name)
            print(f"[{name}] 取得できず（{type(e).__name__}）" + ("／前回分を残します" if keep else ""))
            if keep:
                cats[name] = keep

    if not cats:
        print("ニュースをひとつも取れませんでした。前回のファイルをそのまま残します。")
        return 0 if old else 1

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"cats": cats}, f, ensure_ascii=False)
    total = sum(len(v) for v in cats.values())
    print(f"保存: {OUT}  （{len(cats)}カテゴリ／{total}件／新しく取れたのは {ok} カテゴリ）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
