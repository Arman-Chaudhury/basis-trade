"""Every call the pipeline makes is recorded, then settled against the first print after the release."""
import json, uuid
from datetime import datetime, timezone
from backend import db

SCHEMA = """CREATE TABLE IF NOT EXISTS ledger (id TEXT PRIMARY KEY, ts TEXT, release TEXT, side TEXT, verdict TEXT, contract TEXT,
  contracts INTEGER, cost REAL, payout REAL, loss REAL, trust INTEGER, settled INTEGER DEFAULT 0, outcome TEXT, pnl REAL, detail TEXT)"""


def _con():
    con = db.connect(); con.executescript(SCHEMA); return con


def record(entry):
    con = _con(); eid = uuid.uuid4().hex[:10]
    with db.tx(con):
        con.execute("INSERT INTO ledger VALUES (?,?,?,?,?,?,?,?,?,?,?,0,NULL,NULL,?)",
                    (eid, datetime.now(timezone.utc).isoformat(), entry["release"], entry["side"], entry["verdict"], entry.get("contract"), entry.get("contracts"),
                     entry.get("cost"), entry.get("payout"), entry.get("loss"), entry.get("trust"), json.dumps(entry)))
    return eid


def settle(eid, happened: bool):
    con = _con(); row = con.execute("SELECT * FROM ledger WHERE id=?", (eid,)).fetchone()
    if not row: return None
    if row["verdict"] in ("buy", "fair") and row["contracts"]:
        pnl = (row["payout"] - row["cost"]) if happened else -row["cost"]
    else: pnl = 0.0
    with db.tx(con):
        con.execute("UPDATE ledger SET settled=1, outcome=?, pnl=? WHERE id=?", ("happened" if happened else "did not happen", pnl, eid))
    return dict(con.execute("SELECT * FROM ledger WHERE id=?", (eid,)).fetchone())


def rows():
    con = _con(); return [dict(r) for r in con.execute("SELECT * FROM ledger ORDER BY ts DESC").fetchall()]
