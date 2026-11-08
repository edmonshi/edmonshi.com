export interface Project {
  title: string
  year: string
  blurb: string
  description: string
  projectUrl: string
  tags: string[]
}

export interface Job { company: string; role: string; year: string; url?: string; description: string }

// Newest first. Source: resume, Nov 2026.
export const EXPERIENCE: Job[] = [
  {
    company: '8090 Solutions',
    role: 'Member of Technical Staff',
    year: 'Sep – Dec 2026',
    url: 'https://8090.inc',
    description: 'Building the foundations that let cloud coding agents ship end-to-end on enterprise apps: isolated dev environments with seeded data, migration safety checks, preview environments, and matching CI.',
  },
  {
    company: 'Inference Health',
    role: 'Software Engineer',
    year: 'Jan – Aug 2026',
    url: 'https://inferencehealth.com',
    description: 'Architected a voice-AI pipeline (Twilio, LiveKit, Deepgram, ElevenLabs) handling ~1,000 patient calls a month, shipped a patient messaging portal from scratch, and built the tooling that onboarded 3 new clinics.',
  },
  {
    company: 'Speech Community Elmira',
    role: 'Web Developer & Marketing',
    year: 'Jun – Aug 2025',
    description: 'Designed, built, and maintained the organization’s website, and ran its marketing. Remote co-op.',
  },
]

// Newest first.
export const PROJECTS: Project[] = [
  {
    title: 'Combadge',
    year: '2026',
    blurb: 'wearable AI communicator',
    description: 'A Star Trek-inspired wearable AI communicator built on Raspberry Pi 5 and QNX. Combines voice, camera vision, and tools for web search, email, calendars, and shopping. Hack the North 2026 winner and QNX award winner.',
    projectUrl: 'https://devpost.com/software/combadge',
    tags: ['C', 'Python', 'QNX', 'Raspberry Pi', 'OpenAI'],
  },
  {
    title: 'Autonomous Chessboard',
    year: '2024',
    blurb: 'robot that plays you back',
    description: 'A robotic chessboard that tracks pieces using Hall effect sensors and plays against humans using Stockfish. Features a CoreXY motion system.',
    projectUrl: 'https://git.uwaterloo.ca/b27dai/se101_group_project',
    tags: ['C', 'JS', 'WebSockets', 'Robotics'],
  },
  {
    title: 'Celestial Simulator',
    year: '2024',
    blurb: 'n-body gravity in 3D',
    description: '3D N-Body gravity simulation with Barnes-Hut optimization. Visualizes gravitational fields in real-time.',
    projectUrl: 'https://github.com/tran-ethan/celestial-simulator',
    tags: ['Java', 'JavaFX', 'Physics'],
  },
  {
    title: 'Cellular Automata',
    year: '2023',
    blurb: 'life-like rule simulator',
    description: "A simulator for various cellular automata rulesets, including Conway's Game of Life and Brian's Brain.",
    projectUrl: 'https://github.com/edmonshi/Cellular-Automata-Simulator',
    tags: ['Java', 'JavaFX', 'Simulation'],
  },
]
