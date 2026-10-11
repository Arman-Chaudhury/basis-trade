PY=.venv/bin/python
.PHONY: setup backfill backend node frontend dev demo snapshot smoke pull-atropos pull-leaf pull-landing
setup:
	uv venv .venv && uv pip install -p .venv/bin/python -r requirements.txt && cd frontend && npm install && cd ../services/atropos && npm install --no-audit --no-fund
backfill:
	$(PY) -m scripts.backfill
backend:
	.venv/bin/uvicorn backend.main:app --port 8001 --reload
node:
	cd services/atropos && PORT=4411 BASIS_URL=http://127.0.0.1:8001 node server.js
frontend:
	cd frontend && npm run dev -- --port 5177 --strictPort
dev:
	@trap 'kill 0' INT; (cd services/atropos && PORT=4411 BASIS_URL=http://127.0.0.1:8001 node server.js &) ; (.venv/bin/uvicorn backend.main:app --port 8001 &) ; cd frontend && npm run dev -- --port 5177 --strictPort
demo:
	@trap 'kill 0' INT; (cd services/atropos && PORT=4411 ATROPOS_PUBLIC=1 node server.js &) ; (DEMO_MODE=1 .venv/bin/uvicorn backend.main:app --port 8001 &) ; cd frontend && npm run dev -- --port 5177 --strictPort
snapshot:
	$(PY) -m scripts.snapshot
smoke:
	$(PY) -m scripts.smoke
# Ethan and Juvo keep working in their own repos; pull their latest into this one with these.
pull-atropos:
	git subtree pull --prefix services/atropos https://github.com/ebeirne/atropos main --squash -m "Pull Atropos"
pull-landing:
	git subtree pull --prefix frontend/public/landing https://github.com/ebeirne/one-scroll main --squash -m "Pull one-scroll landing"
pull-leaf:
	@echo "Leaf is vendored by copy under backend/leaf and frontend/src/leaf: re-copy from juvowen/Leaf Backend/app and Frontend/src"
