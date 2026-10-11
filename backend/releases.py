"""Economic-release ladders (CPI, Fed, payrolls): the full probability distribution per release, read across venues.

Ported from Atropos (lib/markets.js). Live venue readers are Atropos's; here the ladders come from its committed
snapshot (data/atropos/tape.json, venues.json) unless a live reader is wired. Every ladder is labelled with its source.
Basis adds two things on top: each bucket price is passed through the calibration curve and renormalised, and each
venue gets a trust score from its depth.
"""
import json, math, re
from datetime import datetime, timezone
from backend.config import DATA_DIR
from backend import calibration
from backend.trust import trust as trust_score

SPECS = {
    "cpi": {"id": "cpi", "name": "Inflation (CPI, year over year)", "short": "inflation report", "tailWords": {"low": "soft", "high": "hot"},
            "kind": "continuous", "unit": "%", "dp": 2, "kernels": {"spx": -0.525, "rate2y": 4.2},
            "reference": {"consensus": 3.0, "trailSigma": 0.15, "lowThreshold": 2.75, "highThreshold": 3.35, "optLow": 0.092, "optHigh": 0.114, "optUnderlying": "SPY"}},
    "fomc": {"id": "fomc", "name": "Fed rate decision", "short": "Fed decision", "tailWords": {"low": "dovish", "high": "hawkish"},
             "kind": "discrete", "unit": "", "dp": 1, "kernels": {"rateFull": 25, "spx": -0.6, "rate2y": 20},  # per 25bp of surprise: ~-0.6% SPX, ~20bp on the 2y
             "reference": {"ois": [0.020, 0.580, 0.395, 0.005], "label": "swaps market"}},
    "nfp": {"id": "nfp", "name": "Jobs report (payrolls)", "short": "jobs report", "tailWords": {"low": "weak", "high": "strong"},
            "kind": "continuous", "unit": "k", "dp": 0, "kernels": {"spx": 0.41, "rate2y": 3.1},
            "reference": {"consensus": 175, "trailSigma": 71, "lowThreshold": 74.5, "highThreshold": 299.5, "optLow": 0.185, "optHigh": 0.102, "optUnderlying": "SPY"}},
}


def _nums(label):
    """Numbers in a bucket label. '3.0-3.1' is two numbers; '-25-0' is -25 and 0; 'under -25' is one."""
    t = re.sub(r"(?<=\d)-(?=-?\d)", " to ", label.replace(",", ""))
    return [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", t)]


def _edges(labels):
    """Bucket edges from labels; open ends ('under X', 'over X') get one bucket-width of room."""
    nums = [_nums(l) for l in labels]
    inner = [n for n in nums if len(n) == 2]
    width = (inner[0][1] - inner[0][0]) if inner else 1.0
    edges = []
    for i, n in enumerate(nums):
        if len(n) == 2: edges.append(n[0])
        elif i == 0: edges.append(n[0] - width)
        else: edges.append(n[0])
    last = nums[-1]
    edges.append(last[1] if len(last) == 2 else last[0] + width)
    return edges


def _edges_any(labels, unit):
    """Edges for any venue's label style: Kalshi 'under 3'/'3-3.1'/'over 5', Polymarket '≤2.9%'/'3.0%'/'≥4.0%' or
    '<-25k'/'-25k to 0'/'100k+', ForecastEx 'under 2.7'/'2.7-2.8'. Point buckets ('3.0%') get half the neighbour gap."""
    nums = [_nums(l.replace("k", "").replace("K", "").replace("%", "").replace("+", "").replace("≤", "under ").replace("≥", "over ").replace("<", "under ").replace(">", "over ")) for l in labels]
    if any(len(n) == 0 for n in nums): return None
    if all(len(n) == 2 for n in nums[1:-1]) and len(nums) > 2: return _edges(labels.__class__([l for l in labels])) if False else _edges_generic(nums, labels)
    return _edges_generic(nums, labels)


def _edges_generic(nums, labels):
    pts = []
    for i, n in enumerate(nums):
        if len(n) == 2: pts.append((n[0], n[1]))
        else: pts.append((n[0], None))
    # point buckets: width from neighbours
    centres = [a if b is None else (a + b) / 2 for a, b in pts]
    step = min((abs(centres[i + 1] - centres[i]) for i in range(len(centres) - 1)), default=1.0) or 1.0
    edges = []
    for i, (a, b) in enumerate(pts):
        lab = labels[i].lower()
        if b is not None: edges.append(a)
        elif i == 0: edges.append(a - step)                       # 'under a' / '≤a'
        elif i == len(pts) - 1: edges.append(a if ("over" in lab or "+" in lab or "≥" in lab or ">" in lab) else a - step / 2)
        else: edges.append(a - step / 2)                          # point bucket centred on a
    last_a, last_b = pts[-1]
    edges.append(last_b if last_b is not None else (edges[-1] + step))
    return edges


def rebin(labels_from, p_from, unit, edges_to):
    """Resample a venue ladder onto the consensus edges through its piecewise-uniform CDF. None if labels don't parse."""
    e = _edges_any(labels_from, unit)
    if not e or len(e) != len(p_from) + 1: return None
    def cdf(x):
        acc = 0.0
        for i, pi in enumerate(p_from):
            lo, hi = e[i], e[i + 1]
            if x >= hi: acc += pi
            elif x > lo: acc += pi * (x - lo) / (hi - lo); break
            else: break
        return acc
    out = [max(cdf(edges_to[i + 1]) - cdf(edges_to[i]), 0.0) for i in range(len(edges_to) - 1)]
    out[0] += cdf(edges_to[0]); out[-1] += 1 - cdf(edges_to[-1])
    tot = sum(out) or 1
    return [x / tot for x in out]


def _snapshot():
    tape = json.loads((DATA_DIR / "atropos" / "tape.json").read_text())
    venues = json.loads((DATA_DIR / "atropos" / "venues.json").read_text())
    return tape, venues


def calibrate_ladder(p):
    """Pass each bucket price through the calibration curve, then renormalise."""
    c = [max(calibration.calibrate(x) or 0.0, 1e-4) for x in p]
    s = sum(c)
    return [x / s for x in c]


def venue_trust(v, all_vols):
    state = {"volume_24h": v.get("volume"), "spread": v.get("medianSpread"), "last_trade_ts": datetime.now(timezone.utc).isoformat(),
             "top10_holder_share": None, "largest_trade_24h": 0}
    return trust_score(state, all_vols, v.get("date") or "2026-12-31")


def ladders(live=True):
    """Every release with its consensus ladder plus per-venue ladders, calibrated, with trust.

    Venues: live Kalshi and Polymarket (backend/venues_live.py) first, then Atropos's snapshot venues
    (Kalshi via IBKR, ForecastEx, Limitless, Futuur, CME via IBKR). The consensus ladder is live Kalshi when it
    answers, else the snapshot. Every ladder says where it came from."""
    from backend.venues_live import live_venues
    tape, venues = _snapshot()
    by_id = {s["id"]: s for s in tape["signals"]}
    live_all = {rid: (live_venues(rid, SPECS[rid]["unit"]) if live else []) for rid in SPECS}
    vol_pool = [v.get("volume") for r in venues["releases"] for v in r["venues"] if v.get("ok") and v.get("volume")]
    vol_pool += [v.get("volume") for vs in live_all.values() for v in vs if v.get("ok") and v.get("volume")]
    out = []
    for rid, spec in SPECS.items():
        sig = by_id.get(rid)
        if not sig: continue
        rel_venues = next((r for r in venues["releases"] if r["id"] == rid), {"venues": []})
        vlist = []
        for v in live_all[rid]:
            if not v.get("ok"): vlist.append({"venue": v["venue"], "ok": False, "error": v.get("error"), "live": True}); continue
            t = venue_trust({**v, "date": sig["date"]}, vol_pool)
            top = max(range(len(v["p"])), key=lambda i: v["p"][i])
            if v["venue"] == "Fed funds futures": v["reference"] = True  # the traditional-market reference, not a prediction market
            vlist.append({**v, "live": True, "trust": t["score"], "trust_breakdown": t["components"], "top": v["labels"][top], "topP": v["p"][top]})
        live_names = {v["venue"] for v in live_all[rid]}
        for v in rel_venues["venues"]:
            if v["venue"] == "Kalshi" or v["venue"] in live_names: continue  # a live reader replaces the snapshot row
            if not v.get("ok"): vlist.append({"venue": v["venue"], "ok": False, "error": v.get("error"), "live": False}); continue
            t = venue_trust(v, vol_pool)
            vlist.append({"venue": v["venue"], "ok": True, "live": False, "title": v.get("title"), "labels": v["labels"], "p": v["p"], "volume": v.get("volume"),
                          "trust": t["score"], "trust_breakdown": t["components"], "top": v.get("top"), "topP": v.get("topP"), "source": "snapshot"})
        lk = next((v for v in vlist if v["venue"] == "Kalshi" and v.get("ok")), None)
        if lk:
            labels = lk["labels"]
            cons_edges = _edges(labels) if spec["kind"] == "continuous" else None
            used = []
            for v in vlist:
                if not v.get("ok") or not v.get("trust") or v.get("reference"): continue
                if v.get("labels") == labels: v["p_rebinned"] = v["p"]
                elif cons_edges: v["p_rebinned"] = rebin(v["labels"], v["p"], spec["unit"], cons_edges)
                else: v["p_rebinned"] = None
                if v["p_rebinned"]: used.append(v)
            wsum = sum(v["trust"] for v in used) or 1
            p = [sum(v["p_rebinned"][i] * v["trust"] for v in used) / wsum for i in range(len(labels))]
            tot = sum(p) or 1; p = [x / tot for x in p]
            source = "trust-weighted: " + ", ".join(f"{v['venue']} {v['trust']}" for v in used)
            as_of = datetime.now(timezone.utc).isoformat()
        else: labels, p, source, as_of = sig["labels"], sig["p"], sig.get("source", "snapshot") + " (snapshot)", tape["asOf"]
        edges = _edges(labels) if spec["kind"] == "continuous" else None
        cal = calibrate_ladder(p)
        out.append({**spec, "date": sig["date"], "title": (lk or {}).get("title") or sig.get("title"), "labels": labels, "p": p, "p_calibrated": cal, "edges": edges,
                    "source": source, "asOf": as_of, "venues": vlist,
                    "depth": {"volume": max((v.get("volume") or 0 for v in rel_venues["venues"] if v.get("ok")), default=0), "medianSpread": None, "emptyBooks": 0, "markets": len(labels)},
                    "trust": max((v["trust"] for v in vlist if v.get("ok")), default=0)})
    return out


def ladder(rid):
    return next((l for l in ladders() if l["id"] == rid), None)
