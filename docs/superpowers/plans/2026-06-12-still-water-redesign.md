# Still Water Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the portfolio's experience layer per `docs/superpowers/specs/2026-06-12-still-water-redesign-design.md`: a Three.js water background, behavior-driven ASCII fish, GSAP/Lenis motion system, custom cursor — minimal, dark, mint-accented, mobile-friendly.

**Architecture:** Three fixed full-viewport layers behind the content: a WebGL water shader canvas (z -2), the existing ASCII fish canvas (z -1), then HTML content, then grain + custom cursor on top. A tiny framework-free `pond` module is the single source of truth for cursor/scroll/ripple state; both canvases read it every frame. All DOM animation goes through GSAP (ScrollTrigger + SplitText) with Lenis driving scroll.

**Tech Stack:** React 19, Vite 6, TypeScript, three, gsap (free SplitText ≥3.13), lenis.

**Testing reality:** This repo has no unit-test runner and the work is visual. Verification per task = `npm run build` + `npm run lint` green, plus the headless-browser script (Task 10 formalizes it; until then use `/tmp/shoot-portfolio.mjs` pattern: Playwright from `~/.claude/skills/gstack/node_modules/playwright/index.mjs` with `chromiumSandbox: false`, dev server at `http://localhost:5180`). Console must stay free of errors.

---

### Task 1: Branch and dependencies

**Files:** `package.json` (via npm)

- [ ] **Step 1: Create branch**

```bash
git checkout -b redesign/still-water
```

- [ ] **Step 2: Install new dependencies (do NOT remove pretext yet — Task 7 does, with its usage)**

```bash
npm install three gsap lenis && npm install -D @types/three
```

- [ ] **Step 3: Verify build still green**

Run: `npm run build` — Expected: `✓ built` with no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add three, gsap, lenis dependencies"
```

---

### Task 2: Pond store

**Files:**
- Create: `src/anim/pond.ts`

- [ ] **Step 1: Write the module**

```ts
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
}

let lastX = -9999, lastY = -9999, lastT = 0

/** Attach global listeners. Call once after mount; returns cleanup. */
export function initPond(): () => void {
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
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    pond.scroll = max > 0 ? Math.min(window.scrollY / max, 1) : 0
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
    rmq.removeEventListener('change', onRmq)
    io.disconnect()
    window.removeEventListener('pointermove', onMove)
    document.documentElement.removeEventListener('pointerleave', onLeave)
    window.removeEventListener('pointerdown', onDown)
    window.removeEventListener('scroll', onScroll)
  }
}

/** Age idle timer, decay speed, expire ripples. Call once per frame from the fish loop. */
export function tickPond(dtMs: number) {
  pond.cursor.idleMs += dtMs
  pond.cursor.speed *= 0.95
  const now = performance.now()
  if (pond.ripples.length && now - pond.ripples[0].birth > RIPPLE_LIFE_S * 1000) {
    pond.ripples = pond.ripples.filter(r => now - r.birth < RIPPLE_LIFE_S * 1000)
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build` — Expected: green (module unused so far; `tsc -b` still type-checks it).

- [ ] **Step 3: Commit**

```bash
git add src/anim/pond.ts && git commit -m "Add pond shared-state module"
```

---

### Task 3: Lenis smooth scroll + GSAP wiring

**Files:**
- Create: `src/anim/useLenis.ts`
- Modify: `src/App.tsx` (hook call + CTA), `src/components/NavBar.tsx` (scrollTo)

- [ ] **Step 1: Write the hook**

```ts
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
    lenis = new Lenis({ duration: 1.1 })
    lenis.on('scroll', ScrollTrigger.update)
    const raf = (time: number) => lenis?.raf(time * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)
    return () => { gsap.ticker.remove(raf); lenis?.destroy(); lenis = null }
  }, [])
}
```

- [ ] **Step 2: Use it in App and route anchor scrolls through it**

In `src/App.tsx`: add imports and call `useLenis()` as the first line of the `App` body; replace the CTA `onClick` body `document.getElementById('portfolio')?.scrollIntoView({ behavior: 'smooth' });` with `scrollToSection('portfolio');`.

```tsx
import { useLenis, scrollToSection } from "./anim/useLenis";
// inside component:
const App: React.FC = () => {
  useLenis();
```

In `src/components/NavBar.tsx`: replace the anchor `onClick` body with `scrollToSection(e)`:

```tsx
import { scrollToSection } from '../anim/useLenis'
// in the map:
        <a
          key={e}
          onClick={() => scrollToSection(e)}
        >
```

- [ ] **Step 3: Verify**

Run: `npm run build && npm run lint` — green. Start dev server, browse-check: clicking nav "03. Portfolio" glides smoothly; console clean.

- [ ] **Step 4: Commit**

```bash
git add src/anim/useLenis.ts src/App.tsx src/components/NavBar.tsx
git commit -m "Add lenis smooth scrolling wired to GSAP ScrollTrigger"
```

---

### Task 4: WaterScene — caustics, god rays, depth gradient, ripples

**Files:**
- Create: `src/components/WaterScene.tsx`
- Modify: `src/App.tsx` (mount it), `src/App.css` (move body gradient into shader's job)

The canvas is opaque and reproduces the page's radial gradient in-shader (so depth darkening can dim it). It sits at `z-index: -2`, beneath the ASCII fish canvas (`-1`).

- [ ] **Step 1: Write the component**

```tsx
// src/components/WaterScene.tsx
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { pond, RIPPLE_LIFE_S } from '../anim/pond'

const MAX_RIPPLES = 8

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uScroll;
  uniform vec2  uRes;
  uniform vec2  uCursor;            // px, y-down
  uniform vec3  uRipples[${MAX_RIPPLES}]; // x, y (px), age (s); age < 0 = unused
  uniform float uHue;               // radians, slow drift
  uniform float uStatic;            // 1 = reduced motion
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float caustics(vec2 p, float t) {
    float n = 1.0 - abs(noise(p * 3.0 + vec2(t * 0.060, t * 0.045)) * 2.0 - 1.0);
    n += (1.0 - abs(noise(p * 6.0 - vec2(t * 0.050, t * 0.030)) * 2.0 - 1.0)) * 0.5;
    return pow(n / 1.5, 3.0);
  }
  vec3 hueRotate(vec3 c, float a) {
    const vec3 k = vec3(0.57735);
    return c * cos(a) + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - cos(a));
  }

  void main() {
    vec2 uv = vUv;                            // y-up
    vec2 px = vec2(uv.x, 1.0 - uv.y) * uRes;  // y-down pixel coords (match DOM)
    float t = mix(uTime, 0.0, uStatic);

    // ripple + cursor distortion of the sample position
    vec2 distort = vec2(0.0);
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec3 r = uRipples[i];
      if (r.z < 0.0) continue;
      float d = distance(px, r.xy);
      float radius = r.z * 220.0;
      float ring = exp(-abs(d - radius) * 0.02) * exp(-r.z * 1.1);
      distort += ((px - r.xy) / max(d, 1.0)) * ring * 14.0;
    }
    float cd = distance(px, uCursor);
    distort += ((px - uCursor) / max(cd, 1.0)) * exp(-cd * 0.008) * 4.0 * (1.0 - uStatic);

    vec2 p = uv * vec2(uRes.x / uRes.y, 1.0) + distort / uRes.y;

    // base: the old body radial gradient (circle at 50% 0%, #1a1a1a -> #000 at 70%)
    float g = 1.0 - smoothstep(0.0, 0.7, distance(uv, vec2(0.5, 1.0)));
    vec3 col = vec3(0.102) * g;

    vec3 mint = vec3(0.392, 1.0, 0.855);      // #64ffda
    col += mint * caustics(p, t) * 0.045;

    // god rays — vertical shafts, strongest at page top, gone by ~35% scroll
    float shaft = pow(noise(vec2(p.x * 2.0 + t * 0.02, 0.5)), 3.0);
    col += mint * shaft * smoothstep(0.25, 1.0, uv.y) * (1.0 - smoothstep(0.0, 0.35, uScroll)) * 0.05;

    // ripples faintly luminous themselves
    col += mint * min(length(distort) * 0.012, 0.03);

    // descend: darken toward the pond floor
    col *= mix(1.0, 0.45, smoothstep(0.0, 1.0, uScroll));
    col = hueRotate(col, uHue);
    gl_FragColor = vec4(col, 1.0);
  }
`

export default function WaterScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dead, setDead] = useState(false)

  useEffect(() => {
    if (dead) return
    const canvas = canvasRef.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' })
    } catch { setDead(true); return }

    const lowEnd = (navigator.hardwareConcurrency ?? 8) < 4
    const dprCap = pond.isTouch ? (lowEnd ? 1.5 : 2) : 2
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap))

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const uniforms = {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uCursor: { value: new THREE.Vector2(-9999, -9999) },
      uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector3(0, 0, -1)) },
      uHue: { value: 0 },
      uStatic: { value: pond.reducedMotion ? 1 : 0 },
    }
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms })
    )
    scene.add(quad)

    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight
      renderer.setSize(w, h, false)
      uniforms.uRes.value.set(w, h)
    }
    resize()

    const render = () => {
      const now = performance.now()
      uniforms.uTime.value = now / 1000
      uniforms.uScroll.value = pond.scroll
      uniforms.uCursor.value.set(pond.cursor.x, pond.cursor.y)
      uniforms.uHue.value = Math.sin(now / 1000 * 0.012) * (5 * Math.PI / 180)
      uniforms.uStatic.value = pond.reducedMotion ? 1 : 0
      for (let i = 0; i < MAX_RIPPLES; i++) {
        const r = pond.ripples[i]
        const v = uniforms.uRipples.value[i]
        if (r && !pond.reducedMotion) {
          const age = (now - r.birth) / 1000
          v.set(r.x, r.y, age < RIPPLE_LIFE_S ? age : -1)
        } else v.z = -1
      }
      renderer.render(scene, camera)
    }

    if (pond.reducedMotion) render()           // single static frame
    else renderer.setAnimationLoop(render)

    const onVis = () => {
      if (pond.reducedMotion) return
      renderer.setAnimationLoop(document.hidden ? null : render)
    }
    const onLost = (e: Event) => { e.preventDefault(); setDead(true) }
    const onResize = () => { resize(); if (pond.reducedMotion) render() }

    document.addEventListener('visibilitychange', onVis)
    canvas.addEventListener('webglcontextlost', onLost)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      canvas.removeEventListener('webglcontextlost', onLost)
      window.removeEventListener('resize', onResize)
      renderer.setAnimationLoop(null)
      quad.geometry.dispose()
      ;(quad.material as THREE.ShaderMaterial).dispose()
      renderer.dispose()
    }
  }, [dead])

  if (dead) return null // graceful: body gradient (restored via CSS fallback) shows instead
  return (
    <canvas ref={canvasRef} aria-hidden="true"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: -2, pointerEvents: 'none' }} />
  )
}
```

- [ ] **Step 2: Mount it in App, after `<ASCIIKoiPond />`**

```tsx
import WaterScene from "./components/WaterScene";
// in JSX, alongside the fish:
      <ASCIIKoiPond />
      <WaterScene />
```

Also in `src/App.tsx`, add the pond init to a `useEffect` (the existing one or new):

```tsx
import { initPond } from "./anim/pond";
// inside useEffect, first line:
    const cleanupPond = initPond();
// and in the effect's cleanup, call cleanupPond()
```

The body `background-image` rule in `App.css` STAYS — it is the no-WebGL fallback; the opaque canvas covers it when alive.

- [ ] **Step 3: Verify**

`npm run build && npm run lint` green. Browse-check at 1440px: hero shows faint vertical light shafts and slow mint shimmer (zoom into a screenshot if unsure — values are intentionally ~5%); scroll to footer: background noticeably darker; click: expanding ripple distortion. Console clean. Screenshot all sections.

- [ ] **Step 4: Commit**

```bash
git add src/components/WaterScene.tsx src/App.tsx
git commit -m "Add Three.js water scene: caustics, god rays, depth gradient, ripples"
```

---

### Task 5: Particles in the water

**Files:**
- Modify: `src/components/WaterScene.tsx`

- [ ] **Step 1: Add a Points layer to the scene (insert after `scene.add(quad)`)**

```tsx
    // ~150 dust/plankton motes (75 on touch). NDC coords; drift in vertex shader.
    const COUNT = pond.isTouch ? 75 : 150
    const pos = new Float32Array(COUNT * 3)
    const seed = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = Math.random() * 2 - 1
      pos[i * 3 + 1] = Math.random() * 2 - 1
      pos[i * 3 + 2] = Math.random()            // pseudo-depth 0..1 for parallax
      seed[i] = Math.random() * 100
    }
    const pgeo = new THREE.BufferGeometry()
    pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    pgeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    const pmat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      uniforms: { uTime: uniforms.uTime, uScroll: uniforms.uScroll, uPar: { value: new THREE.Vector2(0, 0) }, uStatic: uniforms.uStatic },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime; uniform float uScroll; uniform vec2 uPar; uniform float uStatic;
        varying float vA;
        void main() {
          float t = mix(uTime, 0.0, uStatic);
          float depth = position.z;             // 0 far .. 1 near
          vec2 p = position.xy;
          p.x += sin(t * (0.05 + aSeed * 0.001) + aSeed) * 0.04;
          p.y += cos(t * (0.04 + aSeed * 0.0013) + aSeed * 2.0) * 0.04
               + uScroll * (0.15 + depth * 0.5);   // rise as the page descends
          p += uPar * depth * 0.03;                // cursor parallax
          p = mod(p + 1.0, 2.0) - 1.0;             // wrap
          vA = 0.10 + depth * 0.18;
          gl_Position = vec4(p, 0.0, 1.0);
          gl_PointSize = 1.0 + depth * 2.0;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(0.65, 0.85, 0.80, vA * (1.0 - d * 2.0));
        }
      `,
    })
    const points = new THREE.Points(pgeo, pmat)
    scene.add(points)
```

In `render()`, before `renderer.render`, update parallax:

```tsx
      const cx = pond.cursor.x > -9000 ? (pond.cursor.x / window.innerWidth - 0.5) : 0
      const cy = pond.cursor.y > -9000 ? (pond.cursor.y / window.innerHeight - 0.5) : 0
      ;(pmat.uniforms.uPar.value as THREE.Vector2).set(cx, -cy)
```

In the cleanup, add: `pgeo.dispose(); pmat.dispose()`.

- [ ] **Step 2: Verify** — build/lint green; screenshot shows tiny motes; moving cursor in a Playwright `page.mouse.move` sweep shifts near motes more than far ones. Console clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/WaterScene.tsx
git commit -m "Add drifting plankton particles with cursor/scroll parallax"
```

---

### Task 6: Fish behaviors — startle, curiosity, ripple investigation, section migration

**Files:**
- Modify: `src/components/ASCIIKoiPond.tsx`

The fish stops owning input. Delete its `mouseRef`/`ripplesRef` and DOM listeners; read `pond` instead. `RIPPLE_LIFE` stays for glow rendering but reads pond ripples.

- [ ] **Step 1: Swap state source**

At top: `import { pond, tickPond } from '../anim/pond'`.
Delete lines `const mouseRef = useRef(...)` and `const ripplesRef = useRef<Ripple[]>([])` and the `interface Ripple` block (pond owns the type). Delete `onMouseMove`, `onMouseLeave`, `onClick` handlers and their `addEventListener`/`removeEventListener` lines.
In `render()`: replace `ripplesRef.current = ripplesRef.current.filter(...)` with nothing (pond expires them); replace `const mx = mouseRef.current.x, my = mouseRef.current.y` with `const mx = pond.cursor.x, my = pond.cursor.y`; replace `ripplesRef.current.length > 0` with `pond.ripples.length > 0`. In `getRippleGlow`, iterate `pond.ripples` instead of `ripplesRef.current` (field names `x`, `y`, `birth` are identical).
In `loop()`, first line after computing `dt`: `tickPond(dt * 1000)`.

- [ ] **Step 2: Replace the "Mouse avoidance" block in `updateFish` (lines ~448–454) with speed-scaled startle + idle curiosity**

```ts
      // Cursor: startle scales with cursor speed; idle cursor attracts curiosity
      const mx = pond.cursor.x, my = pond.cursor.y
      const mdx = f.x - mx, mdy = f.y - my, mD = Math.sqrt(mdx * mdx + mdy * mdy)
      if (!pond.reducedMotion && mx > -9000 && mD > 1) {
        const startle = Math.min(pond.cursor.speed / 1.5, 1)   // ~1 at fast flicks
        if (mD < 300) {
          const force = (1 - mD / 300) * (40 + 280 * startle) * dt
          f.vx += (mdx / mD) * force; f.vy += (mdy / mD) * force
        }
        if (pond.cursor.idleMs > 2000 && mD > 150 && mD < 600) {
          const pull = 30 * dt                                  // curious drift
          f.vx -= (mdx / mD) * pull; f.vy -= (mdy / mD) * pull
        }
      }
```

- [ ] **Step 3: Replace the "Ripple avoidance" block (lines ~456–464) with startle-then-investigate**

```ts
      // Ripples: brief startle, then the fish comes to investigate
      if (!pond.reducedMotion) for (const rip of pond.ripples) {
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
```

- [ ] **Step 4: Add section migration just before "Edge avoidance"**

```ts
      // Section migration — each section has a preferred region (viewport-normalized)
      const SECTION_ANCHORS = [
        { x: 0.72, y: 0.55 },   // home: right of the name
        { x: 0.16, y: 0.78 },   // about: lower-left, clear of text and photo
        { x: 0.82, y: 0.18 },   // portfolio: upper-right
      ]
      if (!pond.reducedMotion) {
        const an = SECTION_ANCHORS[pond.section] ?? SECTION_ANCHORS[0]
        const adx = an.x * w - f.x, ady = an.y * h - f.y
        const aD = Math.sqrt(adx * adx + ady * ady)
        if (aD > 200) {
          const force = Math.min((aD - 200) / 400, 1) * 50 * dt
          f.vx += (adx / aD) * force; f.vy += (ady / aD) * force
        }
      }
```

- [ ] **Step 5: Calm reduced-motion fish** — in `updateFish`, change the thrust line to:

```ts
      const thrust = energy * (100 + Math.sin(t * 0.15 + f.seed) * 25) * (pond.reducedMotion ? 0.3 : 1)
```

- [ ] **Step 6: Verify** — build/lint green. Browse-check: fish drifts toward each section's region as you scroll (script: scroll to `#about`, wait 6s, screenshot — fish should be lower-left); a `page.mouse.move` fast sweep near the fish makes it dart; a click then 3s wait draws it toward the click point. Console clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/ASCIIKoiPond.tsx
git commit -m "Fish reads pond state: speed-scaled startle, curiosity, ripple investigation, section migration"
```

---

### Task 7: Motion system — reveals, SplitText, hero intro, markup restructure, Pretext removal

**Files:**
- Create: `src/anim/reveals.ts`
- Modify: `src/App.tsx`, `src/App.css`
- Delete: `src/components/PretextParagraph.tsx`

- [ ] **Step 1: Write `src/anim/reveals.ts`**

```ts
// src/anim/reveals.ts — the site's single motion vocabulary.
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'

gsap.registerPlugin(ScrollTrigger, SplitText)

export const EASE_REVEAL = 'power3.out'
export const EASE_MASK = 'expo.out'
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Hero load-in: greeting, masked name chars, subtitle, CTA, contact icons. */
export function heroIntro() {
  const els = '#greeting, #subtitle, #cta-button, .contact-logo'
  if (reduced()) { gsap.set(`${els}, #intro`, { opacity: 1 }); return }
  const name = SplitText.create('#intro', { type: 'chars', mask: 'chars' })
  gsap.set('#intro', { opacity: 1 })
  gsap.timeline({ defaults: { ease: EASE_MASK } })
    .to('#greeting', { opacity: 1, duration: 0.8, ease: 'none' }, 0.2)
    .from(name.chars, { yPercent: 115, duration: 1.0, stagger: 0.035 }, 0.4)
    .to('#subtitle', { opacity: 1, y: 0, duration: 0.9 }, 1.0)
    .to('#cta-button', { opacity: 1, duration: 0.7, ease: 'none' }, 1.3)
    .to('.contact-logo', { opacity: 1, duration: 0.6, stagger: 0.08, ease: 'none' }, 1.45)
}

/** All scroll-triggered reveals. Call once after mount. */
export function initSectionReveals() {
  if (reduced()) {
    gsap.set('.section-heading, .rule, #about-text p, .project-panel, #headshot', { opacity: 1, clearProps: 'transform' })
    return
  }

  document.querySelectorAll<HTMLElement>('.section-heading').forEach(h => {
    const split = SplitText.create(h.querySelector('.heading-text')!, { type: 'chars', mask: 'chars' })
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
    SplitText.create(about.querySelectorAll('p'), {
      type: 'lines', mask: 'lines', autoSplit: true,
      onSplit: self => gsap.from(self.lines, {
        yPercent: 100, opacity: 0, duration: 0.9, ease: EASE_REVEAL, stagger: 0.06,
        scrollTrigger: { trigger: about, start: 'top 75%' },
      }),
    })
  }

  gsap.from('#headshot', {
    y: 50, opacity: 0, duration: 1.0, ease: EASE_REVEAL,
    scrollTrigger: { trigger: '#aboutme', start: 'top 75%' },
  })

  gsap.from('.project-panel', {
    y: 40, opacity: 0, duration: 0.8, ease: EASE_REVEAL, stagger: 0.12,
    scrollTrigger: { trigger: '#projects', start: 'top 80%' },
  })

  // depth line: 1px mint progress line on the right edge
  gsap.to('#depth-line', {
    scaleY: 1, ease: 'none',
    scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: true },
  })
}
```

- [ ] **Step 2: Restructure `src/App.tsx`**

Full new file (replaces the old one — preserves all copy and project data):

```tsx
import "./App.css";
import NavBar from "./components/NavBar";
import ProjectPanel from "./components/ProjectPanel";
import { useEffect } from "react";
import { skills } from "./data/skills";
import ASCIIKoiPond from "./components/ASCIIKoiPond";
import WaterScene from "./components/WaterScene";
import { ChessIcon, OrbitIcon, AutomataIcon } from "./components/AnimatedIcons";
import { initPond } from "./anim/pond";
import { useLenis, scrollToSection } from "./anim/useLenis";
import { heroIntro, initSectionReveals } from "./anim/reveals";

const sections = ["home", "about", "portfolio"];
const aboutParagraphs = [
  "Hello! I'm Edmon, a Software Engineering student at the University of Waterloo.",
  "My interest in software development started in 2019, and since then, I've been focused on building efficient and user-friendly applications. I enjoy the process of turning complex problems into simple, elegant solutions.",
  "Currently, I'm exploring full-stack development and looking for opportunities to apply my skills in real-world projects. I'm seeking a co-op position for Fall 2026.",
];

const App: React.FC = () => {
  useLenis();

  useEffect(() => {
    const cleanupPond = initPond();
    heroIntro();
    initSectionReveals();
    return cleanupPond;
  }, []);

  return (
    <div className="App">
      <header>
        <div className="logo">
          <h3>ES</h3>
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <NavBar sections={sections} />
        </div>
      </header>

      <main>
        <section id="home">
          <p id="greeting">Hi, my name is</p>
          <h1 id="intro">Edmon Shi.</h1>
          <h2 id="subtitle">Software Engineering Student at the University of Waterloo.</h2>
          <a href="#portfolio" id="cta-button" className="primary-button" data-magnetic
            onClick={(e) => { e.preventDefault(); scrollToSection("portfolio"); }}>
            Check out my projects!
          </a>
          <div id="contact">
            {/* the three SVG contact links are UNCHANGED — copy them verbatim from the previous App.tsx */}
          </div>
        </section>

        <section id="about">
          <h1 className="section-heading">
            <span className="ghost-num" aria-hidden="true">02</span>
            <span className="heading-text">About Me</span>
            <span className="rule" aria-hidden="true" />
          </h1>
          <div id="aboutme">
            <div id="about-text">
              {aboutParagraphs.map((p, i) => (<p key={i}>{p}</p>))}
            </div>
            <img src="/photo.jpg" id="headshot" alt="Edmon Shi" />
          </div>
          <div id="skills-bar">
            <div className="skills-track">
              {[...skills, ...skills].map((skill, index) => (
                <span key={index} className="skill-item">
                  <div className="skill-icon-container">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d={skill.path} fill={skill.color} fillRule="evenodd" />
                    </svg>
                  </div>
                  {skill.name}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section id="portfolio">
          <h1 className="section-heading">
            <span className="ghost-num" aria-hidden="true">03</span>
            <span className="heading-text">Some Things I've Built</span>
            <span className="rule" aria-hidden="true" />
          </h1>
          <div id="projects">
            {/* the three <ProjectPanel .../> elements are UNCHANGED — copy verbatim from the previous App.tsx */}
          </div>
        </section>
      </main>

      <footer>
        <p>Made with 🗿 by Edmon Shi</p>
      </footer>
      <div id="depth-line" aria-hidden="true" />
      <ASCIIKoiPond />
      <WaterScene />
    </div>
  );
};

export default App;
```

Notes: the old `useEffect` (manual fadeIn timeouts + IntersectionObserver + `aboutVisible` state) is fully deleted; `PretextParagraph` import and the stray `<meta>` tag are gone; home section keeps its ghost-num-free heading (the name IS the heading).

- [ ] **Step 3: CSS — remove fights with GSAP, add new elements**

In `src/App.css`:
1. In `#greeting`, `#intro`, `#subtitle`, `#cta-button`, `.contact-logo` rules: DELETE the `transition: opacity 1s ease;` lines (GSAP owns these now; keep `opacity: 0`). In `.contact-logo`, keep the `transition: var(--transition)` for hover but move opacity transition out — final rule keeps `opacity: 0;` only.
2. DELETE the `#about { opacity: 0; transform: ...; transition: ... }` and `#about.slide-in-from-left { ... }` rules entirely.
3. DELETE the `h1.section-heading::after` rule (replaced by `.rule`).
4. Scale the hero: in `#intro` change `font-size` to `clamp(48px, 10vw, 140px)` and add `letter-spacing: -0.02em;`.
5. Add:

```css
.heading-text { display: inline-block; }

.rule {
  display: block;
  width: 300px;
  height: 1px;
  margin-left: 24px;
  background-color: rgba(255, 255, 255, 0.14);
  transform: scaleX(0);
  transform-origin: left;
}

.ghost-num {
  position: absolute;
  left: -0.05em;
  top: 50%;
  transform: translateY(-52%);
  font-family: 'Roboto Mono', monospace;
  font-size: clamp(110px, 18vw, 200px);
  font-weight: 500;
  color: rgba(255, 255, 255, 0.04);
  pointer-events: none;
  user-select: none;
  z-index: -1;
}

#about-text p {
  color: #d0d0d0;
  font-size: 18px;
  font-weight: 400;
  line-height: 1.6;
  margin: 0 0 1em;
  max-width: 600px;
}

#depth-line {
  position: fixed;
  top: 0;
  right: 0;
  width: 1px;
  height: 100vh;
  background: var(--primary-accent);
  opacity: 0.45;
  transform: scaleY(0);
  transform-origin: top;
  z-index: 1001;
  pointer-events: none;
}
```

6. DELETE the now-unused `#aboutme h4` rule.

- [ ] **Step 4: Delete Pretext**

```bash
rm src/components/PretextParagraph.tsx
npm uninstall @chenglou/pretext
```

- [ ] **Step 5: Verify** — build/lint green. Browse-check: reload → name rises character-by-character; scroll → headings mask in, rules draw, about lines cascade, ghost numerals (zoom screenshot; 4% opacity), depth line grows down the right edge. Reduced-motion emulation (`page.emulateMedia({ reducedMotion: 'reduce' })`): everything simply visible, no motion. Console clean. Screenshots: 3 sections × desktop.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "GSAP motion system: hero intro, SplitText reveals, ghost numerals, depth line; remove pretext"
```

---

### Task 8: Custom cursor + magnetic CTA + tilt + hover micro-interactions

**Files:**
- Create: `src/components/Cursor.tsx`
- Modify: `src/anim/reveals.ts` (add `initMagnetic`, `initTilt`), `src/App.tsx` (mount Cursor, call inits), `src/App.css`

- [ ] **Step 1: Write `src/components/Cursor.tsx`**

```tsx
// src/components/Cursor.tsx — mint dot + lagging ring; fine pointers only.
import { useEffect, useRef } from 'react'
import gsap from 'gsap'

const finePointer = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(pointer: fine)').matches &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!finePointer()) return
    const dot = dotRef.current!, ring = ringRef.current!
    gsap.set([dot, ring], { xPercent: -50, yPercent: -50 })
    const dx = gsap.quickTo(dot, 'x', { duration: 0.06, ease: 'power2.out' })
    const dy = gsap.quickTo(dot, 'y', { duration: 0.06, ease: 'power2.out' })
    const rx = gsap.quickTo(ring, 'x', { duration: 0.35, ease: 'power3.out' })
    const ry = gsap.quickTo(ring, 'y', { duration: 0.35, ease: 'power3.out' })

    const onMove = (e: PointerEvent) => {
      document.body.classList.add('cursor-on')
      dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY)
    }
    const onOver = (e: PointerEvent) => {
      const hot = (e.target as HTMLElement).closest('a, button, [data-magnetic], .project-panel')
      ring.classList.toggle('cursor-ring--hover', !!hot)
    }
    const onLeave = () => document.body.classList.remove('cursor-on')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerover', onOver)
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerover', onOver)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  if (!finePointer()) return null
  return (
    <>
      <div ref={dotRef} className="cursor-dot" aria-hidden="true" />
      <div ref={ringRef} className="cursor-ring" aria-hidden="true" />
    </>
  )
}
```

- [ ] **Step 2: Add `initMagnetic` and `initTilt` to `src/anim/reveals.ts`**

```ts
/** Elements with [data-magnetic] lean toward the cursor within their box. */
export function initMagnetic() {
  if (!window.matchMedia('(pointer: fine)').matches || reduced()) return
  document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach(el => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.4, ease: 'power3.out' })
    const yTo = gsap.quickTo(el, 'y', { duration: 0.4, ease: 'power3.out' })
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect()
      xTo((e.clientX - r.left - r.width / 2) * 0.3)
      yTo((e.clientY - r.top - r.height / 2) * 0.4)
    })
    el.addEventListener('pointerleave', () => { xTo(0); yTo(0) })
  })
}

/** Project cards tilt ≤4° toward the cursor. */
export function initTilt() {
  if (!window.matchMedia('(pointer: fine)').matches || reduced()) return
  document.querySelectorAll<HTMLElement>('.project-panel').forEach(card => {
    gsap.set(card, { transformPerspective: 800 })
    const rX = gsap.quickTo(card, 'rotationX', { duration: 0.5, ease: 'power3.out' })
    const rY = gsap.quickTo(card, 'rotationY', { duration: 0.5, ease: 'power3.out' })
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect()
      rY(((e.clientX - r.left) / r.width - 0.5) * 8)
      rX(-((e.clientY - r.top) / r.height - 0.5) * 8)
    })
    card.addEventListener('pointerleave', () => { rX(0); rY(0) })
  })
}
```

- [ ] **Step 3: Wire into App** — `import Cursor from "./components/Cursor"`, render `<Cursor />` next to the other overlay layers; in the `useEffect` after `initSectionReveals()` add `initMagnetic(); initTilt();`.

- [ ] **Step 4: CSS**

```css
/* Custom cursor — fine pointers only; native cursor hidden when active */
@media (pointer: fine) {
  body.cursor-on, body.cursor-on a, body.cursor-on button { cursor: none; }
}
.cursor-dot, .cursor-ring {
  position: fixed; top: 0; left: 0;
  border-radius: 50%; pointer-events: none; z-index: 10000;
  opacity: 0; transition: opacity 0.3s ease;
}
body.cursor-on .cursor-dot, body.cursor-on .cursor-ring { opacity: 1; }
.cursor-dot { width: 6px; height: 6px; background: var(--primary-accent); }
.cursor-ring {
  width: 28px; height: 28px;
  border: 1px solid rgba(100, 255, 218, 0.5);
  transition: opacity 0.3s ease, width 0.25s ease, height 0.25s ease, border-color 0.25s ease;
}
.cursor-ring--hover { width: 44px; height: 44px; border-color: rgba(100, 255, 218, 0.9); }
```

And REMOVE `transform: translateY(-10px);` from `.project-panel:hover` (GSAP owns the card transform now; keep the border/shadow lines). Add nav underline + marquee polish:

```css
nav a { position: relative; }
nav a::after {
  content: ""; position: absolute; left: 10px; right: 10px; bottom: 4px; height: 1px;
  background: var(--primary-accent);
  transform: scaleX(0); transform-origin: right;
  transition: transform 0.35s cubic-bezier(0.645, 0.045, 0.355, 1);
}
nav a:hover::after { transform: scaleX(1); transform-origin: left; }

#skills-bar:hover .skills-track { animation-play-state: paused; }
.skill-item:hover .skill-icon-container svg {
  filter: drop-shadow(0 0 6px rgba(100, 255, 218, 0.6));
}
```

- [ ] **Step 5: Verify** — build/lint green. Browse-check (desktop): ring lags dot; ring expands over CTA/nav/cards; CTA shifts toward cursor and springs back; cards tilt; marquee pauses on hover. Mobile viewport (375px): `page.emulateMedia` won't change pointer — instead assert `.cursor-dot` doesn't render under `--blink-settings` touch emulation (the existing Playwright launch flags already force `primaryPointerType=4`... verify on desktop config instead: temporarily evaluate `matchMedia('(pointer: fine)').matches` and confirm the component honors it). Console clean.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Custom cursor, magnetic CTA, card tilt, nav underline, marquee polish"
```

---

### Task 9: Grain overlay + final typography polish

**Files:**
- Modify: `src/App.tsx`, `src/App.css`

- [ ] **Step 1: Add the grain div to App (next to depth-line)**

```tsx
      <div id="grain" aria-hidden="true" />
```

- [ ] **Step 2: CSS**

```css
#grain {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9000;
  opacity: 0.035;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
```

Also final type polish in existing rules: `#subtitle` → add `font-weight: 400;` (replacing 600) and `letter-spacing: -0.01em;`; `h1.section-heading` → `font-size: clamp(28px, 5vw, 40px);` and add `overflow: visible;`.

- [ ] **Step 3: Verify** — build green; screenshot shows grain only on close zoom; text contrast unaffected.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Film grain overlay and typography polish"
```

---

### Task 10: Verification suite + mobile & reduced-motion pass

**Files:**
- Create: `scripts/verify.mjs`
- Modify: `src/App.css` (responsive fixes this pass surfaces)

- [ ] **Step 1: Write `scripts/verify.mjs`**

```js
// Headless verification: 3 viewports × {default, reduced-motion}; console; FPS.
// Run: node scripts/verify.mjs  (dev server must be on :5180)
import { chromium } from '/home/demon/.claude/skills/gstack/node_modules/playwright/index.mjs'

const URL = 'http://localhost:5180/'
const VIEWPORTS = [
  ['desktop', { width: 1440, height: 900 }],
  ['tablet', { width: 768, height: 1024 }],
  ['mobile', { width: 375, height: 812 }],
]

const browser = await chromium.launch({ chromiumSandbox: false, args: ['--no-sandbox'] })
let failures = 0

for (const [name, viewport] of VIEWPORTS) {
  for (const rm of [false, true]) {
    const ctx = await browser.newContext({ viewport, reducedMotion: rm ? 'reduce' : 'no-preference' })
    const page = await ctx.newPage()
    const errors = []
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', e => errors.push(e.message))

    await page.goto(URL, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2500)
    const tag = `${name}${rm ? '-rm' : ''}`
    await page.screenshot({ path: `/tmp/verify-${tag}-home.png` })
    for (const sec of ['about', 'portfolio']) {
      await page.evaluate(id => document.getElementById(id)?.scrollIntoView({ behavior: 'auto' }), sec)
      await page.waitForTimeout(2000)
      await page.screenshot({ path: `/tmp/verify-${tag}-${sec}.png` })
    }

    // FPS while scrolling (desktop default only)
    if (name === 'desktop' && !rm) {
      await page.evaluate(() => window.scrollTo(0, 0))
      const fps = await page.evaluate(() => new Promise(res => {
        let frames = 0
        const t0 = performance.now()
        const step = () => {
          frames++
          window.scrollBy(0, 12)
          if (performance.now() - t0 < 3000) requestAnimationFrame(step)
          else res(Math.round(frames / 3))
        }
        requestAnimationFrame(step)
      }))
      console.log(`FPS during scroll: ${fps}`)
      if (fps < 45) { console.log('FAIL: fps < 45'); failures++ }
    }

    if (errors.length) { console.log(`FAIL ${tag}: console errors`, errors.slice(0, 5)); failures++ }
    else console.log(`PASS ${tag}`)
    await ctx.close()
  }
}
await browser.close()
process.exit(failures ? 1 : 0)
```

- [ ] **Step 2: Run it and read every screenshot**

Run: `node scripts/verify.mjs` (Bash with sandbox disabled, dev server running). Expected: 6× PASS, FPS ≥ 45 (target 60; headless software rendering reads lower than real hardware — investigate only if < 45).
Then Read all 18 `/tmp/verify-*.png` files. Checklist per screenshot: no overlapping text, ghost numerals not clipping headings on 375px, fish not covering content, depth line visible, reduced-motion variants show full content with no half-revealed (opacity-0) elements.

- [ ] **Step 3: Fix what the screenshots surface**

Expected mobile fixes (apply the ones that prove necessary, in the existing `@media` blocks of `App.css`):

```css
@media screen and (max-width: 768px) {
  .ghost-num { font-size: 90px; }
  .rule { width: 80px; margin-left: 14px; }
  #depth-line { display: none; }
  #intro { font-size: clamp(44px, 13vw, 64px); }
}
```

- [ ] **Step 4: Lighthouse (best effort)**

```bash
npm run build && npm run preview -- --port 5181 &
npx lighthouse http://localhost:5181 --quiet --chrome-flags="--headless --no-sandbox" \
  --only-categories=performance --form-factor=mobile --output=json --output-path=/tmp/lh.json \
  && node -e "console.log('perf score:', JSON.parse(require('fs').readFileSync('/tmp/lh.json')).categories.performance.score * 100)"
```

Expected: score ≥ 90. If lighthouse cannot launch on this machine, substitute: Playwright CDP `Performance.getMetrics` + verify gzip bundle delta ≤ 160KB via `du dist/assets`. Record whichever result in the commit message.

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "Add verification script; mobile and reduced-motion fixes"
```

---

### Task 11: Lint, full review, merge prep

- [ ] **Step 1:** `npm run lint && npm run build` — both green, zero warnings introduced (the pre-existing PretextParagraph warning is gone with the file).
- [ ] **Step 2:** `git diff master --stat` — review for stray debug code, console.logs, dead CSS (e.g. confirm `#aboutme h4`, `slide-in-from-left` are gone).
- [ ] **Step 3:** Run `scripts/verify.mjs` once more end-to-end. All PASS.
- [ ] **Step 4:** Present branch to user for review/merge decision (do not merge or push without the user).

---

## Self-review notes

- **Spec coverage:** caustics/rays/depth/hue (T4), particles+parallax (T5), ripples click+cursor (T4, pond T2), fish startle/curiosity/investigate/migration (T6), SplitText reveals + hero + ghost numerals + rules + depth line (T7), cursor/magnetic/tilt/nav/marquee (T8), grain (T9), Pretext removal (T7), Lenis (T3), reduced motion + touch + DPR + visibility pause + context loss (T2/T4/T6/T8), verification matrix + Lighthouse (T10). Skills marquee kept (unchanged markup, polish in T8). Error handling: WebGL death → `setDead` + CSS body-gradient fallback (T4).
- **Type consistency:** `pond`/`initPond`/`tickPond`/`PondRipple`/`RIPPLE_LIFE_S` (T2) match usages in T4/T5/T6. `scrollToSection`/`lenis` (T3) match T7 App.tsx. `heroIntro`/`initSectionReveals`/`initMagnetic`/`initTilt` (T7/T8) match App.tsx wiring.
- **Known judgment calls:** shader constants (opacities, speeds) are starting values — tasks instruct visual verification and tuning is expected; headless FPS threshold set at 45 because software GL underreports real hardware.
