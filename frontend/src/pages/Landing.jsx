import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Terrain, { ContourCard } from '../components/Terrain.jsx'
import CalibrationChart from '../components/CalibrationChart.jsx'
import TrustPill from '../components/TrustPill.jsx'
import { api, pct, pp } from '../api.js'
import { gsap, ScrollTrigger } from '../lib/smooth.js'

/* Scroll captions over the landscape, like "You jump… / We jump…". Each sets the surface and the camera. */
const BEATS = [
  { t: 'The odds move…', shape: 0, form: 1, cam: 'hero', note: 'a prediction-market price, as traded' },
  { t: 'We calibrate.', shape: 1, form: 1, cam: 'low', note: '628 settled markets correct every price' },
  { t: 'We compare.', shape: 2, form: 1, cam: 'hero', note: 'futures and options imply their own odds; the gap is the basis' },
  { t: 'We score trust.', shape: 3, form: 1, cam: 'low', note: 'liquidity, spread, freshness, concentration, horizon' },
  { t: 'Then we map it.', shape: 3, form: 0, morph: 1, cam: 'map', note: 'every event is a peak; thin peaks are signals, smears are rumors' },
]
const PRINCIPLES = [
  ['01.', 'What we measure', 'A calibrated probability for each event, fit on 628 settled Kalshi markets using the price a day before close. A 40¢ contract resolved YES 30% of the time; a 98¢ contract only 84%.'],
  ['02.', 'How we compare', 'Fed-funds futures and Deribit options imply their own probabilities. The gap to the prediction market is the basis. In September it was 55 points for two months.'],
  ['03.', 'When we trust', 'Liquidity, spread, freshness, holder concentration and horizon, scored 0–100, with a flag when one trade is more than 5% of the day\'s tape.'],
]
const FAQ = [
  ['Why not just use the raw odds?', 'Because a 10¢ contract isn\'t a 10% event, and a price with $300 of daily volume and one whale holding 98% is a rumor, not a market.'],
  ['Who pays for this?', 'Macro and event-driven desks already paying for alternative data. The output is a calibrated, trust-weighted probability feed plus a basis signal.'],
  ['What\'s the hardest part?', 'Matching events across venues and to a traditional proxy. We hand-curated 16; doing it generically is the real product.'],
  ['Are the betas causal?', 'No. Co-movement, labelled as such, with R² and n shown.'],
]

export default function Landing({ dark = false }) {
  const terrain = useRef()
  const [events, setEvents] = useState([])
  const [cal, setCal] = useState(null)
  const [pNew, setPNew] = useState(null)
  const [sc, setSc] = useState(null)
  const isStatic = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('static')
  const featured = events.find(e => e.id === 'fomc-2026-12') || events[0]

  useEffect(() => { api.events().then(setEvents).catch(() => {}); api.calibration().then(setCal).catch(() => {}) }, [])
  useEffect(() => { if (events.length) terrain.current?.setEvents(events) }, [events])
  useEffect(() => { if (featured && pNew == null) setPNew(featured.p_raw ?? 0.5) }, [featured])
  useEffect(() => {
    if (pNew == null || !featured) return
    const t = setTimeout(() => api.scenario(featured.id, pNew).then(setSc).catch(() => {}), 120)
    terrain.current?.setEvents(events.map(e => e.id === featured.id ? { ...e, p_calibrated: pNew, p_raw: pNew } : e))
    return () => clearTimeout(t)
  }, [pNew])

  useEffect(() => {
    if (isStatic) { gsap.set('.reveal, .beat', { autoAlpha: 1 }); return }
    const ctx = gsap.context(() => {
      if (!window.__basisWheel) { window.__basisWheel = true }
      gsap.utils.toArray('.beat').forEach((el, i) => {
        ScrollTrigger.create({ trigger: el, start: 'top 60%', end: 'bottom 40%', onEnter: () => terrain.current?.set({ ...BEATS[i], camera: BEATS[i].cam, boost: 0.8 }), onEnterBack: () => terrain.current?.set({ ...BEATS[i], camera: BEATS[i].cam, boost: 0.8 }) })
        gsap.fromTo(el, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, scrollTrigger: { trigger: el, start: 'top 75%', end: 'top 45%', scrub: true } })
        gsap.to(el, { autoAlpha: 0, y: -30, scrollTrigger: { trigger: el, start: 'bottom 55%', end: 'bottom 25%', scrub: true } })
      })
      ScrollTrigger.create({ trigger: '#hero', start: 'top top', end: 'bottom 50%', onEnter: () => terrain.current?.set({ form: 1, shape: 0, camera: 'hero' }), onEnterBack: () => terrain.current?.set({ form: 1, shape: 0, camera: 'hero' }) })
      ScrollTrigger.create({ trigger: '#lab', start: 'top 60%', onEnter: () => terrain.current?.set({ form: 0, morph: 1, camera: 'map' }), onEnterBack: () => terrain.current?.set({ form: 0, morph: 1, camera: 'map' }) })
      gsap.utils.toArray('.reveal').forEach(el => gsap.fromTo(el, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 85%' } }))
      gsap.to('#hero .hero-copy', { autoAlpha: 0, y: -40, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true } })
    })
    return () => ctx.revert()
  }, [events.length])

  return (
    <div className={`-mt-14 relative ${isStatic ? 'static-shot' : ''}`}>
      <div className="terrain-fixed"><Terrain ref={terrain} dark={dark} /></div>

      {/* HERO */}
      <section id="hero" className="relative z-10 h-[100svh]">
        <div className="hero-copy absolute inset-x-0 bottom-0 px-6 md:px-8 pb-10">
          <div className="grid md:grid-cols-[1fr_auto] items-end gap-8">
            <h1 className="h1 max-w-4xl">From the odds<br />to the trade.</h1>
            <p className="max-w-sm text-grey-300 text-lg md:pb-4">Say what you hold and what you fear. We read the odds, price your exposure, and find the cheapest honest protection, or none.</p>
          </div>
          <div className="rule mt-8" style={{ background: dark ? 'rgba(237,237,234,0.3)' : 'rgba(21,21,21,0.25)' }} />
          <div className="mt-4 flex items-center justify-between eyebrow"><span>Basis ©2026 · Kalshi · Polymarket · ForecastEx · CME · Deribit</span><span className="flex gap-6"><Link to="/pipeline">Run the pipeline →</Link><a href="#story">Explore ↓</a></span></div>
        </div>
      </section>

      {/* STORY captions */}
      <section id="story" className="relative z-10">
        {BEATS.map(b => (
          <div key={b.t} className="beat h-[100svh] grid place-items-center text-center px-6">
            <div><div className="caption">{b.t}</div><div className="eyebrow mt-4">{b.note}</div></div>
          </div>
        ))}
      </section>

      {/* EXPLORE */}
      <section id="about" className="relative z-10 bg-ink px-6 md:px-8 py-24">
        <div className="grid md:grid-cols-[1fr_1fr] gap-16">
          <div className="reveal">
            <div className="eyebrow mb-4">Explore</div>
            <h2 className="h2">Where the map<br />comes from</h2>
            <p className="mt-6 text-grey-300 max-w-md">Inspired by topographic maps: a landscape is a height field, and the contour lines are where it crosses each level. Here the field is the market. Every peak is an event, placed by its basis and its trust, with height from its probability. Thin, high peaks are signals. Low smears are rumors.</p>
            <Link to="/app" className="btn-text mt-8 inline-block">Open the desk</Link>
          </div>
          <div className="space-y-10">
            {PRINCIPLES.map(([n, h, p]) => (
              <div key={n} className="reveal grid grid-cols-[3rem_1fr] gap-4 border-t border-grey-700 pt-5">
                <div className="eyebrow">{n}</div>
                <div><div className="h3">{h}</div><p className="mt-2 text-grey-300 max-w-md">{p}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* LAB */}
      <section id="lab" className="relative z-10 min-h-[100svh] px-6 md:px-8 py-24 grid md:grid-cols-[1fr_1fr] gap-12 items-end">
        <div className="reveal bg-ink/85 backdrop-blur rounded-2xl p-6">
          <div className="eyebrow mb-4">The Lab · scenario</div>
          <h2 className="h2">Raise a peak.<br />Watch the room move.</h2>
          <p className="mt-5 text-grey-300">{featured?.title}. Drag the probability; its peak rises on the map and the expected co-movements update from the event betas.</p>
          <div className="mt-8 flex items-center gap-4">
            <span className="eyebrow w-16">p_new</span>
            <input type="range" min="0" max="1" step="0.01" value={pNew ?? 0.5} onChange={e => setPNew(parseFloat(e.target.value))} className="flex-1" />
            <span className="caption !text-5xl w-24 text-right">{Math.round((pNew ?? 0.5) * 100)}</span>
          </div>
          <div className="eyebrow mt-2">now {pct(featured?.p_raw, 1)} → {pct(pNew)} · {pp((pNew ?? 0) - (featured?.p_raw ?? 0))}</div>
        </div>
        <div className="reveal bg-ink/85 backdrop-blur rounded-2xl p-6">
          <table className="w-full text-sm">
            <thead><tr className="eyebrow"><th className="text-left py-2 font-normal">asset</th><th className="text-right font-normal">β / pp</th><th className="text-right font-normal">R²</th><th className="text-right font-normal">n</th><th className="text-right font-normal">expected move</th></tr></thead>
            <tbody>{(sc?.moves || []).map(b => (
              <tr key={b.ticker} className="border-t border-grey-700">
                <td className="py-2.5">{b.ticker}</td>
                <td className="text-right mono text-grey-300">{b.beta_per_pp == null ? '—' : b.beta_per_pp.toFixed(3)}</td>
                <td className="text-right mono text-grey-500">{b.r2 == null ? '—' : b.r2.toFixed(2)}</td>
                <td className="text-right mono text-grey-500">{b.n_obs}</td>
                <td className="text-right caption !text-2xl">{b.expected_move_pct == null ? '—' : `${b.expected_move_pct > 0 ? '+' : ''}${b.expected_move_pct.toFixed(2)}%`}</td>
              </tr>))}</tbody>
          </table>
          <div className="eyebrow mt-4">co-movement, not causation</div>
          {featured && <Link to={`/events/${featured.id}`} className="btn-text mt-6 inline-block">Full event page</Link>}
        </div>
      </section>

      {/* MAP (events) */}
      <section id="figures" className="relative z-10 bg-ink px-6 md:px-8 py-24">
        <div className="reveal flex items-end justify-between gap-8 flex-wrap">
          <div><div className="eyebrow mb-3">Portfolio · {events.length} events</div><h2 className="h2">Every event is a peak.</h2></div>
          <p className="max-w-md text-grey-300">Height is the calibrated probability. Width is one over trust. Click through for the full card, the betas, and the history.</p>
        </div>
        <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-12">
          {events.map(e => (
            <Link to={`/events/${e.id}`} key={e.id} className="reveal group">
              <div className="aspect-square rounded-xl overflow-hidden border border-grey-700 group-hover:border-bone transition-colors"><ContourCard e={e} size={320} dark={dark} /></div>
              <div className="mt-4 flex items-start justify-between gap-3">
                <div><div className="leading-snug">{e.title}</div><div className="eyebrow mt-1">{e.category} · {pct(e.p_calibrated)} · {e.p_proxy == null ? 'no proxy' : pp(e.basis)}</div></div>
                <TrustPill score={e.trust_score} leak={e.leakage_flag} />
              </div>
            </Link>))}
        </div>
      </section>

      {/* CALIBRATION */}
      <section className="relative z-10 bg-ink px-6 md:px-8 py-24">
        <div className="reveal grid md:grid-cols-[1fr_2fr] gap-10 items-end">
          <div><div className="eyebrow mb-3">Public goods · the curve</div><h2 className="h2">Where the levels sit.</h2></div>
          <p className="text-grey-300 max-w-lg">Price about a day before close against how often YES actually happened, across {cal?.n_markets ?? 628} settled Kalshi markets. Below the line, buyers of YES overpaid. The isotonic fit is the correction applied to every live price.</p>
        </div>
        <div className="mt-10 rounded-2xl border border-grey-700 bg-ink-2 p-4 md:p-6">{cal ? <CalibrationChart c={cal} height={460} /> : <div className="h-[460px]" />}</div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 theme-invert px-6 md:px-8 py-24">
        <div className="max-w-3xl">
          <div className="eyebrow mb-3 reveal" style={{ color: dark ? '#6E6E6A' : '#9A9A96' }}>Careers · for judges</div>
          <h2 className="h2 reveal">Questions we expect.</h2>
          <div className="mt-10 accordion divide-y divide-white/15 border-y border-white/15">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-5 reveal"><summary className="flex items-center justify-between gap-6"><span className="text-lg">{q}</span><span className="text-2xl opacity-60 group-open:rotate-45 transition-transform">+</span></summary><p className="mt-3 opacity-80">{a}</p></details>
            ))}
          </div>
          <div className="mt-16 flex items-center justify-between"><div className="h3">Basis</div><Link to="/app" className="btn-text" style={{ color: dark ? '#151515' : '#F2F2F0', borderColor: dark ? 'rgba(21,21,21,0.4)' : 'rgba(242,242,240,0.4)' }}>Open the desk</Link></div>
          <div className="mt-6 eyebrow max-w-2xl leading-relaxed" style={{ color: dark ? '#6E6E6A' : '#9A9A96' }}>Topographic contours are a metaphor; every number is real: Kalshi and Polymarket public data, CME fed-funds futures, Deribit options. Risk-neutral probabilities. Co-movement, not causation.</div>
        </div>
      </section>
    </div>
  )
}
