// src/components/ProjectTimeline.tsx
// Desktop: a horizontal timeline pinned by ScrollTrigger — vertical page scroll
// scrubs the track left/right. Each project is a node on the axis; hovering its
// name unfolds a detail card (video + description + tags) below the axis.
// Touch / narrow / reduced-motion: falls back to the stacked card grid.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import ProjectPanel from './ProjectPanel'
import { ChessIcon, OrbitIcon, AutomataIcon } from './AnimatedIcons'

gsap.registerPlugin(ScrollTrigger)

interface Project {
  title: string
  year: string
  description: string
  projectUrl: string
  tags: string[]
  videoUrl: string
  icon: ReactNode
  pos: number // 0..1 position along the track
}

// Chronological, left → right (oldest → newest)
const PROJECTS: Project[] = [
  {
    title: 'Cellular Automata',
    year: '2023',
    pos: 0.16, // track positions: oldest near left, newest scrolls to center
    icon: <AutomataIcon />,
    videoUrl: 'https://github.com/user-attachments/assets/e8ad756c-e660-4cc6-a8f8-0787dc30417c',
    description: "A simulator for various cellular automata rulesets, including Conway's Game of Life and Brian's Brain.",
    projectUrl: 'https://github.com/edmonshi/Cellular-Automata-Simulator',
    tags: ['Java', 'JavaFX', 'Simulation'],
  },
  {
    title: 'Celestial Simulator',
    year: '2024',
    pos: 0.45,
    icon: <OrbitIcon />,
    videoUrl: 'https://github.com/exisodd/celestial-simulator/assets/96459404/30d4bb50-aad8-489f-a7cc-1052034a7dfe',
    description: '3D N-Body gravity simulation with Barnes-Hut optimization. Visualizes gravitational fields in real-time.',
    projectUrl: 'https://github.com/tran-ethan/celestial-simulator',
    tags: ['Java', 'JavaFX', 'Physics'],
  },
  {
    title: 'Autonomous Chessboard',
    year: '2024',
    pos: 0.74,
    icon: <ChessIcon />,
    videoUrl: '/chessboard.mp4',
    description: 'A robotic chessboard that tracks pieces using Hall effect sensors and plays against humans using Stockfish. Features a CoreXY motion system.',
    projectUrl: 'https://git.uwaterloo.ca/b27dai/se101_group_project',
    tags: ['C', 'JS', 'WebSockets', 'Robotics'],
  },
]

const HORIZONTAL_QUERY = '(min-width: 900px) and (pointer: fine)'

function Station({ p }: { p: Project }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  return (
    <div
      className="tl-station"
      style={{ left: `${p.pos * 100}%` }}
      onMouseEnter={() => videoRef.current?.play().catch(() => {})}
      onMouseLeave={() => videoRef.current?.pause()}
    >
      <a className="tl-label" href={p.projectUrl} target="_blank" rel="noopener noreferrer">
        <span className="tl-year">{p.year}</span>
        <span className="tl-name">{p.icon}{p.title}</span>
      </a>
      <span className="tl-connector" aria-hidden="true" />
      <span className="tl-node" aria-hidden="true" />
      <span className="tl-connector-down" aria-hidden="true" />
      <div className="tl-card">
        <div className="tl-card-media">
          <video ref={videoRef} src={p.videoUrl} loop muted playsInline preload="none" />
        </div>
        <p className="tl-card-desc">{p.description}</p>
        <div className="tl-card-tags">
          {p.tags.map(t => <span key={t} className="tech-tag">{t}</span>)}
        </div>
      </div>
    </div>
  )
}

export default function ProjectTimeline() {
  const sectionRef = useRef<HTMLElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [horizontal, setHorizontal] = useState(false)

  // Decide layout mode at mount and on viewport/pointer changes.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const mq = window.matchMedia(HORIZONTAL_QUERY)
    const update = () => setHorizontal(mq.matches && !reduced)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Pin the section and scrub the track horizontally with scroll.
  useEffect(() => {
    if (!horizontal) return
    const section = sectionRef.current!
    const track = trackRef.current!
    // Translate just enough to bring the LAST node to window center. A station's
    // offsetLeft is its node point (the -50% transform doesn't affect layout
    // offset); the track sits inside .tl-viewport, which is inset from the window
    // edges by the page container, so fold that inset in or the node lands short.
    const centerLast = () => {
      const stations = track.querySelectorAll<HTMLElement>('.tl-station')
      const last = stations[stations.length - 1]
      if (!last) return 0
      const inset = (track.parentElement?.getBoundingClientRect().left) ?? 0
      return Math.max(0, inset + last.offsetLeft - window.innerWidth / 2)
    }
    // A trailing "dwell": extra pinned scroll where the track holds at the centered
    // end, so scrub (which lags ~0.6s) actually settles there and you can rest on
    // the last project instead of it scrolling past at ~62% before catching up.
    const TAIL = 0.18
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: () => '+=' + (centerLast() / (1 - TAIL)),
          pin: true,
          scrub: 0.6,
          invalidateOnRefresh: true,
          anticipatePin: 1,
        },
      })
      tl.to(track, { x: () => -centerLast(), ease: 'none', duration: 1 - TAIL })
        .to(track, { x: () => -centerLast(), ease: 'none', duration: TAIL }) // hold centered
    }, section)
    ScrollTrigger.refresh()
    return () => ctx.revert()
  }, [horizontal])

  return (
    <section id="portfolio" ref={sectionRef} className={horizontal ? 'is-timeline' : ''}>
      <h1 className="section-heading">
        <span className="ghost-num" aria-hidden="true">03</span>
        <span className="heading-text">Some Things I've Built</span>
        <span className="rule" aria-hidden="true" />
      </h1>

      {horizontal ? (
        <div className="tl-viewport">
          <div className="tl-track" ref={trackRef}>
            <div className="tl-axis" aria-hidden="true" />
            {PROJECTS.map(p => <Station key={p.title} p={p} />)}
            <div
              className="tl-end"
              aria-hidden="true"
              // Fixed px gap from the last project, not a track %: the track is
              // 190vw (scales with window) but the viewport is a fixed max-width,
              // so a % offset clips off-screen on wide (1440p+) monitors.
              style={{ left: `calc(${PROJECTS[PROJECTS.length - 1].pos * 100}% + 260px)` }}
            >
              <span className="tl-end-label">more to come&hellip;</span>
              <span className="tl-end-node" />
            </div>
          </div>
          <span className="tl-hint" aria-hidden="true">scroll to explore &rarr;</span>
        </div>
      ) : (
        <div id="projects">
          {[...PROJECTS].reverse().map(p => (
            <ProjectPanel
              key={p.title}
              className="project-panel"
              title={p.title}
              icon={p.icon}
              year={p.year}
              videoUrl={p.videoUrl}
              description={p.description}
              projectUrl={p.projectUrl}
              tags={p.tags}
            />
          ))}
        </div>
      )}
    </section>
  )
}
