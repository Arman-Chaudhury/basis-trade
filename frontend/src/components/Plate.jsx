import React, { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { COMMON, INIT_FRAG, STEP_FRAG, GRAIN_VERT, GRAIN_FRAG, PLATE_VERT, PLATE_FRAG } from './plateShaders.js'
import { modesFor, fieldAt, ampMax, plateParamsFor } from './plateField.js'
export { plateParamsFor as paramsFor }

const SAND = { gamma: 4.5, stepScale: 0.0045, slopeBias: 0.18, flightRate: 6, sprinkle: 0.4, hopHeight: 0.02 }
const CAMERAS = {
  tilt: { pos: [0.0, -2.9, 3.4], target: [0, 0.1, 0], offset: 0.62 },
  overhead: { pos: [0.0, -1.1, 4.3], target: [0, 0.0, 0], offset: 0.6 },
  detail: { pos: [0.7, -2.0, 2.5], target: [0.1, 0.1, 0], offset: 0.62 },
  centre: { pos: [0.0, -2.4, 3.6], target: [0, 0.1, 0], offset: 0 },
}
const SAND_COLOR = new THREE.Color('#D9CFB4')
const PLATE_COLOR = new THREE.Color('#1B212C')
const GLOW_COLOR = new THREE.Color('#9AA2B0')

function fullscreen(frag, uniforms) {
  const mat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: 'in vec3 position; void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: frag, uniforms, depthTest: false, depthWrite: false })
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
  const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geo, mat))
  return { scene, mat }
}
function target(size, type) {
  return new THREE.WebGLRenderTarget(size, size, { count: 2, type, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false })
}

function Sand({ api, texSize, cameraName }) {
  const { gl, camera, size, viewport } = useThree()
  const state = useRef({ f: 744, gamma: 3, drive: [0, 0], targetF: 744, targetGamma: 3, targetDrive: [0, 0], phase: 0, ripple: 1, shake: 0, rippleOrigin: [0, 0], reveal: 0, cam: 'tilt', frame: 0, modesDirty: true })
  const modeUniform = useMemo(() => Array.from({ length: 16 }, () => new THREE.Vector4()), [])
  const shared = useMemo(() => ({ uModes: { value: modeUniform }, uModeCount: { value: 0 }, uAmpMax: { value: 1 } }), [])
  const sim = useMemo(() => {
    const type = gl.capabilities.isWebGL2 && (gl.getContext().getExtension('EXT_color_buffer_float')) ? THREE.FloatType : THREE.HalfFloatType
    const a = target(texSize, type), b = target(texSize, type)
    const init = fullscreen(INIT_FRAG, { uSeed: { value: 1 }, ...shared })
    const step = fullscreen(STEP_FRAG, { uPos: { value: null }, uAux: { value: null }, uDelta: { value: 0 }, uTime: { value: 0 }, uFrame: { value: 0 }, uGamma: { value: SAND.gamma }, uStepScale: { value: SAND.stepScale }, uSlopeBias: { value: SAND.slopeBias }, uFlightRate: { value: SAND.flightRate }, uSprinkle: { value: SAND.sprinkle }, uHopHeight: { value: SAND.hopHeight }, uShake: { value: 0 }, uRipple: { value: 1 }, uRippleOrigin: { value: new THREE.Vector2() }, ...shared })
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    return { a, b, init, step, cam, cur: a, nxt: b, inited: false }
  }, [texSize])
  const grainMat = useMemo(() => new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: GRAIN_VERT, fragmentShader: GRAIN_FRAG, transparent: true, depthWrite: false, depthTest: true, blending: THREE.NormalBlending, premultipliedAlpha: true,
    uniforms: { uPosTex: { value: null }, uAuxTex: { value: null }, uTexSize: { value: texSize }, uPlateHalfSize: { value: new THREE.Vector2(1, 1) }, uGrainWorldSize: { value: 0.0056 }, uHopScale: { value: 0.05 }, uProjectionScale: { value: 1000 }, uReveal: { value: 0 }, uDisplace: { value: 0.05 }, uPhase: { value: 0 }, uSandColor: { value: SAND_COLOR }, uLightDir: { value: new THREE.Vector3(0, 0, 1) }, uAirborneGlow: { value: 0.35 }, ...shared } }), [texSize])
  const grainGeo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(texSize * texSize * 3), 3)); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3); return g }, [texSize])
  const plateMat = useMemo(() => new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: PLATE_VERT, fragmentShader: PLATE_FRAG,
    uniforms: { uDisplace: { value: 0.05 }, uPhase: { value: 0 }, uBaseColor: { value: PLATE_COLOR }, uGlowColor: { value: GLOW_COLOR }, uLightDir: { value: new THREE.Vector3(0, 0, 1) }, uGlow: { value: 0.35 }, uRipple: { value: 1 }, uRippleStrength: { value: 0 }, uRippleOrigin: { value: new THREE.Vector2() }, uEdge: { value: 0 }, ...shared } }), [])
  const edgeMat = useMemo(() => { const m = plateMat.clone(); m.uniforms = THREE.UniformsUtils.clone(plateMat.uniforms); m.uniforms.uModes = shared.uModes; m.uniforms.uModeCount = shared.uModeCount; m.uniforms.uAmpMax = shared.uAmpMax; m.uniforms.uEdge.value = 1; m.uniforms.uDisplace.value = 0; return m }, [plateMat])
  const plateGeo = useMemo(() => new THREE.PlaneGeometry(2, 2, 110, 110), [])
  const lightWorld = useMemo(() => new THREE.Vector3(-0.35, -0.55, 0.75).normalize(), [])
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), t: new THREE.Vector3() }), [])
  const groupRef = useRef()

  useImperativeHandle(api, () => ({
    set: ({ f, gamma, drive, camera: camName, strike }) => {
      const s = state.current
      let changed = false
      if (f != null && Math.abs(f - s.targetF) > 1) { s.targetF = f; changed = true }
      if (gamma != null) s.targetGamma = gamma
      if (drive) { if (Math.abs(drive[0] - s.targetDrive[0]) > 0.01 || Math.abs(drive[1] - s.targetDrive[1]) > 0.01) changed = true; s.targetDrive = drive }
      if (camName) s.cam = camName
      if (strike || changed) { s.ripple = 0; s.shake = 1; s.rippleOrigin = [s.targetDrive[0], s.targetDrive[1]] }
    },
  }), [])

  useEffect(() => { camera.up.set(0, 0, 1); const c = CAMERAS[cameraName || 'tilt']; camera.position.set(...c.pos); camera.lookAt(...c.target); state.current.cam = cameraName || 'tilt' }, [])

  const applyModes = () => {
    const s = state.current
    const modes = modesFor(s.f, s.drive)
    modes.forEach((m, i) => modeUniform[i].set(m.m, m.n, m.w, m.s))
    shared.uModeCount.value = modes.length
    shared.uAmpMax.value = ampMax(modes)
  }

  useFrame((_, delta) => {
    const s = state.current
    const dt = Math.min(delta, 1 / 30)
    // ease parameters (continuous morph like a frequency sweep)
    const k = 1 - Math.exp(-dt * 2.2)
    const nf = s.f + (s.targetF - s.f) * k, ng = s.gamma + (s.targetGamma - s.gamma) * k
    const nd = [s.drive[0] + (s.targetDrive[0] - s.drive[0]) * k, s.drive[1] + (s.targetDrive[1] - s.drive[1]) * k]
    if (Math.abs(nf - s.f) > 0.05 || Math.abs(nd[0] - s.drive[0]) > 1e-3 || Math.abs(nd[1] - s.drive[1]) > 1e-3 || s.modesDirty) { s.f = nf; s.drive = nd; applyModes(); s.modesDirty = false }
    s.gamma = ng
    s.phase += dt * 2.4 * 2 * Math.PI * 0.35
    s.reveal = Math.min(1, s.reveal + dt * 0.8)
    s.ripple = Math.min(1, s.ripple + dt / 0.64)
    s.shake = s.ripple >= 1 ? 0 : s.shake
    s.frame++
    // camera drift toward preset
    const c = CAMERAS[s.cam] || CAMERAS.tilt
    tmp.v.set(...c.pos); camera.position.lerp(tmp.v, 1 - Math.exp(-dt * 1.5))
    tmp.t.set(...c.target); camera.lookAt(tmp.t)
    if (groupRef.current) groupRef.current.position.x += ((c.offset ?? 0) - groupRef.current.position.x) * (1 - Math.exp(-dt * 1.5))
    // light in view space
    const ld = lightWorld.clone().transformDirection(camera.matrixWorldInverse)
    grainMat.uniforms.uLightDir.value.copy(ld); plateMat.uniforms.uLightDir.value.copy(ld); edgeMat.uniforms.uLightDir.value.copy(ld)
    // sim step
    const st = sim.step.mat.uniforms
    if (!sim.inited) { gl.setRenderTarget(sim.cur); gl.render(sim.init.scene, sim.cam); sim.inited = true }
    st.uPos.value = sim.cur.textures[0]; st.uAux.value = sim.cur.textures[1]
    st.uDelta.value = dt; st.uTime.value += dt; st.uFrame.value = s.frame
    st.uGamma.value = s.gamma; st.uShake.value = s.shake; st.uRipple.value = s.ripple; st.uRippleOrigin.value.set(...s.rippleOrigin)
    gl.setRenderTarget(sim.nxt); gl.render(sim.step.scene, sim.cam); gl.setRenderTarget(null)
    const t = sim.cur; sim.cur = sim.nxt; sim.nxt = t
    // render uniforms
    const g = grainMat.uniforms
    g.uPosTex.value = sim.cur.textures[0]; g.uAuxTex.value = sim.cur.textures[1]
    g.uProjectionScale.value = size.height * viewport.dpr / (2 * Math.tan((camera.fov * Math.PI) / 360))
    g.uReveal.value = s.reveal; g.uPhase.value = s.phase
    plateMat.uniforms.uPhase.value = s.phase; plateMat.uniforms.uRipple.value = s.ripple; plateMat.uniforms.uRippleStrength.value = s.shake; plateMat.uniforms.uRippleOrigin.value.set(...s.rippleOrigin)
  })

  return (
    <group ref={groupRef}>
      <mesh geometry={plateGeo} material={plateMat} />
      <mesh material={edgeMat} position={[0, 0, -0.035]}><boxGeometry args={[2, 2, 0.07]} /></mesh>
      <points geometry={grainGeo} material={grainMat} frustumCulled={false} />
    </group>
  )
}

/* 2D canvas fallback (no WebGL2): same field, a lighter CPU walk. */
function Plate2D({ api, count }) {
  const ref = useRef()
  const st = useRef({ f: 744, gamma: 3, drive: [0, 0], tf: 744, tg: 3, td: [0, 0], modes: modesFor(744), amax: 1 })
  useImperativeHandle(api, () => ({ set: ({ f, gamma, drive }) => { const s = st.current; if (f != null) s.tf = f; if (gamma != null) s.tg = gamma; if (drive) s.td = drive } }), [])
  useEffect(() => {
    const cv = ref.current, ctx = cv.getContext('2d')
    const P = new Float32Array(count * 2); for (let i = 0; i < count * 2; i++) P[i] = Math.random() * 2 - 1
    let raf, last = performance.now()
    const draw = now => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now
      const s = st.current, k = 1 - Math.exp(-dt * 2.2)
      s.f += (s.tf - s.f) * k; s.gamma += (s.tg - s.gamma) * k; s.drive = [s.drive[0] + (s.td[0] - s.drive[0]) * k, 0]
      s.modes = modesFor(s.f, s.drive); s.amax = ampMax(s.modes, 24)
      const W = cv.width = cv.clientWidth * devicePixelRatio, H = cv.height = cv.clientHeight * devicePixelRatio
      const R = Math.min(W, H) * 0.4, cx = W / 2, cy = H / 2
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#1B212C'; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R)
      ctx.fillStyle = 'rgba(237,227,203,0.9)'
      const h = 0.004
      for (let i = 0; i < count; i++) {
        let x = P[i * 2], y = P[i * 2 + 1]
        const u = fieldAt(s.modes, x, y) / s.amax, amp = Math.abs(u)
        const excess = Math.max(s.gamma * amp - 0.6, 0)
        const gx = (Math.abs(fieldAt(s.modes, x + h, y)) - Math.abs(fieldAt(s.modes, x - h, y))) / (2 * h * s.amax)
        const gy = (Math.abs(fieldAt(s.modes, x, y + h)) - Math.abs(fieldAt(s.modes, x, y - h))) / (2 * h * s.amax)
        const g = Math.hypot(gx, gy) + 1e-6
        const sig = 0.012 * Math.pow(excess, 1.2)
        x += (Math.random() - 0.5) * sig - (gx / g) * Math.min(0.01, excess * 0.02); y += (Math.random() - 0.5) * sig - (gy / g) * Math.min(0.01, excess * 0.02)
        if (x < -1 || x > 1 || y < -1 || y > 1) { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1 }
        P[i * 2] = x; P[i * 2 + 1] = y
        ctx.fillRect(cx + x * R, cy + y * R, 1.5 * devicePixelRatio, 1.5 * devicePixelRatio)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [count])
  return <canvas ref={ref} className="absolute inset-0 w-full h-full" />
}

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: false } }
  static getDerivedStateFromError() { return { err: true } }
  componentDidCatch(e) { console.warn('plate fell back to 2D:', e?.message) }
  render() { return this.state.err ? this.props.fallback : this.props.children }
}
function webgl2Tier() {
  try {
    const c = document.createElement('canvas'); const g = c.getContext('webgl2')
    if (!g) return null
    const dbg = g.getExtension('WEBGL_debug_renderer_info'); const r = dbg ? g.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ''
    if (/swiftshader|llvmpipe|software/i.test(r)) return 'low'
    return window.innerWidth < 800 ? 'low' : (navigator.hardwareConcurrency >= 8 ? 'high' : 'medium')
  } catch { return null }
}
const TEX = { high: 448, medium: 320, low: 224 }

/* Full-screen plate. `api` ref exposes set({ f, gamma, drive, camera, strike }). */
const Plate = forwardRef(function Plate({ className = '', camera = 'tilt', bloom = true }, api) {
  const [tier] = useState(webgl2Tier)
  const fallback = <Plate2D api={api} count={5000} />
  return (
    <div className={`absolute inset-0 ${className}`}>
      {tier ? (
        <Boundary fallback={fallback}>
          <Canvas dpr={[1, 1.5]} camera={{ fov: 32, near: 0.1, far: 20, position: CAMERAS[camera].pos }} gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }} onCreated={({ gl }) => { gl.setClearColor(0x000000, 0) }}>
            <Sand api={api} texSize={TEX[tier]} cameraName={camera} />
            {bloom && tier !== 'low' && <EffectComposer disableNormalPass multisampling={0}><Bloom mipmapBlur luminanceThreshold={0.7} luminanceSmoothing={0.25} intensity={0.3} /></EffectComposer>}
          </Canvas>
        </Boundary>
      ) : fallback}
    </div>
  )
})
export default Plate

/* Static thumbnail: nodal lines of the figure an event drives. */
export function Figure({ f, gamma = 3, drive = [0, 0], size = 160, className = '' }) {
  const ref = useRef()
  useEffect(() => {
    const cv = ref.current, ctx = cv.getContext('2d'), S = size * devicePixelRatio
    cv.width = cv.height = S
    const modes = modesFor(f, drive), amax = ampMax(modes, 32)
    const img = ctx.createImageData(S, S), d = img.data
    const eps = 0.32 / gamma + 0.02 // rest contour: |Ψ| < 1/Γ
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = (i / S) * 2 - 1, y = (j / S) * 2 - 1
      const a = Math.abs(fieldAt(modes, x, y)) / amax
      const v = a < eps ? 1 - a / eps : 0
      const o = (j * S + i) * 4; d[o] = 237; d[o + 1] = 227; d[o + 2] = 203; d[o + 3] = Math.floor(Math.pow(v, 0.7) * 230)
    }
    ctx.putImageData(img, 0, 0)
  }, [f, gamma, drive[0], drive[1], size])
  return <canvas ref={ref} style={{ width: size, height: size, background: '#1B212C' }} className={className} />
}
