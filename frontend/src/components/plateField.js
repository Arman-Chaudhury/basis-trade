/* Mode selection shared by the GPU plate, the 2D fallback and the Figure thumbnails. */
const BASE_HZ = 211 / 5 // (1,2) mode of the reference plate: f ∝ m² + n²
export const RESONANCES = [242, 523, 744, 1117, 1443, 1590, 1939, 2478, 2768, 2953]

export function modesFor(f, drive = [0, 0], width = 42, count = 10) {
  const out = []
  for (let m = 1; m <= 9; m++) for (let n = m + 1; n <= 10; n++) {
    const fk = BASE_HZ * (m * m + n * n)
    const x = (drive[0] + 1) * 0.5 * Math.PI, y = (drive[1] + 1) * 0.5 * Math.PI
    const shape = Math.cos(n * x) * Math.cos(m * y) - Math.cos(m * x) * Math.cos(n * y)
    const resp = 1 / ((fk - f) ** 2 + width ** 2)
    const w = (0.35 + Math.abs(shape)) * resp // off-centre drive favours modes that move under the stud
    out.push({ m, n, w, s: -1 })
  }
  out.sort((a, b) => b.w - a.w)
  const top = out.slice(0, count)
  const max = top[0].w
  return top.map(t => ({ ...t, w: t.w / max }))
}

export function fieldAt(modes, px, py) {
  const x = (px + 1) * 0.5 * Math.PI, y = (py + 1) * 0.5 * Math.PI
  let v = 0
  for (const { m, n, w, s } of modes) v += w * (Math.cos(n * x) * Math.cos(m * y) + s * Math.cos(m * x) * Math.cos(n * y))
  return v
}

export function ampMax(modes, grid = 40) {
  let mx = 0
  for (let i = 0; i <= grid; i++) for (let j = 0; j <= grid; j++) {
    const v = Math.abs(fieldAt(modes, (i / grid) * 2 - 1, (j / grid) * 2 - 1)); if (v > mx) mx = v
  }
  return Math.max(mx, 1e-6)
}

/* Basis mapping: calibrated probability → drive frequency; trust → Γ; basis → drive point. */
export function plateParamsFor(e) {
  if (!e) return { f: 744, gamma: 3, drive: [0, 0] }
  const p = Math.min(Math.max(e.p_calibrated ?? e.p_raw ?? 0.5, 0), 1)
  const idx = p * (RESONANCES.length - 4)
  const lo = Math.floor(idx), t = idx - lo
  const f = RESONANCES[lo] + (RESONANCES[Math.min(lo + 1, RESONANCES.length - 1)] - RESONANCES[lo]) * t
  const trust = Math.min(Math.max((e.trust_score ?? 50) / 100, 0.05), 1)
  const gamma = 5.5 + (1 - trust) * 5
  const b = Math.max(-0.25, Math.min(0.25, e.basis ?? 0))
  return { f: Math.round(f), gamma: +gamma.toFixed(2), drive: [+(b * 2.4).toFixed(2), 0] }
}
