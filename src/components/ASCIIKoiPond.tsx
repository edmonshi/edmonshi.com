import { useRef, useEffect } from 'react'
import { pond, tickPond } from '../anim/pond'
import { createFishEngine, type FishEngine, type FishState } from '../anim/fishEngine'

// The betta's software rasterizer + canvas draw is ~85% of main-thread JS during
// scroll (measured). Rendering it on the main thread starves the scroll frame
// budget on high-refresh displays. So the fish now runs in a Web Worker on an
// OffscreenCanvas: all of its cost lives off the main thread. This component is
// just the host — it transfers the canvas to the worker and pumps a lightweight
// `pond` snapshot each frame. Falls back to inline main-thread rendering only if
// OffscreenCanvas/Worker is unavailable.

// Cap at 1 device-pixel-per-CSS-pixel: this faint ASCII layer doesn't need hi-DPI.
const DPR_CAP = 1

function snapshot(): FishState {
  return {
    cursor: { x: pond.cursor.x, y: pond.cursor.y, speed: pond.cursor.speed, idleMs: pond.cursor.idleMs },
    scroll: pond.scroll,
    section: pond.section,
    reducedMotion: pond.reducedMotion,
    scrolling: pond.scrolling,
    ripples: pond.ripples.map(r => ({ x: r.x, y: r.y, birth: r.birth })),
  }
}

export default function ASCIIKoiPond() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // transferControlToOffscreen() is permanent and one-shot per <canvas>. These
  // refs survive React StrictMode's dev remount so we transfer + spawn the
  // worker exactly once, then just re-attach the pump on any re-run.
  const workerRef = useRef<Worker | null>(null)
  const setupDoneRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current!
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)

    const canOffscreen =
      typeof Worker !== 'undefined' &&
      typeof (canvas as HTMLCanvasElement).transferControlToOffscreen === 'function' &&
      typeof OffscreenCanvas !== 'undefined'

    // ── WORKER PATH: fish renders entirely off the main thread ──
    if (canOffscreen && (!setupDoneRef.current || workerRef.current)) {
      try {
        if (!setupDoneRef.current) {
          setupDoneRef.current = true
          const worker = new Worker(new URL('../anim/fishWorker.ts', import.meta.url), { type: 'module' })
          workerRef.current = worker
          const offscreen = canvas.transferControlToOffscreen()
          worker.postMessage(
            { type: 'init', canvas: offscreen, w: window.innerWidth, h: window.innerHeight, dpr },
            [offscreen],
          )
        }
        const worker = workerRef.current!

        // Main-thread pump: age the pond and ship a snapshot to the worker each
        // frame. This is the ONLY per-frame main-thread cost now — a few math
        // ops + one small postMessage, microseconds vs. the render it replaces.
        let raf = 0
        let last = 0
        const pump = (now: number) => {
          raf = requestAnimationFrame(pump)
          const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016
          last = now
          tickPond(dt * 1000)
          worker.postMessage({ type: 'state', state: snapshot() })
        }
        raf = requestAnimationFrame(pump)
        worker.postMessage({ type: 'visibility', hidden: false })

        const onResize = () => {
          const d = Math.min(window.devicePixelRatio || 1, DPR_CAP)
          worker.postMessage({ type: 'resize', w: window.innerWidth, h: window.innerHeight, dpr: d })
        }
        const onVisibility = () => {
          if (document.hidden) { cancelAnimationFrame(raf); raf = 0 }
          else if (!raf) { last = 0; raf = requestAnimationFrame(pump) }
          worker.postMessage({ type: 'visibility', hidden: document.hidden })
        }

        window.addEventListener('resize', onResize)
        document.addEventListener('visibilitychange', onVisibility)
        // Note: the worker is intentionally NOT terminated here. The canvas is
        // already transferred to it and can never be transferred again, so the
        // worker must outlive StrictMode's fake unmount. This component lives
        // for the whole page, so there is no real unmount to leak on.
        return () => {
          cancelAnimationFrame(raf)
          window.removeEventListener('resize', onResize)
          document.removeEventListener('visibilitychange', onVisibility)
          worker.postMessage({ type: 'visibility', hidden: true })
        }
      } catch {
        // fall through to the main-thread path below
      }
    }

    // ── FALLBACK PATH: render on the main thread (pre-OffscreenCanvas browsers) ──
    // Never reachable once the canvas has been transferred to the worker.
    if (workerRef.current) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0
    const makeLayer = (pw: number, ph: number) => {
      if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(pw, ph).getContext('2d')!
      const c = document.createElement('canvas'); c.width = pw; c.height = ph
      return c.getContext('2d')!
    }
    let engine: FishEngine | null = null

    const resize = () => {
      const d = Math.min(window.devicePixelRatio || 1, DPR_CAP)
      w = window.innerWidth; h = window.innerHeight
      canvas.width = Math.round(w * d); canvas.height = Math.round(h * d)
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`
      if (!engine) engine = createFishEngine(ctx, makeLayer)
      engine.resize(w, h, d)
    }
    resize()

    const FRAME_MS = 1000 / 30
    let animId = 0, lastFrame = 0
    const loop = (now: number) => {
      animId = requestAnimationFrame(loop)
      if (now - lastFrame < FRAME_MS - 1) return
      const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0.016
      lastFrame = now
      tickPond(dt * 1000)
      engine?.frame(now, dt, snapshot())
    }
    animId = requestAnimationFrame(loop)

    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(animId)
      else { lastFrame = 0; animId = requestAnimationFrame(loop) }
    }
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <canvas ref={canvasRef}
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: -1, pointerEvents: 'none' }} />
  )
}
