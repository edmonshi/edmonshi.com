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
    // Native drag and selection gestures hand cursor control to the OS
    // (Chromium shows the grab/pointer cursor mid-press regardless of CSS).
    // Kill both at the document level; prose stays selectable.
    const onDragStart = (e: Event) => e.preventDefault()
    const onSelectStart = (e: Event) => {
      const t = e.target as HTMLElement
      if (!t.closest?.('#about-text, .panel-description, footer')) e.preventDefault()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerover', onOver)
    document.documentElement.addEventListener('pointerleave', onLeave)
    document.addEventListener('dragstart', onDragStart)
    document.addEventListener('selectstart', onSelectStart)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerover', onOver)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('dragstart', onDragStart)
      document.removeEventListener('selectstart', onSelectStart)
      document.body.classList.remove('cursor-on')
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
