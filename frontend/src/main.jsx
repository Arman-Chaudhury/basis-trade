import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, NavLink, Link, useLocation } from 'react-router-dom'
import './index.css'
import Landing from './pages/Landing.jsx'
import Overview from './pages/Overview.jsx'
import Event from './pages/Event.jsx'
import Calibration from './pages/Calibration.jsx'
import Pipeline from './pages/Pipeline.jsx'
import { api } from './api.js'
import { initSmooth, ScrollTrigger } from './lib/smooth.js'

function Shell() {
  const [health, setHealth] = React.useState(null)
  const [dark, setDark] = React.useState(() => new URLSearchParams(window.location.search).has('dark') || localStorage.getItem('basis-dark') === '1')
  React.useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('basis-dark', dark ? '1' : '0') }, [dark])
  const loc = useLocation()
  React.useEffect(() => { api.health().then(setHealth).catch(() => setHealth({ ok: false })) }, [])
  React.useEffect(() => { const l = initSmooth(); l.scrollTo(0, { immediate: true }); ScrollTrigger.refresh() }, [loc.pathname])
  const onLanding = loc.pathname === '/'
  const link = ({ isActive }) => `px-3 py-1.5 rounded-full text-sm ${isActive ? 'bg-ink-3 text-bone' : 'text-grey-300 hover:text-bone'}`
  return (
    <div className="min-h-screen">
      <header className={`sticky top-0 z-30 ${onLanding ? 'bg-transparent' : 'bg-ink/80 backdrop-blur border-b border-grey-700/40'}`}>
        <div className="mx-auto max-w-7xl px-5 h-14 flex items-center gap-6">
          <Link to="/" className="font-display text-xl tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Basis</Link>
          {onLanding ? <nav className="hidden md:flex gap-6 ml-6">
            {[['#story', 'Story'], ['#lab', 'Lab'], ['#figures', 'Map'], ['#about', 'About']].map(([h, l]) => <a key={h} href={h} className="eyebrow hover:text-bone">{l}</a>)}
          </nav> : <nav className="flex gap-1">
            <NavLink to="/pipeline" className={link}>Pipeline</NavLink>
            <NavLink to="/app" className={link}>Desk</NavLink>
            <NavLink to="/calibration" className={link}>Calibration</NavLink>
          </nav>}
          <div className="ml-auto flex items-center gap-3 text-xs text-grey-500">
            {health?.demo_mode && <span className="rounded-full border border-brass/50 text-brass px-2 py-0.5">DEMO SNAPSHOT</span>}
            {health && !health.ok && <span className="rounded-full border border-rose-400/40 text-rose-200 px-2 py-0.5">API DOWN</span>}
            {!onLanding && health?.last_refresh?.ts && <span>refreshed {new Date(health.last_refresh.ts).toLocaleTimeString()}</span>}
            <button onClick={() => setDark(d => !d)} className="btn-text" title="toggle theme">{dark ? 'Light' : 'Dark'}</button>
            {onLanding ? <Link to="/pipeline" className="btn-text">Run the pipeline</Link> : <Link to="/" className="btn-text">Home</Link>}
          </div>
        </div>
      </header>
      <main className={onLanding ? '' : 'mx-auto max-w-7xl px-5 py-6'}>
        <Routes>
          <Route path="/" element={<Landing dark={dark} />} />
          <Route path="/app" element={<Overview />} />
          <Route path="/events/:id" element={<Event />} />
          <Route path="/calibration" element={<Calibration />} />
          <Route path="/pipeline" element={<Pipeline />} />
        </Routes>
      </main>
    </div>
  )
}
ReactDOM.createRoot(document.getElementById('root')).render(<BrowserRouter><Shell /></BrowserRouter>)
