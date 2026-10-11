"""Live prediction-market ladders for the three releases, read directly from Kalshi and Polymarket.

Each reader returns the venue shape used by releases.ladders(): {venue, ok, title, labels, p, volume, medianSpread, source}.
Kalshi lists 'above T' threshold markets: bucket probabilities are the differences of the cumulative curve (made
monotone first). Polymarket lists one market per bucket: outcome prices are read and renormalised.
Any failure returns ok=False with the reason, never an exception, so a venue being down never breaks the ladder."""
import json, re, statistics
from datetime import datetime, timezone
from backend.clients.common import get_json

K = "https://api.elections.kalshi.com/trade-api/v2"; G = "https://gamma-api.polymarket.com"
KALSHI_EVENTS = {"cpi": ("KXCPIYOY-26SEP", 1.0), "fomc": ("KXFEDDECISION-26OCT", 1.0), "nfp": ("KXPAYROLLS-26OCT", 0.001)}
POLY_SLUGS = {"cpi": "september-inflation-us-annual", "fomc": "fed-decision-in-october-20260617190323537", "nfp": "how-many-jobs-added-in-october-2026"}
FED_LABELS = ["Cut 0.50+", "Cut 0.25", "Hold", "Hike"]


def _f(x, d=None):
    try: return float(x)
    except (TypeError, ValueError): return d


def _mid(m):
    b, a = _f(m.get("yes_bid_dollars")), _f(m.get("yes_ask_dollars"))
    if b is not None and a is not None and 0 <= b <= a <= 1 and (a - b) < 0.3: return (a + b) / 2, a - b
    return _f(m.get("last_price_dollars"), 0.5), None


def _fmt(x, unit):
    return f"{x:g}" if unit != "k" else f"{x:g}"


def kalshi_ladder(rid, unit):
    ev, scale = KALSHI_EVENTS[rid]
    try:
        j, stale = get_json(f"{K}/markets", {"event_ticker": ev, "limit": 100}, ttl=60)
    except Exception as e:  # noqa: BLE001
        return {"venue": "Kalshi", "ok": False, "error": f"unreachable ({str(e)[:60]})"}
    ms = j.get("markets", [])
    if not ms: return {"venue": "Kalshi", "ok": False, "error": f"no markets for {ev}"}
    vol = sum(_f(m.get("volume_24h_fp"), 0) for m in ms); spreads = []
    title = ms[0].get("title", ev).split("?")[0]
    if rid == "fomc":
        px = {}
        for m in ms:
            p, s = _mid(m); px[m["ticker"].split("-")[-1]] = p
            if s is not None: spreads.append(s)
        raw = [px.get("C26", 0), px.get("C25", 0), px.get("H0", 0), px.get("H25", 0) + px.get("H26", 0)]
        tot = sum(raw) or 1; p = [x / tot for x in raw]
        return {"venue": "Kalshi", "ok": True, "title": title, "labels": FED_LABELS, "p": p, "volume": vol, "medianSpread": statistics.median(spreads) if spreads else None,
                "source": "live" + (" (cached)" if stale else ""), "ticker": ev}
    rows = []
    for m in ms:
        suffix = m["ticker"].split("-")[-1]
        if not suffix.startswith("T"): continue
        t = _f(suffix[1:]); p, s = _mid(m)
        if t is None: continue
        rows.append((t * scale, p)); 
        if s is not None: spreads.append(s)
    rows.sort()
    # cumulative P(>t) must fall with t; enforce, then difference into buckets
    cum = []
    for t, p in rows: cum.append(min(p, cum[-1]) if cum else p)
    labels, p = [f"under {_fmt(rows[0][0], unit)}"], [1 - cum[0]]
    for i in range(len(rows) - 1):
        labels.append(f"{_fmt(rows[i][0], unit)}-{_fmt(rows[i + 1][0], unit)}"); p.append(max(cum[i] - cum[i + 1], 0))
    labels.append(f"over {_fmt(rows[-1][0], unit)}"); p.append(cum[-1])
    tot = sum(p) or 1; p = [x / tot for x in p]
    return {"venue": "Kalshi", "ok": True, "title": title, "labels": labels, "p": p, "volume": vol, "medianSpread": statistics.median(spreads) if spreads else None,
            "source": "live" + (" (cached)" if stale else ""), "ticker": ev}


def polymarket_ladder(rid):
    slug = POLY_SLUGS[rid]
    try:
        j, stale = get_json(f"{G}/events", {"slug": slug}, ttl=60)
    except Exception as e:  # noqa: BLE001
        return {"venue": "Polymarket", "ok": False, "error": f"unreachable ({str(e)[:60]})"}
    if not j: return {"venue": "Polymarket", "ok": False, "error": f"no event {slug}"}
    ev = j[0]; ms = [m for m in ev.get("markets", []) if not m.get("closed") and m.get("outcomePrices")]
    if not ms: return {"venue": "Polymarket", "ok": False, "error": "no open markets"}
    def yes(m):
        try: return float(json.loads(m["outcomePrices"])[0])
        except Exception: return 0.0  # noqa: BLE001
    vol = sum(_f(m.get("volume24hr"), 0) for m in ms); spreads = [_f(m.get("spread")) for m in ms if _f(m.get("spread")) is not None]
    if rid == "fomc":
        raw = [0.0] * 4
        for m in ms:
            q = m["question"].lower(); v = yes(m)
            if "decrease" in q and "50" in q: raw[0] += v
            elif "decrease" in q: raw[1] += v
            elif "no change" in q: raw[2] += v
            elif "increase" in q: raw[3] += v
        tot = sum(raw) or 1
        return {"venue": "Polymarket", "ok": True, "title": ev["title"], "labels": FED_LABELS, "p": [x / tot for x in raw], "volume": vol,
                "medianSpread": statistics.median(spreads) if spreads else None, "source": "live" + (" (cached)" if stale else ""), "slug": slug}
    def key(m):
        n = re.findall(r"-?\d+(?:\.\d+)?", (m.get("groupItemTitle") or m["question"]).replace(",", ""))
        return float(n[0]) if n else 0.0
    ms.sort(key=key)
    labels = [(m.get("groupItemTitle") or m["question"]).strip() for m in ms]; raw = [yes(m) for m in ms]; tot = sum(raw) or 1
    return {"venue": "Polymarket", "ok": True, "title": ev["title"], "labels": labels, "p": [x / tot for x in raw], "volume": vol,
            "medianSpread": statistics.median(spreads) if spreads else None, "source": "live" + (" (cached)" if stale else ""), "slug": slug}


NODE = __import__("os").getenv("ATROPOS_URL", "http://127.0.0.1:4411")


def node_venues(rid):
    """Every venue Atropos's Node service reads (Kalshi, Kalshi via IBKR, ForecastEx, Limitless, Futuur, CME via IBKR),
    live from /api/venues when the service is up. Returns [] when it is not."""
    try:
        j, stale = get_json(f"{NODE}/api/venues", None, ttl=60)
    except Exception:  # noqa: BLE001
        return []
    rel = next((r for r in j.get("releases", []) for _ in [0] if r["id"] == rid), None)
    if not rel: return []
    out = []
    for v in rel["venues"]:
        if v["venue"] == "Kalshi": continue  # our own direct reader covers it
        if not v.get("ok"): out.append({"venue": v["venue"], "ok": False, "error": v.get("error"), "via": "atropos"}); continue
        out.append({"venue": v["venue"], "ok": True, "title": v.get("title"), "labels": v["labels"], "p": v["p"], "volume": v.get("volume"), "medianSpread": v.get("medianSpread"),
                    "source": "live via Atropos" + (" (cached)" if stale else ""), "via": "atropos"})
    return out


def live_venues(rid, unit):
    return [kalshi_ladder(rid, unit), polymarket_ladder(rid)] + node_venues(rid)
