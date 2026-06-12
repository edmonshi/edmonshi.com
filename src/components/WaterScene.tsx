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
