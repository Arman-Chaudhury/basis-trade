# Basis — from the odds to the trade

**One product from three projects.** Ethan's one-scroll landing is the front door (`/`). Behind it, one website with two services:

- **Python (FastAPI, :8001)** — Basis (calibration, basis, trust, betas), Leaf (Gemini EX + Lego screener), Atropos's core ported (exposure, hedge, history, ledger), and the pipeline that chains them.
- **Node (Atropos as-is, :4411, vendored under `services/atropos`)** — the six venue readers, Atty's voiced walkthrough, Jev, SnapTrade, 13F, news, fine-print rules, the console.

The Vite gateway (:5177) makes them one origin: `/api/*` → Python, `/leaf/*` → Leaf routers, `/node/*` and `/landing/api/*` → Node.

| Route | What | From |
|---|---|---|
| `/` | one-scroll landing, fed live by both services | Ethan |
| `/pipeline` | sentence → calibrated multi-venue ladder → exposure → contract vs equity hedge → history → verdict → ledger | all three |
| `/research` | Leaf's screener and strategy math | Juvo |
| `/console`, `/atty` | Atropos's console and Atty's walkthrough | Ethan |
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
- TODO: Tiger Data (Postgres hypertables for `prices`/`market_state`), GoDaddy domain.
