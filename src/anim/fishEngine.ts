// src/anim/fishEngine.ts
// The ASCII betta fish — geometry, physics, software rasterizer, and canvas draw.
// Extracted from ASCIIKoiPond so it can run inside a Web Worker on an
// OffscreenCanvas, off the main thread. It reads a plain state snapshot
// (posted from the main thread) instead of the live `pond` singleton, so it has
// no DOM/window dependencies. The same engine also powers the main-thread
// fallback when OffscreenCanvas is unavailable.

// ═══════════════════════════════════════════════════════════════
//  SHARED STATE SNAPSHOT (posted by the main thread each pump tick)
// ═══════════════════════════════════════════════════════════════
export interface FishRipple { x: number; y: number; birth: number }
export interface FishState {
  cursor: { x: number; y: number; speed: number; idleMs: number }
  scroll: number
  section: number
  reducedMotion: boolean
  scrolling: boolean
  ripples: FishRipple[]
}

// Any 2D context — main-thread CanvasRenderingContext2D or worker
// OffscreenCanvasRenderingContext2D share the drawing API we use.
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

// ═══════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════
const FONT_SIZE = 9
const CELL_W = 8
const CELL_H = 11
const FONT = `${FONT_SIZE}px 'Roboto Mono', monospace`
const ACCENT = { r: 100, g: 255, b: 218 }
const FISH_ALPHA = 0.38
const WATER_ALPHA = 0.025
const WATER_FILL = 0.4

const SHADE_CHARS = '@#W*+~:;,.'
function shadeChar(intensity: number): string {
  const i = Math.max(0, Math.min(SHADE_CHARS.length - 1,
    Math.floor((1 - intensity) * SHADE_CHARS.length)))
  return SHADE_CHARS[i]
}

// ═══════════════════════════════════════════════════════════════
//  VECTOR MATH
// ═══════════════════════════════════════════════════════════════
type V3 = [number, number, number]
const v3add = (a: V3, b: V3): V3 => [a[0]+b[0], a[1]+b[1], a[2]+b[2]]
const v3sub = (a: V3, b: V3): V3 => [a[0]-b[0], a[1]-b[1], a[2]-b[2]]
const v3scale = (a: V3, s: number): V3 => [a[0]*s, a[1]*s, a[2]*s]
const v3dot = (a: V3, b: V3): number => a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
const v3cross = (a: V3, b: V3): V3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
const v3len = (a: V3): number => Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2])
const v3norm = (a: V3): V3 => { const l = v3len(a) || 1; return [a[0]/l, a[1]/l, a[2]/l] }

function rotX(v: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a)
  return [v[0], v[1]*c - v[2]*s, v[1]*s + v[2]*c]
}
function rotY(v: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a)
  return [v[0]*c + v[2]*s, v[1], -v[0]*s + v[2]*c]
}
function rotZ(v: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a)
  return [v[0]*c - v[1]*s, v[0]*s + v[1]*c, v[2]]
}

// ═══════════════════════════════════════════════════════════════
//  3D BETTA FISH MODEL
// ═══════════════════════════════════════════════════════════════
function bodyRadius(t: number): [number, number] {
  let profile: number
  if (t < 0.3) {
    profile = Math.sin((t / 0.3) * Math.PI / 2)
  } else if (t < 0.55) {
    profile = 1
  } else {
    const tt = (t - 0.55) / 0.45
    profile = 1 - tt * tt * 0.85
  }
  const ry = profile * 0.42
  const rz = profile * 0.18
  return [ry, rz]
}

function buildBodyMesh(segments: number, rings: number): [V3, V3][] {
  const verts: [V3, V3][] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const x = 1.0 - t * 2.0
    const [ry, rz] = bodyRadius(t)
    for (let j = 0; j <= rings; j++) {
      const a = (j / rings) * Math.PI * 2
      const ny = Math.cos(a), nz = Math.sin(a)
      const bellyDrop = Math.sin(t * Math.PI) * -0.04
      const pos: V3 = [x, ny * ry + bellyDrop, nz * rz]
      const norm: V3 = v3norm([0, ny * rz, nz * ry])
      verts.push([pos, norm])
    }
  }
  return verts
}

function triangulateBody(_verts: [V3, V3][], segments: number, rings: number): [number, number, number][] {
  const tris: [number, number, number][] = []
  const stride = rings + 1
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < rings; j++) {
      const a = i * stride + j
      const b = a + stride
      const c = a + 1
      const d = b + 1
      tris.push([a, b, c])
      tris.push([c, b, d])
    }
  }
  return tris
}

interface FinDef {
  spineStart: V3
  spineDir: V3
  length: number
  width: number
  widthDir: V3
  segments: number
  widthSegs: number
  waveAmp: number
  waveFreq: number
  waveSpeed: number
  trailFactor: number
  opacity: number
  idleFan?: number
}

const FINS: FinDef[] = [
  { spineStart: [-0.35, 0.2, 0], spineDir: [-0.4, 0.7, 0], length: 0.8,
    width: 0.45, widthDir: [-1, 0.2, 0], segments: 20, widthSegs: 12,
    waveAmp: 0.08, waveFreq: 2.0, waveSpeed: 2.0, trailFactor: 0.45, opacity: 0.75 },

  ...[0, 1, 2, 3, 4, 5, 6].map((i): FinDef => {
    const angle = (i / 6 - 0.5) * Math.PI
    const dirY = Math.sin(angle)
    const dirX = -Math.cos(angle) * 0.6 - 0.4
    return {
      spineStart: [-0.65, dirY * 0.06, 0],
      spineDir: [dirX, dirY, 0],
      length: 1.2,
      width: 0.4,
      widthDir: [dirY * 0.3, -dirX * 0.3 + 0.5, 0.15],
      segments: 22, widthSegs: 12,
      waveAmp: 0.15, waveFreq: 1.3, waveSpeed: 1.3,
      trailFactor: 0.7, opacity: 0.72,
    }
  }),

  ...[0, 1, 2, 3, 4].map((i): FinDef => {
    const angle = (i / 4 - 0.5) * 0.9
    const dirY = -0.85 + Math.abs(angle) * 0.3
    const dirX = -0.5 - i * 0.12
    return {
      spineStart: [-0.1 - i * 0.1, -0.2, 0],
      spineDir: [dirX, dirY, 0],
      length: 1.2 - i * 0.05,
      width: 0.5,
      widthDir: [-1, 0.1 + angle * 0.3, 0],
      segments: 22, widthSegs: 12,
      waveAmp: 0.1, waveFreq: 1.8, waveSpeed: 1.8,
      trailFactor: 0.55, opacity: 0.68,
    }
  }),

  ...[0, 1, 2].map((i): FinDef => {
    const spread = (i / 2 - 0.5) * 0.6
    return {
      spineStart: [0.25, -0.1, 0.08],
      spineDir: [0.1 + spread * 0.15, -0.7, 0.4],
      length: 0.8, width: 0.3,
      widthDir: [0, -1, 0.1 + spread * 0.2],
      segments: 22, widthSegs: 12,
      waveAmp: 0.06, waveFreq: 3.0, waveSpeed: 3.0, trailFactor: 0.3, opacity: 0.6,
      idleFan: 2.5,
    }
  }),
  ...[0, 1, 2].map((i): FinDef => {
    const spread = (i / 2 - 0.5) * 0.6
    return {
      spineStart: [0.25, -0.1, -0.08],
      spineDir: [0.1 + spread * 0.15, -0.7, -0.4],
      length: 0.8, width: 0.3,
      widthDir: [0, -1, -0.1 - spread * 0.2],
      segments: 22, widthSegs: 12,
      waveAmp: 0.06, waveFreq: 3.0, waveSpeed: 3.0, trailFactor: 0.3, opacity: 0.6,
      idleFan: 2.5,
    }
  }),

  { spineStart: [0.15, -0.05, 0.03], spineDir: [-0.15, -1, 0.4], length: 0.7,
    width: 0.1, widthDir: [-1, 0, 0.2], segments: 18, widthSegs: 8,
    waveAmp: 0.05, waveFreq: 2.5, waveSpeed: 2.5, trailFactor: 0.35, opacity: 0.5 },
  { spineStart: [0.15, -0.05, -0.03], spineDir: [-0.15, -1, -0.4], length: 0.7,
    width: 0.1, widthDir: [-1, 0, -0.2], segments: 18, widthSegs: 8,
    waveAmp: 0.05, waveFreq: 2.5, waveSpeed: 2.5, trailFactor: 0.35, opacity: 0.5 },
]

// This betta lives at z-index -1 under ~0.38 alpha. Full 22×12 tessellation per
// fin (21 fins ≈ 11k triangles/frame) is invisible detail at that scale but the
// dominant cost. Decimate the mesh ~3x; the silhouette is unchanged.
for (const f of FINS) {
  f.segments = Math.max(8, Math.round(f.segments * 0.6))
  f.widthSegs = Math.max(5, Math.round(f.widthSegs * 0.6))
}

function bodyDeformation(bodyX: number, bodyWave: number, turnBend: number): V3 {
  const t = (1 - bodyX) / 2
  const amp = Math.min(t * 1.8, 1) * 0.28
  const lateralWave = Math.sin(t * 4 - bodyWave) * amp
  const bend = turnBend * Math.sin(t * Math.PI) * 0.4
  return [0, 0, lateralWave + bend]
}

function buildFinVerts(fin: FinDef, time: number, localSpeed: number, turnRate: number, bodyWave: number, turnBend: number): V3[][] {
  const dir = v3norm(fin.spineDir)
  const wdir = v3norm(fin.widthDir)
  const grid: V3[][] = []

  for (let i = 0; i <= fin.segments; i++) {
    const t = i / fin.segments

    let segDir = dir
    if (fin.idleFan) {
      const fanWave = Math.sin(time * fin.idleFan * 2 - t * 3) * 0.35 * (0.3 + t * 0.7)
      segDir = v3norm(rotY(dir, fanWave))
    }

    const rawSpinePos = v3add(fin.spineStart, v3scale(segDir, t * fin.length))

    const trail = t * t * fin.trailFactor * localSpeed * 0.002
    const turnDrag = t * t * turnRate * 0.3
    const trailed: V3 = [rawSpinePos[0] - trail, rawSpinePos[1], rawSpinePos[2] + turnDrag]

    const wavePhase = time * 2.2 - t * 4

    const row: V3[] = []
    for (let j = 0; j <= fin.widthSegs; j++) {
      const wt = j / fin.widthSegs
      const edgeDist = Math.abs(wt - 0.5) * 2
      const tipTaper = t > 0.7 ? 1 - ((t - 0.7) / 0.3) ** 2 : 1
      const w = (wt - 0.5) * 2 * fin.width * (1 + t * 0.15) * tipTaper

      const rufflePerp = v3norm(v3cross(dir, wdir))
      const ruffle = Math.sin(wt * 8 + t * 6 + bodyWave * 0.5) * 0.04 * edgeDist * edgeDist * (0.3 + t)
      const ruffleOffset = v3scale(rufflePerp, ruffle)

      const curlY = Math.sin(wavePhase + wt * 2) * 0.06 * t * (0.4 + edgeDist * 0.6)
      const twist = Math.sin(wavePhase * 0.8 + 1.5) * 0.08 * t * t * (wt - 0.5) * 2
      const recoilX = Math.cos(wavePhase + 0.5) * 0.04 * t * t * edgeDist

      const vertPos = v3add(v3add(trailed, v3scale(wdir, w)), ruffleOffset)
      vertPos[1] += curlY + twist
      vertPos[0] += recoilX

      const inheritFactor = 1 + t * 0.8
      const deform = v3scale(bodyDeformation(vertPos[0], bodyWave, turnBend), inheritFactor)
      row.push(v3add(vertPos, deform))
    }
    grid.push(row)
  }
  return grid
}

// ═══════════════════════════════════════════════════════════════
//  RASTERIZER
// ═══════════════════════════════════════════════════════════════
interface RasterCell { char: string; depth: number; alpha: number }

function projectVertex(v: V3, fishYaw: number, fishPitch: number,
  fishRoll: number, screenScale: number, cx: number, cy: number): [number, number, number] {
  let p = rotZ(v, fishRoll)
  p = rotX(p, fishPitch)
  p = rotY(p, fishYaw)
  const sx = cx + p[0] * screenScale
  const sy = cy - p[1] * screenScale
  return [sx, sy, p[2]]
}

function rasterizeTriangle(
  v0: [number, number, number], v1: [number, number, number], v2: [number, number, number],
  intensity: number, alpha: number,
  buf: RasterCell[][], cols: number, rows: number,
) {
  const minX = Math.max(0, Math.floor(Math.min(v0[0], v1[0], v2[0]) / CELL_W))
  const maxX = Math.min(cols - 1, Math.ceil(Math.max(v0[0], v1[0], v2[0]) / CELL_W))
  const minY = Math.max(0, Math.floor(Math.min(v0[1], v1[1], v2[1]) / CELL_H))
  const maxY = Math.min(rows - 1, Math.ceil(Math.max(v0[1], v1[1], v2[1]) / CELL_H))

  for (let r = minY; r <= maxY; r++) {
    for (let c = minX; c <= maxX; c++) {
      const px = c * CELL_W + CELL_W / 2
      const py = r * CELL_H + CELL_H / 2

      const d0x = v1[0] - v0[0], d0y = v1[1] - v0[1]
      const d1x = v2[0] - v0[0], d1y = v2[1] - v0[1]
      const d2x = px - v0[0], d2y = py - v0[1]
      const den = d0x * d1y - d1x * d0y
      if (Math.abs(den) < 0.001) continue
      const u = (d2x * d1y - d1x * d2y) / den
      const v = (d0x * d2y - d2x * d0y) / den
      if (u < 0 || v < 0 || u + v > 1) continue

      const depth = v0[2] * (1 - u - v) + v1[2] * u + v2[2] * v

      const cell = buf[r][c]
      if (cell && depth > cell.depth) continue

      buf[r][c] = { char: shadeChar(intensity), depth, alpha }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  FISH + BUBBLE STATE
// ═══════════════════════════════════════════════════════════════
interface Fish {
  x: number; y: number
  vx: number; vy: number
  yaw: number
  pitch: number
  roll: number
  targetYaw: number
  wanderAngle: number
  seed: number
  bodyWave: number
  depth: number
}

const MAX_DEPTH = 1
const DEPTH_SCALE_MIN = 0.3
const DEPTH_ALPHA_MIN = 0.3

const RIPPLE_LIFE = 4, RIPPLE_SPEED = 60, RIPPLE_RINGS = 3

interface Bubble {
  x: number; y: number
  vx: number; vy: number
  birth: number; life: number
  seed: number
}
const BUBBLE_MAX = 36
const BUBBLE_ALPHA = 0.32

// ═══════════════════════════════════════════════════════════════
//  ENGINE
// ═══════════════════════════════════════════════════════════════
export interface FishEngine {
  resize(w: number, h: number, dpr: number): void
  /** Advance physics by dt (seconds) and draw one frame. */
  frame(now: number, dt: number, state: FishState): void
}

/**
 * @param ctx           the visible canvas 2D context (main or offscreen)
 * @param makeLayer     factory for an offscreen 2D context of a given pixel size
 *                      (the ambient "01" water field lives here, redrawn rarely)
 */
export function createFishEngine(
  ctx: Ctx2D,
  makeLayer: (pw: number, ph: number) => Ctx2D,
): FishEngine {
  let w = 0, h = 0, cols = 0, rows = 0
  let wctx: Ctx2D | null = null
  let waterGrid: (string | null)[][] = []
  let swapTimes: number[][] = []
  let fishBuf: RasterCell[][] = []
  const screenScale = 180

  const BODY_SEGS = 16, BODY_RINGS = 12
  const bodyTemplate = buildBodyMesh(BODY_SEGS, BODY_RINGS)
  const bodyIndices = triangulateBody(bodyTemplate, BODY_SEGS, BODY_RINGS)

  const fish: Fish = {
    x: 0, y: 0, vx: 0, vy: 0,
    yaw: Math.random() * Math.PI * 2, pitch: 0, roll: 0,
    targetYaw: Math.random() * Math.PI * 2,
    wanderAngle: 0, seed: Math.random() * 1000,
    bodyWave: 10, depth: 0.1,
  }
  let fishInit = false

  const bubbles: Bubble[] = []
  let lastBubbleAt = 0

  const WATER_REDRAW_MS = 150
  let lastWaterDraw = -Infinity

  function resize(nw: number, nh: number, dpr: number) {
    w = nw; h = nh
    cols = Math.ceil(w / CELL_W) + 1
    rows = Math.ceil(h / CELL_H) + 1
    fishBuf = Array.from({ length: rows }, () => Array(cols).fill(null))
    const now = performance.now()
    waterGrid = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () =>
        Math.random() < WATER_FILL ? '01'[Math.floor(Math.random() * 2)] : null))
    swapTimes = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => now + Math.random() * 5000))
    wctx = makeLayer(w * dpr, h * dpr)
    wctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    lastWaterDraw = -Infinity
    if (!fishInit) {
      fish.x = Math.random() * w * 0.6 + w * 0.2
      fish.y = Math.random() * h * 0.6 + h * 0.2
      fishInit = true
    }
    redrawWater(now)
  }

  function updateFish(dt: number, now: number, s: FishState) {
    const t = now / 1000
    const f = fish

    f.wanderAngle += (
      Math.sin(t * 0.11 + f.seed) * 0.3 +
      Math.sin(t * 0.05 + f.seed * 3) * 0.2
    ) * dt

    f.targetYaw += Math.sin(f.wanderAngle) * 0.15 * dt

    let yawDiff = f.targetYaw - f.yaw
    while (yawDiff > Math.PI) yawDiff -= 2 * Math.PI
    while (yawDiff < -Math.PI) yawDiff += 2 * Math.PI
    f.yaw += yawDiff * (1 - Math.exp(-4 * dt))

    const idleCycle = Math.sin(t * 0.12 + f.seed * 2) + Math.sin(t * 0.07 + f.seed * 4) * 0.5
    const energy = Math.max(0, Math.min(1, (0.8 - idleCycle) / 1.0))
    const thrust = energy * (100 + Math.sin(t * 0.15 + f.seed) * 25) * (s.reducedMotion ? 0.3 : 1)

    f.vx += Math.cos(f.yaw) * thrust * dt * 2
    f.vy += Math.sin(f.yaw) * thrust * dt * 0.5

    const drag = 2.5 + (1 - energy) * 2.0
    f.vx *= 1 - drag * dt
    f.vy *= 1 - drag * dt

    const mx = s.cursor.x, my = s.cursor.y
    const mdx = f.x - mx, mdy = f.y - my, mD = Math.sqrt(mdx * mdx + mdy * mdy)
    if (!s.reducedMotion && mx > -9000 && mD > 1) {
      const startle = Math.min(s.cursor.speed / 1.5, 1)
      if (mD < 300) {
        const force = (1 - mD / 300) * (40 + 280 * startle) * dt
        f.vx += (mdx / mD) * force; f.vy += (mdy / mD) * force
      }
      if (s.cursor.idleMs > 2000 && mD > 150 && mD < 600) {
        const pull = 30 * dt
        f.vx -= (mdx / mD) * pull; f.vy -= (mdy / mD) * pull
      }
    }

    if (!s.reducedMotion) for (const rip of s.ripples) {
      const age = (now - rip.birth) / 1000
      const rx = f.x - rip.x, ry = f.y - rip.y, rD = Math.sqrt(rx * rx + ry * ry)
      if (rD < 1) continue
      if (age < 0.6 && rD < 300) {
        const force = (1 - age / 0.6) * (1 - rD / 300) * 150 * dt
        f.vx += (rx / rD) * force; f.vy += (ry / rD) * force
      } else if (age >= 0.6 && age < 4 && rD > 120) {
        const force = (1 - age / 4) * 60 * dt
        f.vx -= (rx / rD) * force; f.vy -= (ry / rD) * force
      }
    }

    const SECTION_ANCHORS = [
      { x: 0.72, y: 0.55 },
      { x: 0.16, y: 0.78 },
      { x: 0.78, y: 0.30 },
    ]
    if (!s.reducedMotion) {
      const an = SECTION_ANCHORS[s.section] ?? SECTION_ANCHORS[0]
      const adx = an.x * w - f.x, ady = an.y * h - f.y
      const aD = Math.sqrt(adx * adx + ady * ady)
      if (aD > 200) {
        const force = Math.min((aD - 200) / 400, 1) * 50 * dt
        f.vx += (adx / aD) * force; f.vy += (ady / aD) * force
      }
    }

    const m = 300
    if (f.x < m) f.vx += ((m - f.x) / m) ** 2 * 200 * dt
    if (f.x > w - m) f.vx -= (((f.x - w + m) / m) ** 2) * 200 * dt
    if (f.y < m) f.vy += ((m - f.y) / m) ** 2 * 200 * dt
    if (f.y > h - m) f.vy -= (((f.y - h + m) / m) ** 2) * 200 * dt

    const curSpd = Math.sqrt(f.vx * f.vx + f.vy * f.vy)
    if (curSpd > 5) {
      const velAngle = Math.atan2(f.vy, f.vx)
      let diff = velAngle - f.targetYaw
      while (diff > Math.PI) diff -= 2 * Math.PI
      while (diff < -Math.PI) diff += 2 * Math.PI
      f.targetYaw += diff * (1 - Math.exp(-4 * dt))
    }

    const tgtPitch = curSpd > 3 ? Math.atan2(f.vy, Math.abs(f.vx)) * 0.3 : 0
    f.pitch += (tgtPitch - f.pitch) * (1 - Math.exp(-2 * dt))

    const tgtRoll = -yawDiff * 1.5
    f.roll += (Math.max(-0.4, Math.min(0.4, tgtRoll)) - f.roll) * (1 - Math.exp(-4 * dt))

    const zFacing = -Math.sin(f.yaw)
    f.depth += zFacing * curSpd * 0.003 * dt
    if (f.depth < 0) f.depth = 0
    if (f.depth > MAX_DEPTH) f.depth = MAX_DEPTH

    f.x += f.vx * dt; f.y += f.vy * dt

    const hm = screenScale * 3
    if (f.x < -hm) f.x = w + hm; if (f.x > w + hm) f.x = -hm
    if (f.y < -hm) f.y = h + hm; if (f.y > h + hm) f.y = -hm

    const yawRate = Math.abs(yawDiff)
    f.bodyWave += dt * (2 + curSpd * 0.12 + yawRate * 15)
  }

  function renderFish(now: number, buf: RasterCell[][]) {
    const time = now / 1000
    const f = fish
    const localSpeed = Math.sqrt(f.vx * f.vx + f.vy * f.vy)
    let yawDiff = f.targetYaw - f.yaw
    while (yawDiff > Math.PI) yawDiff -= 2 * Math.PI
    while (yawDiff < -Math.PI) yawDiff += 2 * Math.PI

    const depthFactor = 1 - f.depth * (1 - DEPTH_SCALE_MIN)
    const depthAlpha = 1 - f.depth * (1 - DEPTH_ALPHA_MIN)
    const curScale = screenScale * depthFactor

    const lightDir: V3 = v3norm([0.4, 0.6, -0.8])

    const deformedVerts: [V3, V3][] = bodyTemplate.map(([pos, norm]) => {
      const deform = bodyDeformation(pos[0], f.bodyWave, yawDiff)
      const dpos: V3 = [pos[0], pos[1] + deform[1], pos[2] + deform[2]]
      return [dpos, norm]
    })

    const projVerts = deformedVerts.map(([pos]) =>
      projectVertex(pos, f.yaw, f.pitch, f.roll, curScale, f.x, f.y))

    for (const [a, b, c] of bodyIndices) {
      const va = projVerts[a], vb = projVerts[b], vc = projVerts[c]

      const cross2d = (va[0] - vc[0]) * (vb[1] - vc[1]) - (va[1] - vc[1]) * (vb[0] - vc[0])
      if (cross2d < 0) continue

      const wA = deformedVerts[a][0], wB = deformedVerts[b][0], wC = deformedVerts[c][0]
      let worldNorm = v3norm(v3cross(v3sub(wB, wA), v3sub(wC, wA)))
      worldNorm = rotZ(worldNorm, f.roll)
      worldNorm = rotX(worldNorm, f.pitch)
      worldNorm = rotY(worldNorm, f.yaw)

      const intensity = Math.max(0, v3dot(worldNorm, lightDir))
      rasterizeTriangle(va, vb, vc, intensity, FISH_ALPHA * depthAlpha, buf, cols, rows)
    }

    const eyeL: V3 = [0.65, 0.08, 0.16]
    const eyeR: V3 = [0.65, 0.08, -0.16]
    for (const eyePos of [eyeL, eyeR]) {
      const deform = bodyDeformation(eyePos[0], f.bodyWave, yawDiff)
      const deformedEye: V3 = [eyePos[0] + deform[0], eyePos[1] + deform[1], eyePos[2] + deform[2]]
      const proj = projectVertex(deformedEye, f.yaw, f.pitch, f.roll, curScale, f.x, f.y)
      if (proj[2] > 0) continue
      const ec = Math.round(proj[0] / CELL_W)
      const er = Math.round(proj[1] / CELL_H)
      if (ec >= 0 && ec < cols && er >= 0 && er < rows) {
        const existing = buf[er][ec]
        if (!existing || proj[2] <= existing.depth) {
          buf[er][ec] = { char: '@', depth: proj[2], alpha: FISH_ALPHA * 1.8 * depthAlpha }
        }
      }
    }

    for (const fin of FINS) {
      const grid = buildFinVerts(fin, time, localSpeed, yawDiff, f.bodyWave, yawDiff)

      for (let i = 0; i < grid.length - 1; i++) {
        for (let j = 0; j < grid[i].length - 1; j++) {
          const p00 = grid[i][j], p10 = grid[i + 1][j]
          const p01 = grid[i][j + 1], p11 = grid[i + 1][j + 1]

          for (const [tA, tB, tC] of [[p00, p10, p01], [p01, p10, p11]]) {
            let faceNorm = v3norm(v3cross(v3sub(tB, tA), v3sub(tC, tA)))
            faceNorm = rotZ(faceNorm, f.roll)
            faceNorm = rotX(faceNorm, f.pitch)
            faceNorm = rotY(faceNorm, f.yaw)

            const intensity = Math.abs(v3dot(faceNorm, lightDir))

            const pa = projectVertex(tA, f.yaw, f.pitch, f.roll, curScale, f.x, f.y)
            const pb = projectVertex(tB, f.yaw, f.pitch, f.roll, curScale, f.x, f.y)
            const pc = projectVertex(tC, f.yaw, f.pitch, f.roll, curScale, f.x, f.y)

            const avgT = (i + 0.5) / fin.segments
            const finAlpha = fin.opacity * FISH_ALPHA * depthAlpha * (1 - avgT * 0.5)

            rasterizeTriangle(pa, pb, pc, intensity * 0.8 + 0.1, finAlpha, buf, cols, rows)
          }
        }
      }
    }
  }

  function getRippleGlow(px: number, py: number, now: number, s: FishState): number {
    let glow = 0
    for (const rip of s.ripples) {
      const age = (now - rip.birth) / 1000; if (age > RIPPLE_LIFE) continue
      const dist = Math.sqrt((px - rip.x) ** 2 + (py - rip.y) ** 2)
      const fade = Math.max(0, 1 - age / RIPPLE_LIFE) ** 2
      for (let ring = 0; ring < RIPPLE_RINGS; ring++) {
        const rAge = age - ring * 0.3; if (rAge < 0) continue
        const radius = rAge * RIPPLE_SPEED, ringW = 15 + rAge * 12
        const fromRing = Math.abs(dist - radius)
        if (fromRing < ringW) glow = Math.max(glow, fade * (1 - ring * 0.25) * (1 - fromRing / ringW) * 0.22)
      }
    }
    return glow < 0.05 ? 0 : glow
  }

  function redrawWater(now: number) {
    if (!wctx) return
    lastWaterDraw = now
    wctx.clearRect(0, 0, w, h)
    wctx.font = FONT
    wctx.textBaseline = 'middle'
    wctx.fillStyle = `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${WATER_ALPHA})`
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (now > swapTimes[r][c]) {
          waterGrid[r][c] = Math.random() < WATER_FILL ? '01'[Math.floor(Math.random() * 2)] : null
          swapTimes[r][c] = now + 2000 + Math.random() * 5000
        }
        const ch = waterGrid[r][c]
        if (ch) wctx.fillText(ch, c * CELL_W, r * CELL_H)
      }
    }
  }

  function render(now: number, s: FishState) {
    ctx.clearRect(0, 0, w, h)
    ctx.font = FONT; ctx.textBaseline = 'middle'

    if (!s.scrolling && now - lastWaterDraw > WATER_REDRAW_MS) redrawWater(now)
    if (wctx) ctx.drawImage((wctx.canvas as unknown as CanvasImageSource), 0, 0, w, h)

    const mx = s.cursor.x, my = s.cursor.y

    for (let r = 0; r < rows; r++) fishBuf[r].fill(null as unknown as RasterCell)
    renderFish(now, fishBuf)

    const lit: [number, number, string, number][] = []

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = fishBuf[r][c]
        if (cell) lit.push([c * CELL_W, r * CELL_H, cell.char, Math.min(0.7, cell.alpha)])
      }
    }

    if (mx > -9000) {
      const GLOW = 75
      const c0 = Math.max(0, Math.floor((mx - GLOW) / CELL_W)), c1 = Math.min(cols - 1, Math.ceil((mx + GLOW) / CELL_W))
      const r0 = Math.max(0, Math.floor((my - GLOW) / CELL_H)), r1 = Math.min(rows - 1, Math.ceil((my + GLOW) / CELL_H))
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (fishBuf[r][c]) continue
          const px = c * CELL_W, py = r * CELL_H
          const gDist = Math.sqrt((px - mx) ** 2 + (py - my) ** 2)
          if (gDist >= GLOW) continue
          const gc = waterGrid[r][c] ?? '01'[(r * 7 + c * 13) % 2]
          lit.push([px, py, gc, WATER_ALPHA + (1 - gDist / GLOW) * 0.06])
        }
      }
    }

    for (const rip of s.ripples) {
      const age = (now - rip.birth) / 1000
      if (age > RIPPLE_LIFE) continue
      const maxR = age * RIPPLE_SPEED + 15 + age * 12 + CELL_W
      const c0 = Math.max(0, Math.floor((rip.x - maxR) / CELL_W)), c1 = Math.min(cols - 1, Math.ceil((rip.x + maxR) / CELL_W))
      const r0 = Math.max(0, Math.floor((rip.y - maxR) / CELL_H)), r1 = Math.min(rows - 1, Math.ceil((rip.y + maxR) / CELL_H))
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (fishBuf[r][c]) continue
          const px = c * CELL_W, py = r * CELL_H
          const ripple = getRippleGlow(px, py, now, s)
          if (ripple > 0.001) {
            const gc = waterGrid[r][c] ?? '01'[(r * 7 + c * 13) % 2]
            lit.push([px, py, gc, WATER_ALPHA + ripple])
          }
        }
      }
    }

    for (const [x, y, ch, a] of lit) {
      ctx.fillStyle = `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${a})`
      ctx.fillText(ch, x, y)
    }

    for (const b of bubbles) {
      const t = (now - b.birth) / b.life
      const ch = t < 0.35 ? '·' : t < 0.75 ? '°' : 'o'
      const alpha = BUBBLE_ALPHA * (t < 0.8 ? 0.5 + t : (1 - t) / 0.2)
      ctx.fillStyle = `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${alpha})`
      ctx.fillText(ch, b.x, b.y)
    }
  }

  function updateBubbles(dt: number, now: number, s: FishState) {
    const speed = s.cursor.speed
    if (!s.reducedMotion && s.cursor.x > -9000 && speed > 0.25 &&
        bubbles.length < BUBBLE_MAX &&
        now - lastBubbleAt > 120 - Math.min(speed * 30, 90)) {
      lastBubbleAt = now
      bubbles.push({
        x: s.cursor.x + (Math.random() - 0.5) * 16,
        y: s.cursor.y + (Math.random() - 0.5) * 16,
        vx: (Math.random() - 0.5) * 12,
        vy: -20 - Math.random() * 24,
        birth: now,
        life: 1100 + Math.random() * 900,
        seed: Math.random() * 10,
      })
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]
      if (now - b.birth > b.life) { bubbles.splice(i, 1); continue }
      b.vy -= 16 * dt
      b.x += (b.vx + Math.sin(now / 350 + b.seed) * 9) * dt
      b.y += b.vy * dt
    }
  }

  function frame(now: number, dt: number, s: FishState) {
    if (!w || !rows) return
    updateFish(dt, now, s)
    updateBubbles(dt, now, s)
    render(now, s)
  }

  return { resize, frame }
}
