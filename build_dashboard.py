# -*- coding: utf-8 -*-
"""分析結果を1枚のHTMLダッシュボードにする"""
import calendar, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyze, feedback

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboard.html")


def build_payload():
    data = analyze.build()
    months = sorted(data)
    payload = {"months": months, "target": feedback.TARGET, "data": {}}
    KEYS = ("net", "tech", "goods", "goods_items", "goods_per", "goods_ratio", "discount",
            "goods_buyers", "goods_buy_rate", "goods_per_buyer", "goods_per_item",
            "nominate_fee", "points", "customers", "new", "repeat", "avg", "new_rate",
            "repeat_rate", "nom_rate", "rebook", "rebook_rate", "treat", "treat_rate",
            "treat_sales", "app_rate", "hpb_rate")
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
                      "return": s.get("return"),
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
                "routes": p["routes"],
                "feedback": feedback.stylist_feedback(p, s, pv),
            })
        payload["data"][m] = entry
    return payload


HTML_HEAD = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "head.html"), encoding="utf-8").read()


def main():
    payload = build_payload()
    html = [HTML_HEAD,
            '<div class="wrap">',
            '<div class="top">',
            '<p class="brand">AI TOKYO men\'s 池袋</p>',
            '<h1>スタイリスト分析</h1>',
            '<div class="ctrl"><select id="m" aria-label="対象月"></select>',
            '<span id="ls" hidden></span><select id="s" aria-label="スタイリスト" hidden></select></div>',
            '<div class="seg" role="tablist">'
            '<button data-v="store" role="tab" aria-selected="true">店舗全体</button>'
            '<button data-v="rank" role="tab" aria-selected="false">スタイリスト比較</button>'
            '<button data-v="person" role="tab" aria-selected="false">個人カルテ</button>'
            '</div>',
            '</div>',
            '<div class="topspace"></div>',
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
