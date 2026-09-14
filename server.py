#!/usr/bin/env python3
"""X 每日看板本地服务：托管前端 + 调用 twitterapi.io 抓取 + 归一化 + 内存缓存。

零第三方依赖，仅用标准库。启动：
    TWITTERAPI_KEY=xxx python3 server.py
环境变量：
    TWITTERAPI_KEY  twitterapi.io API key（必填，控制台 Dashboard 获取）
    PORT            本服务端口，默认 8787
    CACHE_TTL       拉取结果缓存秒数，默认 900
    MAX_PER_USER    每个账号展示上限，默认 3（越大越费额度）
    CONCURRENCY     并发请求数，默认 8
    REQUEST_INTERVAL 请求最小间隔秒数（安全垫），默认 0.15
"""
import json
import os
import re
import time
import threading
import urllib.parse
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(ROOT, "public")
TWITTERAPI_KEY = os.environ.get("TWITTERAPI_KEY", "").strip()
TWITTERAPI_BASE = "https://api.twitterapi.io"
PORT = int(os.environ.get("PORT", "8787"))
CACHE_TTL = int(os.environ.get("CACHE_TTL", "900"))
PROFILE_TTL = int(os.environ.get("PROFILE_TTL", "86400"))  # 资料缓存 24 小时：一天最多拉一次，其余走缓存
MAX_PER_USER = int(os.environ.get("MAX_PER_USER", "3"))
CONCURRENCY = int(os.environ.get("CONCURRENCY", "8"))
REQUEST_INTERVAL = float(os.environ.get("REQUEST_INTERVAL", "0.15"))
MAX_RETRIES = int(os.environ.get("MAX_RETRIES", "3"))

ACCOUNTS_PATH = os.path.join(ROOT, "accounts.json")
ACCOUNTS = {"categories": []}
HANDLE_MAP = {}   # handle(小写) -> meta
ALL_HANDLES = []


def load_accounts():
    """从 accounts.json 加载账号并重建索引（支持热重载）。"""
    global ACCOUNTS, HANDLE_MAP, ALL_HANDLES
    with open(ACCOUNTS_PATH, encoding="utf-8") as f:
        ACCOUNTS = json.load(f)
    hmap, handles = {}, []
    for cat in ACCOUNTS["categories"]:
        for acc in cat["accounts"]:
            h = acc["handle"]
            hmap[h.lower()] = {
                "handle": h,
                "name": acc.get("name", h),
                "desc": acc.get("desc", ""),
                "categoryId": cat["id"],
                "categoryName": cat["name"],
                "color": cat["color"],
            }
            handles.append(h)
    HANDLE_MAP, ALL_HANDLES = hmap, handles


load_accounts()

_cache = {"ts": 0, "data": None}
# 后台刷新状态
_refresh = {"running": False, "done": 0, "total": 0, "startedAt": 0, "error": None}
_refresh_lock = threading.Lock()

LINK_HANDLE_RE = re.compile(r"(?:x|twitter)\.com/([^/]+)/status", re.I)


def extract_handle(link, fallback=""):
    if link:
        m = LINK_HANDLE_RE.search(link)
        if m:
            return m.group(1)
    return fallback


def to_iso(raw):
    """把 twitterapi.io 的 createdAt（Twitter 原生格式或 ISO）转 ISO8601。"""
    if not raw:
        return None
    for parser in (parsedate_to_datetime, datetime.fromisoformat):
        try:
            dt = parser(raw)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc).isoformat()
        except Exception:
            continue
    return None


_rate_lock = threading.Lock()
_last_call = [0.0]


def _rate_wait():
    """全局限速：确保任意两次请求间隔 >= REQUEST_INTERVAL。"""
    with _rate_lock:
        wait = REQUEST_INTERVAL - (time.monotonic() - _last_call[0])
        if wait > 0:
            time.sleep(wait)
        _last_call[0] = time.monotonic()


class FatalFetchError(Exception):
    """余额不足/鉴权失败等无需重试的致命错误。"""


def _http_hint(e):
    body = ""
    try:
        body = e.read().decode("utf-8", "ignore")[:200]
    except Exception:
        pass
    if e.code == 402:
        return "twitterapi.io 余额不足，请到 twitterapi.io 控制台充值。（%s）" % body
    if e.code in (401, 403):
        return "TWITTERAPI_KEY 无效或未授权。（%s）" % body
    return "twitterapi.io HTTP %d：%s" % (e.code, body)


def _fetch_user(handle):
    """拉取单账号最新推文，遇 429 自动退避重试。返回 (handle, tweets|异常)。"""
    url = (TWITTERAPI_BASE + "/twitter/user/last_tweets?"
           + urllib.parse.urlencode({"userName": handle, "includeReplies": "false"}))
    req = urllib.request.Request(url, headers={"x-api-key": TWITTERAPI_KEY,
                                               "User-Agent": "x-daily-dashboard/1.0"})
    last_err = None
    for attempt in range(MAX_RETRIES):
        _rate_wait()
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = json.loads(resp.read())
            data = body.get("data") if isinstance(body.get("data"), dict) else {}
            tweets = data.get("tweets") or body.get("tweets") or []
            tweets = [t for t in tweets if not (isinstance(t, dict)
                      and (t.get("text") or "").startswith("RT @"))]
            return handle, tweets[:MAX_PER_USER]
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code == 429:
                time.sleep(REQUEST_INTERVAL * (attempt + 1))
                continue
            if e.code in (401, 402, 403):
                # 余额不足/鉴权失败：无需重试其余账号，直接中止整轮
                raise FatalFetchError(_http_hint(e))
            return handle, e
        except Exception as e:
            return handle, e
    return handle, last_err


PROFILES_CACHE_PATH = os.path.join(ROOT, "profiles_cache.json")


def _load_profiles_cache():
    """启动时从磁盘加载 profiles 缓存，使按天缓存能跨重启复用。"""
    try:
        with open(PROFILES_CACHE_PATH, encoding="utf-8") as f:
            obj = json.load(f)
        if isinstance(obj, dict) and isinstance(obj.get("data"), dict):
            return {"ts": obj.get("ts", 0), "data": obj["data"]}
    except Exception:
        pass
    return {"ts": 0, "data": None}


def _save_profiles_cache():
    """把 profiles 缓存原子写入磁盘。"""
    try:
        tmp = PROFILES_CACHE_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"ts": _profiles["ts"], "data": _profiles["data"]}, f, ensure_ascii=False)
        os.replace(tmp, PROFILES_CACHE_PATH)
    except Exception:
        pass


_profiles = _load_profiles_cache()
_profiles_refresh = {"running": False, "done": 0, "total": 0, "error": None}
_profiles_lock = threading.Lock()


def _fetch_profile(handle):
    """拉取单账号资料（粉丝数/头像/简介/存在性）。返回 dict。"""
    url = (TWITTERAPI_BASE + "/twitter/user/info?"
           + urllib.parse.urlencode({"userName": handle}))
    req = urllib.request.Request(url, headers={"x-api-key": TWITTERAPI_KEY,
                                               "User-Agent": "x-daily-dashboard/1.0"})
    for attempt in range(MAX_RETRIES):
        _rate_wait()
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = json.loads(resp.read())
            if body.get("status") == "error" or not body.get("data"):
                return {"handle": handle, "exists": False}
            d = body["data"]
            return {
                "handle": d.get("userName") or handle,
                "exists": True,
                "name": d.get("name") or handle,
                "desc": d.get("description") or "",
                "avatar": (d.get("profilePicture") or "").replace("_normal", ""),
                "followers": d.get("followers") or 0,
                "following": d.get("following") or 0,
                "tweets": d.get("statusesCount") or 0,
                "verified": bool(d.get("isBlueVerified") or d.get("isVerified")),
                "protected": bool(d.get("protected")),
            }
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(REQUEST_INTERVAL * (attempt + 1))
                continue
            if e.code in (401, 402, 403):
                raise FatalFetchError(_http_hint(e))
            return {"handle": handle, "exists": None, "error": "HTTP %d" % e.code}
        except Exception as e:
            return {"handle": handle, "exists": None, "error": str(e)}
    return {"handle": handle, "exists": None, "error": "重试超限"}


def _do_profiles():
    """后台批量拉取全部账号资料，写入 _profiles 缓存。"""
    result = {}
    fatal = [None]
    lock = threading.Lock()

    def work(handle):
        if fatal[0]:
            return
        try:
            p = _fetch_profile(handle)
        except FatalFetchError as e:
            fatal[0] = e
            return
        with lock:
            result[handle.lower()] = p
            _profiles_refresh["done"] += 1

    try:
        with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
            list(pool.map(work, ALL_HANDLES))
        if fatal[0]:
            _profiles_refresh["error"] = str(fatal[0])
        else:
            _profiles["data"] = result
            _profiles["ts"] = time.time()
            _profiles_refresh["error"] = None
            _save_profiles_cache()   # 落地磁盘，按天缓存跨重启复用
    finally:
        _profiles_refresh["running"] = False


def start_profiles(force=False):
    """按天刷新：缓存在 PROFILE_TTL（默认 24h）内一律走缓存、绝不重拉，
    force 也无法绕过——避免同一天内反复烧额度。只有缓存为空或已过期，
    才真正触发一次全量抓取。"""
    now = time.time()
    fresh = _profiles["data"] is not None and now - _profiles["ts"] < PROFILE_TTL
    with _profiles_lock:
        if _profiles_refresh["running"]:
            return False
        if fresh:
            return False
        _profiles_refresh.update({"running": True, "done": 0,
                                  "total": len(ALL_HANDLES), "error": None})
    threading.Thread(target=_do_profiles, daemon=True).start()
    return True


def fetch_feed():
    """并发（受全局限速约束）调用 twitterapi.io 抓取全部账号，归一化为条目列表。

    CONCURRENCY 个线程并行，REQUEST_INTERVAL 控制两次请求最小间隔做安全垫。
    单账号失败不影响其他账号；余额/鉴权类致命错误会中止整轮。增量入库随进度填充。
    """
    if not TWITTERAPI_KEY:
        raise RuntimeError("未设置 TWITTERAPI_KEY；请用 TWITTERAPI_KEY=xxx python3 server.py 启动")

    rows = []
    errors = []
    fatal = [None]
    lock = threading.Lock()

    def work(handle):
        if fatal[0]:
            return
        try:
            _, result = _fetch_user(handle)
        except FatalFetchError as e:
            fatal[0] = e
            return
        with lock:
            if isinstance(result, Exception):
                errors.append("%s: %s" % (handle, result))
            else:
                for tw in result:
                    if isinstance(tw, dict):
                        tw["_source"] = handle
                        rows.append(tw)
            _refresh["done"] += 1
            # 增量入库：每积累若干条就刷新缓存，看板随进度填充
            if rows and _refresh["done"] % 5 == 0:
                _cache["data"] = normalize(list(rows))
                _cache["ts"] = time.time()

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        list(pool.map(work, ALL_HANDLES))

    if fatal[0]:
        raise fatal[0]
    if not rows and errors:
        raise RuntimeError("所有账号抓取均失败（示例：%s）" % errors[0])
    return normalize(rows)


def normalize(rows):
    items = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        author = r.get("author") or {}
        link = r.get("url") or r.get("twitterUrl") or ""
        # _source=被抓账号（用于归类）；author.userName=实际作者
        src = (r.get("_source") or author.get("userName")
               or extract_handle(link)) or ""
        author_handle = author.get("userName") or src
        meta = HANDLE_MAP.get(src.lower())
        text = (r.get("text") or r.get("fullText") or "").strip()
        if not text:
            continue
        avatar = (author.get("profilePicture") or author.get("profile_image_url_https")
                  or author.get("profile_image_url") or "")
        items.append({
            "id": str(r.get("id") or link or (src + text[:40])),
            "handle": meta["handle"] if meta else author_handle,
            "name": meta["name"] if meta else (author.get("name") or author_handle),
            "avatar": avatar,
            "categoryId": meta["categoryId"] if meta else "unknown",
            "categoryName": meta["categoryName"] if meta else "未分类",
            "color": meta["color"] if meta else "#94a3b8",
            "link": link,
            "title": text[:80],
            "text": text,
            "date": to_iso(r.get("createdAt") or r.get("created_at") or r.get("date")),
            "likes": r.get("likeCount") or r.get("favoriteCount") or 0,
            "retweets": r.get("retweetCount") or 0,
            "replies": r.get("replyCount") or 0,
        })
    items.sort(key=lambda x: x["date"] or "", reverse=True)
    return items


def _do_refresh():
    try:
        items = fetch_feed()
        _cache["data"] = items
        _cache["ts"] = time.time()
        _refresh["error"] = None
        _refresh["fatal"] = False
    except FatalFetchError as e:
        # 致命错误（余额不足/鉴权失败）：设为粘性，非 force 轮询不再自动重试
        _refresh["error"] = str(e)
        _refresh["fatal"] = True
    except Exception as e:
        _refresh["error"] = str(e)
    finally:
        _refresh["running"] = False


def start_refresh(force=False):
    """按需在后台启动一次刷新。返回是否真的启动了新刷新。"""
    now = time.time()
    fresh = _cache["data"] is not None and now - _cache["ts"] < CACHE_TTL
    with _refresh_lock:
        if _refresh["running"]:
            return False
        # 粘性致命错误：只有手动 force 才重试，避免自动轮询把错误反复清掉
        if _refresh.get("fatal") and not force:
            return False
        if fresh and not force:
            return False
        _refresh.update({"running": True, "done": 0, "total": len(ALL_HANDLES),
                         "startedAt": now, "error": None, "fatal": False})
    threading.Thread(target=_do_refresh, daemon=True).start()
    return True


def get_data(force=False):
    """立即返回当前缓存。仅在手动 force 时才触发后台抓取，避免自动烧额度。"""
    if force:
        start_refresh(force=True)
    return _cache["data"] or [], _cache["ts"]


_HANDLE_RE = re.compile(r"^[A-Za-z0-9_]{1,15}$")


def validate_accounts(payload):
    """校验前端提交的账号配置，返回规范化后的对象或抛 ValueError。"""
    if not isinstance(payload, dict) or not isinstance(payload.get("categories"), list):
        raise ValueError("格式错误：缺少 categories 数组")
    cats = payload["categories"]
    if not cats:
        raise ValueError("至少要有一个分类")
    seen_cat, out = set(), []
    for c in cats:
        cid = str(c.get("id", "")).strip()
        name = str(c.get("name", "")).strip()
        color = str(c.get("color", "")).strip() or "#94a3b8"
        if not cid or not name:
            raise ValueError("分类需要 id 和 name")
        if cid in seen_cat:
            raise ValueError("分类 id 重复：%s" % cid)
        seen_cat.add(cid)
        accs = []
        for a in (c.get("accounts") or []):
            h = str(a.get("handle", "")).strip().lstrip("@")
            if not h:
                continue
            if not _HANDLE_RE.match(h):
                raise ValueError("非法账号名：%s（只能字母数字下划线，≤15 位）" % h)
            accs.append({
                "handle": h,
                "name": str(a.get("name", "")).strip() or h,
                "desc": str(a.get("desc", "")).strip(),
            })
        out.append({"id": cid, "name": name, "color": color, "accounts": accs})
    return {"categories": out}


def save_accounts(payload):
    """校验并原子写入 accounts.json，然后热重载。"""
    clean = validate_accounts(payload)
    tmp = ACCOUNTS_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ACCOUNTS_PATH)
    load_accounts()
    return clean


CTYPE = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        elif isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/api/accounts":
            return self._send(404, {"ok": False, "error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            clean = save_accounts(payload)
            return self._send(200, {"ok": True, "categories": clean["categories"],
                                    "count": sum(len(c["accounts"]) for c in clean["categories"])})
        except ValueError as e:
            return self._send(400, {"ok": False, "error": str(e)})
        except Exception as e:
            return self._send(500, {"ok": False, "error": str(e)})

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/accounts":
            return self._send(200, ACCOUNTS)

        if path == "/api/feed":
            qs = urllib.parse.parse_qs(parsed.query)
            force = qs.get("force", ["0"])[0] == "1"
            items, ts = get_data(force=force)
            return self._send(200, {
                "ok": True,
                "fetchedAt": datetime.fromtimestamp(ts, timezone.utc).isoformat() if ts else None,
                "count": len(items),
                "items": items,
                "refreshing": _refresh["running"],
                "progress": {"done": _refresh["done"], "total": _refresh["total"]},
                "error": _refresh["error"],
            })

        if path == "/api/profiles":
            qs = urllib.parse.parse_qs(parsed.query)
            force = qs.get("force", ["0"])[0] == "1"
            # 只有用户主动点“加载/刷新”时才尝试抓取；start_profiles 内部按 24h TTL 决定
            # 是否真的抓——缓存新鲜就直接复用，一天最多真实抓取一次。
            if force:
                start_profiles()
            return self._send(200, {
                "ok": True,
                "fetchedAt": datetime.fromtimestamp(_profiles["ts"], timezone.utc).isoformat() if _profiles["ts"] else None,
                "profiles": _profiles["data"] or {},
                "refreshing": _profiles_refresh["running"],
                "progress": {"done": _profiles_refresh["done"], "total": _profiles_refresh["total"]},
                "error": _profiles_refresh["error"],
            })

        # 静态文件
        rel = path.lstrip("/") or "index.html"
        fpath = os.path.normpath(os.path.join(PUBLIC, rel))
        if not fpath.startswith(PUBLIC) or not os.path.isfile(fpath):
            return self._send(404, "not found", "text/plain; charset=utf-8")
        ext = os.path.splitext(fpath)[1]
        with open(fpath, "rb") as fh:
            data = fh.read()
        return self._send(200, data, CTYPE.get(ext, "application/octet-stream"))


if __name__ == "__main__":
    print("X 每日看板运行中：http://localhost:%d" % PORT)
    print("数据源：twitterapi.io  缓存 %ds  并发 %d  间隔 %.2fs" % (CACHE_TTL, CONCURRENCY, REQUEST_INTERVAL))
    print("追踪账号数：%d  每号上限 %d 条" % (len(ALL_HANDLES), MAX_PER_USER))
    if not TWITTERAPI_KEY:
        print("⚠ 未设置 TWITTERAPI_KEY——刷新时会报错。用 TWITTERAPI_KEY=xxx python3 server.py 启动")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
