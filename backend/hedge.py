"""Two ways to protect a tail, side by side: a prediction-market contract (Atropos's agent, trust-gated by Basis)
and an equity hedge found by Leaf's pair screener."""
import math
import numpy as np, pandas as pd
from backend.exposure import cdf_at, r2
from backend.leaf.lego.functions import Pair, Stock
from backend.leaf.lego.providers import get_prices

HEDGE_UNIVERSE = ["SH", "PSQ", "SQQQ", "VIXY", "UUP", "FXY", "TLT", "IEF", "GLD", "SHY", "XLU", "XLP", "TBT", "TBF"]
MIN_OI = 500


def contract_hedge(sig, side, loss, trust):
    """The contract that pays in the tail, sized so its payout covers the loss, priced from the ladder."""
    if loss <= 0 or not sig.get("tails"): return {"skipped": "No loss in this tail."}
    t = sig["tails"][side]
    if sig["kind"] == "discrete":
        fair = r2(t["pModel"]); label = t["label"]; strike = None
        return _price_contract(sig, side, loss, trust, fair, label, strike)
    edges, p = sig["edges"], sig["p"]
    # nearest bucket edge to the threshold is the strike the venue lists
    strike = min(edges[1:-1], key=lambda e: abs(e - t["threshold"])) if len(edges) > 2 else t["threshold"]
    fair = (1 - cdf_at(edges, p, strike)) if side == "high" else cdf_at(edges, p, strike)
    fair = r2(fair)
    label = f"{'Above' if side == 'high' else 'Below'} {strike:g}{sig['unit']}"
    return _price_contract(sig, side, loss, trust, fair, label, strike)


def _price_contract(sig, side, loss, trust, fair, label, strike):
    ask = r2(min(0.99, fair + 0.01)); bid = r2(max(0.01, fair - 0.01))  # no live book in the snapshot: one-cent half-spread, labelled
    payout_per = 1 - ask
    contracts = math.ceil(loss / max(payout_per, 0.01))
    cost = r2(contracts * ask)
    over_fair = r2(ask - fair)
    if trust < 40: verdict, why = "skip", f"venue trust {trust}/100 is below the gate"
    elif ask > fair * 1.10 + 0.01: verdict, why = "skip", "costs more than the odds imply"
    elif ask < fair * 0.95: verdict, why = "buy", "cheaper than the odds imply"
    else: verdict, why = "fair", "priced about where the odds put it"
    return {"instrument": "prediction_contract", "venue": "Kalshi via IBKR (snapshot)", "contract": f'YES on "{label}"', "strike": strike, "expiry": sig["date"],
            "fair": fair, "ask": ask, "bid": bid, "book": "estimated (snapshot has no live book)", "contracts": contracts, "cost": cost, "payout": contracts,
            "covers": r2(loss), "overFair": over_fair, "trust": trust, "verdict": verdict, "why": why}


def equity_hedge(holdings, side_sign, days=252):
    """Leaf's pair maths: the portfolio as one pseudo-ticker against a hedge universe; best hedge effectiveness wins.
    side_sign: +1 if the tail hurts (we want an inverse mover), used only for the sign check."""
    syms = [h["symbol"] for h in holdings]
    try:
        prices = get_prices("yahoo", list(dict.fromkeys(syms + HEDGE_UNIVERSE)), days)
    except Exception as e:  # noqa: BLE001
        return {"skipped": f"No price history: {e}"}
    close = prices.close
    have = [s for s in syms if s in close.columns]
    if not have: return {"skipped": "None of the holdings have price history."}
    w = np.array([next(h["value"] for h in holdings if h["symbol"] == s) for s in have], dtype=float); w /= w.sum()
    rets = close[have].pct_change().dropna()
    port_ret = (rets.values * w).sum(axis=1)
    port_close = 100 * np.cumprod(1 + port_ret)
    port = Stock(port_close, np.ones(len(port_close)))
    rows = []
    for c in HEDGE_UNIVERSE:
        if c not in close.columns or c in have: continue
        s = Stock(close[c].to_numpy()[-len(port_close):], prices.volume[c].to_numpy()[-len(port_close):])
        pr = Pair(port, s)
        corr = float(pr.corr) if hasattr(pr, "corr") else float(np.corrcoef(port.returns, s.returns)[0, 1])
        he = corr * corr
        h = float(np.cov(port.returns, s.returns)[0, 1] / np.var(s.returns, ddof=1))
        rows.append({"ticker": c, "corr": r2(corr), "hedge_effectiveness": r2(he), "hedge_ratio": r2(h), "coint_p": r2(float(pr.coint_p)) if hasattr(pr, "coint_p") else None})
    inverse = sorted([r for r in rows if r["corr"] < -0.2], key=lambda r: -r["hedge_effectiveness"])
    if not inverse: return {"skipped": "Nothing in the hedge universe moves against this book.", "candidates": rows[:5]}
    best = inverse[0]; value = sum(h["value"] for h in holdings)
    dollars = r2(abs(best["hedge_ratio"]) * value)
    return {"instrument": "equity_hedge", "ticker": best["ticker"], "action": "BUY", "dollars": dollars, "corr": best["corr"], "hedge_effectiveness": best["hedge_effectiveness"],
            "hedge_ratio": best["hedge_ratio"], "note": f"removes about {round(best['hedge_effectiveness'] * 100)}% of the book's variance; it hedges every day, not just the release",
            "alternatives": inverse[1:3], "screened": len(rows), "source": "Leaf pair screener over Yahoo daily closes"}
