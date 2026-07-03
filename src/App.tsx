import "./App.css";
import NavBar from "./components/NavBar";
import ProjectTimeline from "./components/ProjectTimeline";
import { lazy, Suspense, useEffect } from "react";
import { skills } from "./data/skills";
import ASCIIKoiPond from "./components/ASCIIKoiPond";
const WaterScene = lazy(() => import("./components/WaterScene"));
import { initPond } from "./anim/pond";
import { useLenis, scrollToSection } from "./anim/useLenis";
import { initMotion } from "./anim/reveals";

const sections = ["home", "about", "portfolio"];
const aboutParagraphs = [
  "Hello! I'm Edmon, a Software Engineering student at the University of Waterloo.",
  "I've been building software since 2019, and what keeps me hooked is the art of taking simple, solid pieces and stacking them into something beautiful.",
  "There's a quiet thrill in watching small, well-made parts come together into something that feels effortless to use. That's the work I keep chasing.",
  "Away from the screen, I'm a swimmer and fisherman, happiest when I'm in the water.",
  "I'm hunting for what's next: a Fall 2026 co-op where I can do my best work. Building something worth chasing? Let's talk.",
];

// Perf-diagnostic toggles: append ?water=off / ?fish=off / ?smooth=off to the URL
// to disable a layer and isolate what costs frames on a given machine.
const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
const SHOW_WATER = params.get('water') !== 'off';
const SHOW_FISH = params.get('fish') !== 'off';

const App: React.FC = () => {
  useLenis();

  useEffect(() => {
    const cleanupPond = initPond();
    const cleanupMotion = initMotion();
    return () => { cleanupMotion(); cleanupPond(); };
  }, []);

  return (
    <div className="App">
      <header>
        <div className="logo">
          <h3>ES</h3>
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <NavBar sections={sections} />
        </div>
      </header>

      <main>
        <section id="home">
          <p id="greeting">Hi, my name is</p>
          <h1 id="intro">Edmon Shi.</h1>
          <h2 id="subtitle">Software Engineering Student at the University of Waterloo.</h2>
          <a href="#portfolio" id="cta-button" className="primary-button" data-magnetic
            onClick={(e) => { e.preventDefault(); scrollToSection("portfolio"); }}>
            See what I've built
          </a>
          <div id="contact">
            <a href="mailto:edmonshi0614@gmail.com" target="_blank" rel="noreferrer">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="contact-logo">
                <path d="M64 112c-8.8 0-16 7.2-16 16l0 22.1L220.5 291.7c20.7 17 50.4 17 71.1 0L464 150.1l0-22.1c0-8.8-7.2-16-16-16L64 112zM48 212.2L48 384c0 8.8 7.2 16 16 16l384 0c8.8 0 16-7.2 16-16l0-171.8L322 328.8c-38.4 31.5-93.7 31.5-132 0L48 212.2zM0 128C0 92.7 28.7 64 64 64l384 0c35.3 0 64 28.7 64 64l0 256c0 35.3-28.7 64-64 64L64 448c-35.3 0-64-28.7-64-64L0 128z" />
              </svg>
            </a>
            <a href="https://www.github.com/edmonshi/" target="_blank" rel="noreferrer">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" className="contact-logo">
                <path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3 .3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5 .3-6.2 2.3zm44.2-1.7c-2.9 .7-4.9 2.6-4.6 4.9 .3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8z" />
              </svg>
            </a>
            <a href="https://www.linkedin.com/in/edmonshi/" target="_blank" rel="noreferrer">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" className="contact-logo">
                <path d="M416 32H31.9C14.3 32 0 46.5 0 64.3v383.4C0 465.5 14.3 480 31.9 480H416c17.6 0 32-14.5 32-32.3V64.3c0-17.8-14.4-32.3-32-32.3zM135.4 416H69V202.2h66.5V416zm-33.2-243c-21.3 0-38.5-17.3-38.5-38.5S80.9 96 102.2 96c21.2 0 38.5 17.3 38.5 38.5 0 21.3-17.2 38.5-38.5 38.5zm282.1 243h-66.4V312c0-24.8-.5-56.7-34.5-56.7-34.6 0-39.9 27-39.9 54.9V416h-66.4V202.2h63.7v29.2h.9c8.9-16.8 30.6-34.5 62.9-34.5 67.2 0 79.7 44.3 79.7 101.9V416z" />
              </svg>
            </a>
          </div>
        </section>

        <section id="about">
          <h1 className="section-heading">
            <span className="ghost-num" aria-hidden="true">02</span>
            <span className="heading-text">About Me</span>
            <span className="rule" aria-hidden="true" />
          </h1>
          <div id="aboutme">
            <div id="about-text">
              {aboutParagraphs.map((p, i) => (<p key={i}>{p}</p>))}
            </div>
            <img src="/photo.jpg" id="headshot" alt="Edmon Shi" />
          </div>
          <div id="skills-bar">
            <div className="skills-track">
              {[...skills, ...skills].map((skill, index) => (
                <span key={index} className="skill-item">
                  <div className="skill-icon-container">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d={skill.path} fill={skill.color} fillRule="evenodd" />
                    </svg>
                  </div>
                  {skill.name}
                </span>
              ))}
            </div>
          </div>
        </section>

        <ProjectTimeline />
      </main>

      <footer>
        <p>Made with 🗿 by Edmon Shi</p>
        <p className="footer-tech">React · Three.js · GSAP — and one very territorial betta</p>
      </footer>
      <div id="grain" aria-hidden="true" />
      <div id="depth-line" aria-hidden="true" />
      {SHOW_FISH && <ASCIIKoiPond />}
      {SHOW_WATER && <Suspense fallback={null}><WaterScene /></Suspense>}
    </div>
  );
};

export default App;
