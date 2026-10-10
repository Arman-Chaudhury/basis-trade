"""Does the protection pay when you lose? Ported from Atropos lib/history.js.

Live path needs BLS (release dates, CPI first prints) and ALFRED (payroll vintages); both were unreachable during
the build, so this serves Atropos's committed result for the sample portfolio and says so. The structure is the
live one, so wiring BLS back is a drop-in."""
import json
from backend.config import DATA_DIR

SAMPLE = {"SPY", "QQQ", "NVDA", "TLT", "AAPL", "JPM", "GLD", "XLE", "IEF", "MSFT"}


def fits(holdings, release, side):
    th = json.loads((DATA_DIR / "atropos" / "demo.json").read_text())  # fallback shape
    try:
        thread = json.loads((DATA_DIR / "atropos" / "thread.json").read_text())
        f = thread["history"]["fits"].get(f"{release}:{side}")
        if f:
            same = set(h["symbol"] for h in holdings) <= SAMPLE
            return {**f, "test": thread["history"]["test"], "source": "Atropos snapshot (sample portfolio)" if same else "Atropos snapshot (sample portfolio; your holdings differ — live BLS/ALFRED path not reachable)", "live": False}
    except Exception:  # noqa: BLE001
        pass
    return {"days": None, "lossDays": None, "paidOnLoss": None, "hitRate": None, "worst": [], "source": "unavailable", "live": False}
