# -*- coding: utf-8 -*-
"""
ビューティーメリットの管理画面に自動でログインし、
データを取得するための部品（クライアント）です。

2026年9月時点の画面構成をもとに作成しています。
ビューティーメリット側の画面が変更された場合、この部分の修正が必要になる
可能性があります。
"""
import io
import math
import re
import time

import pandas as pd
import requests
from bs4 import BeautifulSoup

LOGIN_PAGE_URL_PATH = "/manage/login"
LOGIN_POST_URL_PATH = "/manage/login/"
STYLIST_SALES_URL_PATH = "/manage/account/analysis/"
RESERVE_LIST_URL_PATH = "/manage/user/"

# 1ページあたりの予約件数（画面の仕様。変わっていたら自動検出にフォールバックします）
RESERVE_PAGE_SIZE = 20


class BeautyMeritLoginError(Exception):
    """ログインに失敗したときのエラー"""


class BeautyMeritClient:
    def __init__(self, base_url: str, login_id: str, password: str, request_interval_sec: float = 0.8):
        self.base_url = base_url.rstrip("/")
        self.login_id = login_id
        self.password = password
        # サーバーに負担をかけすぎないよう、リクエストの間に少し間隔をあけます
        self.request_interval_sec = request_interval_sec
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (compatible; SalonReportBot/1.0; +internal-use-only)"
        })

    # ------------------------------------------------------------------
    # ログイン
    # ------------------------------------------------------------------
    def login(self):
        """ログインページからトークンを取得し、ID・パスワードでログインします。"""
        login_page_url = self.base_url + LOGIN_PAGE_URL_PATH
        res = self.session.get(login_page_url, timeout=30)
        res.raise_for_status()

        soup = BeautifulSoup(res.text, "html.parser")
        token_input = soup.select_one('input[name="login_token"]')
        login_token = token_input["value"] if token_input and token_input.has_attr("value") else ""

        login_post_url = self.base_url + LOGIN_POST_URL_PATH
        payload = {
            "login_token": login_token,
            "login_id": self.login_id,
            "password": self.password,
        }
        res = self.session.post(login_post_url, data=payload, timeout=30, allow_redirects=True)
        res.raise_for_status()

        # ログインに失敗すると、再びログインフォームが表示される仕様のため、
        # 「password」という入力欄がまだ画面にあるかどうかで成否を判定します。
        soup = BeautifulSoup(res.text, "html.parser")
        if soup.select_one('input[name="password"]'):
            raise BeautyMeritLoginError(
                "ログインに失敗しました。ログインID・パスワードが正しいか、"
                ".env ファイルの内容をご確認ください。"
            )
        return True

    def _get(self, path, params=None):
        time.sleep(self.request_interval_sec)
        url = self.base_url + path
        res = self.session.get(url, params=params, timeout=30)
        res.raise_for_status()
        return res

    # ------------------------------------------------------------------
    # スタッフ別 売上・客数集計（CSVダウンロード機能を利用）
    # ------------------------------------------------------------------
    def fetch_stylist_sales_csv(self, start_date: str, end_date: str, shop_user_type: str = "1") -> pd.DataFrame:
        """
        「データ > 売上集計 > スタッフ別売上集計」のCSVダウンロードと同じデータを取得します。
        shop_user_type: "1" = 施術スタッフ（実際に施術したスタイリスト）, "0" = 予約スタッフ
        戻り値: スタッフごとの売上・客数が入った pandas.DataFrame
        """
        params = {
            "action": "aggregate",
            "target": "stylist",
            "start_date": start_date,
            "end_date": end_date,
            "shop_user_type": shop_user_type,
            "csv": "CSVダウンロード",
        }
        res = self._get(STYLIST_SALES_URL_PATH, params=params)

        # ビューティーメリットのCSVは Shift-JIS(CP932) で出力されるため、
        # ここで文字コードを変換してから読み込みます（Mac文字化け対策）。
        text = res.content.decode("cp932", errors="replace")
        df = pd.read_csv(io.StringIO(text))
        return df

    # ------------------------------------------------------------------
    # 予約一覧（予約経路・メニューの分析に利用）
    # ------------------------------------------------------------------
    def fetch_reservations(self, start_date: str, end_date: str, progress_callback=None):
        """
        「予約管理 > 予約一覧」を指定期間で検索し、全ページ分の予約データを
        1件ずつのリストにして返します。

        戻り値: 辞書のリスト。各辞書は1予約分のデータで、以下のキーを持ちます。
            reserve_code, status, staff, route, menus(list[str])
        """
        base_params = {
            "reserve_code": "",
            "created_start": "",
            "created_end": "",
            "date_start": start_date,
            "date_end": end_date,
            "shop_user_id": "",
            "name_sei": "",
            "name_mei": "",
            "status": "",     # 空欄=すべてのステータス
            "route": "-1",    # -1=すべての予約経路
            "app_user": "",
            "site_id": "0",   # 0=すべての連携システム
            "noted": "",
            "search": "検索",
        }

        # 1ページ目を取得して、全部で何件あるか・何ページあるかを調べます
        first_page = self._get(RESERVE_LIST_URL_PATH, params={**base_params, "page": 1})
        soup = BeautifulSoup(first_page.text, "html.parser")

        total_count = self._extract_total_count(soup)
        total_pages = max(1, math.ceil(total_count / RESERVE_PAGE_SIZE)) if total_count else 1

        if progress_callback:
            progress_callback(0, total_pages, total_count)

        all_reservations = []
        all_reservations.extend(self._parse_reservation_table(soup))

        for page in range(2, total_pages + 1):
            res = self._get(RESERVE_LIST_URL_PATH, params={**base_params, "page": page})
            page_soup = BeautifulSoup(res.text, "html.parser")
            all_reservations.extend(self._parse_reservation_table(page_soup))
            if progress_callback:
                progress_callback(page - 1, total_pages, total_count)

        return all_reservations

    @staticmethod
    def _extract_total_count(soup: BeautifulSoup) -> int:
        """画面上の「検索結果： 1650 件」のような表示から件数を取り出します。"""
        text = soup.get_text()
        m = re.search(r"検索結果[：:]\s*([0-9,]+)\s*件", text)
        if m:
            return int(m.group(1).replace(",", ""))
        return 0

    @staticmethod
    def _find_reservation_table(soup: BeautifulSoup):
        """予約一覧のテーブル（見出しに「予約経路」を含む表）を探します。"""
        for table in soup.find_all("table"):
            header_text = table.find("tr").get_text() if table.find("tr") else ""
            if "予約経路" in header_text and "スタッフ" in header_text:
                return table
        return None

    def _parse_reservation_table(self, soup: BeautifulSoup):
        table = self._find_reservation_table(soup)
        if table is None:
            return []

        rows = table.find_all("tr")[1:]  # 先頭行(見出し)を除く
        results = []
        for row in rows:
            cells = row.find_all("td")
            if len(cells) < 10:
                continue  # 想定外の行（空行など）はスキップ

            reserve_code_el = cells[1].find("a")
            reserve_code = reserve_code_el.get_text(strip=True) if reserve_code_el else cells[1].get_text(strip=True)

            status = cells[2].get_text(strip=True)
            staff = cells[6].get_text(strip=True)

            # メニュー欄: <p class="list-menu"><span class="attribute_tag">M</span>メニュー名</p> の形
            menus = []
            for p in cells[7].select("p.list-menu"):
                badge = p.select_one(".attribute_tag")
                badge_text = badge.get_text(strip=True) if badge else ""
                full_text = p.get_text(strip=True)
                item_name = full_text[len(badge_text):].strip() if badge_text else full_text
                if badge_text == "M" and item_name:
                    menus.append(item_name)

            # 予約経路欄: 1行目を経路名として扱う（例: "アプリ\n現地決済" → "アプリ"）
            route_lines = [line.strip() for line in cells[9].get_text(separator="\n").split("\n") if line.strip()]
            route = route_lines[0] if route_lines else "不明"

            results.append({
                "reserve_code": reserve_code,
                "status": status,
                "staff": staff,
                "route": route,
                "menus": menus,
            })
        return results
