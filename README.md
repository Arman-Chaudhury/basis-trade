# Basis — from the odds to the trade

One sentence in, one honest trade (or none) out. Three Hack Knight projects fused into one pipeline:

| Step | What | From |
|---|---|---|
| 1. Signal | Release ladders (CPI, Fed, payrolls) across venues, calibrated by an isotonic curve fit on 628 settled Kalshi markets, trust-scored per venue | **Basis** + Atropos ladders |
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
- Ladders come from Atropos's committed snapshot (`data/atropos/`). Live IBKR/ForecastEx readers are in Atropos `lib/markets.js`, not ported.
- Contract book is estimated (fair ± 1¢): wire a live book for real bid/ask.
- History is the Atropos sample-portfolio snapshot, labelled; live BLS/ALFRED path to port from `lib/history.js`.
- TODO: Tiger Data (Postgres hypertables for `prices`/`market_state`), GoDaddy domain.
