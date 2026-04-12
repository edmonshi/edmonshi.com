import { useRef, useEffect } from 'react'

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

// ASCII shading by surface brightness (dot product of normal and light)
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
//  Body = parametric ellipsoid (x=forward, y=up, z=lateral)
//  Fins = flat deformable quad strips
// ═══════════════════════════════════════════════════════════════
// Betta body cross-section: stocky, deep, laterally compressed
// ry = vertical (tall), rz = lateral (thin)
function bodyRadius(t: number): [number, number] {
  let profile: number
  if (t < 0.3) {
    // Head: blunt, rises quickly
    profile = Math.sin((t / 0.3) * Math.PI / 2)
  } else if (t < 0.55) {
    // Midsection: full, widest here
    profile = 1
  } else {
    // Tail: tapers gradually then sharply to narrow peduncle
    const tt = (t - 0.55) / 0.45
    profile = 1 - tt * tt * 0.85 // quadratic dropoff
  }
  // Belly hangs slightly lower than back
  const ry = profile * 0.42
  // Laterally compressed (thin from front)
  const rz = profile * 0.18
  return [ry, rz]
}

function buildBodyMesh(segments: number, rings: number): [V3, V3][] {
  const verts: [V3, V3][] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const x = 1.0 - t * 2.0 // 1.0 (nose) to -1.0 (tail)
    const [ry, rz] = bodyRadius(t)
    for (let j = 0; j <= rings; j++) {
      const a = (j / rings) * Math.PI * 2
      const ny = Math.cos(a), nz = Math.sin(a)
      // Belly offset: body center shifts down at midsection for fuller underbelly
      const bellyDrop = Math.sin(t * Math.PI) * -0.04
      const pos: V3 = [x, ny * ry + bellyDrop, nz * rz]
      // Approximate normal
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

// Fin: a deformable strip defined by spine points + width
interface FinDef {
  spineStart: V3       // attachment point on body (body-local)
  spineDir: V3         // direction the fin extends
  length: number        // fin length
  width: number         // fin half-width (perpendicular)
  widthDir: V3         // direction of width expansion
  segments: number      // length subdivisions
  widthSegs: number     // width subdivisions
  waveAmp: number       // undulation amplitude
  waveFreq: number      // undulation frequency
  waveSpeed: number     // wave propagation speed
  trailFactor: number   // how much velocity trails the fin tips
  opacity: number       // base opacity
  idleFan?: number      // if set, fan back and forth at this speed even when still
}

const FINS: FinDef[] = [
  // ═══ DORSAL — moderate rounded fan, sits toward rear of back ═══
  { spineStart: [-0.35, 0.39, 0], spineDir: [-0.4, 0.7, 0], length: 0.8,
    width: 0.45, widthDir: [-1, 0.2, 0], segments: 10, widthSegs: 6,
    waveAmp: 0.08, waveFreq: 2.0, waveSpeed: 2.0, trailFactor: 0.45, opacity: 0.75 },

  // ═══ CAUDAL (halfmoon) — 7 equal-length lobes fanning 180° ═══
  ...[0, 1, 2, 3, 4, 5, 6].map((i): FinDef => {
    const angle = (i / 6 - 0.5) * Math.PI // -90° to +90° spread
    const dirY = Math.sin(angle)
    const dirX = -Math.cos(angle) * 0.6 - 0.4 // all point somewhat backward
    return {
      spineStart: [-0.92, dirY * 0.06, 0],
      spineDir: [dirX, dirY, 0],
      length: 1.2,
      width: 0.4,
      widthDir: [dirY * 0.3, -dirX * 0.3 + 0.5, 0.15],
      segments: 14, widthSegs: 7,
      waveAmp: 0.15, waveFreq: 1.3, waveSpeed: 1.3,
      trailFactor: 0.7, opacity: 0.72,
    }
  }),

  // ═══ ANAL — multi-lobe fan along the belly, same resolution as tail ═══
  ...[0, 1, 2, 3, 4].map((i): FinDef => {
    const angle = (i / 4 - 0.5) * 0.9 // spread ~50° under the belly
    const dirY = -0.85 + Math.abs(angle) * 0.3
    const dirX = -0.5 - i * 0.12
    return {
      spineStart: [-0.1 - i * 0.1, -0.38, 0],
      spineDir: [dirX, dirY, 0],
      length: 1.2 - i * 0.05,
      width: 0.5,
      widthDir: [-1, 0.1 + angle * 0.3, 0],
      segments: 14, widthSegs: 7,
      waveAmp: 0.1, waveFreq: 1.8, waveSpeed: 1.8,
      trailFactor: 0.55, opacity: 0.68,
    }
  }),

  // ═══ PECTORAL — multi-lobe fan, tucked closer to body, always fanning ═══
  ...[0, 1, 2].map((i): FinDef => {
    const spread = (i / 2 - 0.5) * 0.6
    return {
      spineStart: [0.25, -0.25, 0.18],
      spineDir: [0.1 + spread * 0.15, -0.7, 0.4],
      length: 0.8, width: 0.3,
      widthDir: [0, -1, 0.1 + spread * 0.2],
      segments: 14, widthSegs: 7,
      waveAmp: 0.06, waveFreq: 3.0, waveSpeed: 3.0, trailFactor: 0.3, opacity: 0.6,
      idleFan: 2.5,
    }
  }),
  ...[0, 1, 2].map((i): FinDef => {
    const spread = (i / 2 - 0.5) * 0.6
    return {
      spineStart: [0.25, -0.25, -0.18],
      spineDir: [0.1 + spread * 0.15, -0.7, -0.4],
      length: 0.8, width: 0.3,
      widthDir: [0, -1, -0.1 - spread * 0.2],
      segments: 14, widthSegs: 7,
      waveAmp: 0.06, waveFreq: 3.0, waveSpeed: 3.0, trailFactor: 0.3, opacity: 0.6,
      idleFan: 2.5,
    }
  }),

  // ═══ PELVIC — long, thin, trailing like ribbons ═══
  // Left
  { spineStart: [0.15, -0.35, 0.1], spineDir: [-0.15, -1, 0.4], length: 0.7,
    width: 0.1, widthDir: [-1, 0, 0.2], segments: 10, widthSegs: 4,
    waveAmp: 0.05, waveFreq: 2.5, waveSpeed: 2.5, trailFactor: 0.35, opacity: 0.5 },
  // Right
  { spineStart: [0.15, -0.35, -0.1], spineDir: [-0.15, -1, -0.4], length: 0.7,
    width: 0.1, widthDir: [-1, 0, -0.2], segments: 10, widthSegs: 4,
    waveAmp: 0.05, waveFreq: 2.5, waveSpeed: 2.5, trailFactor: 0.35, opacity: 0.5 },
]

// Compute body S-curve displacement at a given body-local X position
// turnBend: positive = bend right (like ")"), negative = bend left (like "(")
function bodyDeformation(bodyX: number, bodyWave: number, turnBend: number): V3 {
  const t = (1 - bodyX) / 2 // 0 at nose, 1 at tail
  // Swimming wave
  const amp = Math.min(t * 1.8, 1) * 0.28
  const lateralWave = Math.sin(t * 4 - bodyWave) * amp
  // Turn bend: smooth sine curve, no stretching — just lateral offset
  const bend = turnBend * Math.sin(t * Math.PI) * 0.4
  return [0, 0, lateralWave + bend]
}

function buildFinVerts(fin: FinDef, time: number, localSpeed: number, turnRate: number, bodyWave: number, turnBend: number): V3[][] {
  let dir = v3norm(fin.spineDir)
  const wdir = v3norm(fin.widthDir)
  const grid: V3[][] = []

  for (let i = 0; i <= fin.segments; i++) {
    const t = i / fin.segments

    // Pectoral flutter — wave propagates along the fin with phase delay per segment
    let segDir = dir
    if (fin.idleFan) {
      const fanWave = Math.sin(time * fin.idleFan * 2 - t * 3) * 0.35 * (0.3 + t * 0.7)
      segDir = v3norm(rotY(dir, fanWave))
    }

    const rawSpinePos = v3add(fin.spineStart, v3scale(segDir, t * fin.length))

    // Trailing in LOCAL frame
    const trail = t * t * fin.trailFactor * localSpeed * 0.002
    const turnDrag = t * t * turnRate * 0.3
    const trailed: V3 = [rawSpinePos[0] - trail, rawSpinePos[1], rawSpinePos[2] + turnDrag]

    // Wave phase at this spine segment (for multi-axis deformation)
    const wavePhase = time * 2.2 - t * 4

    const row: V3[] = []
    for (let j = 0; j <= fin.widthSegs; j++) {
      const wt = j / fin.widthSegs
      const edgeDist = Math.abs(wt - 0.5) * 2
      const w = (wt - 0.5) * 2 * fin.width * (1 + t * 0.15)

      // Edge ruffling
      const rufflePerp = v3norm(v3cross(dir, wdir))
      const ruffle = Math.sin(wt * 8 + t * 6 + bodyWave * 0.5) * 0.04 * edgeDist * edgeDist * (0.3 + t)
      const ruffleOffset = v3scale(rufflePerp, ruffle)

      // Vertical curl — wave makes the fin surface undulate up/down, stronger at tips & edges
      const curlY = Math.sin(wavePhase + wt * 2) * 0.06 * t * (0.4 + edgeDist * 0.6)

      // Twist — outer edges rotate opposite to inner, creating a corkscrew/recoil effect
      const twist = Math.sin(wavePhase * 0.8 + 1.5) * 0.08 * t * t * (wt - 0.5) * 2

      // Horizontal recoil at tips — tips curl back after the wave passes
      const recoilX = Math.cos(wavePhase + 0.5) * 0.04 * t * t * edgeDist

      const vertPos = v3add(v3add(trailed, v3scale(wdir, w)), ruffleOffset)
      vertPos[1] += curlY + twist
      vertPos[0] += recoilX

      // Body wave inheritance — amplified toward fin tips
      const inheritFactor = 1 + t * 0.8
      const deform = v3scale(bodyDeformation(vertPos[0], bodyWave, turnBend), inheritFactor)
      row.push(v3add(vertPos, deform))
    }
    grid.push(row)
  }
  return grid
}

// ═══════════════════════════════════════════════════════════════
//  RASTERIZER — project triangles to character grid
// ═══════════════════════════════════════════════════════════════
interface RasterCell { char: string; depth: number; alpha: number }

function projectVertex(v: V3, _fishPos: V3, fishYaw: number, fishPitch: number,
  fishRoll: number, screenScale: number, cx: number, cy: number): [number, number, number] {
  // Rotate vertex by fish orientation
  let p = rotZ(v, fishRoll)
  p = rotX(p, fishPitch)
  p = rotY(p, fishYaw)
  // Scale and translate to screen
  const sx = cx + p[0] * screenScale
  const sy = cy - p[1] * screenScale  // flip Y (screen Y is down)
  return [sx, sy, p[2]] // z for depth sorting
}

function rasterizeTriangle(
  v0: [number, number, number], v1: [number, number, number], v2: [number, number, number],
  intensity: number, alpha: number,
  buf: RasterCell[][], cols: number, rows: number,
) {
  // Bounding box
  const minX = Math.max(0, Math.floor(Math.min(v0[0], v1[0], v2[0]) / CELL_W))
  const maxX = Math.min(cols - 1, Math.ceil(Math.max(v0[0], v1[0], v2[0]) / CELL_W))
  const minY = Math.max(0, Math.floor(Math.min(v0[1], v1[1], v2[1]) / CELL_H))
  const maxY = Math.min(rows - 1, Math.ceil(Math.max(v0[1], v1[1], v2[1]) / CELL_H))

  for (let r = minY; r <= maxY; r++) {
    for (let c = minX; c <= maxX; c++) {
      const px = c * CELL_W + CELL_W / 2
      const py = r * CELL_H + CELL_H / 2

      // Barycentric coordinates
      const d0x = v1[0] - v0[0], d0y = v1[1] - v0[1]
      const d1x = v2[0] - v0[0], d1y = v2[1] - v0[1]
      const d2x = px - v0[0], d2y = py - v0[1]
      const den = d0x * d1y - d1x * d0y
      if (Math.abs(den) < 0.001) continue
      const u = (d2x * d1y - d1x * d2y) / den
      const v = (d0x * d2y - d2x * d0y) / den
      if (u < 0 || v < 0 || u + v > 1) continue

      // Interpolate depth
      const depth = v0[2] * (1 - u - v) + v1[2] * u + v2[2] * v

      // Depth test
      const cell = buf[r][c]
      if (cell && depth > cell.depth) continue // farther away, skip

      buf[r][c] = {
        char: shadeChar(intensity),
        depth,
        alpha: alpha,
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  FISH STATE
// ═══════════════════════════════════════════════════════════════
interface Fish {
  x: number; y: number     // screen position
  vx: number; vy: number
  yaw: number              // rotation around Y (left/right heading)
  pitch: number            // rotation around X (up/down tilt)
  roll: number             // rotation around Z (banking)
  targetYaw: number
  wanderAngle: number
  seed: number
  bodyWave: number         // phase for body undulation
  depth: number            // 0 = surface (closest, full size), 1 = max depth (smallest)
}

// Depth config
const MAX_DEPTH = 1
const DEPTH_SCALE_MIN = 0.3   // at max depth, fish is 30% of full size
const DEPTH_ALPHA_MIN = 0.3   // at max depth, alpha is 30% of normal

interface Ripple { x: number; y: number; birth: number }
const RIPPLE_LIFE = 5, RIPPLE_SPEED = 120, RIPPLE_RINGS = 3

// ═══════════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function ASCIIKoiPond() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const ripplesRef = useRef<Ripple[]>([])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, cols = 0, rows = 0
    let waterGrid: (string | null)[][] = []
    let swapTimes: number[][] = []
    let fish: Fish
    let animId = 0
    const screenScale = 180 // how big the fish appears on screen

    // Pre-build body mesh (static topology, vertices deformed per frame)
    const BODY_SEGS = 16, BODY_RINGS = 12
    const bodyTemplate = buildBodyMesh(BODY_SEGS, BODY_RINGS)
    const bodyIndices = triangulateBody(bodyTemplate, BODY_SEGS, BODY_RINGS)

    function resize() {
      const dpr = window.devicePixelRatio || 1
      w = window.innerWidth; h = window.innerHeight
      canvas.width = w * dpr; canvas.height = h * dpr
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(w / CELL_W) + 1
      rows = Math.ceil(h / CELL_H) + 1
      const now = performance.now()
      waterGrid = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () =>
          Math.random() < WATER_FILL ? '01'[Math.floor(Math.random() * 2)] : null))
      swapTimes = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => now + Math.random() * 5000))
    }

    function initFish() {
      fish = {
        x: Math.random() * w * 0.6 + w * 0.2,
        y: Math.random() * h * 0.6 + h * 0.2,
        vx: 0, vy: 0,
        yaw: Math.random() * Math.PI * 2, pitch: 0, roll: 0,
        targetYaw: Math.random() * Math.PI * 2,
        wanderAngle: 0, seed: Math.random() * 1000,
        bodyWave: 10, depth: 0.1,
      }
    }

    // ═══════════════════════════════════════
    //  FISH MOVEMENT — fully 3D orientation
    // ═══════════════════════════════════════
    function updateFish(dt: number, now: number) {
      const t = now / 1000
      const f = fish

      // Wander — gently shift target yaw
      f.wanderAngle += (
        Math.sin(t * 0.11 + f.seed) * 0.3 +
        Math.sin(t * 0.05 + f.seed * 3) * 0.2
      ) * dt

      // Target yaw follows wander
      f.targetYaw += Math.sin(f.wanderAngle) * 0.15 * dt

      // Smoothly approach target yaw
      let yawDiff = f.targetYaw - f.yaw
      while (yawDiff > Math.PI) yawDiff -= 2 * Math.PI
      while (yawDiff < -Math.PI) yawDiff += 2 * Math.PI
      f.yaw += yawDiff * (1 - Math.exp(-4 * dt))

      // Energy cycle — smoothly fades between swimming and idle
      const idleCycle = Math.sin(t * 0.12 + f.seed * 2) + Math.sin(t * 0.07 + f.seed * 4) * 0.5
      const energy = Math.max(0, Math.min(1, (0.8 - idleCycle) / 1.0))
      const thrust = energy * (70 + Math.sin(t * 0.15 + f.seed) * 20)

      // Thrust in facing direction
      f.vx += Math.cos(f.yaw) * thrust * dt * 2
      f.vy += Math.sin(f.yaw) * thrust * dt * 0.5

      // Drag — gradually increases as energy drops
      const drag = 2.5 + (1 - energy) * 2.0
      f.vx *= 1 - drag * dt
      f.vy *= 1 - drag * dt

      // Mouse avoidance — pushes velocity directly
      const mx = mouseRef.current.x, my = mouseRef.current.y
      const mdx = f.x - mx, mdy = f.y - my, mD = Math.sqrt(mdx * mdx + mdy * mdy)
      if (mD < 300 && mD > 1) {
        const force = (1 - mD / 300) * 120 * dt
        f.vx += (mdx / mD) * force; f.vy += (mdy / mD) * force
      }

      // Ripple avoidance — pushes velocity directly
      for (const rip of ripplesRef.current) {
        const age = (now - rip.birth) / 1000; if (age > 2) continue
        const rx = f.x - rip.x, ry = f.y - rip.y, rD = Math.sqrt(rx * rx + ry * ry)
        if (rD < 300 && rD > 1) {
          const force = (1 - age / 2) * (1 - rD / 300) * 150 * dt
          f.vx += (rx / rD) * force; f.vy += (ry / rD) * force
        }
      }

      // Edge avoidance — strong push back on screen
      const m = 300
      if (f.x < m) f.vx += ((m - f.x) / m) ** 2 * 200 * dt
      if (f.x > w - m) f.vx -= (((f.x - w + m) / m) ** 2) * 200 * dt
      if (f.y < m) f.vy += ((m - f.y) / m) ** 2 * 200 * dt
      if (f.y > h - m) f.vy -= (((f.y - h + m) / m) ** 2) * 200 * dt

      // Yaw follows velocity direction smoothly
      const curSpd = Math.sqrt(f.vx * f.vx + f.vy * f.vy)
      if (curSpd > 5) {
        const velAngle = Math.atan2(f.vy, f.vx)
        let diff = velAngle - f.targetYaw
        while (diff > Math.PI) diff -= 2 * Math.PI
        while (diff < -Math.PI) diff += 2 * Math.PI
        f.targetYaw += diff * (1 - Math.exp(-4 * dt))
      }

      // Pitch from vertical velocity
      const tgtPitch = curSpd > 3 ? Math.atan2(f.vy, Math.abs(f.vx)) * 0.3 : 0
      f.pitch += (tgtPitch - f.pitch) * (1 - Math.exp(-2 * dt))

      // Roll into turns (proportional to yaw rate)
      const tgtRoll = -yawDiff * 1.5
      f.roll += (Math.max(-0.4, Math.min(0.4, tgtRoll)) - f.roll) * (1 - Math.exp(-4 * dt))

      // Depth wandering — slow, biased toward surface (depth=0)
      // Depth from Z-component of velocity: cos(yaw) is the forward X component,
      // so sin(yaw) is the lateral component. But depth = facing INTO screen.
      // When yaw ≈ π/2 (facing "up" on screen / into screen), depth increases.
      // When yaw ≈ -π/2 (facing "down" / out of screen), depth decreases.
      // Only apply when significantly facing toward/away (deadzone for sideways)
      const zFacing = -Math.sin(f.yaw) // negative because our yaw convention
      f.depth += zFacing * curSpd * 0.003 * dt
      if (f.depth < 0) f.depth = 0
      if (f.depth > MAX_DEPTH) f.depth = MAX_DEPTH

      // Move
      f.x += f.vx * dt; f.y += f.vy * dt

      // Wrap
      const hm = screenScale * 3 // use max scale for wrap margin
      if (f.x < -hm) f.x = w + hm; if (f.x > w + hm) f.x = -hm
      if (f.y < -hm) f.y = h + hm; if (f.y > h + hm) f.y = -hm

      // Body wave speed tied to swimming speed + yaw change rate
      const yawRate = Math.abs(yawDiff)
      f.bodyWave += dt * (2 + curSpd * 0.12 + yawRate * 15)
    }

    // ═══════════════════════════════════════
    //  BUILD FRAME — deform mesh + rasterize
    // ═══════════════════════════════════════
    function renderFish(now: number, buf: RasterCell[][]) {
      const time = now / 1000
      const f = fish
      const localSpeed = Math.sqrt(f.vx * f.vx + f.vy * f.vy)
      // Yaw rate for lateral fin drag during turns
      let yawDiff = f.targetYaw - f.yaw
      while (yawDiff > Math.PI) yawDiff -= 2 * Math.PI
      while (yawDiff < -Math.PI) yawDiff += 2 * Math.PI
      const turnRate = yawDiff

      // Depth-adjusted scale and alpha
      const depthFactor = 1 - f.depth * (1 - DEPTH_SCALE_MIN) // 1.0 at surface, DEPTH_SCALE_MIN at max
      const depthAlpha = 1 - f.depth * (1 - DEPTH_ALPHA_MIN)
      const curScale = screenScale * depthFactor

      // Light direction (from upper-right)
      const lightDir: V3 = v3norm([0.4, 0.6, -0.8])

      // --- BODY ---
      const deformedVerts: [V3, V3][] = bodyTemplate.map(([pos, norm]) => {
        const deform = bodyDeformation(pos[0], f.bodyWave, yawDiff)
        const dpos: V3 = [pos[0], pos[1] + deform[1], pos[2] + deform[2]]
        return [dpos, norm]
      })

      // Project and rasterize body triangles
      const projVerts = deformedVerts.map(([pos]) =>
        projectVertex(pos, [0, 0, 0], f.yaw, f.pitch, f.roll, curScale, f.x, f.y))

      for (const [a, b, c] of bodyIndices) {
        const va = projVerts[a], vb = projVerts[b], vc = projVerts[c]

        // Back-face cull via screen-space winding order
        const cross2d = (va[0] - vc[0]) * (vb[1] - vc[1]) - (va[1] - vc[1]) * (vb[0] - vc[0])
        if (cross2d < 0) continue

        // Compute face normal in world space for shading
        const wA = deformedVerts[a][0], wB = deformedVerts[b][0], wC = deformedVerts[c][0]
        let worldNorm = v3norm(v3cross(v3sub(wB, wA), v3sub(wC, wA)))
        worldNorm = rotZ(worldNorm, f.roll)
        worldNorm = rotX(worldNorm, f.pitch)
        worldNorm = rotY(worldNorm, f.yaw)

        const intensity = Math.max(0, v3dot(worldNorm, lightDir))
        rasterizeTriangle(va, vb, vc, intensity, FISH_ALPHA * depthAlpha, buf, cols, rows)
      }


      // --- EYES (single character each, deformed with body) ---
      const eyeL: V3 = [0.65, 0.08, 0.16]
      const eyeR: V3 = [0.65, 0.08, -0.16]
      for (const eyePos of [eyeL, eyeR]) {
        const deform = bodyDeformation(eyePos[0], f.bodyWave, yawDiff)
        const deformedEye: V3 = [eyePos[0] + deform[0], eyePos[1] + deform[1], eyePos[2] + deform[2]]
        const proj = projectVertex(deformedEye, [0, 0, 0], f.yaw, f.pitch, f.roll, curScale, f.x, f.y)
        // Skip if eye is on the far side of the body
        if (proj[2] > 0) continue
        const ec = Math.round(proj[0] / CELL_W)
        const er = Math.round(proj[1] / CELL_H)
        if (ec >= 0 && ec < cols && er >= 0 && er < rows) {
          const existing = buf[er][ec]
          // Only draw if no body surface is closer (proper depth test)
          if (!existing || proj[2] <= existing.depth) {
            buf[er][ec] = { char: '@', depth: proj[2], alpha: FISH_ALPHA * 1.8 * depthAlpha }
          }
        }
      }

      // --- FINS ---
      for (const fin of FINS) {
        const grid = buildFinVerts(fin, time, localSpeed, turnRate, f.bodyWave, yawDiff)

        for (let i = 0; i < grid.length - 1; i++) {
          for (let j = 0; j < grid[i].length - 1; j++) {
            const p00 = grid[i][j], p10 = grid[i + 1][j]
            const p01 = grid[i][j + 1], p11 = grid[i + 1][j + 1]

            // Two triangles per quad
            for (const [tA, tB, tC] of [[p00, p10, p01], [p01, p10, p11]]) {
              let faceNorm = v3norm(v3cross(v3sub(tB, tA), v3sub(tC, tA)))
              faceNorm = rotZ(faceNorm, f.roll)
              faceNorm = rotX(faceNorm, f.pitch)
              faceNorm = rotY(faceNorm, f.yaw)

              // Fins are thin — render both sides (no back-face cull)
              const intensity = Math.abs(v3dot(faceNorm, lightDir))

              const pa = projectVertex(tA, [0, 0, 0], f.yaw, f.pitch, f.roll, curScale, f.x, f.y)
              const pb = projectVertex(tB, [0, 0, 0], f.yaw, f.pitch, f.roll, curScale, f.x, f.y)
              const pc = projectVertex(tC, [0, 0, 0], f.yaw, f.pitch, f.roll, curScale, f.x, f.y)

              // Fin opacity: base * (1 - taper toward tip)
              const avgT = (i + 0.5) / fin.segments
              const finAlpha = fin.opacity * FISH_ALPHA * depthAlpha * (1 - avgT * 0.5)

              rasterizeTriangle(pa, pb, pc, intensity * 0.8 + 0.1, finAlpha, buf, cols, rows)
            }
          }
        }
      }
    }

    // ═══════════════════════════════════════
    //  RIPPLE
    // ═══════════════════════════════════════
    function getRippleGlow(px: number, py: number, now: number): number {
      let glow = 0
      for (const rip of ripplesRef.current) {
        const age = (now - rip.birth) / 1000; if (age > RIPPLE_LIFE) continue
        const dist = Math.sqrt((px - rip.x) ** 2 + (py - rip.y) ** 2)
        const fade = Math.exp(-age * 1.2)
        for (let ring = 0; ring < RIPPLE_RINGS; ring++) {
          const rAge = age - ring * 0.3; if (rAge < 0) continue
          const radius = rAge * RIPPLE_SPEED, ringW = 15 + rAge * 12
          const fromRing = Math.abs(dist - radius)
          if (fromRing < ringW) glow = Math.max(glow, fade * (1 - ring * 0.25) * (1 - fromRing / ringW) * 0.22)
        }
      }
      return glow
    }

    // ═══════════════════════════════════════
    //  RENDER
    // ═══════════════════════════════════════
    function render(now: number) {
      ctx.clearRect(0, 0, w, h)
      ctx.font = FONT; ctx.textBaseline = 'middle'
      ripplesRef.current = ripplesRef.current.filter(r => (now - r.birth) / 1000 < RIPPLE_LIFE)

      const mx = mouseRef.current.x, my = mouseRef.current.y
      const hasRipples = ripplesRef.current.length > 0
      const waterStyle = `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${WATER_ALPHA})`

      // Build fish raster buffer
      const fishBuf: RasterCell[][] = Array.from({ length: rows }, () => Array(cols).fill(null))
      renderFish(now, fishBuf)

      ctx.fillStyle = waterStyle
      const lit: [number, number, string, number][] = []

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (now > swapTimes[r][c]) {
            waterGrid[r][c] = Math.random() < WATER_FILL ? '01'[Math.floor(Math.random() * 2)] : null
            swapTimes[r][c] = now + 2000 + Math.random() * 5000
          }

          const px = c * CELL_W, py = r * CELL_H
          const ripple = hasRipples ? getRippleGlow(px, py, now) : 0

          // Fish cell
          const cell = fishBuf[r][c]
          if (cell) {
            lit.push([px, py, cell.char, Math.min(0.7, cell.alpha + ripple)])
            continue
          }

          // Water
          const ch = waterGrid[r][c]
          const gDist = Math.sqrt((px - mx) ** 2 + (py - my) ** 2)
          const glow = gDist < 100 ? (1 - gDist / 100) * 0.06 : 0
          const extra = glow + ripple
          if (extra > 0.001) {
            const gc = ch ?? '01'[(r * 7 + c * 13) % 2]
            lit.push([px, py, gc, WATER_ALPHA + extra])
          } else if (ch) {
            ctx.fillText(ch, px, py)
          }
        }
      }

      for (const [x, y, ch, a] of lit) {
        ctx.fillStyle = `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${a})`
        ctx.fillText(ch, x, y)
      }
    }

    // ── LOOP ──
    let prevTime = 0
    function loop(now: number) {
      if (!prevTime) prevTime = now
      const dt = Math.min((now - prevTime) / 1000, 0.05)
      prevTime = now
      updateFish(dt, now)
      render(now)
      animId = requestAnimationFrame(loop)
    }

    const onMouseMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY } }
    const onMouseLeave = () => { mouseRef.current = { x: -9999, y: -9999 } }
    const onClick = (e: MouseEvent) => { ripplesRef.current.push({ x: e.clientX, y: e.clientY, birth: performance.now() }) }

    resize(); initFish()
    animId = requestAnimationFrame(loop)
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseleave', onMouseLeave)
    window.addEventListener('click', onClick)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseleave', onMouseLeave)
      window.removeEventListener('click', onClick)
    }
  }, [])

  return (
    <canvas ref={canvasRef}
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: -1, pointerEvents: 'none' }} />
  )
}
