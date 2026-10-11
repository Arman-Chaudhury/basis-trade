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


def ladders():
    """Every release with its consensus ladder plus per-venue ladders, calibrated, with trust."""
    tape, venues = _snapshot()
    by_id = {s["id"]: s for s in tape["signals"]}
    vol_pool = [v.get("volume") for r in venues["releases"] for v in r["venues"] if v.get("ok") and v.get("volume")]
    out = []
    for rid, spec in SPECS.items():
        sig = by_id.get(rid)
        if not sig: continue
        labels, p = sig["labels"], sig["p"]
        edges = _edges(labels) if spec["kind"] == "continuous" else None
        rel_venues = next((r for r in venues["releases"] if r["id"] == rid), {"venues": []})
        vlist = []
        for v in rel_venues["venues"]:
            if not v.get("ok"): vlist.append({"venue": v["venue"], "ok": False, "error": v.get("error")}); continue
            t = venue_trust(v, vol_pool)
            vlist.append({"venue": v["venue"], "ok": True, "title": v.get("title"), "labels": v["labels"], "p": v["p"], "volume": v.get("volume"),
                          "trust": t["score"], "trust_breakdown": t["components"], "top": v.get("top"), "topP": v.get("topP")})
        cal = calibrate_ladder(p)
        out.append({**spec, "date": sig["date"], "title": sig.get("title"), "labels": labels, "p": p, "p_calibrated": cal, "edges": edges,
                    "source": sig.get("source", "snapshot"), "asOf": tape["asOf"], "venues": vlist,
                    "depth": {"volume": max((v.get("volume") or 0 for v in rel_venues["venues"] if v.get("ok")), default=0), "medianSpread": None, "emptyBooks": 0, "markets": len(labels)},
                    "trust": max((v["trust"] for v in vlist if v.get("ok")), default=0)})
    return out


def ladder(rid):
    return next((l for l in ladders() if l["id"] == rid), None)
