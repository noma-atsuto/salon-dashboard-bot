# -*- coding: utf-8 -*-
"""ビューティーメリットの「売上明細」CSVを月ごとに取得して貯める。
   1会計の1行ごとに、区分・カテゴリ・項目名・金額・スタッフ・予約経路・新規再来・
   支払い方法・お客様番号まで入っている、いちばん詳しいデータ。"""
import calendar, datetime, io, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bm_config as config
import pandas as pd
from bm_client import BeautyMeritClient

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
MONTHS_BACK = 6          # さかのぼる月数（当月を含む）
TODAY = datetime.date.today()


def target_months():
    """当月から MONTHS_BACK ヶ月分を古い順に返す"""
    out, y, m = [], TODAY.year, TODAY.month
    for _ in range(MONTHS_BACK):
        out.append((y, m))
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return list(reversed(out))

# お客様名はそのまま持たない。取り込む時点でハッシュ（不可逆な符号）に置き換え、
# 「同じ人かどうか」だけ分かる形にする。名前そのものはファイルに残らない。
DROP = ["お客様名", "お客様名カナ"]
SALT = "aitokyo-ikebukuro-2026"


def _hash_customer(df):
    import hashlib
    name = df.get("お客様名")
    kana = df.get("お客様名カナ")
    if name is None:
        df["客ID"] = ""
        return df
    key = name.fillna("").astype(str).str.strip()
    if kana is not None:
        key = key + "|" + kana.fillna("").astype(str).str.strip()
    df["客ID"] = [
        "" if not k.strip("|") else hashlib.sha256((SALT + k).encode("utf-8")).hexdigest()[:16]
        for k in key
    ]
    # 予約一覧にはカナが無いので、氏名だけの符号も作って突き合わせに使う
    df["客ID名"] = [name_key(v) for v in name.fillna("").astype(str)]
    return df


def name_key(v):
    """氏名から空白を取り除いて符号にする。予約一覧側と同じ作り方にすること。"""
    import hashlib, re
    core = re.sub(r"[\s　]+", "", str(v)).strip()
    if not core:
        return ""
    return hashlib.sha256((SALT + "N|" + core).encode("utf-8")).hexdigest()[:16]


def rng(y, m):
    end = datetime.date(y, m, calendar.monthrange(y, m)[1])
    if end > TODAY:
        end = TODAY            # 当月は今日まで（途中経過）
    return f"{y}-{m:02d}-01", end.isoformat()


def is_open(y, m):
    """まだ終わっていない月（＝毎回取り直す必要がある月）か"""
    return (y, m) >= (TODAY.year, TODAY.month)


def main():
    os.makedirs(CACHE, exist_ok=True)
    client = None
    months = target_months()
    # 当月と前月は会計の追加・修正が入りうるので毎回取り直す
    refresh = {months[-1], months[-2]} if len(months) > 1 else set(months)
    for y, m in months:
        s, e = rng(y, m)
        path = os.path.join(CACHE, f"detail_{y}-{m:02d}.csv")
        if os.path.exists(path) and "--force" not in sys.argv and (y, m) not in refresh:
            print(f"[{y}-{m:02d}] 取得済み（スキップ）", flush=True)
            continue
        if client is None:
            client = BeautyMeritClient(config.BM_BASE_URL, config.BM_LOGIN_ID, config.BM_PASSWORD)
            client.login()
            print("ログインしました", flush=True)
        print(f"[{y}-{m:02d}] {s} 〜 {e} を取得中...", flush=True)
        p = {"action": "detail", "date_type": "0", "start_date": s, "end_date": e,
             "shop_user_type": "1", "shop_user_id": "", "csv": "CSVダウンロード"}
        raw = client._get("/manage/account/sales/", params=p).content.decode("cp932", "replace")
        df = pd.read_csv(io.StringIO(raw), thousands=",")
        df = _hash_customer(df)
        df = df.drop(columns=[c for c in DROP if c in df.columns])
        df.insert(0, "月", f"{y}-{m:02d}")
        tmp = path + ".tmp"
        df.to_csv(tmp, index=False, encoding="utf-8")
        os.replace(tmp, path)          # 途中で失敗しても壊れたファイルを残さない
        print(f"[{y}-{m:02d}] 完了: {len(df):,}行", flush=True)
    keep = {f"detail_{y}-{m:02d}.csv" for y, m in months}
    for f in os.listdir(CACHE):
        if f.startswith("detail_") and f.endswith(".csv") and f not in keep:
            os.remove(os.path.join(CACHE, f))
            print(f"  古い月を削除: {f}", flush=True)
    print("すべて完了", flush=True)


if __name__ == "__main__":
    main()
