"""From a sentence to a trade: parse → signal (ladder) → exposure → express (contract vs equity hedge) → history → ledger."""
import json, logging, re
from backend import releases, exposure, hedge, history, ledger, config
from backend.exposure import bucket_of, r2, p1

log = logging.getLogger("basis.pipeline")
SAMPLE_PORTFOLIO = [("SPY", 40), ("QQQ", 15), ("NVDA", 30), ("TLT", 60), ("GLD", 20)]
RELEASE_WORDS = {"cpi": ["cpi", "inflation", "prices"], "fomc": ["fed", "fomc", "rate decision", "powell", "hike", "cut"], "nfp": ["jobs", "payroll", "nfp", "unemployment"]}
HIGH_WORDS = ["hot", "high", "strong", "hawkish", "hike", "above"]; LOW_WORDS = ["soft", "low", "weak", "dovish", "cut", "below", "miss"]

PARSE_SYSTEM = """You turn one sentence from an investor into JSON for a hedging tool. Return STRICT JSON only:
{"holdings":[{"symbol":"SPY","units":40}|{"symbol":"TLT","dollars":5000}],"release":"cpi"|"fomc"|"nfp"|null,"side":"high"|"low"|null,"restated":"one sentence"}
release: cpi = inflation/CPI; fomc = Fed decision; nfp = jobs/payrolls. side: the tail they are worried about (hot/strong/hawkish/hike → high; soft/weak/dovish/cut → low).
If no quantities are given, omit units and dollars. Never invent tickers that are not in the sentence."""


def _parse_llm(text):
    """Gemini first (Leaf's client), then Claude, else None."""
    try:
        from backend.leaf.ex import gemini
        schema = {"type": "object", "properties": {"holdings": {"type": "array", "items": {"type": "object", "properties": {"symbol": {"type": "string"}, "units": {"type": "number"}, "dollars": {"type": "number"}}, "required": ["symbol"]}},
                  "release": {"type": "string", "nullable": True}, "side": {"type": "string", "nullable": True}, "restated": {"type": "string"}}, "required": ["holdings", "restated"]}
        out = gemini.generate_json(f"<sentence>\n{text}\n</sentence>", PARSE_SYSTEM, schema)
        return {**out, "parser": "gemini"}
    except Exception as e:  # noqa: BLE001
        log.info("gemini parse unavailable: %s", str(e)[:120])
    try:
        from backend import ai
        if ai.available():
            txt = ai._call(PARSE_SYSTEM, text, 400); m = re.search(r"\{.*\}", txt, re.S)
            if m: return {**json.loads(m.group(0)), "parser": "claude"}
    except Exception as e:  # noqa: BLE001
        log.info("claude parse unavailable: %s", str(e)[:120])
    return None


def _parse_rules(text):
    t = text.lower()
    skip = {"CPI", "FOMC", "NFP", "FED", "ETF", "USD", "AND", "THE", "I"}
    holdings = {}
    for units, sym in re.findall(r"(\d[\d,]*)\s*(?:shares?\s+(?:of\s+)?|x\s*)?([A-Z]{2,5}(?:[.-][A-Z])?)\b", text):
        if sym not in skip: holdings[sym] = {"symbol": sym, "units": float(units.replace(",", ""))}
    for dollars, sym in re.findall(r"\$\s?(\d[\d,]*)k?\s*(?:of|in)\s+([A-Z]{2,5})\b", text):
        if sym not in skip: holdings[sym] = {"symbol": sym, "dollars": float(dollars.replace(",", ""))}
    for sym in re.findall(r"\b[A-Z]{2,5}(?:[.-][A-Z])?\b", text):
        if sym not in skip and sym not in holdings: holdings[sym] = {"symbol": sym}
    rel = next((r for r, ws in RELEASE_WORDS.items() if any(w in t for w in ws)), None)
    side = "high" if any(w in t for w in HIGH_WORDS) else ("low" if any(w in t for w in LOW_WORDS) else None)
    return {"holdings": list(holdings.values()), "release": rel, "side": side, "restated": text, "parser": "rules"}


def parse(text):
    out = _parse_llm(text) or _parse_rules(text)
    if not out.get("holdings"): out["holdings"] = [{"symbol": s, "units": u} for s, u in SAMPLE_PORTFOLIO]; out["portfolio_source"] = "sample"
    else: out["portfolio_source"] = "sentence"
    out["release"] = out.get("release") or "cpi"
    return out


def _price(symbol):
    from backend import db
    con = db.connect(); rows = db.get_asset(con, symbol)
    if rows: return rows[-1][1]
    try:
        from backend.clients.proxies import yf_history
        h = yf_history(symbol, "5d")
        if h: db.upsert_asset(con, symbol, h); return h[-1][1]
    except Exception:  # noqa: BLE001
        pass
    return None


def holdings_from(parsed):
    out = []
    for h in parsed["holdings"]:
        sym = h["symbol"].upper(); px = _price(sym)
        if h.get("dollars"): value = float(h["dollars"])
        elif h.get("units") and px: value = float(h["units"]) * px
        elif px: value = 10 * px  # no quantity given: ten shares, labelled
        else: value = 5000.0
        out.append({"symbol": sym, "value": r2(value), "price": px, "units": h.get("units"), "bucket": bucket_of(sym), "assumed": not (h.get("dollars") or (h.get("units") and px))})
    return out


def run(text):
    parsed = parse(text)
    holdings = holdings_from(parsed)
    lad = releases.ladder(parsed["release"]) or releases.ladders()[0]
    sig = exposure.analyse(lad)
    side = parsed.get("side") or (sig.get("side") if sig.get("side") else "high")
    rows = exposure.impacts(holdings, sig)
    tail_total = r2(sum(r[side]["dollars"] for r in rows)) if rows else 0.0
    loss = max(0.0, -tail_total)
    contract = hedge.contract_hedge(sig, side, loss, sig["trust"]) if sig.get("tails") else {"skipped": "No tails for this release."}
    equity = hedge.equity_hedge(holdings, 1) if loss > 0 else {"skipped": "This tail does not hurt the book."}
    hist = history.fits(holdings, parsed["release"], side)
    words = sig["tailWords"]
    total = r2(sum(h["value"] for h in holdings))
    if loss <= 0:
        verdict = f"A {words[side]} {sig['short']} on {sig['date']} would not hurt this book: it gains about ${abs(tail_total):,.0f}. Nothing to protect."
    elif contract.get("verdict") == "skip":
        verdict = f"A {words[side]} {sig['short']} on {sig['date']} costs this ${total:,.0f} book about ${loss:,.0f}. The protection contract is a skip: {contract['why']}."
    else:
        verdict = (f"A {words[side]} {sig['short']} on {sig['date']} costs this ${total:,.0f} book about ${loss:,.0f}. "
                   f"{contract['contracts']} contracts of {contract['contract']} cost ${contract['cost']:,.2f} and pay ${contract['payout']:,.0f}: {contract['why']} ({contract['verdict']}).")
    if hist.get("hitRate") is not None:
        verdict += f" On the {hist['lossDays']} {words[side]}-side loss days since {hist['from'][:4]}, that protection would have paid on {hist['paidOnLoss']}."
    eid = ledger.record({"release": parsed["release"], "side": side, "verdict": contract.get("verdict", "skip"), "contract": contract.get("contract"), "contracts": contract.get("contracts"),
                         "cost": contract.get("cost"), "payout": contract.get("payout"), "loss": loss, "trust": sig["trust"], "sentence": text})
    return {"parsed": parsed, "holdings": holdings, "total": total, "signal": sig, "side": side, "impacts": rows, "tail_total": tail_total, "loss": loss,
            "express": {"contract": contract, "equity": equity}, "history": hist, "verdict": verdict, "ledger_id": eid,
            "provenance": {"ladder": sig["source"], "calibration": "Basis isotonic curve", "engine": "Atropos (ported)", "screener": "Leaf", "parser": parsed["parser"]}}
