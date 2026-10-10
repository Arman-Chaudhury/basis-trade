import React from 'react'
import { ComposedChart, Scatter, Line, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { COLORS } from '../api.js'

export default function CalibrationChart({ c, invert = false, height = 520 }) {
  const bins = c.bins.map(b => ({ x: b.raw_p, y: b.win_rate, n: b.n, bin: b.bin }))
  const curve = c.curve.map(p => ({ x: p.p, fit: p.p_cal }))
  const diag = [{ x: 0, d: 0 }, { x: 1, d: 1 }]
  const txt = invert ? '#3A3F3F' : COLORS.text
  const grid = invert ? '#C9CECE' : COLORS.grid
  const dot = invert ? '#0B0C07' : COLORS.kalshi
  const fit = COLORS.proxy
  const tip = 'bg-ink-2 border-grey-700 text-bone'
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <ComposedChart margin={{ top: 10, right: 30, bottom: 24, left: 10 }}>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" />
          <XAxis dataKey="x" type="number" domain={[0, 1]} tickFormatter={v => `${Math.round(v * 100)}¢`} tick={{ fill: txt, fontSize: 11 }} label={{ value: 'market price (YES)', position: 'insideBottom', offset: -8, fill: txt, fontSize: 12 }} />
          <YAxis dataKey="y" type="number" domain={[0, 1]} tickFormatter={v => `${Math.round(v * 100)}%`} tick={{ fill: txt, fontSize: 11 }} width={48} label={{ value: 'empirical win rate', angle: -90, position: 'insideLeft', fill: txt, fontSize: 12 }} />
          <ZAxis dataKey="n" range={[40, 900]} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
            const p = payload?.[0]?.payload
            if (!p) return null
            if (p.bin) return <div className={`rounded border p-2 text-xs ${tip}`}><div className="font-medium">bin {p.bin}</div><div>n = {p.n.toLocaleString()}</div><div>avg price {(p.x * 100).toFixed(1)}¢</div><div>win rate {(p.y * 100).toFixed(1)}%</div></div>
            return <div className={`rounded border p-2 text-xs ${tip}`}><div>price {(p.x * 100).toFixed(0)}¢ → calibrated {(p.fit * 100).toFixed(1)}%</div></div>
          }} />
          <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12, color: txt }} />
          <Line data={diag} dataKey="d" name="perfect calibration" stroke={invert ? '#8A9090' : COLORS.ref} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
          <Line data={curve} dataKey="fit" name="isotonic fit" stroke={fit} strokeWidth={2.5} dot={false} isAnimationActive={false} />
          <Scatter data={bins} name="5¢ bins (size = n)" fill={dot} fillOpacity={0.8} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
