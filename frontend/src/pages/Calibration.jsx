import React from 'react'
import CalibrationChart from '../components/CalibrationChart.jsx'
import { api } from '../api.js'

export default function Calibration() {
  const [c, setC] = React.useState(null)
  const [err, setErr] = React.useState(null)
  React.useEffect(() => { api.calibration().then(setC).catch(e => setErr(String(e))) }, [])
  if (err) return <div className="card text-rose-200">{err}</div>
  if (!c) return <div className="text-grey-500">Loading…</div>
  const lowBins = c.bins.filter(b => b.hi <= 0.2)
  const low = lowBins.length ? lowBins.reduce((a, b) => a + b.n * (b.raw_p - b.win_rate), 0) / lowBins.reduce((a, b) => a + b.n, 0) : 0
  const hiBins = c.bins.filter(b => b.lo >= 0.8)
  const hi = hiBins.length ? hiBins.reduce((a, b) => a + b.n * (b.win_rate - b.raw_p), 0) / hiBins.reduce((a, b) => a + b.n, 0) : 0
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h2">Are Kalshi prices calibrated?</h1>
        <p className="text-sm text-grey-300 mt-1">{c.n_markets.toLocaleString()} settled Kalshi markets. Price ~1 day before close vs. how often YES actually happened. Perfect calibration is the 45° line.</p>
      </div>
      <div className="grid gap-3 grid-cols-3">
        <div className="card py-3"><div className="text-xs text-grey-500">settled markets</div><div className="text-xl text-bone mono">{c.n_markets.toLocaleString()}</div></div>
        <div className="card py-3"><div className="text-xs text-grey-500">longshots (≤20¢): price − win rate</div><div className="text-xl text-bone mono">{(low * 100).toFixed(1)}pp</div></div>
        <div className="card py-3"><div className="text-xs text-grey-500">favorites (≥80¢): win rate − price</div><div className="text-xl text-bone mono">{(hi * 100).toFixed(1)}pp</div></div>
      </div>
      <div className="card">
        <CalibrationChart c={c} height={520} />
        <div className="text-xs text-grey-500 mt-2">Below the 45° line = buyers of YES overpaid at that price; above = underpaid. The isotonic fit is the monotone correction Basis applies to every raw price.</div>
      </div>
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-grey-700/60 text-xs text-grey-300"><tr><th className="px-3 py-2 text-left">bin</th><th className="px-3 py-2 text-right">n</th><th className="px-3 py-2 text-right">avg price</th><th className="px-3 py-2 text-right">win rate</th><th className="px-3 py-2 text-right">gap</th></tr></thead>
          <tbody>{c.bins.map(b => (
            <tr key={b.bin} className="border-b border-grey-700/40 mono">
              <td className="px-3 py-1.5 text-grey-300">{b.bin}</td><td className="px-3 py-1.5 text-right">{b.n.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right">{(b.raw_p * 100).toFixed(1)}¢</td><td className="px-3 py-1.5 text-right text-bone">{(b.win_rate * 100).toFixed(1)}%</td>
              <td className={`px-3 py-1.5 text-right ${b.win_rate - b.raw_p < 0 ? 'text-rose-200' : 'text-emerald-200'}`}>{((b.win_rate - b.raw_p) * 100).toFixed(1)}pp</td>
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  )
}
