import "./App.css";
import NavBar from "./components/NavBar";
import ProjectPanel from "./components/ProjectPanel";
import ParticlesBg from 'particles-bg'
import { useEffect } from 'react';

const sections = ["home", "about", "portfolio"];

const App: React.FC = () => {
  useEffect(() => {
    //Landing page animations
    const fadeIn = (selector: string, delay: number) => {
      setTimeout(() => {
        const el = document.querySelector(selector);
        if (el) (el as HTMLElement).style.opacity = "1";
      }, delay);
    };

    fadeIn("#greeting", 250);
    fadeIn("#intro", 1250);
    fadeIn("#subtitle", 2250);

    setTimeout(() => {
      document.querySelectorAll(".contact-logo").forEach(el => {
        (el as HTMLElement).style.opacity = "1";
      });
    }, 3250);

    //Scroll-triggered animations
    const setupScrollAnimation = () => {
      const aboutSection = document.querySelector('#about');
      
      if (!aboutSection) {
        console.log('About section not found, retrying...');
        setTimeout(setupScrollAnimation, 500);
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
              console.log('About section is more than 50% visible - adding animation class');
              entry.target.classList.add('slide-in-from-left');
            }
          });
        },
        {
          threshold: 0.6, //Trigger when 50% of element is visible
        }
      );

      observer.observe(aboutSection);
      
      //Cleanup
      return () => {
        observer.disconnect();
      };
    };

    const cleanup = setupScrollAnimation();

    return cleanup || (() => {});
  }, []);

  return (
    <div className="App">
      {/*Removes ugly white bar caused by iPhone dynamic island*/}
      <meta name="theme-color" content="#000000" />
      <header>
        <div className="logo">
          <h3>ES</h3>
        </div>
        <NavBar sections={sections} />
      </header>
      <main>
        <section id="home">
          <h2 id="greeting">Nice to meet you!</h2>
          <h2 id="intro">I'm Edmon Shi.</h2>
          <h3 id="subtitle">
            Software Engineering Co-op Student at the University of Waterloo
          </h3>
          <div id="contact">
            <a href="mailto:edmonshi0614@gmail.com">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 512 512"
                className="contact-logo">
                {//Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.
                }
                <path d="M64 112c-8.8 0-16 7.2-16 16l0 22.1L220.5 291.7c20.7 17 50.4 17 71.1 0L464 150.1l0-22.1c0-8.8-7.2-16-16-16L64 112zM48 212.2L48 384c0 8.8 7.2 16 16 16l384 0c8.8 0 16-7.2 16-16l0-171.8L322 328.8c-38.4 31.5-93.7 31.5-132 0L48 212.2zM0 128C0 92.7 28.7 64 64 64l384 0c35.3 0 64 28.7 64 64l0 256c0 35.3-28.7 64-64 64L64 448c-35.3 0-64-28.7-64-64L0 128z" />
              </svg>{" "}
            </a>
            <a href="https://www.github.com/edmonshi/">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 496 512"
                className="contact-logo">
                {//Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.
                }
                <path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3 .3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5 .3-6.2 2.3zm44.2-1.7c-2.9 .7-4.9 2.6-4.6 4.9 .3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3 .7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3 .3 2.9 2.3 3.9 1.6 1 3.6 .7 4.3-.7 .7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3 .7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3 .7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z" />
              </svg>{" "}
            </a>
            <a href="https://www.linkedin.com/in/edmonshi/">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 448 512"
                className="contact-logo">
                {//Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.
                }
                <path d="M416 32H31.9C14.3 32 0 46.5 0 64.3v383.4C0 465.5 14.3 480 31.9 480H416c17.6 0 32-14.5 32-32.3V64.3c0-17.8-14.4-32.3-32-32.3zM135.4 416H69V202.2h66.5V416zm-33.2-243c-21.3 0-38.5-17.3-38.5-38.5S80.9 96 102.2 96c21.2 0 38.5 17.3 38.5 38.5 0 21.3-17.2 38.5-38.5 38.5zm282.1 243h-66.4V312c0-24.8-.5-56.7-34.5-56.7-34.6 0-39.9 27-39.9 54.9V416h-66.4V202.2h63.7v29.2h.9c8.9-16.8 30.6-34.5 62.9-34.5 67.2 0 79.7 44.3 79.7 101.9V416z" />
              </svg>{" "}
            </a>
          </div>
        </section>
        <section id="about">
          <h1>About Me</h1>
          <div id="aboutme">
            <h4>
              I'm Edmon, a Software Engineering student at the University of
              Waterloo.
              <br></br>
              <br></br>
              &emsp;&emsp;I began my coding journey in 2019 through my high
              school’s computer science program, where I quickly fell in love
              with writing code and exploring its endless creative potential.
              Driven by an intense desire to learn and grow, I took a bold step
              in 2024 when I left Montreal — my home of 18 years — to pursue
              Software Engineering at the University of Waterloo. Over there, I
              immersed myself in a variety of programming languages and
              technologies.
              <br></br>
              &emsp;&emsp;These building blocks allowed me to create many
              interesting projects that can be found below. I am eager to learn
              new things and always on the uptake to tackle challenging
              problems. 
              <br></br>
              <br></br>
              I'm currently seeking a co-op position for Winter 2026.
              Feel free to reach out!
            </h4>
            <img src="/photo.jpg" id="headshot"></img>
          </div>
        </section>
        <div id="skills-bar">
            <div className="skills-scroll">
              <div className="skills-track">
                <span className="skill-item">JavaScript</span>
                <span className="skill-item">TypeScript</span>
                <span className="skill-item">React</span>
                <span className="skill-item">Java</span>
                <span className="skill-item">JavaFX</span>
                <span className="skill-item">C</span>
                <span className="skill-item">C++</span>
                <span className="skill-item">Python</span>
                <span className="skill-item">HTML</span>
                <span className="skill-item">CSS</span>
                <span className="skill-item">Git</span>
                <span className="skill-item">Linux</span>
                <span className="skill-item">Bash</span>
                <span className="skill-item">Node.js</span>
                <span className="skill-item">Docker</span>
                <span className="skill-item">Flutter</span>
                <span className="skill-item">Vite</span>
                {/* Duplicate for seamless loop */}
                <span className="skill-item">JavaScript</span>
                <span className="skill-item">TypeScript</span>
                <span className="skill-item">React</span>
                <span className="skill-item">Java</span>
                <span className="skill-item">JavaFX</span>
                <span className="skill-item">C</span>
                <span className="skill-item">C++</span>
                <span className="skill-item">Python</span>
                <span className="skill-item">HTML</span>
                <span className="skill-item">CSS</span>
                <span className="skill-item">Git</span>
                <span className="skill-item">Linux</span>
                <span className="skill-item">Bash</span>
                <span className="skill-item">Node.js</span>
                <span className="skill-item">Docker</span>
                <span className="skill-item">Flutter</span>
                <span className="skill-item">Vite</span>
              </div>
            </div>
          </div>
        <section id="portfolio">
          <h1>Portfolio</h1>
          <div id="projects">
            <ProjectPanel className = "project-panel"
              title="Autonomous Chessboard Robot"
              videoUrl="/chessboardrobot.MOV"
              description="An autonomous robotic chessboard designed to play against a human opponent. It employs a Hall effect sensor matrix to track game pieces. The chessboard communicates with a server running the Stockfish chess engine in real-time via WebSockets to calculate moves. The chess pieces are moved using a CoreXY system, guided by a Breadth-First Search algorithm for pathfinding."
              projectUrl="https://git.uwaterloo.ca/b27dai/se101_group_project"
              tags={["C Programming", "JavaScript", "WebSockets", "Pathfinding", "Robotics"]}>
            </ProjectPanel>
            <ProjectPanel className = "project-panel"
              title="Celestial Simulator"
              videoUrl="https://github.com/exisodd/celestial-simulator/assets/96459404/30d4bb50-aad8-489f-a7cc-1052034a7dfe"
              description="A fully interactive 3D Newtonian N-Body Gravity Simulation with gravitational vector field visualization developed in Java and JavaFX. The simulation allows users to add celestial bodies and adjust their mass, velocity, and position. The application is built using Java and is optimized using the Barnes-Hut algorithm."
              projectUrl="https://github.com/tran-ethan/celestial-simulator"
              tags={["Java", "JavaFX", "3D Graphics", "Simulation", "Animation"]}>
            </ProjectPanel>
                        <ProjectPanel className = "project-panel"
              title="Cellular Automata Simulator"
              videoUrl="https://github.com/user-attachments/assets/e8ad756c-e660-4cc6-a8f8-0787dc30417c"
              description="A project experimenting with the behavior of cellular automata under various sets of rules. The simulator allows users to create and visualize cellular automata using a variety of rulesets, including Conway's Game of Life, Brian's Brain, and more. The ability to record simulations using bitmaps and to play them back at different speeds adds an extra layer of interactivity. The project is built using Java and JavaFX."
              projectUrl="https://github.com/edmonshi/Cellular-Automata-Simulator"
              tags={["Java", "JavaFX", "Game of Life", "Simulation", "Animation"]}>
            </ProjectPanel>
          </div>
        </section>
      </main>
      <footer>
        <p>Made with 🗿 by Edmon Shi</p>
      </footer>
      <ParticlesBg color="#949494" type="cobweb" bg={true} />
    </div>
  );
};

export default App;
