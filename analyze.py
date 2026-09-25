# -*- coding: utf-8 -*-
"""売上明細から、スタイリスト個人・店舗全体の指標を組み立てる。

明細の構造
  区分 = 技術 / 商品 / その他
    技術  … メニュー・クーポン・割引クーポン
    商品  … 店販
    その他 … 指名料・利用ポイント
"""
import collections, glob, os, re
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
EXCLUDE = {"AI TOKYO STYLE", "AI TOKYO 運営チーム", "フリー"}
TREAT = ("トリートメント", "AI me 3STEP", "ディープレイヤー")
RETURN_DAYS = 75          # 新規が「戻ってきた」と見なす日数


def load():
    frames = []
    for p in sorted(glob.glob(os.path.join(CACHE, "detail_*.csv"))):
        frames.append(pd.read_csv(p))
    if not frames:
        raise SystemExit("cache に明細がありません。fetch_detail.py を先に実行してください。")
    df = pd.concat(frames, ignore_index=True)
    for c in ("金額", "単価", "個数"):
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
    df["来店日"] = pd.to_datetime(df["来店日"], errors="coerce")
    df["施術担当者"] = df["施術担当者"].fillna("").astype(str).str.strip()
    df["項目名"] = df["項目名"].fillna("").astype(str)
    return df


def _slice(d):
    """区分ごとの金額をまとめる"""
    tech = d[(d["区分"] == "技術")]
    goods = d[d["区分"] == "商品"]
    other = d[d["区分"] == "その他"]
    menu = tech[tech["カテゴリ"].isin(["メニュー", "クーポン"])]["金額"].sum()
    disc = tech[tech["カテゴリ"] == "割引クーポン"]["金額"].sum()
    nomi = other[other["カテゴリ"] == "その他"]["金額"].sum()
    point = other[other["カテゴリ"] == "ポイント"]["金額"].sum()
    g = goods["金額"].sum()
    return {
        "tech": float(menu), "discount": float(disc), "goods": float(g),
        "nominate_fee": float(nomi), "points": float(-point),
        "net": float(menu + disc + g + nomi + point),
        "goods_items": int(goods["個数"].sum()),
    }


def _bills(d):
    """会計（お客様1回）単位の情報"""
    b = d.drop_duplicates("会計ID")
    return b


def _metrics(d, all_df=None, month=None):
    m = _slice(d)
    b = _bills(d)
    n = len(b)
    m["customers"] = n
    # 店販：買ったお客様が何人いて、その方はいくら使ったか
    gd = d[d["区分"] == "商品"]
    buyers = int(gd["会計ID"].nunique())
    m["goods_buyers"] = buyers
    m["goods_buy_rate"] = buyers / n * 100 if n else 0.0
    m["goods_per_buyer"] = m["goods"] / buyers if buyers else 0.0
    m["goods_per_item"] = m["goods"] / m["goods_items"] if m["goods_items"] else 0.0
    m["new"] = int((b["新規再来"] == "新規").sum())
    m["repeat"] = int((b["新規再来"] == "再来").sum())
    m["avg"] = m["net"] / n if n else 0.0
    m["new_rate"] = m["new"] / n * 100 if n else 0.0
    m["repeat_rate"] = m["repeat"] / n * 100 if n else 0.0
    m["nom_count"] = int((b["指名"].astype(str).str.strip().isin(["指名", "有", "1", "あり"])).sum())
    m["nom_rate"] = m["nom_count"] / n * 100 if n else 0.0
    routes = b["予約経路"].fillna("不明").value_counts().to_dict()
    m["routes"] = {k: int(v) for k, v in routes.items()}
    m["rebook"] = int(routes.get("次回予約", 0))
    m["rebook_rate"] = m["rebook"] / n * 100 if n else 0.0
    m["app_rate"] = routes.get("アプリ", 0) / n * 100 if n else 0.0
    m["hpb_rate"] = routes.get("ホットペッパービューティー", 0) / n * 100 if n else 0.0
    m["goods_per"] = m["goods"] / n if n else 0.0
    m["goods_ratio"] = m["goods"] / m["net"] * 100 if m["net"] else 0.0
    # トリートメント
    tre = d[(d["区分"] == "技術") & (d["項目名"].str.contains("|".join(TREAT), na=False))]
    tre_bills = tre["会計ID"].nunique()
    m["treat"] = int(tre_bills)
    m["treat_rate"] = tre_bills / n * 100 if n else 0.0
    m["treat_sales"] = float(tre["金額"].sum())
    # 支払い方法
    m["payments"] = {str(k): int(v) for k, v in
                     b["支払い方法"].fillna("不明").value_counts().items()}
    m["daily"] = _daily(d)
    return m


def _daily(d):
    """日ごとの売上と客数。[日, 純売上, 客数] の配列"""
    if d.empty:
        return []
    day = d["来店日"].dt.day
    net = d.groupby(day)["金額"].sum()
    cnt = d.groupby(day)["会計ID"].nunique()
    last = int(d["来店日"].dt.day.max())
    out = []
    for i in range(1, last + 1):
        out.append([i, float(net.get(i, 0)), int(cnt.get(i, 0))])
    return out


def _visit_index(all_df):
    """客IDごとの来店日一覧（リターン率の判定に使う）"""
    b = _bills(all_df)[["客ID", "来店日"]].dropna()
    idx = collections.defaultdict(list)
    for cid, day in zip(b["客ID"], b["来店日"]):
        idx[cid].append(day)
    for v in idx.values():
        v.sort()
    return idx


def _return_rate(all_df, month, idx, staff=None):
    """その月に初めて来たお客様が、RETURN_DAYS 以内にもう一度来た割合"""
    b = _bills(all_df)
    cur = b[(b["月"] == month) & (b["新規再来"] == "新規")]
    if staff:
        cur = cur[cur["施術担当者"] == staff]
    if cur.empty:
        return None
    last = all_df["来店日"].max()
    returned = judged = 0
    for cid, d0 in zip(cur["客ID"], cur["来店日"]):
        if pd.isna(d0) or (last - d0).days < RETURN_DAYS:
            continue                      # まだ判定できるだけの日数が経っていない
        judged += 1
        limit = d0 + pd.Timedelta(days=RETURN_DAYS)
        if any(d0 < d <= limit for d in idx.get(cid, ())):
            returned += 1
    if judged == 0:
        return None
    return {"rate": returned / judged * 100, "returned": returned, "judged": judged,
            "days": RETURN_DAYS}


def build():
    df = load()
    idx = _visit_index(df)
    months = sorted(df["月"].unique())
    out = {}
    for mo in months:
        d = df[df["月"] == mo]
        store = _metrics(d)
        store["return"] = _return_rate(df, mo, idx)
        store["end"] = str(d["来店日"].max().date())
        people = {}
        for name, g in d.groupby("施術担当者"):
            if not name or name in EXCLUDE:
                continue
            p = _metrics(g)
            if p["customers"] < 20:
                continue
            p["return"] = _return_rate(df, mo, idx, name)
            people[name] = p
        store["headcount"] = len(people)
        out[mo] = {"store": store, "stylists": people,
                   "active": sorted(people, key=lambda k: -people[k]["net"]),
                   "top_goods": _top(d, "商品"), "top_menus": _top(d, "技術")}
    return out


def _top(d, kind, n=10):
    q = d[d["区分"] == kind]
    if kind == "技術":
        q = q[q["カテゴリ"].isin(["メニュー", "クーポン"])]
    g = q.groupby("項目名")["金額"].agg(["count", "sum"]).sort_values("sum", ascending=False)
    return [[re.sub(r"^(店販|カット|カラー|パーマ|トリートメント|その他|縮毛矯正|ヘアセット|組み合わせメニュー):", "", k),
             int(v["count"]), float(v["sum"])] for k, v in g.head(n).iterrows()]


if __name__ == "__main__":
    data = build()
    for k in sorted(data):
        s = data[k]["store"]
        r = s["return"]
        print(f"{k}  純売上 {s['net']:>11,.0f}  客数 {s['customers']:>5}  単価 {s['avg']:>7,.0f}  "
              f"店販 {s['goods']:>8,.0f}({s['goods_items']:>3}点/{s['goods_per']:>5,.0f}円)  "
              f"次回予約 {s['rebook']:>3}({s['rebook_rate']:.1f}%)  再来率 {s['repeat_rate']:.1f}%  "
              f"ﾘﾀｰﾝ率 {(f'{r[chr(114)+chr(97)+chr(116)+chr(101)]:.1f}%' if r else '—'):>7}  "
              f"ﾄﾘｰﾄﾒﾝﾄ {s['treat_rate']:.1f}%")
