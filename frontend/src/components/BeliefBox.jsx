import React from 'react'
import { Link } from 'react-router-dom'
import { api, pct, pp } from '../api.js'
import TrustPill from './TrustPill.jsx'

export default function BeliefBox() {
  const [q, setQ] = React.useState('')
  const [res, setRes] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState(null)
  async function go(e) {
    e?.preventDefault()
    if (!q.trim()) return
    setBusy(true); setErr(null); setRes(null)
    try { setRes(await api.belief(q)) } catch (e) { setErr(String(e)) } finally { setBusy(false) }
  }
  const examples = ['the Fed hikes twice by December', 'bitcoin breaks 100k this year', 'the Iran ceasefire collapses this month']
  return (
    <div className="card">
      <form onSubmit={go} className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Type your belief… e.g. “the Fed hikes twice by December”"
          className="flex-1 rounded-xl bg-ink border border-grey-700 px-3 py-2 text-sm focus:outline-none focus:border-bone" />
        <button disabled={busy} className="rounded-xl bg-bone text-ink font-medium px-4 py-2 text-sm disabled:opacity-50">{busy ? 'Thinking…' : 'Check'}</button>
      </form>
      <div className="mt-2 flex gap-2 flex-wrap text-xs text-grey-500">
        try: {examples.map(x => <button key={x} onClick={() => { setQ(x) }} className="underline decoration-dotted hover:text-grey-300">{x}</button>)}
      </div>
      {err && <div className="mt-3 text-sm text-rose-200">{err}</div>}
      {res && (
        <div className="mt-4 space-y-3">
          <div className="text-sm text-grey-300">{res.interpretation}</div>
          {res.matched.length === 0 && <div className="text-sm text-grey-500">No event in the map tests this belief. Add one to <code>data/events.json</code>.</div>}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {res.matched.map(c => (
              <Link to={`/events/${c.id}`} key={c.id} className="rounded-xl border border-grey-700/60 bg-ink p-3 hover:border-grey-300">
                <div className="text-sm font-medium text-bone leading-snug">{c.title}</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs mono">
                  <div><div className="text-grey-500">calibrated</div><div className="text-bone text-base">{pct(c.p_calibrated)}</div></div>
                  <div><div className="text-grey-500">basis</div><div className={`text-base ${c.basis == null ? 'text-grey-500' : c.basis > 0 ? 'text-emerald-200' : 'text-rose-200'}`}>{c.p_proxy == null ? 'no proxy' : pp(c.basis)}</div></div>
                  <div><div className="text-grey-500">trust</div><div><TrustPill score={c.trust_score} leak={c.leakage_flag} /></div></div>
                </div>
              </Link>
            ))}
          </div>
          {res.explanation && <div className="text-sm text-grey-300 border-l-2 border-brass pl-3">{res.explanation}</div>}
          {!res.ai_available && <div className="text-xs text-grey-500">Running without ANTHROPIC_API_KEY — keyword matching and a templated explanation.</div>}
        </div>
      )}
    </div>
  )
}
