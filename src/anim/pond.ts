// src/anim/pond.ts
// Shared "pond" state — written by global listeners, read every frame by the
// WebGL water layer and the ASCII fish. Plain module: no React, no subscribers.

export interface PondRipple { x: number; y: number; birth: number }

export const RIPPLE_LIFE_S = 5

export const pond = {
  cursor: { x: -9999, y: -9999, speed: 0, idleMs: 0 }, // speed in px/ms (smoothed)
  scroll: 0,                 // 0..1 through the whole page
  section: 0,                // 0 home, 1 about, 2 portfolio
  ripples: [] as PondRipple[],
  isTouch: false,
  reducedMotion: false,
  scrolling: false,         // true while the page is actively scrolling
}

let lastX = -9999, lastY = -9999, lastT = 0

/** Attach global listeners. Call once after mount; returns cleanup. */
export function initPond(): () => void {
  // Reset module/singleton state — initPond runs twice under StrictMode dev mounts
  lastX = -9999; lastY = -9999; lastT = 0
  pond.ripples = []
  pond.cursor.speed = 0
  pond.cursor.idleMs = 0

  pond.isTouch = window.matchMedia('(pointer: coarse)').matches
  const rmq = window.matchMedia('(prefers-reduced-motion: reduce)')
  pond.reducedMotion = rmq.matches
  const onRmq = () => { pond.reducedMotion = rmq.matches }
  rmq.addEventListener('change', onRmq)

  const onMove = (e: PointerEvent) => {
    const now = performance.now()
    if (lastT && lastX > -9000) {
      const dt = Math.max(now - lastT, 1)
      const d = Math.hypot(e.clientX - lastX, e.clientY - lastY)
      pond.cursor.speed = pond.cursor.speed * 0.8 + (d / dt) * 0.2
    }
    lastX = e.clientX; lastY = e.clientY; lastT = now
    pond.cursor.x = e.clientX; pond.cursor.y = e.clientY
    pond.cursor.idleMs = 0
  }
  const onLeave = () => { pond.cursor.x = -9999; pond.cursor.y = -9999; pond.cursor.speed = 0 }
  const onDown = (e: PointerEvent) => {
    pond.ripples.push({ x: e.clientX, y: e.clientY, birth: performance.now() })
    if (pond.ripples.length > 8) pond.ripples.shift()
  }
  // Flag active scrolling so the canvas/WebGL layers can throttle themselves and
  // hand the frame budget to the scroll while the page is moving.
  let scrollIdle: ReturnType<typeof setTimeout> | undefined
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    pond.scroll = max > 0 ? Math.min(window.scrollY / max, 1) : 0
    pond.scrolling = true
    clearTimeout(scrollIdle)
    scrollIdle = setTimeout(() => { pond.scrolling = false }, 140)
  }

  const io = new IntersectionObserver(entries => {
    for (const en of entries) {
      if (en.isIntersecting) pond.section = ['home', 'about', 'portfolio'].indexOf(en.target.id)
    }
  }, { threshold: 0.5 })
  for (const id of ['home', 'about', 'portfolio']) {
    const el = document.getElementById(id)
    if (el) io.observe(el)
  }

  window.addEventListener('pointermove', onMove)
  document.documentElement.addEventListener('pointerleave', onLeave)
  window.addEventListener('pointerdown', onDown)
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()

  return () => {
    clearTimeout(scrollIdle)
    rmq.removeEventListener('change', onRmq)
    io.disconnect()
    window.removeEventListener('pointermove', onMove)
    document.documentElement.removeEventListener('pointerleave', onLeave)
    window.removeEventListener('pointerdown', onDown)
    window.removeEventListener('scroll', onScroll)
  }
}

/**
 * Age idle timer, decay speed, expire ripples. The fish loop is the sole
 * driver — if it pauses (hidden tab), aging pauses too; consumers re-derive
 * ripple age from `birth`, so stale entries stay harmless.
 */
export function tickPond(dtMs: number) {
  pond.cursor.idleMs += dtMs
  // ≈ ×0.95 per frame at 60fps, frame-rate independent on 120/165Hz displays
  pond.cursor.speed *= Math.exp(-3 * (dtMs / 1000))
  const now = performance.now()
  if (pond.ripples.length && now - pond.ripples[0].birth > RIPPLE_LIFE_S * 1000) {
    pond.ripples = pond.ripples.filter(r => now - r.birth < RIPPLE_LIFE_S * 1000)
  }
}
