# Atropos: from the odds to the trade

Prediction markets like Kalshi and Polymarket now put a price on this month's
CPI print, the next Fed decision, and the jobs number. Trading desks have
started reading those prices as forecasts, but the raw odds are biased (people
overpay for long shots), often thin, and sometimes stale. Atropos is the piece
in between: it takes those odds, corrects them, works out what they mean for
the stocks you actually hold, and tells you whether a hedge is worth it.

You type one sentence: "I hold 40 SPY, 30 NVDA and 60 TLT and I'm worried about
a hot CPI print." Atropos reads the odds ladder for that release across six
venues, runs each through a calibration curve fit on 628 settled Kalshi
markets, weights the venues by a trust score (liquidity, spread, freshness,
holder concentration), and turns the result into dollars of exposure per
holding. Then it shows two ways to cover it side by side: the prediction-market
contract that pays in that tail, and an equity pair hedge. Every call is
written to a ledger and settled against the real print, so you can see whether
it would have paid. No model is allowed to invent a number; every figure in the
verdict has to trace back to something computed.

We built it in a day at Hack Knight 2026, a team of three, by fusing three
earlier projects: my Basis (calibration and trust scoring), Ethan's Atropos
(exposure engine, venue readers, ledger), and Juvo's Leaf (equity screener).
The rest of this file is the engineering map of how those pieces fit.

## Architecture

**One product from three projects.** Ethan's Atropos landing is the front door (`/`, served by the Node service; his one-scroll page is at `/node/topo/`). Behind it, one website with two services:

- **Python (FastAPI, :8001)** — Basis (calibration, basis, trust, betas), Leaf (Gemini EX + Lego screener), Atropos's core ported (exposure, hedge, history, ledger), and the pipeline that chains them.
- **Node (Atropos as-is, :4411, vendored under `services/atropos`)** — the six venue readers, Atty's voiced walkthrough, Jev, SnapTrade, 13F, news, fine-print rules, the console.

The Vite gateway (:5177) makes them one origin: `/py/*` → Python, `/leaf/*` → Leaf routers, `/api/*` and `/node/*` → Node (so Atropos's pages run unmodified).

| Route | What | From |
|---|---|---|
| `/` | Atropos landing (odds this week, how it works, research), live from the Node service | Ethan |
| `/pipeline` | sentence → calibrated multi-venue ladder → exposure → contract vs equity hedge → history → verdict → ledger | all three |
| `/research` | Leaf's screener and strategy math | Juvo |
| `/console`, `/atty`, `/node/topo/` | Atropos's console, Atty's walkthrough, the one-scroll page | Ethan |
| `/app`, `/calibration`, `/events/:id` | Basis's desk and calibration curve | Arman |
| `/gallery` | the earlier topology landing | Arman |

**How the engines feed each other.** Every venue ladder (Kalshi and Polymarket read here; Kalshi via IBKR, ForecastEx, Limitless, Futuur, CME via Atropos) is re-binned onto common edges, passed through Basis's calibration curve, and combined into a **trust-weighted consensus** (weights are Basis's per-venue trust scores; fed-funds futures stay a reference, not a vote). That distribution drives Atropos's exposure engine; the contract hedge is trust-gated; Leaf's screener produces the competing equity hedge in the same step.


One sentence in, one honest trade (or none) out. Three Hack Knight projects fused into one pipeline:

| Step | What | From |
|---|---|---|
| 1. Signal | Release ladders (CPI, Fed, payrolls) across six venues: **Kalshi and Polymarket live** (`backend/venues_live.py`), plus Kalshi via IBKR, ForecastEx, Limitless, Futuur and CME via IBKR from Atropos's snapshot; calibrated by an isotonic curve fit on 628 settled Kalshi markets, trust-scored per venue; consensus = live Kalshi | **Basis** + Atropos ladders |
| 2. Exposure | Your holdings bucketed and moved by each tail of the release, in dollars (deterministic engine, ported) | **Atropos** |
| 3. Express | Side by side: the prediction-market contract that pays in that tail, sized to the loss and trust-gated; and the equity hedge Leaf's pair screener finds (best hedge effectiveness) | **Atropos** + **Leaf** |
| 4. Does it pay when you lose? | Release-day backtest since 2021 (snapshot while BLS/ALFRED are unreachable) | Atropos |
| 5. Ledger | Every call recorded and settled against the print | Atropos |

Parsing the sentence: Gemini (Leaf's client) → Claude → rules. Voice: ElevenLabs (Atropos's Atty voice), cached. No model ever authors a number.

## Run
```bash
uv venv .venv && uv pip install -p .venv/bin/python -r requirements.txt
cp .env.example .env            # every key optional
.venv/bin/uvicorn backend.main:app --port 8000
curl -s -X POST localhost:8000/pipeline -H 'Content-Type: application/json' \
  -d '{"sentence":"I hold 40 SPY, 30 NVDA and 60 TLT and I am worried about a hot CPI print"}' | python3 -m json.tool
```
Endpoints: `POST /pipeline`, `GET /releases`, `POST /voice`, `GET /ledger`, `POST /ledger/{id}/settle`, plus Basis (`/events`, `/calibration`, `/scenario`, `/belief`) and Leaf (`/api/ex/assess`, `/api/scan/multi`).

Frontend: the Basis topology landing + desk + **`/pipeline`** + **`/research`** (Leaf's screener UI, vendored under `frontend/src/leaf`, scoped CSS, talks to the mounted Leaf routers through the `/leaf` proxy) (`cd frontend && npm install && npm run dev`; the Vite proxy expects the backend on :8001).

## STATUS (2026-10-10)
- Pipeline works end to end for `cpi`, `nfp` and `fomc`, backend and `/pipeline` page, verified in the browser. Fed tails are the Cut-0.25 and Hike buckets as a 25bp surprise against the expected move (kernels: −0.6% SPX, 20bp on the 2y per 25bp).
- All venue ladders are live when the Node service is up (60s cache, last-good fallback); without it the Atropos snapshot rows are used.
- Contract book is estimated (fair ± 1¢): wire a live book for real bid/ask.
- History is the Atropos sample-portfolio snapshot, labelled; live BLS/ALFRED path to port from `lib/history.js`.
- Holdings: from the sentence; else the Atropos service's portfolio (SnapTrade when linked in the console, else its sample).
- Context step: SEC 13F funds holding what you hold, and news ranked for the release, both from the Atropos service.
- Every verdict passes `backend/check.py`: each figure in the sentence must trace to a computed number (Jev's rule, no key needed; Jev itself runs in the Node service with a TypeSafe key).
- Tiger Data: set `DATABASE_URL` to mirror prices, every venue ladder and the ledger into Postgres (`backend/timeseries.py`; hypertables when the timescaledb extension exists). `GET /py/timeseries/status`, `GET /py/timeseries/ladders/cpi?hours=24` for the live dashboard. Tested against a local Postgres 16; the Tiger cloud needs only the URL.
- Domain (GoDaddy track): register at godaddy.com and point an A/CNAME at the deployment; nothing in the code depends on it.
