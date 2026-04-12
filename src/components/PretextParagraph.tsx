import { useRef, useState, useLayoutEffect, useCallback } from 'react'
import { prepare, layout } from '@chenglou/pretext'

type Props = {
  text: string
  font: string
  lineHeight: number
  animate?: boolean
  staggerMs?: number
}

export default function PretextParagraph({ text, font, lineHeight, animate = false, staggerMs = 150 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const paragraphs = text.split('\n\n')
  const [heights, setHeights] = useState<number[]>([])

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const width = el.clientWidth
    setHeights(paragraphs.map(p => {
      const prepared = prepare(p, font)
      return layout(prepared, width, lineHeight).height
    }))
  }, [text, font, lineHeight])

  useLayoutEffect(() => {
    measure()
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  useLayoutEffect(() => {
    document.fonts.ready.then(measure)
  }, [measure])

  return (
    <div ref={ref} style={{ lineHeight: `${lineHeight}px`, overflowWrap: 'break-word' }}>
      {paragraphs.map((para, i) => (
        <div
          key={i}
          style={{
            opacity: animate ? 1 : 0,
            transform: animate ? 'none' : 'translateY(12px)',
            transition: `opacity 0.5s ease-out ${i * staggerMs}ms, transform 0.5s ease-out ${i * staggerMs}ms`,
            height: heights[i],
            marginBottom: i < paragraphs.length - 1 ? lineHeight : 0,
          }}
        >
          {para}
        </div>
      ))}
    </div>
  )
}
