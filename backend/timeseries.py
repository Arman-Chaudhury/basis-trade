"""Tiger Data (TimescaleDB-flavoured Postgres) mirror of the time-series tables, for the live dashboard and the
sponsor track. Optional: set DATABASE_URL (postgres://...). SQLite stays the source of truth; this mirrors writes.

Tables: prices(ticker, ts, close), ladders(release, venue, ts, labels jsonb, p jsonb, trust), ledger(id, ts, ...).
On a Tiger/Timescale database each becomes a hypertable on `ts`; on plain Postgres they are ordinary tables."""
import json, logging, os
from datetime import datetime, timezone

log = logging.getLogger("basis.timeseries")
URL = os.getenv("DATABASE_URL", "")
_con = None

DDL = """
CREATE TABLE IF NOT EXISTS prices (ticker TEXT NOT NULL, ts TIMESTAMPTZ NOT NULL, close DOUBLE PRECISION, PRIMARY KEY (ticker, ts));
CREATE TABLE IF NOT EXISTS ladders (release TEXT NOT NULL, venue TEXT NOT NULL, ts TIMESTAMPTZ NOT NULL, labels JSONB, p JSONB, trust INT, PRIMARY KEY (release, venue, ts));
CREATE TABLE IF NOT EXISTS ledger (id TEXT NOT NULL, ts TIMESTAMPTZ NOT NULL, release TEXT, side TEXT, verdict TEXT, cost DOUBLE PRECISION, payout DOUBLE PRECISION, loss DOUBLE PRECISION, trust INT, PRIMARY KEY (id, ts));
"""


def configured(): return bool(URL)


def con():
    global _con
    if not configured(): return None
    if _con is None or _con.closed:
        import psycopg
        _con = psycopg.connect(URL, autocommit=True)
        with _con.cursor() as c:
            c.execute(DDL)
            c.execute("SELECT 1 FROM pg_extension WHERE extname='timescaledb'")
            if c.fetchone():
                for t in ("prices", "ladders", "ledger"):
                    c.execute(f"SELECT create_hypertable('{t}', 'ts', if_not_exists => TRUE)")
    return _con


def kind():
    try:
        with con().cursor() as c:
            c.execute("SELECT 1 FROM pg_extension WHERE extname='timescaledb'"); return "timescale" if c.fetchone() else "postgres"
    except Exception:  # noqa: BLE001
        return None


def mirror_prices(ticker, rows):
    if not configured(): return
    try:
        with con().cursor() as c:
            c.executemany("INSERT INTO prices VALUES (%s,%s,%s) ON CONFLICT DO NOTHING", [(ticker, d, v) for d, v in rows])
    except Exception as e:  # noqa: BLE001
        log.warning("mirror_prices: %s", e)


def mirror_ladders(ladders):
    if not configured(): return
    now = datetime.now(timezone.utc)
    try:
        with con().cursor() as c:
            for l in ladders:
                for v in l["venues"]:
                    if v.get("ok"):
                        c.execute("INSERT INTO ladders VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING", (l["id"], v["venue"], now, json.dumps(v["labels"]), json.dumps(v["p"]), v.get("trust")))
                c.execute("INSERT INTO ladders VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING", (l["id"], "consensus", now, json.dumps(l["labels"]), json.dumps(l["p_calibrated"]), l.get("trust")))
    except Exception as e:  # noqa: BLE001
        log.warning("mirror_ladders: %s", e)


def mirror_ledger(entry, eid):
    if not configured(): return
    try:
        with con().cursor() as c:
            c.execute("INSERT INTO ledger VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                      (eid, datetime.now(timezone.utc), entry.get("release"), entry.get("side"), entry.get("verdict"), entry.get("cost"), entry.get("payout"), entry.get("loss"), entry.get("trust")))
    except Exception as e:  # noqa: BLE001
        log.warning("mirror_ledger: %s", e)


def status():
    if not configured(): return {"configured": False}
    try:
        with con().cursor() as c:
            c.execute("SELECT (SELECT count(*) FROM prices), (SELECT count(*) FROM ladders), (SELECT count(*) FROM ledger)")
            p, l, g = c.fetchone()
        return {"configured": True, "kind": kind(), "rows": {"prices": p, "ladders": l, "ledger": g}}
    except Exception as e:  # noqa: BLE001
        return {"configured": True, "error": str(e)[:160]}


def recent_ladders(release, hours=24):
    """For the live dashboard: the consensus ladder's history over the last `hours`."""
    if not configured(): return []
    with con().cursor() as c:
        c.execute("SELECT ts, p FROM ladders WHERE release=%s AND venue='consensus' AND ts > now() - (%s || ' hours')::interval ORDER BY ts", (release, str(hours)))
        return [{"ts": r[0].isoformat(), "p": r[1]} for r in c.fetchall()]
