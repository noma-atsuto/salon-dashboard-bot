# -*- coding: utf-8 -*-
"""指標から、スタイリスト個人・店舗へのフィードバック文を組み立てる。

方針
  ・良し悪しを断定しない。「どこが強いか」「どこに伸びしろがあるか」を示す。
  ・必ず次の一手をセットで書く。
  ・新規率・指名率は優劣をつけず、タイプの違いとして扱う。
"""

# 目標値（変えたいときはここ）
TARGET = {
    "rebook_rate": 10.0,     # 次回予約率（%）
    "return_rate": 50.0,     # 新規のお客様が75日以内に再来する割合（%）
    "treat_rate": 25.0,      # トリートメント装着率（%）
    "goods_per": 400.0,      # お客様1人あたり店販（円）
}

LABEL = {"rebook_rate": "次回予約率", "return_rate": "リターン率",
         "treat_rate": "トリートメント装着率", "goods_per": "店販（お客様1人あたり・全員平均）"}


def _fmt(key, v):
    return f"{v:,.0f}円" if key == "goods_per" else f"{v:.1f}%"


def _rate(p, key):
    if key == "return_rate":
        return p["return"]["rate"] if p.get("return") else None
    return p.get(key)


def stylist_feedback(p, store, prev=None):
    strengths, issues, actions = [], [], []

    for key in ("rebook_rate", "return_rate", "treat_rate", "goods_per"):
        mine, avg, tgt = _rate(p, key), _rate(store, key), TARGET[key]
        if mine is None or avg is None:
            continue
        if mine >= tgt:
            strengths.append(f"{LABEL[key]}は{_fmt(key, mine)}で、目標の{_fmt(key, tgt)}に届いています。")
        elif avg > 0 and mine >= avg * 1.25:
            strengths.append(f"{LABEL[key]}は{_fmt(key, mine)}。店舗平均{_fmt(key, avg)}を上回っていて、店内では強いほうです。")
        elif avg > 0 and mine <= avg * 0.6:
            issues.append(f"{LABEL[key]}が{_fmt(key, mine)}で、店舗平均{_fmt(key, avg)}を下回っています。")

    if store["avg"] and p["avg"] >= store["avg"] * 1.1:
        strengths.append(f"客単価{p['avg']:,.0f}円は店舗平均{store['avg']:,.0f}円を上回っています。")
    elif store["avg"] and p["avg"] <= store["avg"] * 0.85:
        issues.append(f"客単価が{p['avg']:,.0f}円で、店舗平均{store['avg']:,.0f}円を下回っています。")

    tag = None
    if p["new_rate"] >= 45:
        tag = "新規のお客様を多く担当しているタイプ"
    elif p["nom_rate"] >= 90:
        tag = "指名で支えられているタイプ"
    elif p["new_rate"] >= 20:
        tag = "新規と再来のバランス型"

    if p["rebook_rate"] < TARGET["rebook_rate"]:
        if p["nom_rate"] >= 90:
            actions.append("指名のお客様が中心なので、次回予約はいちばん切り出しやすい立場です。"
                           "会計時にレジで代行入力するところまでを習慣にしてみてください。")
        elif p["new_rate"] >= 45:
            actions.append("新規のお客様が多いぶん、次回予約の効果がいちばん大きく出ます。"
                           "アプリ登録とセットで、その場で押さえるところまでを徹底しましょう。")
        else:
            actions.append("次回予約はアプリ登録とセットで。「あとから変更できます」の一言が決め手になります。")
    r = _rate(p, "return_rate")
    if r is not None and r < TARGET["return_rate"]:
        actions.append(f"初めて来てくださったお客様のうち、{r:.0f}%しか戻ってきていません。"
                       "次回予約を取れているかどうかが、いちばん効きます。")
    if p["treat_rate"] < TARGET["treat_rate"]:
        actions.append("店内トリートメントは優先順位1位です。"
                       "カットのみのお客様に、髪の状態を一言聞くところから始めてみてください。")
    if p["goods_per"] < TARGET["goods_per"]:
        actions.append("店販はワックスが入口です。"
                       "仕上げのときに「これ、おうちでも使えますよ」と一言添えるだけで変わります。")

    return {"strengths": strengths, "issues": issues, "actions": actions[:3],
            "tag": tag, "trend": _trend(p, prev)}


def _trend(p, prev):
    if not prev:
        return []
    out = []
    for key, label, unit in (("net", "純売上", "円"), ("customers", "客数", "人"),
                             ("avg", "客単価", "円"), ("goods", "店販売上", "円")):
        a, b = prev.get(key, 0), p.get(key, 0)
        if not a:
            continue
        diff = (b - a) / a * 100
        if abs(diff) >= 5:
            out.append({"label": label, "diff": diff,
                        "text": f"{label}は前月比 {diff:+.1f}%（{a:,.0f}{unit} → {b:,.0f}{unit}）"})
    return out


def store_feedback(s, prev=None):
    good, bad, acts = [], [], []

    if s["rebook_rate"] < TARGET["rebook_rate"]:
        bad.append(f"次回予約率が{s['rebook_rate']:.1f}%（目標{TARGET['rebook_rate']:.0f}%）。"
                   "いちばん伸びしろの大きい指標です。")
        acts.append("会計時のレジ代行入力を全員の手順にそろえる。アプリ登録率を上げることが前提になります。")
    r = s.get("return")
    if r:
        if r["rate"] >= TARGET["return_rate"]:
            good.append(f"リターン率は{r['rate']:.1f}%。新規{r['judged']}人のうち{r['returned']}人が"
                        f"{r['days']}日以内に戻ってきています。")
        else:
            bad.append(f"リターン率が{r['rate']:.1f}%（目標{TARGET['return_rate']:.0f}%）。"
                       f"新規{r['judged']}人のうち、戻ってきたのは{r['returned']}人です。")
            acts.append("次回予約を取れた人と取れなかった人で、リターン率がどう違うかを見ていくと効果がはっきりします。")
    if s["treat_rate"] < TARGET["treat_rate"]:
        bad.append(f"トリートメント装着率が{s['treat_rate']:.1f}%（目標{TARGET['treat_rate']:.0f}%）。")
        acts.append("カットのみのご予約が母数です。髪の状態を聞くところから提案につなげる。")
    else:
        good.append(f"トリートメント装着率は{s['treat_rate']:.1f}%。目標{TARGET['treat_rate']:.0f}%に届いています。")
    if s["goods_per"] < TARGET["goods_per"]:
        bad.append(f"店販は、お客様全員で割ると1人あたり{s['goods_per']:,.0f}円（目標{TARGET['goods_per']:,.0f}円）。"
                   f"買ってくださった方は{s['goods_buyers']}人で平均{s['goods_per_buyer']:,.0f}円なので、"
                   f"金額よりも「買う人を増やすこと」が課題です（購入率{s['goods_buy_rate']:.1f}%）。")
        acts.append("ワックスを入口に。ディープレイヤーは1本で割引分の5.9倍を回収できます。")
    if s["hpb_rate"] >= 50:
        bad.append(f"ホットペッパービューティー経由が{s['hpb_rate']:.1f}%。手数料がかかる集客に偏っています。")
        acts.append("アプリ経由と次回予約に移すほど、手元に残る金額が増えます。")
    if s["app_rate"] >= 20:
        good.append(f"アプリ経由のご予約が{s['app_rate']:.1f}%あります。登録済みのお客様は一定数いる状態です。")
    if prev and prev.get("net"):
        diff = (s["net"] - prev["net"]) / prev["net"] * 100
        (good if diff >= 0 else bad).append(f"純売上は前月比 {diff:+.1f}%。")
    return {"good": good, "issues": bad, "actions": acts}
