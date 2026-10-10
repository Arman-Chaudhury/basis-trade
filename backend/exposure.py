"""The deterministic core, ported from Atropos lib/engine.js: distribution moments, tails, and what each
holding does in each tail. No model authors a number here."""
import math
from scipy.stats import norm

COST = {"optionRoundTrip": 0.025, "rateRoundTrip": 0.30, "directionMinNetBp": 1.0, "shapeThresholdPp": 3,
        "minVolume": 5000, "maxSpread": 0.08, "hedgeBudget": 0.010, "leanBudget": 0.005}
MOVES_BP = [-50, -25, 0, 25]

BUCKETS = {
    "broad_equity": {"beta": 1.00, "duration": 0, "proxy": "SPY", "label": "Broad US equity"},
    "growth_tech": {"beta": 1.30, "duration": 0, "proxy": "QQQ", "label": "Large-cap growth"},
    "high_beta_tech": {"beta": 1.80, "duration": 0, "proxy": "QQQ", "label": "High-beta tech"},
    "small_cap": {"beta": 1.20, "duration": 0, "proxy": "IWM", "label": "Small caps"},
    "financials": {"beta": 1.10, "duration": -2.0, "proxy": "XLF", "label": "Financials"},
    "rate_sensitive_equity": {"beta": 0.70, "duration": 6.0, "proxy": "XLU", "label": "Rate-sensitive equity"},
    "defensive": {"beta": 0.60, "duration": 2.0, "proxy": "SPY", "label": "Defensive"},
    "energy": {"beta": 0.90, "duration": 0, "proxy": "XLE", "label": "Energy"},
    "long_bond": {"beta": 0, "duration": 16.5, "proxy": "TLT", "label": "Long Treasuries"},
    "intermediate_bond": {"beta": 0, "duration": 7.5, "proxy": "IEF", "label": "Intermediate Treasuries"},
    "short_bond": {"beta": 0, "duration": 1.9, "proxy": "SHY", "label": "Short Treasuries"},
    "aggregate_bond": {"beta": 0, "duration": 6.0, "proxy": "AGG", "label": "Aggregate bonds"},
    "gold": {"beta": 0.10, "duration": 3.0, "proxy": "GLD", "label": "Gold"},
    "crypto_related": {"beta": 2.20, "duration": 0, "proxy": "QQQ", "label": "Crypto-linked"},
    "other": {"beta": 1.00, "duration": 0, "proxy": "SPY", "label": "Unclassified"},
}
TICKER_BUCKET = {}
for _b, _syms in {
    "broad_equity": "SPY VOO VTI IVV DIA", "growth_tech": "QQQ QQQM AAPL MSFT GOOGL GOOG AMZN META NFLX AVGO",
    "high_beta_tech": "NVDA AMD TSLA PLTR ARKK SMH SOXX TQQQ", "small_cap": "IWM VB",
    "financials": "JPM BAC WFC GS MS C XLF SCHW KRE", "crypto_related": "HOOD COIN MSTR IBIT",
    "rate_sensitive_equity": "O VNQ XLU NEE XLRE", "defensive": "KO PG JNJ WMT COST XLP PEP MCD BRK.B BRK-B",
    "energy": "XOM CVX XLE OXY", "long_bond": "TLT EDV ZROZ VGLT", "intermediate_bond": "IEF VGIT",
    "short_bond": "SHY SGOV BIL VGSH", "aggregate_bond": "BND AGG", "gold": "GLD IAU",
}.items():
    for s in _syms.split(): TICKER_BUCKET[s] = _b


def r2(x): return round(x * 100) / 100
def p1(x): return f"{round(x * 10) / 10:.1f}"
def inv_norm(p): return float(norm.ppf(min(max(p, 1e-4), 1 - 1e-4)))


def moments(edges, p):
    m = m2 = 0.0
    for i, pi in enumerate(p):
        mid = (edges[i] + edges[i + 1]) / 2; m += mid * pi; m2 += mid * mid * pi
    sd = math.sqrt(max(1e-12, m2 - m * m))
    m3 = sum(pi * ((edges[i] + edges[i + 1]) / 2 - m) ** 3 / sd ** 3 for i, pi in enumerate(p))
    return {"mean": m, "sd": sd, "skew": m3}


def cdf_at(edges, p, x):
    acc = 0.0
    for i, pi in enumerate(p):
        lo, hi = edges[i], edges[i + 1]
        if x >= hi: acc += pi
        elif x > lo: acc += pi * (x - lo) / (hi - lo); break
        else: break
    return min(0.9995, max(0.0005, acc))


def quantile_of(edges, p, q):
    acc = 0.0
    for i, pi in enumerate(p):
        if acc + pi >= q: return edges[i] + (edges[i + 1] - edges[i]) * ((q - acc) / max(pi, 1e-9))
        acc += pi
    return edges[-1]


def bucket_of(sym, overrides=None):
    s = str(sym or "").upper()
    return (overrides or {}).get(s) or TICKER_BUCKET.get(s) or "other"


def move_per_z(bucket, kernels):
    b = BUCKETS.get(bucket, BUCKETS["other"])
    return b["beta"] * kernels.get("spx", 0) - b["duration"] * kernels.get("rate2y", 0) / 100


def analyse(ev, use_calibrated=True):
    """Tails and verdict for one release. `ev` is a ladder from releases.ladders()."""
    p = ev["p_calibrated"] if use_calibrated else ev["p"]
    out = {"id": ev["id"], "name": ev["name"], "short": ev["short"], "tailWords": ev["tailWords"], "date": ev["date"], "kind": ev["kind"],
           "unit": ev["unit"], "dp": ev["dp"], "labels": ev["labels"], "p": p, "p_raw": ev["p"], "edges": ev.get("edges"), "source": ev["source"],
           "trust": ev.get("trust", 0), "verdict": "none", "side": None, "notes": []}
    ref, words = ev.get("reference"), ev["tailWords"]
    if ev["kind"] == "discrete":
        ois = ref["ois"]; em = sum(pi * MOVES_BP[k] for k, pi in enumerate(p)); er = sum(pi * MOVES_BP[k] for k, pi in enumerate(ois))
        gap = em - er; net = abs(gap) - COST["rateRoundTrip"]
        i = max(range(len(p)), key=lambda k: abs(p[k] - ois[k]))
        out.update({"focus": {"label": ev["labels"][i], "market": r2(p[i] * 100), "reference": r2(ois[i] * 100), "gapPp": r2((p[i] - ois[i]) * 100)},
                    "expectedMoveBp": {"market": r2(em), "reference": r2(er)}, "direction": {"rateBp": r2(abs(gap)), "netBp": r2(net), "sign": (gap > 0) - (gap < 0)},
                    "referenceProbs": ois, "referenceLabel": ref.get("label", "swaps market"), "verdict": "direction" if net > COST["directionMinNetBp"] else "none"})
        show = lambda ps: ", ".join(f"{l.lower()} {p1(x * 100)}%" for l, x in zip(ev["labels"], ps) if x >= 0.02)
        sgn = lambda x: ("+" if x >= 0 else "−") + str(abs(r2(x)))
        out["notes"].append(f"The odds: {show(p)}. {out['referenceLabel'].capitalize()}: {show(ois)}. Expected move {sgn(em)}bp against {sgn(er)}bp, a {r2(abs(gap))}bp gap against {COST['rateRoundTrip']}bp to trade" + (": too thin to act on." if out["verdict"] == "none" else "."))
        return out
    edges = ev["edges"]; m = moments(edges, p)
    # Atropos's reference thresholds and options tail prices are typed by hand. If the live ladder has drifted
    # away from them (its mass sits outside 5–95% of them), fall back to the ladder's own 15th/85th percentiles,
    # as Atropos does for an unpriced release, and drop the options comparison.
    stale = cdf_at(edges, p, ref["lowThreshold"]) > 0.4 or (1 - cdf_at(edges, p, ref["highThreshold"])) > 0.6
    if stale:
        lo, hi = quantile_of(edges, p, 0.15), quantile_of(edges, p, 0.85)
        tails = {"low": {"threshold": r2(lo), "pModel": 0.15, "pOptions": None, "z": inv_norm(0.15)},
                 "high": {"threshold": r2(hi), "pModel": 0.15, "pOptions": None, "z": inv_norm(0.85)}}
        out["thresholds_from"] = "ladder 15th/85th percentiles (hand-typed reference is stale)"
    else:
        p_low = cdf_at(edges, p, ref["lowThreshold"]); p_high = 1 - cdf_at(edges, p, ref["highThreshold"])
        tails = {"low": {"threshold": ref["lowThreshold"], "pModel": p_low, "pOptions": ref["optLow"], "z": inv_norm(p_low)},
                 "high": {"threshold": ref["highThreshold"], "pModel": p_high, "pOptions": ref["optHigh"], "z": inv_norm(1 - p_high)}}
        out["thresholds_from"] = "reference"
    for t in tails.values():
        t["gapPp"] = r2((t["pModel"] - t["pOptions"]) * 100) if t["pOptions"] is not None else None
        t["spxMove"] = r2(ev["kernels"]["spx"] * t["z"]); t["rateMove"] = r2(ev["kernels"]["rate2y"] * t["z"]); t["pModel"] = r2(t["pModel"] * 100) / 100
    gap_z = (m["mean"] - ref["consensus"]) / m["sd"]; rate_bp = abs(gap_z * ev["kernels"]["rate2y"])
    direction = {"meanGapZ": r2(gap_z), "rateBp": r2(rate_bp), "netBp": r2(rate_bp - COST["rateRoundTrip"])}
    cheap_side = "low" if (tails["low"]["gapPp"] or -99) >= (tails["high"]["gapPp"] or -99) else "high"; cheap = tails[cheap_side]
    out.update({"mean": r2(m["mean"]), "sd": round(m["sd"], 3), "skew": r2(m["skew"]), "consensus": ref["consensus"], "sigmaVsTrailing": r2(m["sd"] / ref["trailSigma"]), "tails": tails, "direction": direction})
    if stale:
        out["verdict"] = "unpriced"
        out["notes"].append(f"The odds center on {p1(m['mean'])}{ev['unit']} (spread {round(m['sd'], 2)}{ev['unit']}); a {words['low']} print means {p1(tails['low']['threshold'])}{ev['unit']} or lower, {words['high']} means {p1(tails['high']['threshold'])}{ev['unit']} or higher. The hand-typed consensus and options references are stale against this ladder, so there is no second price to trade against.")
    elif cheap["gapPp"] >= COST["shapeThresholdPp"]:
        out["verdict"], out["side"] = "shape", cheap_side
        out["notes"].append(f"{ref['optUnderlying']} options price a {words[cheap_side]} print at {p1(cheap['pOptions'] * 100)}%; the calibrated odds put it at {p1(cheap['pModel'] * 100)}%.")
    elif direction["netBp"] > COST["directionMinNetBp"]:
        out["verdict"] = "direction"
        out["notes"].append(f"The odds average {r2(m['mean'])}{ev['unit']} against a {ref['consensus']}{ev['unit']} consensus: {direction['rateBp']}bp of drift on the two-year against {COST['rateRoundTrip']}bp to trade.")
    elif direction["netBp"] > 0:
        out["notes"].append(f"The odds lean {r2(m['mean'])}{ev['unit']} against a {ref['consensus']}{ev['unit']} consensus, worth {direction['rateBp']}bp on the two-year: above the {COST['rateRoundTrip']}bp cost, too thin to act on.")
    else:
        out["notes"].append("Odds, consensus and options agree within costs.")
    rich = tails["high" if cheap_side == "low" else "low"]
    if rich["gapPp"] is not None and rich["gapPp"] <= -COST["shapeThresholdPp"]:
        out["richTail"] = "high" if cheap_side == "low" else "low"
        out["notes"].append(f"Options price a {words[out['richTail']]} print at {p1(rich['pOptions'] * 100)}% against odds of {p1(rich['pModel'] * 100)}%: a poor week to buy protection against it.")
    if out["trust"] < 40 and out["verdict"] in ("shape", "direction"):
        out["verdict"], out["side"] = "thin", None
        out["notes"].append(f"Too thin to signal from: venue trust {out['trust']}/100.")
    return out


def impacts(holdings, sig):
    """Dollar move of each holding in each tail. holdings: [{symbol, value, bucket}]."""
    if not sig.get("tails"): return []
    rows = []
    for h in holdings:
        per = move_per_z(h["bucket"], {"spx": sig_kernels(sig)["spx"], "rate2y": sig_kernels(sig)["rate2y"]})
        row = {"holding": h["symbol"], "value": r2(h["value"]), "bucket": h["bucket"], "bucketLabel": BUCKETS.get(h["bucket"], BUCKETS["other"])["label"]}
        for side, t in sig["tails"].items():
            pct = per * t["z"]; row[side] = {"pct": r2(pct), "dollars": r2(h["value"] * pct / 100)}
        rows.append(row)
    return rows


def sig_kernels(sig):
    from backend.releases import SPECS
    return SPECS[sig["id"]]["kernels"]
