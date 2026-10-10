import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
gsap.registerPlugin(ScrollTrigger)
let lenis
export function initSmooth() {
  if (lenis) return lenis
  lenis = new Lenis({ duration: 1.4, wheelMultiplier: 1.15 })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add(t => lenis.raf(t * 1000))
  gsap.ticker.lagSmoothing(0)
  document.documentElement.classList.add('lenis')
  return lenis
}
export { gsap, ScrollTrigger }
