# -*- coding: utf-8 -*-
"""売上明細から、スタイリスト個人・店舗全体の指標を組み立てる。

明細の構造
  区分 = 技術 / 商品 / その他
    技術  … メニュー・クーポン・割引クーポン
    商品  … 店販
    その他 … 指名料・利用ポイント
"""
import collections, datetime, glob, os, re
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


def load_history():
    """折れ線グラフ用の長期データ。店舗全体とスタイリスト別の月次。"""
    out = {"months": [], "store": {}, "stylists": {}}
    mp = os.path.join(CACHE, "monthly.csv")
    sp = os.path.join(CACHE, "stylist_monthly.csv")
    if os.path.exists(mp):
        m = pd.read_csv(mp)
        m["ym"] = m["年月"].astype(str).str.replace("年", "-", regex=False).str.replace("月", "", regex=False)
        for c in ("総売上", "純売上", "総客数", "客単価"):
            m[c] = pd.to_numeric(m.get(c), errors="coerce").fillna(0)
        m = m[m["総売上"] > 0].sort_values("ym")
        out["months"] = list(m["ym"])
        out["store"] = {r["ym"]: {"gross": float(r["総売上"]), "net": float(r["純売上"]),
                                  "customers": int(r["総客数"]), "avg": float(r["客単価"])}
                        for _, r in m.iterrows()}
    if os.path.exists(sp):
        d = pd.read_csv(sp)
        for name, g in d.groupby("スタッフ"):
            name = str(name).strip()
            if name in EXCLUDE or "削除済" in name:
                continue
            out["stylists"][name] = {
                str(r["年月"]): {"gross": float(r["総売上"]), "net": float(r["純売上"]),
                                 "customers": int(r["客数"]), "avg": float(r["客単価"])}
                for _, r in g.iterrows()}
    return out


def load_shift():
    """シフト（出勤／休日）。記録がある月だけ入っている"""
    frames = []
    for path in sorted(glob.glob(os.path.join(CACHE, "shift_*.csv"))):
        frames.append(pd.read_csv(path))
    if not frames:
        return pd.DataFrame(columns=["月", "スタッフ", "日", "出勤"])
    df = pd.concat(frames, ignore_index=True)
    df["スタッフ"] = df["スタッフ"].fillna("").astype(str).str.strip()
    df["出勤"] = df["出勤"].astype(str).str.lower().isin(["true", "1"])
    return df


def workdays_from_shift(sh, month, upto_day, staff=None):
    """予約枠を開けている日を出勤として数える。記録が無ければ None"""
    if sh.empty:
        return None
    d = sh[(sh["月"] == month) & (sh["日"] <= upto_day) & sh["出勤"]]
    if staff is not None:
        d = d[d["スタッフ"] == staff]
        if not len(sh[(sh["月"] == month) & (sh["スタッフ"] == staff)]):
            return None
    elif not len(sh[sh["月"] == month]):
        return None
    return int(len(d)) if staff is not None else int(d["日"].nunique())


def shift_days_planned(sh, month, staff=None):
    """その月に予約枠を開けている日数（月末まで。目標の計算に使う）"""
    if sh.empty:
        return None
    d = sh[(sh["月"] == month) & sh["出勤"]]
    if staff is not None:
        if not len(sh[(sh["月"] == month) & (sh["スタッフ"] == staff)]):
            return None
        return int(len(d[d["スタッフ"] == staff]))
    if not len(sh[sh["月"] == month]):
        return None
    return int(d["日"].nunique())


def load_rebook():
    """打った月ごとの次回予約。無ければ空で返す"""
    frames = []
    for path in sorted(glob.glob(os.path.join(CACHE, "rebook_*.csv"))):
        frames.append(pd.read_csv(path))
    if not frames:
        return pd.DataFrame(columns=["月", "会計済", "ステータス", "来店日時", "スタッフ"])
    df = pd.concat(frames, ignore_index=True)
    df["スタッフ"] = df["スタッフ"].fillna("").astype(str).str.strip()
    df["来店日"] = pd.to_datetime(
        df["来店日時"].astype(str).str.slice(0, 10), errors="coerce")
    return df


def first_visit_days(df):
    """お客様ごとの「1回目の来店日」の一覧。

    手元のデータは直近数ヶ月分しかないため、来店日を数えるだけだと
    「前から通っているお客様」も1回目に見えてしまう。
    ビューティーメリットは全期間の履歴を持っていて、それが会計データの
    「新規／再来」欄に入っているので、そちらを正として判定する。
    """
    bills = _bills(df)[["客ID名", "来店日", "新規再来"]].dropna(subset=["来店日"])
    out = set()
    for cid, day, kind in zip(bills["客ID名"], bills["来店日"], bills["新規再来"]):
        if cid and kind == "新規":
            out.add((cid, day.date()))
    return out


def mark_first_visit(rb, df):
    """次回予約を「初回来店のお客様から取れたもの」に絞るための印をつける。

    判定は来店回数で行う。お客様ごとに来店日を並べ、その日が1回目の来店であれば
    「初回」とみなす。打った日のお会計を会計明細から探して突き合わせる。
    （日付をまたいで深夜に打った場合に備え、前日まで見る）
    """
    if rb.empty:
        rb["初回"] = []
        return rb
    firsts = first_visit_days(df)
    made_day = pd.to_datetime(rb["打った日時"].astype(str).str.slice(0, 10), errors="coerce")
    flags = []
    for cid, d0 in zip(rb["客ID名"].fillna("").astype(str), made_day):
        ok = False
        if cid and pd.notna(d0):
            base = d0.date()
            ok = (cid, base) in firsts or (cid, base - datetime.timedelta(days=1)) in firsts
        flags.append(ok)
    rb = rb.copy()
    rb["初回"] = flags
    return rb


def rebook_funnel(rb, month, staff=None):
    """その月に打った次回予約が、その後どうなったか。

    対象は「次回予約タブから打たれたもの」だけ（電話予約枠は取得していない）。
    さらに、枠止めの手打ちを除き、初回来店のお客様から取れた分に絞る。
    """
    if rb.empty:
        return None
    raw = rb[rb["月"] == month]
    if staff is not None:
        raw = raw[raw["スタッフ"] == staff]
    d = raw[~raw["枠止め"].astype(bool)]
    ex_dummy = len(raw) - len(d)
    if "初回" in d.columns:
        before = len(d)
        d = d[d["初回"].astype(bool)]
        ex_other = before - len(d)
    else:
        ex_other = 0
    made = len(d)
    base = {"raw": len(raw), "ex_dummy": ex_dummy, "ex_other": ex_other}
    if made == 0:
        return {**base, "made": 0, "done": 0, "cancelled": 0, "upcoming": 0, "show_rate": None}
    done = int(d["会計済"].astype(bool).sum())
    cancelled = int(d["ステータス"].astype(str).str.contains("キャンセル", na=False).sum())
    today = pd.Timestamp(datetime.date.today())
    upcoming = int(((~d["会計済"].astype(bool))
                    & (~d["ステータス"].astype(str).str.contains("キャンセル", na=False))
                    & (d["来店日"] > today)).sum())
    judged = made - upcoming
    return {**base, "made": made, "done": done, "cancelled": cancelled, "upcoming": upcoming,
            "show_rate": (done / judged * 100) if judged else None}


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
        # 総売上＝割引とポイントを引く前。純売上＝そこから引いたあと
        "gross": float(menu + g + nomi),
        "net": float(menu + disc + g + nomi + point),
        "goods_items": int(goods["個数"].sum()),
    }


def _bills(d):
    """会計（お客様1回）単位の情報"""
    b = d.drop_duplicates("会計ID")
    return b


def _metrics(d, all_df=None, month=None, first_days=None):
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
    # 「指名」列は 指名予約 / フリー予約 の2値
    nm = b["指名"].fillna("").astype(str)
    m["nom_count"] = int(nm.str.startswith("指名").sum())
    m["free_count"] = int(nm.str.startswith("フリー").sum())
    m["nom_rate"] = m["nom_count"] / n * 100 if n else 0.0
    m["free_rate"] = m["free_count"] / n * 100 if n else 0.0
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
    m["detail"] = _detail(d)
    # 初回来店のお客様が何人いたか（次回予約の取得率の分母）
    m["first_visits"] = m["new"]     # 初回来店のお客様＝新規のお客様
    # 出勤日数：シフトの記録があればそちら（予約枠を開けている日）を使う
    acc_days = int(d["来店日"].dt.date.nunique()) if not d.empty else 0
    m["workdays_sales"] = acc_days
    m["workdays"] = acc_days
    m["workday_source"] = "sales"
    m["gross_per_day"] = 0.0
    return m


def _detail(d, top=15):
    """売上の内訳を、もう一段細かく分解する"""
    def rank(q, key):
        g = q.groupby(key)["金額"].agg(["count", "sum"]).sort_values("sum", ascending=False)
        rows = [[str(k), int(v["count"]), float(v["sum"])] for k, v in g.iterrows()]
        if len(rows) > top:
            rest = rows[top:]
            rows = rows[:top] + [["その他 " + str(len(rest)) + "件", sum(r[1] for r in rest),
                                  sum(r[2] for r in rest)]]
        return rows

    tech = d[(d["区分"] == "技術") & (d["カテゴリ"].isin(["メニュー", "クーポン"]))].copy()
    # 「カット:カット 【プライムスタイリスト】￥6900」の "カット" の部分で分ける。
    # クーポンには区分がないので「クーポン」としてまとめる。
    tech["分類"] = [
        (n.split(":", 1)[0] if ":" in n else "クーポン") for n in tech["項目名"]
    ]
    goods = d[d["区分"] == "商品"].copy()
    goods["名前"] = goods["項目名"].str.replace("^店販:", "", regex=True)
    disc = d[(d["区分"] == "技術") & (d["カテゴリ"] == "割引クーポン")]
    nomi = d[(d["区分"] == "その他") & (d["カテゴリ"] == "その他")].copy()
    nomi["区分け"] = nomi["単価"].map(lambda v: f"{int(v):,}円の指名料")
    pt = d[(d["区分"] == "その他") & (d["カテゴリ"] == "ポイント")].copy()
    pt["経路"] = pt["予約経路"].fillna("不明")
    return {
        "tech": rank(tech, "分類"),
        "tech_items": rank(tech, "項目名"),
        "goods": rank(goods, "名前"),
        "discount": rank(disc, "項目名"),
        "nominate": rank(nomi, "区分け"),
        "points": rank(pt, "経路"),
    }


def _daily(d):
    """日ごとの数字。[日, 総売上, 純売上, 客数, 店販] の配列"""
    if d.empty:
        return []
    day = d["来店日"].dt.day
    net = d.groupby(day)["金額"].sum()
    cnt = d.groupby(day)["会計ID"].nunique()
    # 総売上＝割引とポイントを引く前
    plus = d[~((d["区分"] == "技術") & (d["カテゴリ"] == "割引クーポン"))
             & ~((d["区分"] == "その他") & (d["カテゴリ"] == "ポイント"))]
    gross = plus.groupby(plus["来店日"].dt.day)["金額"].sum() if not plus.empty else {}
    gd = d[d["区分"] == "商品"]
    goods = gd.groupby(gd["来店日"].dt.day)["金額"].sum() if not gd.empty else {}
    get = lambda src, i: (src.get(i, 0) if hasattr(src, "get") else 0)
    last = int(day.max())
    return [[i, float(get(gross, i)), float(net.get(i, 0)), int(cnt.get(i, 0)),
             float(get(goods, i))] for i in range(1, last + 1)]


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
    firsts = first_visit_days(df)
    rb = mark_first_visit(load_rebook(), df)
    sh = load_shift()
    idx = _visit_index(df)
    months = sorted(df["月"].unique())
    out = {}
    for mo in months:
        d = df[df["月"] == mo]
        store = _metrics(d, first_days=firsts)
        store["return"] = _return_rate(df, mo, idx)
        store["rebook_made"] = _with_rate(rebook_funnel(rb, mo), store["first_visits"])
        store["end"] = str(d["来店日"].max().date())
        people = {}
        for name, g in d.groupby("施術担当者"):
            if not name or name in EXCLUDE:
                continue
            p = _metrics(g, first_days=firsts)
            if p["customers"] < 20:
                continue
            p["return"] = _return_rate(df, mo, idx, name)
            p["rebook_made"] = _with_rate(rebook_funnel(rb, mo, name), p["first_visits"])
            people[name] = p
        # シフトの記録がある月は、そちらで出勤日数を置き換える
        upto = int(str(store["end"])[8:10])
        for who, mm in [(None, store)] + [(k, v) for k, v in people.items()]:
            w = workdays_from_shift(sh, mo, upto, who)
            if w:
                mm["workdays"] = w
                mm["workday_source"] = "shift"
            mm["net_per_day"] = mm["net"] / mm["workdays"] if mm["workdays"] else 0.0
            mm["gross_per_day"] = mm["gross"] / mm["workdays"] if mm["workdays"] else 0.0
            mm["cust_per_day"] = mm["customers"] / mm["workdays"] if mm["workdays"] else 0.0
        store["headcount"] = len(people)
        out[mo] = {"store": store, "stylists": people,
                   "active": sorted(people, key=lambda k: -people[k]["net"]),
                   "top_goods": _top(d, "商品"), "top_menus": _top(d, "技術")}
    return out


# 目標の作り方
#   基準 = 過去の「1日あたり総売上」のうち、いちばん良かった月の水準
#          （一度は実際に出している数字なので、強気だが再現できる）
#   目標 = 基準 × GROWTH × その月の出勤日数
# 季節（繁忙期・閑散期）は目標には掛けない。参考の指標として画面に出すだけ。
BASIS = "avg"             # "avg"＝直近の平均を基準 / "best"＝いちばん良かった月を基準
GROWTH = 1.05
LOOKBACK = 6              # さかのぼる月数（集計が終わった月のみ）
SINCE = "2026-05"         # この月以降の実績だけを参照する（体制が変わった時期）
STORE_FLOOR = 10_500_000  # 店舗の月間目標のボーダー。下回る月はここまで引き上げる


def seasonal_index():
    """月ごとの忙しさの指数（1.00が平年並み）。

    売上や客数はスタッフの人数にも左右されるので、「1名あたりの客数」に直してから、
    伸びの傾き（成長分）を取り除いた残りを季節のクセとみなす。
    データが足りない月は 1.00（平年並み）として扱う。
    """
    path = os.path.join(CACHE, "headcount.csv")
    if not os.path.exists(path):
        return {}, {}
    h = pd.read_csv(path)
    h = h[(h["稼働"] > 0) & (h["客数"] > 0)].copy()
    if len(h) < 6:
        return {}, {}
    h = h.sort_values("年月").reset_index(drop=True)
    h["per"] = h["客数"] / h["稼働"]
    t = list(range(len(h)))
    a, b = _fit(t, list(h["per"]))
    h["ratio"] = [v / (a * i + b) if (a * i + b) else 1.0 for i, v in zip(t, h["per"])]
    idx, cnt = {}, {}
    for m, g in h.groupby("月"):
        idx[int(m)] = float(g["ratio"].mean())
        cnt[int(m)] = int(len(g))
    avg = sum(idx.values()) / len(idx)
    return {k: v / avg for k, v in idx.items()}, cnt


def _fit(xs, ys):
    n = len(xs)
    mx = sum(xs) / n
    my = sum(ys) / n
    den = sum((x - mx) ** 2 for x in xs) or 1.0
    a = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den
    return a, my - a * mx


def build_targets(out, sh, months):
    """月ごとに、店舗とスタイリストの売上目標をつくる"""
    season, season_n = seasonal_index()
    sfac = lambda ym: season.get(int(ym[5:7]), 1.0)
    for i, mo in enumerate(months):
        past = [m for m in months[:i]
                if not out[m]["partial"] and (not SINCE or m >= SINCE)][-LOOKBACK:]
        entry = out[mo]
        entry["target"] = None
        if not past:
            continue
        planned_store = shift_days_planned(sh, mo) or entry["store"]["workdays"]
        people = {}
        total = 0.0
        for name, p in entry["stylists"].items():
            vals = [(m, out[m]["stylists"][name]["gross_per_day"])
                    for m in past
                    if name in out[m]["stylists"] and out[m]["stylists"][name]["gross_per_day"]]
            if not vals:
                continue
            # 直近の実績を基準にする（季節は掛けない）
            best_m, best = max(vals, key=lambda kv: kv[1])
            avg = sum(v for _, v in vals) / len(vals)
            days = shift_days_planned(sh, mo, name) or p["workdays"]
            base = (best if BASIS == "best" else avg)
            goal = base * GROWTH * days
            people[name] = {"base_per_day": base, "avg_per_day": avg, "best_month": best_m,
                            "days": days, "target": goal, "actual": p["gross"],
                            "months_used": len(vals)}
            total += goal
        # 店舗目標：スタイリストの合計に、フリー枠など一覧外の分を過去比で足す
        share = []
        for m in past:
            tot = out[m]["store"]["gross"]
            sub = sum(v["gross"] for v in out[m]["stylists"].values())
            if sub:
                share.append(tot / sub)
        ratio = sum(share) / len(share) if share else 1.0
        store_goal = total * ratio
        floored = False
        if STORE_FLOOR and store_goal < STORE_FLOOR:
            # 下限に届かない月は、全員の目標を同じ割合で引き上げる
            scale = STORE_FLOOR / store_goal
            for v in people.values():
                v["target"] *= scale
                v["base_per_day"] *= scale
            store_goal = STORE_FLOOR
            floored = True
        entry["target"] = {
            "store": store_goal, "store_days": planned_store, "floored": floored,
            "floor": STORE_FLOOR,
            "stylists": people, "growth": GROWTH, "months_used": len(past),
            "based_on": past, "season": sfac(mo),
            "season_table": {str(k): v for k, v in sorted(season.items())},
            "season_years": {str(k): v for k, v in sorted(season_n.items())},
        }


def _with_rate(f, first_visits):
    """取得率＝初回来店のお客様のうち、次回予約を取れた割合"""
    if f is None:
        return None
    f["first_visits"] = int(first_visits)
    f["take_rate"] = (f["made"] / first_visits * 100) if first_visits else None
    return f


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
