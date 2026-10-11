"""Talk to the vendored Atropos Node service (services/atropos): holdings (sample or SnapTrade), 13F funds, news, voice.
Every call fails soft: an empty result, never an exception, so the pipeline runs without the service."""
import os
from backend.clients.common import get_json

NODE = os.getenv("ATROPOS_URL", "http://127.0.0.1:4411")


def status():
    try: return get_json(f"{NODE}/api/status", None, ttl=30)[0]
    except Exception: return None  # noqa: BLE001


def portfolio():
    """Holdings the Atropos agent is working on: the linked brokerage (SnapTrade) when configured, else its sample."""
    try:
        j, _ = get_json(f"{NODE}/api/agent", None, ttl=60)
        r = (j or {}).get("result") or {}
        return {"source": r.get("portfolioId", "sample"), "holdings": [{"symbol": h["symbol"], "dollars": h["value"], "bucket": h.get("bucket")} for h in r.get("holdings", [])]}
    except Exception:  # noqa: BLE001
        return None


def funds_holding(symbols, limit=6):
    """Public pensions and university funds (SEC 13F) that hold what you hold: name, the overlap, their tail exposure."""
    try:
        j, _ = get_json(f"{NODE}/api/funds", None, ttl=3600)
    except Exception:  # noqa: BLE001
        return {"note": None, "funds": []}
    want = {s.upper() for s in symbols}; out = []
    for f in (j or {}).get("funds", []):
        overlap = [t for t in f.get("top", []) if t.get("ticker") in want]
        if overlap:
            out.append({"name": f["name"], "kind": f["kind"], "period": f["period"], "total": f["total"], "overlap": [{"ticker": t["ticker"], "value": t["value"]} for t in overlap[:4]],
                        "exposure": f.get("exposure"), "coverage": f.get("coverage")})
    out.sort(key=lambda f: -len(f["overlap"]))
    return {"note": (j or {}).get("note"), "funds": out[:limit]}


def news(query, limit=6):
    try:
        j, _ = get_json(f"{NODE}/api/news", {"q": query}, ttl=600)
    except Exception:  # noqa: BLE001
        return {"query": query, "articles": [], "brief": None}
    arts = [{"title": a.get("title"), "url": a.get("url"), "source": a.get("source"), "when": a.get("published") or a.get("date")} for a in (j or {}).get("articles", [])[:limit]]
    return {"query": query, "articles": arts, "brief": (j or {}).get("brief"), "sources": [s["name"] for s in (j or {}).get("sources", []) if s.get("ok")]}
