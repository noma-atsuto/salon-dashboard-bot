# -*- coding: utf-8 -*-
"""シフト設定から、スタイリストごとの出勤日／休日を取得する。

予約枠を開けている日を「出勤」、閉じている日を「休日」として数える。
（画面の色分けで「休日」になっているセルが休み）
"""
import calendar, datetime, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bm_config as config
import pandas as pd
from bm_client import BeautyMeritClient
from bs4 import BeautifulSoup

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
TODAY = datetime.date.today()


def target_months(back=6):
    out, y, m = [], TODAY.year, TODAY.month
    for _ in range(back):
        out.append((y, m))
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return list(reversed(out))


def parse(html):
    """[スタッフ, 日, 出勤かどうか] の一覧にする"""
    soup = BeautifulSoup(html, "html.parser")
    grid = None
    for t in soup.find_all("table"):
        rows = t.find_all("tr")
        if len(rows) > 5 and len(t.find_all(["td", "th"])) > 100:
            grid = t
            break
    if grid is None:
        return []
    rows = grid.find_all("tr")
    # 見出しから日にちを読む（「1 (火)」の形）
    days = []
    for cell in rows[0].find_all(["th", "td"])[1:]:
        m = re.match(r"\s*(\d+)", cell.get_text(" ", strip=True))
        days.append(int(m.group(1)) if m else None)
    out = []
    for tr in rows[1:]:
        cells = tr.find_all(["th", "td"])
        if len(cells) < 2:
            continue
        name = cells[0].get_text(" ", strip=True)
        if not name:
            continue
        for i, td in enumerate(cells[1:]):
            if i >= len(days) or days[i] is None:
                continue
            sp = td.find("span")
            cls = " ".join(sp.get("class", [])) if sp else ""
            txt = sp.get_text(strip=True) if sp else td.get_text(strip=True)
            holiday = ("colHoliday" in cls) or (txt.startswith("休"))
            out.append({"スタッフ": name, "日": days[i], "出勤": not holiday})
    return out


def main():
    """シフト設定は「当月と、それ以降の月」しか表示できない（過去は見られない）。
    そのため毎日ここで当月分を記録し、月をまたいでも残るようにしている。
    過去に記録したファイルは消さない（あとから取り直せないため）。"""
    os.makedirs(CACHE, exist_ok=True)
    client = BeautyMeritClient(config.BM_BASE_URL, config.BM_LOGIN_ID, config.BM_PASSWORD)
    client.login()
    y, m = TODAY.year, TODAY.month
    for _ in range(2):           # 当月と翌月
        html = client._get("/manage/setting/shift/", params={"ym": f"{y}-{m:02d}"}).text
        soup = BeautifulSoup(html, "html.parser")
        hid = soup.find("input", {"name": "curr_ym"})
        got = hid.get("value") if hid else f"{y}-{m:02d}"
        rows = parse(html)
        if not rows:
            print(f"[{got}] シフトを読み取れませんでした", flush=True)
        else:
            df = pd.DataFrame(rows, columns=["スタッフ", "日", "出勤"])
            df.insert(0, "月", got)
            path = os.path.join(CACHE, f"shift_{got}.csv")
            tmp = path + ".tmp"
            df.to_csv(tmp, index=False, encoding="utf-8")
            os.replace(tmp, path)
            print(f"[{got}] シフト {len(df)}マス（出勤 {int(df['出勤'].sum())}）を記録", flush=True)
        m += 1
        if m == 13:
            y, m = y + 1, 1
    print("シフトの記録を完了", flush=True)


if __name__ == "__main__":
    main()
