import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import './index.css'
import Overview from './pages/Overview.jsx'
import Event from './pages/Event.jsx'
import Calibration from './pages/Calibration.jsx'
import Pipeline from './pages/Pipeline.jsx'
import Research from './pages/Research.jsx'
import { initSmooth, ScrollTrigger } from './lib/smooth.js'

function External({ to }) { React.useEffect(() => { window.location.replace(to) }, [to]); return <div className='eyebrow p-6'>Opening…</div> }

/* One nav for the whole product. The landing (served by the Node service) carries the same list. */
const LINKS = [
  ['/node/index.html#how', 'How', true], ['/node/index.html#odds', 'This week', true], ['/node/console.html#news', 'News', true],
  ['/pipeline', 'Pipeline'], ['/research', 'Research'], ['/signals', 'Signals'], ['/node/console.html', 'Console', true], ['/node/atty/', 'Atty', true],
]

function Shell() {
  const loc = useLocation()
  React.useEffect(() => { const l = initSmooth(); l.scrollTo(0, { immediate: true }); ScrollTrigger.refresh() }, [loc.pathname])
  return (
    <div className="min-h-screen">
      <nav className="anav" aria-label="Main">
        <a className="brand" href="/node/index.html"><b>Atropos</b><span className="tag">Beta</span></a>
        <div className="links">
          {LINKS.map(([to, label, ext]) => ext ? <a key={to} href={to}>{label}</a> : <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>)}
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-5 py-8">
        <Routes>
          <Route path="/" element={<External to="/node/index.html" />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/research" element={<Research />} />
          <Route path="/signals" element={<Overview />} />
          <Route path="/app" element={<Overview />} />
          <Route path="/desk" element={<Overview />} />
          <Route path="/events/:id" element={<Event />} />
          <Route path="/calibration" element={<Calibration />} />
          <Route path="/console" element={<External to="/node/console.html" />} />
          <Route path="/atty" element={<External to="/node/atty/" />} />
        </Routes>
      </main>
      <footer className="mx-auto max-w-7xl px-5 py-10 eyebrow">Atropos · engines: Basis (Arman Chaudhury) · Atropos (Ethan Beirne) · Leaf (juvowen) · read-only, nothing is traded for you</footer>
    </div>
  )
}
ReactDOM.createRoot(document.getElementById('root')).render(<BrowserRouter><Shell /></BrowserRouter>)
