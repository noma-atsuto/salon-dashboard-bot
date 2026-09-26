# -*- coding: utf-8 -*-
"""分析結果を1枚のHTMLダッシュボードにする"""
import calendar, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyze, feedback

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboard.html")


def build_payload():
    data = analyze.build()
    months = sorted(data)
    shift = analyze.load_shift()
    payload = {"months": months, "target": feedback.TARGET, "data": {}}
    KEYS = ("net", "gross", "tech", "goods", "goods_items", "goods_per", "goods_ratio", "discount",
            "goods_buyers", "goods_buy_rate", "goods_per_buyer", "goods_per_item",
            "nominate_fee", "points", "customers", "new", "repeat", "avg", "new_rate",
            "repeat_rate", "nom_rate", "nom_count", "free_count", "free_rate",
            "rebook", "rebook_rate", "treat", "treat_rate",
            "treat_sales", "app_rate", "hpb_rate", "first_visits",
            "workdays", "net_per_day", "gross_per_day", "cust_per_day", "workday_source")
    # 売上の内訳（合計すると純売上になる）
    BREAKDOWN = ("tech", "goods", "nominate_fee", "discount", "points")
    STORE_ONLY = ("headcount",)
    for i, m in enumerate(months):
        prev = data[months[i - 1]] if i else None
        s = data[m]["store"]
        end = s["end"]
        y, mo = int(m[:4]), int(m[5:7])
        last = f"{y}-{mo:02d}-{calendar.monthrange(y, mo)[1]:02d}"
        entry = {
            "end": end, "partial": end != last,
            "store": {**{k: s[k] for k in KEYS}, **{k: s.get(k) for k in STORE_ONLY},
                      "return": s.get("return"), "daily": s.get("daily", []),
                      "rebook_made": s.get("rebook_made"),
                      "detail": s.get("detail", {}),
                      "routes": s["routes"], "payments": s["payments"]},
            "top_goods": data[m]["top_goods"], "top_menus": data[m]["top_menus"],
            "store_feedback": feedback.store_feedback(s, prev["store"] if prev else None),
            "stylists": [],
        }
        for name in data[m]["active"]:
            p = data[m]["stylists"][name]
            pv = prev["stylists"].get(name) if prev else None
            entry["stylists"].append({
                "name": name, **{k: p[k] for k in KEYS}, "return": p.get("return"),
                "routes": p["routes"], "daily": p.get("daily", []), "detail": p.get("detail", {}),
                "rebook_made": p.get("rebook_made"),
                "feedback": feedback.stylist_feedback(p, s, pv),
            })
        payload["data"][m] = entry

    # 目標は、集計が終わった過去の月を見て決める
    tmp = {m: {"partial": payload["data"][m]["partial"],
               "store": {"net": data[m]["store"]["net"],
                         "gross": data[m]["store"]["gross"],
                         "workdays": data[m]["store"]["workdays"]},
               "stylists": data[m]["stylists"]} for m in months}
    analyze.build_targets(tmp, shift, months)
    for m in months:
        payload["data"][m]["target"] = tmp[m].get("target")
    payload["growth"] = analyze.GROWTH
    payload["history"] = analyze.load_history()
    return payload


HTML_HEAD = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "head.html"), encoding="utf-8").read()


def main():
    payload = build_payload()
    html = [HTML_HEAD,
            '<div class="wrap">',
            '<div class="top">',
            '<div class="topbar">',
            '<button id="menubtn" type="button" aria-expanded="false" aria-controls="menu" aria-label="メニューを開く">'
            '<span class="bars"><i></i><i></i><i></i></span></button>',
            '<div class="titles"><p class="brand">AI TOKYO men\'s 池袋</p>'
            '<h1 id="vtitle">店舗全体</h1></div>',
            '</div>',
            '<div class="ctrl"><select id="m" aria-label="対象月"></select>',
            '<span id="ls" hidden></span><select id="s" aria-label="スタイリスト" hidden></select></div>',
            '</div>',
            '<nav id="menu" hidden aria-label="表示の切り替え">',
            '<button class="mitem" data-v="store"><b>店舗全体</b>'
            '<span>売上・客数・目標の進み・予約経路・フィードバック</span></button>',
            '<button class="mitem" data-v="rank"><b>スタイリスト比較</b>'
            '<span>全員の数字を一覧で並べて比べる</span></button>',
            '<button class="mitem" data-v="goal"><b>目標</b>'
            '<span>今月の売上目標と、達成までの残り</span></button>',
            '<button class="mitem" data-v="rebook"><b>次回予約</b>'
            '<span>取得率ランキングと、その後の来店</span></button>',
            '<button class="mitem" data-v="person"><b>個人カルテ</b>'
            '<span>1人ぶんの数字・成長の推移・次の一手</span></button>',
            '</nav>',
            '<div id="menubg" hidden></div>',
            '<div id="view"></div>',
            '<p class="foot">ビューティーメリットのデータをもとに自動作成しています。'
            '数値の最終確認は管理画面でお願いします。<br>'
            '売上・スタッフ個人の実績を含みます。共有範囲にご注意ください。<br>'
            '※これは一般的な情報です。実際の判断は、専門家（弁護士・税理士など）に必ずご確認ください。</p>',
            '</div>',
            '<script id="payload" type="application/json">',
            json.dumps(payload, ensure_ascii=False), '</' + 'script>',
            open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboard.js"),
                 encoding="utf-8").read()]
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(html))
    print(f"出力: {OUT}  （{len(payload['months'])}ヶ月分）")


if __name__ == "__main__":
    main()
