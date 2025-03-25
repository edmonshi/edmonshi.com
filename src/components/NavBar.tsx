
interface NavBarProps {
  sections: string[];
}


function NavBar({sections}: NavBarProps) {
  return (
    <nav>
      {sections.map((e) => (
        <a href={"#"+e} key={e}>{e.charAt(0).toUpperCase()+e.substring(1)}</a>
      ))}
    </nav>
  )
}

export default NavBar