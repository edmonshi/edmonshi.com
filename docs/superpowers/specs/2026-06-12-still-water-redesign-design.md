# Still Water — Portfolio Redesign Design

**Date:** 2026-06-12
**Status:** Approved direction, pending spec review

## Goal

Redesign the existing single-page portfolio into an awwwards-caliber experience while
preserving the site's identity: minimalism, black/grey palette with mint (`#64ffda`)
accent, and details that reward attention. Content stays the same (Home, About,
3 projects). No pinned scrollytelling — smooth, subtle scroll with refined reveals.

## Concept

The page is a pond viewed from inside. The top of the page is the surface — faint
light rays filter down through the hero. Scrolling descends into the water: the
background grows subtly darker and calmer until the footer rests at the pond floor.
The existing ASCII betta fish lives in this water and reacts to the visitor.

"Immersive" means atmosphere, not noise. All water effects sit at low opacity
(~3–8%), noticeable only when you look.

## Stack

| Library | Role |
|---|---|
| `three` | Background water scene (caustics, rays, particles, ripples) |
| `gsap` (+ ScrollTrigger, SplitText) | All DOM animation: reveals, magnetic CTA, tilt. SplitText is free as of GSAP 3.13 |
| `lenis` | Smooth scrolling, integrated with ScrollTrigger |

Removed: `@chenglou/pretext` (replaced by GSAP SplitText for one consistent motion
system). React 19 + Vite + TypeScript stay. JS budget: ≤ +160KB gzip over current.

## Layer architecture (back to front)

1. **WebGL water canvas** — `WaterScene.tsx`. Single fixed full-viewport canvas,
   one quad with a fragment shader plus a particle system:
   - Procedural caustics shimmer, ~6% opacity, slow (period ≥ 8s). Hue drifts ±5°
     over several minutes.
   - God rays: soft vertical light shafts, strongest at scroll position 0,
     fading to nothing by the About section.
   - Depth gradient: scene darkens slightly as scroll progresses (surface → floor).
   - ~150 floating dust/plankton particles (desktop), parallax against scroll and
     cursor.
   - Cursor ripples: moving the cursor gently distorts the caustics; clicking
     spawns a visible expanding ripple ring.
2. **ASCII betta fish** — existing `ASCIIKoiPond.tsx` engine is kept (the 729-line
   custom renderer is the site's signature; no port to Three.js). It gains a
   behavior module:
   - *Cursor awareness:* darts away from fast cursor movement near it; drifts
     curiously toward an idle cursor; swims to investigate click-ripples.
   - *Scroll migration:* each section defines a preferred region; the fish swims
     there as sections enter view, never overlapping primary content.
3. **Content** — existing copy, headshot, skills marquee, 3 project panels,
   restyled per "Typography & motion" below.
4. **Foreground** — film grain overlay at ~3% opacity (CSS or tiny canvas), and a
   custom cursor: 6px mint dot + lagging ~28px ring; ring expands over
   interactive elements. Hidden entirely on touch devices.

## Typography & motion language

- Fonts stay: Inter (body), Roboto Mono (labels/accents).
- Hero name scales to ~`clamp(48px, 10vw, 140px)` with per-character masked rise
  on load; subtitle follows with a line mask.
- Section headings: same per-char masked rise, triggered on scroll-in.
- Oversized ghost numerals (01 / 02 / 03) behind section headings at ~4% opacity.
- Thin horizontal rules draw in (scaleX 0→1) on scroll.
- About paragraph: line-by-line masked stagger via SplitText (replaces
  PretextParagraph).
- Nav links: mint underline slides in on hover.
- CTA button: magnetic — translates toward cursor within ~60px radius, springs
  back on leave.
- Project cards: tilt ≤4° toward cursor, video brightens on hover, tags stagger in.
- Skills marquee kept, refined: pauses on hover, subtle mint glow on hovered icon.
- Scroll progress: 1px mint "depth line" along the right viewport edge.
- One easing vocabulary (e.g. `power3.out` for reveals, `expo.out` for masks)
  defined once in `src/anim/reveals.ts` and reused everywhere.

## Component layout

```
src/
  anim/
    reveals.ts        # shared GSAP helpers, eases, durations
    useLenis.ts       # lenis init + ScrollTrigger sync
    useCursor.ts      # cursor state (pos, velocity, hover target)
  components/
    WaterScene.tsx    # Three.js layer
    Cursor.tsx        # custom cursor dot + ring
    ASCIIKoiPond.tsx  # existing engine + new behavior module
    NavBar.tsx, ProjectPanel.tsx, AnimatedIcons.tsx  # restyled
  App.tsx, App.css
```

Deleted: `PretextParagraph.tsx`.

The fish behavior module and WaterScene communicate through a tiny shared store
(plain module with subscribe, no new state library): cursor position/velocity,
scroll depth, last click-ripple. Both canvases read from it; React owns neither
loop.

## Mobile & accessibility

- Touch devices: no custom cursor, no card tilt, no magnetic CTA. Tap creates a
  ripple and the fish reacts to it. Fish scaled down; particle count halved
  (~75); DPR capped at 2 (1.5 on low-end via `navigator.hardwareConcurrency < 4`).
- `prefers-reduced-motion`: static dim background (no caustics animation, no
  rays, no ripples), fish idles slowly with no darting, all text reveals become
  simple fades or instant.
- SplitText keeps original text accessible (aria handling built in); all content
  remains real selectable DOM text.
- RAF loops pause when the tab is hidden (`visibilitychange`) and when their
  canvas is fully offscreen.

## Performance targets & verification

- 60fps desktop, no long tasks > 50ms during idle scroll.
- Lighthouse performance ≥ 90 on mobile emulation.
- Verified with headless Chrome DevTools: screenshots at desktop (1440px),
  tablet (768px), mobile (375px); console clean; FPS sampled via the
  Performance API during scroll; `prefers-reduced-motion` emulation checked.

## Error handling

- WebGL unavailable (or context lost): WaterScene unmounts silently; site runs
  with fish + static gradient background only.
- Font load failure: SplitText `autoSplit` re-splits after `document.fonts.ready`.

## Testing

- `npm run build` and `npm run lint` stay green.
- Manual verification matrix (headless DevTools): 3 viewports × {default,
  reduced-motion} for each section's reveal, cursor behaviors, fish behaviors,
  ripple on click/tap.

## Out of scope

- New content/sections, per-project detail pages, contact form.
- Konami-style easter eggs (possible follow-up).
- Compressing/relocating `public/chessboardrobot.MOV` (separate task).
