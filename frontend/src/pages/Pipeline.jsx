import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { api, pct, COLORS } from '../api.js'
import TrustPill from '../components/TrustPill.jsx'

const EXAMPLES = ["I hold 40 SPY, 30 NVDA and 60 TLT and I'm worried about a hot CPI print",
  "I'm long $20,000 of QQQ and worried the jobs report comes in weak", "Fed hikes next week and I own 50 JPM, 100 XLF and 80 TLT"]
const usd = x => (x == null ? '—' : `$${Math.abs(x).toLocaleString(undefined, { maximumFractionDigits: 0 })}`)
const signed = x => (x == null ? '—' : `${x < 0 ? '−' : '+'}${usd(x)}`)

function Step({ n, title, note, children }) {
  return (
    <section className="reveal border-t border-grey-700 pt-6 mt-10">
      <div className="grid md:grid-cols-[14rem_1fr] gap-6">
        <div><div className="eyebrow">{n}</div><h2 className="h3 mt-2">{title}</h2>{note && <p className="mt-2 text-sm text-grey-500 max-w-[22ch]">{note}</p>}</div>
        <div>{children}</div>
      </div>
    </section>
  )
}

export default function Pipeline() {
  const [q, setQ] = useState(EXAMPLES[0])
  const [out, setOut] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ledger, setLedger] = useState([])
  const [voice, setVoice] = useState({ configured: false })
  const audio = useRef()
  useEffect(() => { api.ledger().then(setLedger).catch(() => {}); api.voiceStatus().then(setVoice).catch(() => {}) }, [out])
  async function run(e) {
    e?.preventDefault(); setBusy(true); setErr(null)
    try { setOut(await api.pipeline(q)) } catch (e) { setErr(String(e)) } finally { setBusy(false) }
  }
  async function hear() {
    try { const blob = await api.voice(out.verdict.slice(0, 300)); const url = URL.createObjectURL(blob); audio.current.src = url; audio.current.play() } catch (e) { setErr('Voice: ' + e.message) }
  }
  async function settle(id, happened) { await api.settle(id, happened); setLedger(await api.ledger()) }
  const sig = out?.signal; const side = out?.side
  const ladder = sig ? sig.labels.map((l, i) => ({ label: l, raw: sig.p_raw[i] * 100, cal: sig.p[i] * 100 })) : []
  const tail = sig?.tails?.[side]
  return (
    <div className="max-w-6xl mx-auto">
      <div className="eyebrow mb-3">Pipeline · from the odds to the trade</div>
      <h1 className="h2">Say what you hold and what you fear.</h1>
      <form onSubmit={run} className="mt-6 flex gap-3">
        <input value={q} onChange={e => setQ(e.target.value)} className="flex-1 rounded-xl bg-ink-2 border border-grey-700 px-4 py-3 text-base focus:outline-none focus:border-bone" />
        <button disabled={busy} className="pill disabled:opacity-50">{busy ? 'Working…' : 'Run'}</button>
      </form>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-grey-500">try: {EXAMPLES.map(x => <button type="button" key={x} onClick={() => setQ(x)} className="underline decoration-dotted hover:text-bone text-left">{x}</button>)}</div>
      {err && <div className="mt-4 text-rose-300 text-sm">{err}</div>}

      {out && (<>
        <Step n="01 · Signal" title={sig.name} note={`${sig.source}`}>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-grey-300">resolves {sig.date}</span><TrustPill score={sig.trust} /><span className="eyebrow">{sig.verdict}</span>
            {sig.thresholds_from && <span className="eyebrow">{sig.thresholds_from}</span>}
          </div>
          <div className="h-56 mt-4">
            <ResponsiveContainer><BarChart data={ladder} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: COLORS.text, fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
              <YAxis tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fill: COLORS.text, fontSize: 11 }} width={40} />
              <Tooltip contentStyle={{ background: '#0B0C07', border: '1px solid #3A3F3F', fontSize: 12 }} formatter={(v, n) => [`${v.toFixed(1)}%`, n === 'cal' ? 'calibrated' : 'raw']} />
              <Bar dataKey="raw" fill={COLORS.ref} />
              <Bar dataKey="cal" fill={COLORS.proxy}>{ladder.map((d, i) => <Cell key={i} fill={tail?.bucket === i ? '#C96A3F' : COLORS.proxy} />)}</Bar>
            </BarChart></ResponsiveContainer>
          </div>
          <ul className="mt-3 text-sm text-grey-300 space-y-1">{sig.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          <div className="mt-3 flex flex-wrap gap-2">{sig.venues?.filter(v => v.ok).map(v => <span key={v.venue} className="chip" title={v.title || ''}>{v.live && <span className="dot" style={{ background: '#2fbf71' }} />}{v.venue} <span className="mono text-grey-300">{v.trust}</span>{v.top && <span className="text-grey-500">· {v.top} {Math.round((v.topP || 0) * 100)}%</span>}</span>)}
            {sig.venues?.filter(v => !v.ok).map(v => <span key={v.venue} className="chip opacity-50" title={v.error}>{v.venue} · down</span>)}</div>
        </Step>

        <Step n="02 · Exposure" title={`A ${sig.tailWords[side]} ${sig.short}`} note={tail ? `tail: ${tail.label || `${side === 'high' ? '≥' : '≤'} ${tail.threshold}${sig.unit}`} · odds ${pct(tail.pModel)} · SPX ${tail.spxMove}% · 2y ${tail.rateMove}bp` : ''}>
          <div className="eyebrow mb-2">holdings from: {(out.provenance?.portfolio || 'sample') === 'sentence' ? 'your sentence' : (out.provenance?.portfolio || '').startsWith('atropos:') ? (out.provenance.portfolio === 'atropos:sample' ? "Atropos's sample portfolio (link a brokerage in the console to use yours)" : 'your linked brokerage, read-only') : 'sample'}</div>
          <table className="w-full text-sm">
            <thead><tr className="eyebrow"><th className="text-left py-2 font-normal">holding</th><th className="text-left font-normal">bucket</th><th className="text-right font-normal">value</th><th className="text-right font-normal">move</th><th className="text-right font-normal">dollars</th></tr></thead>
            <tbody>{out.impacts.map(r => (
              <tr key={r.holding} className="border-t border-grey-700/60">
                <td className="py-2">{r.holding}{out.holdings.find(h => h.symbol === r.holding)?.assumed && <span className="eyebrow ml-2">10 sh assumed</span>}</td>
                <td className="text-grey-500">{r.bucketLabel}</td><td className="text-right mono">{usd(r.value)}</td>
                <td className={`text-right mono ${r[side].pct < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{r[side].pct > 0 ? '+' : ''}{r[side].pct}%</td>
                <td className={`text-right mono ${r[side].dollars < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{signed(r[side].dollars)}</td>
              </tr>))}
              <tr className="border-t border-grey-700"><td className="py-2 font-medium" colSpan={2}>Book</td><td className="text-right mono">{usd(out.total)}</td><td /><td className={`text-right mono text-lg ${out.tail_total < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{signed(out.tail_total)}</td></tr>
            </tbody>
          </table>
        </Step>

        <Step n="03 · Express" title="Two ways to protect it" note="contract pays on the print; the equity hedge pays on the reaction">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card">
              <div className="eyebrow">Prediction-market contract · {out.express.contract.venue || ''}</div>
              {out.express.contract.skipped ? <p className="mt-3 text-grey-300">{out.express.contract.skipped}</p> : (<>
                <div className="mt-2 text-lg">{out.express.contract.contract}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm mono">
                  <div><div className="eyebrow">fair</div>{out.express.contract.fair.toFixed(2)}</div><div><div className="eyebrow">ask</div>{out.express.contract.ask.toFixed(2)}</div><div><div className="eyebrow">contracts</div>{out.express.contract.contracts}</div>
                  <div><div className="eyebrow">cost</div>{usd(out.express.contract.cost)}</div><div><div className="eyebrow">pays</div>{usd(out.express.contract.payout)}</div><div><div className="eyebrow">covers</div>{usd(out.express.contract.covers)}</div>
                </div>
                <div className={`mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${out.express.contract.verdict === 'buy' ? 'border-emerald-400/40 text-emerald-200' : out.express.contract.verdict === 'skip' ? 'border-rose-400/40 text-rose-200' : 'border-brass/40 text-brass'}`}>{out.express.contract.verdict} · {out.express.contract.why}</div>
                <div className="eyebrow mt-3">{out.express.contract.book}</div>
              </>)}
            </div>
            <div className="card">
              <div className="eyebrow">Equity hedge · pair screener</div>
              {out.express.equity.skipped ? <p className="mt-3 text-grey-300">{out.express.equity.skipped}</p> : (<>
                <div className="mt-2 text-lg">{out.express.equity.action} {out.express.equity.ticker} · {usd(out.express.equity.dollars)}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm mono">
                  <div><div className="eyebrow">corr</div>{out.express.equity.corr}</div><div><div className="eyebrow">hedge eff.</div>{out.express.equity.hedge_effectiveness}</div><div><div className="eyebrow">ratio</div>{out.express.equity.hedge_ratio}</div>
                </div>
                <p className="mt-3 text-sm text-grey-300">{out.express.equity.note}</p>
                {out.express.equity.alternatives?.length > 0 && <div className="eyebrow mt-3">also: {out.express.equity.alternatives.map(a => `${a.ticker} (${a.hedge_effectiveness})`).join(', ')} · {out.express.equity.screened} screened</div>}
              </>)}
            </div>
          </div>
        </Step>

        <Step n="04 · Does it pay when you lose?" title={out.history.hitRate == null ? 'No history' : `${out.history.paidOnLoss} of ${out.history.lossDays} loss days`} note={out.history.source}>
          {out.history.hitRate != null && (<>
            <p className="text-sm text-grey-300 max-w-2xl">{out.history.test}</p>
            <div className="mt-4 flex flex-wrap gap-2">{out.history.worst?.map(w => <span key={w.date} className={`chip ${w.happened ? '' : 'opacity-50'}`}>{w.date} <span className="mono text-rose-300">{w.ret}%</span> {w.happened ? '✓ paid' : '✗ missed'}</span>)}</div>
            <div className="eyebrow mt-3">{out.history.days} release days {out.history.from} → {out.history.to} · hit rate {Math.round(out.history.hitRate * 100)}%</div>
          </>)}
        </Step>

        <Step n="05 · Verdict" title="One call, recorded" note={out.check ? (out.check.ok ? 'every figure traced to the numbers' : `untraced: ${out.check.untraced.join(', ')}`) : ''}>
          <p className="text-lg leading-relaxed max-w-3xl">{out.verdict}</p>
          <div className="mt-4 flex items-center gap-4">
            <button onClick={hear} disabled={!voice.configured} className="btn-text disabled:opacity-40" title={voice.configured ? 'ElevenLabs' : 'set ELEVENLABS_API_KEY'}>Hear it</button>
            <audio ref={audio} />
            <span className="eyebrow">ledger #{out.ledger_id} · every number from code</span>
          </div>
        </Step>
      </>)}

      {out?.context && (out.context.funds?.funds?.length > 0 || out.context.news?.articles?.length > 0) && (
        <Step n="06 · Context" title="Who else holds this, and what's in the news" note="SEC 13F filings and news feeds">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card">
              <div className="eyebrow">Public money next to you</div>
              <ul className="mt-3 space-y-2 text-sm">{out.context.funds.funds.map(f => (
                <li key={f.name} className="border-t border-grey-700/60 pt-2"><div>{f.name}</div><div className="eyebrow">{f.kind.replace('_', ' ')} · {f.period} · holds {f.overlap.map(o => o.ticker).join(', ')}{f.exposure?.[out.signal.id] ? ` · ${out.signal.tailWords[side]} tail ${f.exposure[out.signal.id][side] > 0 ? '+' : ''}${f.exposure[out.signal.id][side]}%` : ''}</div></li>))}
              </ul>
              {out.context.funds.note && <div className="eyebrow mt-3">{out.context.funds.note}</div>}
            </div>
            <div className="card">
              <div className="eyebrow">In the news · {out.context.news.query}</div>
              <ul className="mt-3 space-y-2 text-sm">{out.context.news.articles.map(a => (
                <li key={a.url} className="border-t border-grey-700/60 pt-2"><a href={a.url} target="_blank" rel="noreferrer" className="hover:underline">{a.title}</a><div className="eyebrow">{a.source || ''}</div></li>))}
              </ul>
              {out.context.news.brief && <p className="mt-3 text-sm text-grey-300">{out.context.news.brief}</p>}
            </div>
          </div>
        </Step>
      )}

      {ledger.length > 0 && (
        <Step n="Ledger" title="Calls and settlements" note="settle against the first print after the release">
          <table className="w-full text-sm">
            <thead><tr className="eyebrow"><th className="text-left py-2 font-normal">when</th><th className="text-left font-normal">release</th><th className="text-left font-normal">call</th><th className="text-right font-normal">cost</th><th className="text-right font-normal">pays</th><th className="text-right font-normal">p&l</th><th className="text-right font-normal">settle</th></tr></thead>
            <tbody>{ledger.slice(0, 12).map(r => (
              <tr key={r.id} className="border-t border-grey-700/60">
                <td className="py-2 mono text-grey-500">{r.ts.slice(0, 16).replace('T', ' ')}</td><td>{r.release} · {r.side}</td><td>{r.verdict}{r.contract ? ` · ${r.contract}` : ''}</td>
                <td className="text-right mono">{r.cost == null ? '—' : usd(r.cost)}</td><td className="text-right mono">{r.payout == null ? '—' : usd(r.payout)}</td>
                <td className={`text-right mono ${r.pnl > 0 ? 'text-emerald-300' : r.pnl < 0 ? 'text-rose-300' : ''}`}>{r.settled ? signed(r.pnl) : '—'}</td>
                <td className="text-right">{r.settled ? <span className="eyebrow">{r.outcome}</span> : <span className="flex justify-end gap-2"><button onClick={() => settle(r.id, true)} className="btn-text">happened</button><button onClick={() => settle(r.id, false)} className="btn-text">didn't</button></span>}</td>
              </tr>))}</tbody>
          </table>
        </Step>
      )}
      <div className="mt-16 eyebrow">Read-only. Nothing is ever traded for you.</div>
    </div>
  )
}
