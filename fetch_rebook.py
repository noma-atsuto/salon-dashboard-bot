# -*- coding: utf-8 -*-
"""「次回予約」を、打った（入力した）月ごとに取得する。

会計データから分かるのは「次回予約で実際に来店した分」だけ。
こちらは予約一覧を作成日で絞り、その月に何件打ったかと、
そのうち何件が実際に来店・会計したかを追う。
"""
import calendar, datetime, math, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bm_config as config
import pandas as pd
from bm_client import BeautyMeritClient
from bs4 import BeautifulSoup

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
ROUTE_REBOOK = "8"        # 予約経路「次回予約」
PAGE_SIZE = 20
TODAY = datetime.date.today()


def target_months(back=6):
    out, y, m = [], TODAY.year, TODAY.month
    for _ in range(back):
        out.append((y, m))
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return list(reversed(out))


def _rows(soup):
    for t in soup.find_all("table"):
        head = t.find("tr")
        if not head or "予約経路" not in head.get_text():
            continue
        out = []
        for tr in t.find_all("tr")[1:]:
            c = tr.find_all("td")
            if len(c) < 10:
                continue
            txt = lambda i: c[i].get_text(" ", strip=True)
            out.append({
                "予約番号": txt(1).split()[0] if txt(1) else "",
                "会計済": "会計済" in txt(1),
                "ステータス": txt(2),
                "打った日時": txt(3),
                "来店日時": txt(4),
                "スタッフ": txt(6),
            })   # お客様名は取り込まない
        return out
    return []


def fetch_month(client, y, m):
    last = calendar.monthrange(y, m)[1]
    end = min(datetime.date(y, m, last), TODAY)
    base = {"created_start": f"{y}-{m:02d}-01", "created_end": end.isoformat(),
            "route": ROUTE_REBOOK, "date_start": "", "date_end": "",
            "status": "", "site_id": "0", "search": "検索"}
    first = client._get("/manage/user/", params={**base, "page": 1})
    soup = BeautifulSoup(first.text, "html.parser")
    mt = re.search(r"検索結果[：:]\s*([0-9,]+)\s*件", soup.get_text())
    total = int(mt.group(1).replace(",", "")) if mt else 0
    rows = _rows(soup)
    for page in range(2, max(1, math.ceil(total / PAGE_SIZE)) + 1):
        s2 = BeautifulSoup(client._get("/manage/user/", params={**base, "page": page}).text,
                           "html.parser")
        rows += _rows(s2)
    return total, rows


def main():
    os.makedirs(CACHE, exist_ok=True)
    months = target_months()
    refresh = {months[-1], months[-2]} if len(months) > 1 else set(months)
    client = None
    for y, m in months:
        path = os.path.join(CACHE, f"rebook_{y}-{m:02d}.csv")
        if os.path.exists(path) and "--force" not in sys.argv and (y, m) not in refresh:
            print(f"[{y}-{m:02d}] 次回予約：取得済み（スキップ）", flush=True)
            continue
        if client is None:
            client = BeautyMeritClient(config.BM_BASE_URL, config.BM_LOGIN_ID, config.BM_PASSWORD)
            client.login()
        total, rows = fetch_month(client, y, m)
        df = pd.DataFrame(rows, columns=["予約番号", "会計済", "ステータス", "打った日時",
                                         "来店日時", "スタッフ"])
        df.insert(0, "月", f"{y}-{m:02d}")
        tmp = path + ".tmp"
        df.to_csv(tmp, index=False, encoding="utf-8")
        os.replace(tmp, path)
        print(f"[{y}-{m:02d}] 次回予約 {total}件を取得", flush=True)
    keep = {f"rebook_{y}-{m:02d}.csv" for y, m in months}
    for f in os.listdir(CACHE):
        if f.startswith("rebook_") and f.endswith(".csv") and f not in keep:
            os.remove(os.path.join(CACHE, f))
    print("次回予約の取得を完了", flush=True)


if __name__ == "__main__":
    main()
