import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'

function fib(count, radius) {
  const arr = new Float32Array(count * 3)
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const t = golden * i
    arr[i * 3] = Math.cos(t) * r * radius; arr[i * 3 + 1] = y * radius; arr[i * 3 + 2] = Math.sin(t) * r * radius
  }
  return arr
}

// Point-cloud globe: "the market". `progress` is a ref 0..1 driven by scroll.
function Points({ progress, count = 4200, radius = 2.2 }) {
  const ref = useRef()
  const positions = useMemo(() => fib(count, radius), [count, radius])
  useFrame((_, dt) => {
    if (!ref.current) return
    const p = progress?.current ?? 0
    ref.current.rotation.y += dt * 0.05
    ref.current.rotation.x = -0.35 + p * 0.3
    ref.current.rotation.z = p * 0.15
  })
  return (
    <group ref={ref}>
      <points>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
        <pointsMaterial size={0.018} color="#E1E5E5" sizeAttenuation transparent opacity={0.85} depthWrite={false} />
      </points>
      <mesh><sphereGeometry args={[radius * 0.985, 48, 48]} /><meshBasicMaterial color="#0B0C07" /></mesh>
      <mesh><sphereGeometry args={[radius * 1.004, 32, 32]} /><meshBasicMaterial color="#E1E5E5" wireframe transparent opacity={0.035} /></mesh>
    </group>
  )
}

// 2D-canvas fallback (no WebGL): same point sphere, painter-sorted, back half dimmed.
function Globe2D({ progress, y, radius }) {
  const ref = useRef()
  useEffect(() => {
    const cv = ref.current; const ctx = cv.getContext('2d')
    const pts = fib(2600, 1); let raf, rot = 0, last = performance.now()
    const draw = now => {
      const dt = (now - last) / 1000; last = now
      const p = progress?.current ?? 0
      rot += dt * 0.05
      const W = cv.width = cv.clientWidth * devicePixelRatio, H = cv.height = cv.clientHeight * devicePixelRatio
      ctx.clearRect(0, 0, W, H)
      const R = Math.min(W, H) * 0.26 * (radius / 2.2), cx = W / 2, cy = H / 2 - y * (H / 5.2)
      const tx = -0.35 + p * 0.3, cosx = Math.cos(tx), sinx = Math.sin(tx), cosy = Math.cos(rot), siny = Math.sin(rot)
      for (let i = 0; i < pts.length; i += 3) {
        let x = pts[i], yy = pts[i + 1], z = pts[i + 2]
        let x1 = x * cosy + z * siny, z1 = -x * siny + z * cosy
        let y1 = yy * cosx - z1 * sinx, z2 = yy * sinx + z1 * cosx
        const a = z2 > 0 ? 0.85 : 0.08
        ctx.fillStyle = `rgba(225,229,229,${a})`
        ctx.fillRect(cx + x1 * R, cy - y1 * R, 1.6 * devicePixelRatio, 1.6 * devicePixelRatio)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [y, radius])
  return <canvas ref={ref} className="absolute inset-0 w-full h-full" />
}

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: false } }
  static getDerivedStateFromError() { return { err: true } }
  render() { return this.state.err ? this.props.fallback : this.props.children }
}

function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}

export default function Globe({ progress, className = '', y = -1.7, radius = 2.2 }) {
  const [gl] = useState(hasWebGL)
  const fallback = <Globe2D progress={progress} y={y} radius={radius} />
  return (
    <div className={`absolute inset-0 ${className}`}>
      {gl ? (
        <Boundary fallback={fallback}>
          <Canvas dpr={[1, 1.75]} camera={{ position: [0, 0, 5.2], fov: 42 }} gl={{ antialias: true, alpha: true }}>
            <group position={[0, y, 0]}><Points progress={progress} radius={radius} /></group>
            <fog attach="fog" args={['#0B0C07', 4, 8]} />
          </Canvas>
        </Boundary>
      ) : fallback}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,rgba(225,229,229,0.10),transparent_55%)]" />
    </div>
  )
}
