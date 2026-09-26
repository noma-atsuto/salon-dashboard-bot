# -*- coding: utf-8 -*-
"""月別売上集計と、月ごとの稼働人数を数年分取得する。

繁忙期・閑散期の傾向を出すために使う。売上や客数はスタッフの人数にも左右されるので、
「1名あたりの客数」で見られるよう、稼働人数もあわせて取る。
"""
import calendar, datetime, io, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bm_config as config
import pandas as pd
from bm_client import BeautyMeritClient

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
YEARS_BACK = 3
TODAY = datetime.date.today()


def main():
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, "monthly.csv")
    client = BeautyMeritClient(config.BM_BASE_URL, config.BM_LOGIN_ID, config.BM_PASSWORD)
    client.login()
    frames = []
    for y in range(TODAY.year - YEARS_BACK, TODAY.year + 1):
        em = TODAY.month if y == TODAY.year else 12
        p = {"action": "aggregate", "target": "month", "start_year": str(y), "start_month": "1",
             "end_year": str(y), "end_month": str(em), "shop_user_type": "1",
             "shop_user_id": "", "by_payment": "0", "csv": "CSVダウンロード"}
        txt = client._get("/manage/account/analysis/", params=p).content.decode("cp932", "replace")
        if not txt.lstrip().startswith("年月"):
            print(f"[{y}] 取得できませんでした", flush=True)
            continue
        frames.append(pd.read_csv(io.StringIO(txt)))
        print(f"[{y}] 取得しました", flush=True)
    if not frames:
        raise SystemExit("月別売上集計を取得できませんでした")
    df = pd.concat(frames, ignore_index=True)
    tmp = path + ".tmp"
    df.to_csv(tmp, index=False, encoding="utf-8")
    os.replace(tmp, path)
    print(f"月別売上集計 {len(df)}ヶ月分を保存しました", flush=True)
    fetch_headcount(client, df)


EXCLUDE = {"AI TOKYO STYLE", "AI TOKYO 運営チーム", "フリー", "吉田周人 [池袋]"}


def fetch_headcount(client, monthly):
    """月ごとの稼働人数（その月に20人以上担当したスタッフの数）"""
    path = os.path.join(CACHE, "headcount.csv")
    rows, per = [], []
    for ym in monthly["年月"]:
        m = str(ym)
        y, mo = int(m[:4]), int(m[5:7])
        if datetime.date(y, mo, 1) > TODAY.replace(day=1):
            continue
        last = calendar.monthrange(y, mo)[1]
        p = {"action": "aggregate", "target": "stylist",
             "start_date": f"{y}-{mo:02d}-01", "end_date": f"{y}-{mo:02d}-{last}",
             "shop_user_type": "1", "csv": "CSVダウンロード"}
        txt = client._get("/manage/account/analysis/", params=p).content.decode("cp932", "replace")
        if not txt.lstrip().startswith("スタッフ"):
            continue
        df = pd.read_csv(io.StringIO(txt))
        df = df[~df["スタッフ"].astype(str).str.strip().isin(EXCLUDE)]
        df["総客数"] = pd.to_numeric(df["総客数"], errors="coerce").fillna(0)
        rows.append({"年月": f"{y}-{mo:02d}", "年": y, "月": mo,
                     "稼働": int((df["総客数"] >= 20).sum()),
                     "客数": int(df["総客数"].sum())})
        # スタイリストごとの月次（折れ線グラフ用）
        for _, r in df.iterrows():
            if float(r.get("総客数") or 0) < 20:
                continue
            per.append({"年月": f"{y}-{mo:02d}",
                        "スタッフ": str(r["スタッフ"]).strip(),
                        "総売上": _num(r.get("総売上")), "純売上": _num(r.get("純売上")),
                        "客数": int(_num(r.get("総客数"))), "客単価": _num(r.get("客単価"))})
    if rows:
        out = pd.DataFrame(rows)
        tmp = path + ".tmp"
        out.to_csv(tmp, index=False, encoding="utf-8")
        os.replace(tmp, path)
        print(f"稼働人数 {len(out)}ヶ月分を保存しました", flush=True)
    if per:
        p2 = os.path.join(CACHE, "stylist_monthly.csv")
        out2 = pd.DataFrame(per)
        tmp2 = p2 + ".tmp"
        out2.to_csv(tmp2, index=False, encoding="utf-8")
        os.replace(tmp2, p2)
        print(f"スタイリスト別の月次 {len(out2)}行を保存しました", flush=True)


def _num(v):
    try:
        f = float(v)
        return 0.0 if f != f else f
    except (TypeError, ValueError):
        return 0.0


if __name__ == "__main__":
    main()
