// src/anim/reveals.ts — the site's single motion vocabulary.
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'

gsap.registerPlugin(ScrollTrigger, SplitText)

export const EASE_REVEAL = 'power3.out'
export const EASE_MASK = 'expo.out'
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// SplitText instances aren't collected by gsap.context() — track and revert them
// ourselves so StrictMode's mount→cleanup→mount cycle never double-splits or lets
// a second gsap.from() capture an already-hidden value as its end state.
let splits: SplitText[] = []

/** Create all animations with revertable cleanup. Call once after mount. */
export function initMotion(): () => void {
  splits = []
  const removers: (() => void)[] = []
  const ctx = gsap.context(() => {
    heroIntro()
    initSectionReveals()
    initMagnetic(removers)
    initTilt(removers)
  })
  return () => {
    removers.forEach(r => r())
    ctx.revert()
    splits.forEach(s => s.revert())
    splits = []
  }
}

const finePointer = () => window.matchMedia('(pointer: fine)').matches

/** Elements with [data-magnetic] lean toward the cursor within their box. */
function initMagnetic(removers: (() => void)[]) {
  if (!finePointer() || reduced()) return
  document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach(el => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.4, ease: 'power3.out' })
    const yTo = gsap.quickTo(el, 'y', { duration: 0.4, ease: 'power3.out' })
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      xTo((e.clientX - r.left - r.width / 2) * 0.3)
      yTo((e.clientY - r.top - r.height / 2) * 0.4)
    }
    const onLeave = () => { xTo(0); yTo(0) }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    removers.push(() => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    })
  })
}

/** Project cards tilt ≤4° toward the cursor. */
function initTilt(removers: (() => void)[]) {
  if (!finePointer() || reduced()) return
  document.querySelectorAll<HTMLElement>('.project-panel').forEach(card => {
    gsap.set(card, { transformPerspective: 800 })
    const rX = gsap.quickTo(card, 'rotationX', { duration: 0.5, ease: 'power3.out' })
    const rY = gsap.quickTo(card, 'rotationY', { duration: 0.5, ease: 'power3.out' })
    const onMove = (e: PointerEvent) => {
      const r = card.getBoundingClientRect()
      rY(((e.clientX - r.left) / r.width - 0.5) * 8)
      rX(-((e.clientY - r.top) / r.height - 0.5) * 8)
    }
    const onLeave = () => { rX(0); rY(0) }
    card.addEventListener('pointermove', onMove)
    card.addEventListener('pointerleave', onLeave)
    removers.push(() => {
      card.removeEventListener('pointermove', onMove)
      card.removeEventListener('pointerleave', onLeave)
    })
  })
}

/** Hero load-in: greeting, masked name chars, subtitle, CTA, contact icons. */
function heroIntro() {
  const els = '#greeting, #subtitle, #cta-button, .contact-logo'
  if (reduced()) { gsap.set(`${els}, #intro`, { opacity: 1 }); return }
  const name = SplitText.create('#intro', { type: 'chars', mask: 'chars' })
  splits.push(name)
  gsap.set('#intro', { opacity: 1 })
  gsap.timeline({ defaults: { ease: EASE_MASK } })
    .to('#greeting', { opacity: 1, duration: 0.8, ease: 'none' }, 0.2)
    .from(name.chars, { yPercent: 115, duration: 1.0, stagger: 0.035 }, 0.4)
    .to('#subtitle', { opacity: 1, y: 0, duration: 0.9 }, 1.0)
    .to('#cta-button', { opacity: 1, duration: 0.7, ease: 'none' }, 1.3)
    .to('.contact-logo', { opacity: 1, duration: 0.6, stagger: 0.08, ease: 'none' }, 1.45)
}

/** All scroll-triggered reveals. */
function initSectionReveals() {
  if (reduced()) {
    gsap.set('.section-heading, .rule, #about-text p, .project-panel, #headshot', { opacity: 1, clearProps: 'transform' })
    return
  }

  document.querySelectorAll<HTMLElement>('.section-heading').forEach(h => {
    const split = SplitText.create(h.querySelector('.heading-text')!, { type: 'chars', mask: 'chars' })
    splits.push(split)
    gsap.from(split.chars, {
      yPercent: 115, duration: 0.8, ease: EASE_MASK, stagger: 0.02,
      scrollTrigger: { trigger: h, start: 'top 80%' },
    })
  })

  document.querySelectorAll<HTMLElement>('.rule').forEach(rule => {
    gsap.fromTo(rule, { scaleX: 0 }, {
      scaleX: 1, duration: 1.1, ease: EASE_REVEAL,
      scrollTrigger: { trigger: rule, start: 'top 85%' },
    })
  })

  const about = document.querySelector<HTMLElement>('#about-text')
  if (about) {
    splits.push(SplitText.create(about.querySelectorAll('p'), {
      type: 'lines', mask: 'lines', autoSplit: true,
      onSplit: self => gsap.from(self.lines, {
        yPercent: 100, opacity: 0, duration: 0.9, ease: EASE_REVEAL, stagger: 0.06,
        scrollTrigger: { trigger: about, start: 'top 75%' },
      }),
    }))
  }

  // opacity-only: #headshot's CSS hover owns transform
  gsap.from('#headshot', {
    opacity: 0, duration: 1.0, ease: EASE_REVEAL,
    scrollTrigger: { trigger: '#aboutme', start: 'top 75%' },
  })

  gsap.from('.project-panel', {
    y: 40, opacity: 0, duration: 0.8, ease: EASE_REVEAL, stagger: 0.12,
    scrollTrigger: { trigger: '#projects', start: 'top 80%' },
  })

  gsap.from('.tech-tag', {
    opacity: 0, y: 8, duration: 0.5, ease: EASE_REVEAL, stagger: 0.05,
    scrollTrigger: { trigger: '#projects', start: 'top 80%' },
  })

  // depth line: 1px mint progress line on the right edge
  gsap.to('#depth-line', {
    scaleY: 1, ease: 'none',
    scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: true },
  })
}
