# -*- coding: utf-8 -*-
"""ログイン情報の読み込み。

  1. 環境変数 BM_LOGIN_ID / BM_PASSWORD があればそれを使う（GitHub Actions 用）
  2. なければ手元の config.py を読む（Mac で動かすとき用）
"""
import os, sys

BM_BASE_URL = os.environ.get("BM_BASE_URL", "https://b-merit.jp")
BM_LOGIN_ID = os.environ.get("BM_LOGIN_ID", "")
BM_PASSWORD = os.environ.get("BM_PASSWORD", "")

if not BM_LOGIN_ID or not BM_PASSWORD:
    local = os.path.expanduser("~/Downloads/beauty_merit_report 3")
    if os.path.isdir(local):
        sys.path.insert(0, local)
        try:
            import config as _c
            BM_LOGIN_ID = BM_LOGIN_ID or _c.BM_LOGIN_ID
            BM_PASSWORD = BM_PASSWORD or _c.BM_PASSWORD
            BM_BASE_URL = getattr(_c, "BM_BASE_URL", BM_BASE_URL)
        except Exception:
            pass

if not BM_LOGIN_ID or not BM_PASSWORD:
    raise SystemExit(
        "ログイン情報が見つかりません。\n"
        "  ・GitHub Actions の場合: シークレット BM_LOGIN_ID / BM_PASSWORD を設定してください\n"
        "  ・Mac の場合: ~/Downloads/beauty_merit_report 3/config.py を確認してください")
