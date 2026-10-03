// src/components/ProjectTimeline.tsx
// Desktop: a horizontal timeline pinned by ScrollTrigger — vertical page scroll
// scrubs the track left/right. Each project has an expanded detail card
// (video + description + tags) below its node on the axis.
// Touch / narrow / reduced-motion: falls back to the stacked card grid.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import ProjectPanel from './ProjectPanel'
import ProjectMedia from './ProjectMedia'
import { lenis } from '../anim/useLenis'
import { ChessIcon, OrbitIcon, AutomataIcon, CombadgeIcon } from './AnimatedIcons'
import combadgeImage from '../assets/combadge.jpg'
import automataVideo from '../assets/cellular-automata.mp4'
import celestialVideo from '../assets/celestial-simulator.mp4'
import chessboardVideo from '../assets/chessboard.mp4'

gsap.registerPlugin(ScrollTrigger)

interface Project {
  title: string
  year: string
  description: string
  projectUrl: string
  tags: string[]
  videoUrl?: string
  imageUrl?: string
  demoUrl?: string
  icon: ReactNode
  pos: number // 0..1 position along the track
}

// Chronological, left → right (oldest → newest)
const PROJECTS: Project[] = [
  {
    title: 'Cellular Automata',
    year: '2023',
    pos: 0.14, // track positions: oldest near left, newest scrolls to center
    icon: <AutomataIcon />,
    videoUrl: automataVideo,
    description: "A simulator for various cellular automata rulesets, including Conway's Game of Life and Brian's Brain.",
    projectUrl: 'https://github.com/edmonshi/Cellular-Automata-Simulator',
    tags: ['Java', 'JavaFX', 'Simulation'],
  },
  {
    title: 'Celestial Simulator',
    year: '2024',
    pos: 0.36,
    icon: <OrbitIcon />,
    videoUrl: celestialVideo,
    description: '3D N-Body gravity simulation with Barnes-Hut optimization. Visualizes gravitational fields in real-time.',
    projectUrl: 'https://github.com/tran-ethan/celestial-simulator',
    tags: ['Java', 'JavaFX', 'Physics'],
  },
  {
    title: 'Autonomous Chessboard',
    year: '2024',
    pos: 0.58,
    icon: <ChessIcon />,
    videoUrl: chessboardVideo,
    description: 'A robotic chessboard that tracks pieces using Hall effect sensors and plays against humans using Stockfish. Features a CoreXY motion system.',
    projectUrl: 'https://git.uwaterloo.ca/b27dai/se101_group_project',
    tags: ['C', 'JS', 'WebSockets', 'Robotics'],
  },
  {
    title: 'Combadge',
    year: '2026',
    pos: 0.8,
    icon: <CombadgeIcon />,
    imageUrl: combadgeImage,
    demoUrl: 'https://www.youtube.com/watch?v=ZbD7XTCFx-I',
    description: 'A Star Trek-inspired wearable AI communicator built on Raspberry Pi 5 and QNX. Combines voice, camera vision, and tools for web search, email, calendars, and shopping. Hack the North 2026 winner and QNX award winner.',
    projectUrl: 'https://devpost.com/software/combadge',
    tags: ['C', 'Python', 'QNX', 'Raspberry Pi', 'OpenAI'],
  },
]

const HORIZONTAL_QUERY = '(min-width: 900px) and (min-height: 620px) and (pointer: fine)'

function Station({ p }: { p: Project }) {
  return (
    <div
      className="tl-station"
      style={{ left: `${p.pos * 100}%` }}
    >
      <a className="tl-label" href={p.projectUrl} target="_blank" rel="noopener noreferrer">
        <span className="tl-year">{p.year}</span>
        <span className="tl-name">{p.icon}{p.title}</span>
      </a>
      <span className="tl-connector" aria-hidden="true" />
      <span className="tl-node" aria-hidden="true" />
      <span className="tl-connector-down" aria-hidden="true" />
      <div className="tl-card">
        <ProjectMedia key={p.videoUrl??p.imageUrl} className="tl-card-media" title={p.title}
          src={p.videoUrl??p.imageUrl??''} video={!!p.videoUrl} />
        <p className="tl-card-desc">{p.description}</p>
        <div className="tl-card-tags">
          {p.tags.map(t => <span key={t} className="tech-tag">{t}</span>)}
        </div>
        {p.demoUrl && <a className="project-demo" href={p.demoUrl} target="_blank" rel="noopener noreferrer">Watch demo &rarr;</a>}
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
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const mq = window.matchMedia(HORIZONTAL_QUERY)
    const update = () => setHorizontal(mq.matches && !reduced.matches)
    update()
    mq.addEventListener('change', update)
    reduced.addEventListener('change', update)
    return () => {
      mq.removeEventListener('change', update)
      reduced.removeEventListener('change', update)
    }
  }, [])

  // Pin the section and scrub the track horizontally with scroll.
  useEffect(() => {
    if (!horizontal) return
    const section = sectionRef.current!
    const track = trackRef.current!
    // Reach the end marker as well as the final expanded project card.
    const endTravel = () => {
      const endpoint = track.querySelector<HTMLElement>('.tl-end')
      const viewport = track.parentElement
      if (!endpoint || !viewport) return 0
      return Math.max(0, endpoint.offsetLeft - viewport.clientWidth / 2)
    }
    const TAIL = 0.18
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: () => '+=' + (endTravel() / (1 - TAIL)),
          pin: true,
          scrub: 0.6,
          invalidateOnRefresh: true,
          anticipatePin: 1,
        },
      })
      tl.to(track, { x: () => -endTravel(), ease: 'none', duration: 1 - TAIL })
        .to(track, { x: () => -endTravel(), ease: 'none', duration: TAIL }) // hold centered
    }, section)
    ScrollTrigger.refresh()
    lenis?.resize()
    return () => { ctx.revert(); lenis?.resize() }
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
              // fixed-width, and the viewport is a fixed max-width,
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
              imageUrl={p.imageUrl}
              demoUrl={p.demoUrl}
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
