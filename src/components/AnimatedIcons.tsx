import React from 'react';

export const CodingAnimation = () => (
  <svg viewBox="0 0 200 200" className="tech-svg">
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: 'var(--primary-accent)', stopOpacity: 0.2 }} />
        <stop offset="100%" style={{ stopColor: 'var(--primary-accent)', stopOpacity: 0.05 }} />
      </linearGradient>
    </defs>
    {/* Floating Brackets */}
    <text x="20" y="50" className="floating-text" style={{ animationDelay: '0s' }}>{'<'}</text>
    <text x="160" y="150" className="floating-text" style={{ animationDelay: '1s' }}>{'/>'}</text>
    <text x="140" y="60" className="floating-text" style={{ animationDelay: '2s' }}>{'{'}</text>
    <text x="40" y="160" className="floating-text" style={{ animationDelay: '3.5s' }}>{'}'}</text>
    
    {/* Connecting Lines */}
    <circle cx="100" cy="100" r="40" fill="url(#grad1)" className="pulse-circle" />
    <path d="M60 100 L140 100" stroke="var(--primary-accent)" strokeWidth="0.5" strokeDasharray="4 4" className="moving-line" />
    <path d="M100 60 L100 140" stroke="var(--primary-accent)" strokeWidth="0.5" strokeDasharray="4 4" className="moving-line-alt" />
  </svg>
);

export const ChessIcon = () => (
  <svg viewBox="0 0 24 24" className="project-icon-svg" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <path d="M9 3v18M15 3v18M3 9h18M3 15h18" strokeOpacity="0.3" />
    <circle r="1.5" fill="var(--primary-accent)" stroke="none">
      <animateMotion 
        path="M 6,6 L 12,18 L 18,6 L 6,18 L 18,18 L 6,6" 
        dur="8s" 
        repeatCount="indefinite" 
      />
    </circle>
  </svg>
);

export const OrbitIcon = () => (
  <svg viewBox="0 0 36 36" className="project-icon-svg" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {/* Sun */}
    <circle cx="18" cy="18" r="2.5" fill="var(--primary-accent)" stroke="none">
      <animate attributeName="opacity" values="1;0.7;1" dur="2s" repeatCount="indefinite" />
    </circle>
    
    {/* Inner Elliptical Orbit (rotated 30deg) - rx: 7 -> 10.5, ry: 3 -> 4.5 */}
    <g transform="rotate(30 18 18)">
      <ellipse cx="18" cy="18" rx="10.5" ry="4.5" stroke="rgba(255,255,255,0.1)" strokeDasharray="2 2" />
      <circle r="1" fill="currentColor" stroke="none">
        <animateMotion 
          path="M 7.5,18 a 10.5,4.5 0 1,0 21,0 a 10.5,4.5 0 1,0 -21,0" 
          dur="3s" 
          repeatCount="indefinite" 
        />
      </circle>
    </g>

    {/* Outer Elliptical Orbit (rotated -45deg) - rx: 10 -> 15, ry: 5 -> 7.5 */}
    <g transform="rotate(-45 18 18)">
      <ellipse cx="18" cy="18" rx="15" ry="7.5" stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
      <circle r="1.2" fill="var(--primary-accent)" stroke="none">
        <animateMotion 
          path="M 3,18 a 15,7.5 0 1,0 30,0 a 15,7.5 0 1,0 -30,0" 
          dur="6s" 
          repeatCount="indefinite" 
        />
      </circle>
    </g>
  </svg>
);

export const AutomataIcon = () => (
  <svg viewBox="0 0 24 24" className="project-icon-svg">
    {[0, 1, 2].map(i => [0, 1, 2].map(j => (
      <rect 
        key={`${i}-${j}`}
        x={4 + i * 6} 
        y={4 + j * 6} 
        width="4" 
        height="4" 
        className="automata-cell"
        style={{ animationDelay: `${(i + j) * 0.2}s` }}
      />
    )))}
  </svg>
);
