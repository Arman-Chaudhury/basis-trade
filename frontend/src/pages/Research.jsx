import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Screener from '../leaf/Screener.jsx'
import { getStrategies } from '../leaf/api.js'
import '../leaf/styles/tokens.css'
import '../leaf/styles/home.css'
import '../leaf/styles/screener.css'
import '../leaf/styles/basis-skin.css'

/* Leaf's research tool, as Juvo built it: strategy cards with their math, a parameter builder, and the
   pair screener over real Yahoo prices, with charts and a written reading of why each pair fits. */
export default function Research() {
  const [strategies, setStrategies] = useState(null)
  useEffect(() => { getStrategies().then(d => setStrategies(d.strategies)).catch(() => setStrategies({})) }, [])
  return (
    <div className="max-w-6xl mx-auto">
      <div className="eyebrow mb-3">Research · pairs</div>
      <h1 className="h2">Find the pairs that move together.</h1>
      <p className="mt-4 max-w-2xl text-grey-300">Pick a strategy or set your own conditions, and Atropos screens a universe of real daily prices for cointegration, correlation and how fast a spread snaps back, then returns a ranked shortlist with the numbers, the charts, and a plain-language reading of why each pair fits. The same screen finds the equity hedge in the <Link to="/pipeline" className="underline">pipeline</Link>.</p>
      {strategies && (
        <div className="mt-10 grid md:grid-cols-3 gap-4">
          {Object.entries(strategies).map(([k, s]) => (
            <div key={k} className="card">
              <div className="h3">{s.label}</div>
              <p className="mt-2 text-sm text-grey-300">{s.summary}</p>
              <ul className="mt-3 space-y-1 mono text-[11px] text-grey-500">{s.math?.map(m => <li key={m}>{m}</li>)}</ul>
              <div className="mt-3 eyebrow">{Object.entries(s.requires || {}).map(([a, b]) => `${a} ${b}`).join(' · ')}</div>
            </div>
          ))}
        </div>
      )}
      <div className="leaf mt-12">
        <Screener strategies={strategies} query={{}} />
      </div>
    </div>
  )
}
