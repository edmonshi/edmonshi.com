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
    const distance = () => Math.max(0, track.scrollWidth - window.innerWidth)
    const ctx = gsap.context(() => {
      gsap.to(track, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: () => '+=' + distance(),
          pin: true,
          scrub: 0.6,
          invalidateOnRefresh: true,
          anticipatePin: 1,
        },
      })
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
