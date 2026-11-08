import "./App.css";
import { lazy, Suspense, useEffect, useState } from "react";
import { initPond } from "./anim/pond";
import { EXPERIENCE, PROJECTS } from "./projects";
const BettaScene = lazy(() => import("./components/BettaScene"));

// ?fish=off disables the plate canvas (perf diagnostics).
const SHOW_FISH = new URLSearchParams(window.location.search).get("fish") !== "off";

const links = [
  ["email", "mailto:edmonshi0614@gmail.com"],
  ["github", "https://www.github.com/edmonshi/"],
  ["linkedin", "https://www.linkedin.com/in/edmonshi/"],
];

const TABS = ["about", "experience", "projects"] as const;
type Tab = typeof TABS[number];

const App: React.FC = () => {
  const [tab, setTab] = useState<Tab>("about");
  useEffect(() => initPond(), []);

  return (
    <main className="card">
      <figure className="plate">
        {SHOW_FISH && <Suspense fallback={null}><BettaScene /></Suspense>}
        <span className="stamp" aria-hidden="true">43.47N 80.54W</span>
      </figure>

      <div className="intro">
        <h1 className="name">Edmon Shi</h1>
        <p className="sub">Software Engineering<br />University of Waterloo</p>
        <nav className="links">
          {links.map(([label, href]) => (
            <a key={label} href={href} target="_blank" rel="noreferrer">{label}</a>
          ))}
        </nav>
      </div>

      <div className="tabbed">
        <div className="tabs" role="tablist">
          {TABS.map(t => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
        <div role="tabpanel">
          {tab === "about" && (
            <div className="bio">
              <p>I like taking simple, solid pieces and stacking them into something that feels effortless to use. Building since 2019.</p>
              <p>Away from the screen I swim and fish.</p>
            </div>
          )}
          {tab === "experience" && (
            <ul className="rows">
              {EXPERIENCE.map(j => (
                <li key={j.company}>
                  {j.url ? <a href={j.url} target="_blank" rel="noreferrer">{j.company}</a> : <span>{j.company}</span>}
                  <span className="detail">{j.role}</span>
                  <span className="year">{j.year}</span>
                </li>
              ))}
            </ul>
          )}
          {tab === "projects" && (
            <ul className="rows">
              {PROJECTS.map(p => (
                <li key={p.title}>
                  <a href={p.projectUrl} target="_blank" rel="noreferrer">{p.title}</a>
                  <span className="detail">{p.blurb}</span>
                  <span className="year">{p.year}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
};

export default App;
