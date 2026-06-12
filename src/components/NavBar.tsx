import { scrollToSection } from '../anim/useLenis'

interface NavBarProps {
  sections: string[];
}

function NavBar({ sections }: NavBarProps) {
  return (
    <nav>
      {sections.map((e, index) => (
        <a
          key={e}
          href={`#${e}`}
          draggable={false}
          onClick={(ev) => { ev.preventDefault(); scrollToSection(e); }}
        >
          <span style={{ color: 'var(--primary-accent)', marginRight: '5px', fontSize: '12px' }}>
            0{index + 1}.
          </span>
          {e.charAt(0).toUpperCase() + e.substring(1)}
        </a>
      ))}
    </nav>
  )
}

export default NavBar