// src/anim/fishWorker.ts
// Runs the ASCII fish engine on an OffscreenCanvas, off the main thread.
// The main thread pumps a FishState snapshot in; this worker owns the render
// loop. Dedicated workers have no requestAnimationFrame, so we self-drive with
// setTimeout at ~30fps (the fish was already 30fps-capped, and it's an ambient
// background layer — vsync alignment is imperceptible here).

import { createFishEngine, type FishEngine, type FishState } from './fishEngine'

type InitMsg = { type: 'init'; canvas: OffscreenCanvas; w: number; h: number; dpr: number }
type ResizeMsg = { type: 'resize'; w: number; h: number; dpr: number }
type StateMsg = { type: 'state'; state: FishState }
type VisMsg = { type: 'visibility'; hidden: boolean }
type InMsg = InitMsg | ResizeMsg | StateMsg | VisMsg

let engine: FishEngine | null = null
let canvas: OffscreenCanvas | null = null
let dpr = 1
let paused = false
let timer: ReturnType<typeof setTimeout> | undefined
let lastFrame = 0
const FRAME_MS = 1000 / 30

let state: FishState = {
  cursor: { x: -9999, y: -9999, speed: 0, idleMs: 0 },
  scroll: 0, section: 0, reducedMotion: false, scrolling: false, ripples: [],
}

function loop() {
  timer = setTimeout(loop, FRAME_MS)
  if (paused || !engine) return
  const now = performance.now()
  const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0.016
  lastFrame = now
  engine.frame(now, dt, state)
}

function start() {
  if (timer) return
  lastFrame = 0
  timer = setTimeout(loop, FRAME_MS)
}
function stop() {
  if (timer) { clearTimeout(timer); timer = undefined }
}

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data
  switch (msg.type) {
    case 'init': {
      canvas = msg.canvas
      dpr = msg.dpr
      canvas.width = Math.round(msg.w * dpr)
      canvas.height = Math.round(msg.h * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      engine = createFishEngine(
        ctx,
        (pw, ph) => new OffscreenCanvas(pw, ph).getContext('2d')!,
      )
      engine.resize(msg.w, msg.h, dpr)
      start()
      break
    }
    case 'resize': {
      if (!canvas || !engine) return
      dpr = msg.dpr
      canvas.width = Math.round(msg.w * dpr)
      canvas.height = Math.round(msg.h * dpr)
      engine.resize(msg.w, msg.h, dpr)
      break
    }
    case 'state':
      state = msg.state
      break
    case 'visibility':
      paused = msg.hidden
      if (msg.hidden) stop()
      else start()
      break
  }
}
