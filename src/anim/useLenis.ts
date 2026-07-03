// src/anim/useLenis.ts
import { useEffect } from 'react'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/** Module-level handle so nav/CTA can scrollTo. Null when reduced motion. */
export let lenis: Lenis | null = null

export function scrollToSection(id: string) {
  const target = `#${id}`
  if (lenis) lenis.scrollTo(target, { duration: 1.2 })
  else document.querySelector(target)?.scrollIntoView({ behavior: 'auto' })
}

export function useLenis() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // ?smooth=off → native scroll (ScrollTrigger still works); perf diagnostic.
    if (new URLSearchParams(window.location.search).get('smooth') === 'off') return
    lenis = new Lenis({ duration: 1.1 })
    lenis.on('scroll', ScrollTrigger.update)
    const raf = (time: number) => lenis?.raf(time * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)
    return () => { gsap.ticker.remove(raf); lenis?.destroy(); lenis = null }
  }, [])
}
