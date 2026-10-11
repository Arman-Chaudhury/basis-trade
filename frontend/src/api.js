const BASE = import.meta.env.VITE_API_URL || '/api'
async function j(path, opts) {
  const r = await fetch(BASE + path, opts)
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
  return r.json()
}
export const api = {
  events: () => j('/events'),
  event: id => j(`/events/${id}`),
  calibration: () => j('/calibration'),
  divergence: () => j('/divergence'),
  arb: () => j('/arb'),
  health: () => j('/health'),
  scenario: (event_id, p_new) => j('/scenario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id, p_new }) }),
  pipeline: sentence => j('/pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sentence }) }),
  ledger: () => j('/ledger'),
  settle: (id, happened) => j(`/ledger/${id}/settle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ happened }) }),
  voiceStatus: () => j('/voice/status'),
  voice: async text => { const r = await fetch(BASE + '/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.status); return r.blob() },
  belief: belief => j('/belief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ belief }) }),
}
export const pct = (x, d = 0) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`)
export const pp = x => (x == null ? '—' : `${x > 0 ? '+' : ''}${(x * 100).toFixed(1)}pp`)
export const COLORS = { kalshi: '#151515', polymarket: '#7C7C78', proxy: '#C96A3F', grid: '#DADAD6', text: '#7C7C78', ref: '#B5B5B0' }
export function trustColor(s) { return s >= 70 ? 'bg-emerald-400/10 text-emerald-200 border-emerald-400/30' : s >= 40 ? 'bg-brass/10 text-brass border-brass/40' : 'bg-rose-400/10 text-rose-200 border-rose-400/30' }
