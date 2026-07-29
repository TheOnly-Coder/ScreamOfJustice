import React, { useState } from 'react';

interface Props {
  onBack: () => void;
  onStartChapter: (chapter: number) => void;
}

export function ChapterSelect({ onBack, onStartChapter }: Props) {
  const [hoveredChapter, setHoveredChapter] = useState<number | null>(null);

  // 8 chapters in a zigzag path layout
  // Positions as percentage of container
  const chapters = [
    { num: 1, x: 12, y: 15, unlocked: true },
    { num: 2, x: 30, y: 30, unlocked: true },
    { num: 3, x: 18, y: 50, unlocked: true },
    { num: 4, x: 35, y: 65, unlocked: false },
    { num: 5, x: 55, y: 15, unlocked: false },
    { num: 6, x: 70, y: 35, unlocked: false },
    { num: 7, x: 60, y: 58, unlocked: false },
    { num: 8, x: 80, y: 78, unlocked: false },
  ];

  // Connections: each pair [from, to]
  const connections: [number, number][] = [
    [0,1],[1,2],[2,3],[0,4],[4,5],[5,6],[6,7],[3,6],
  ];

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center select-none overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #000510 0%, #020b1a 40%, #0a1628 100%)' }}>

      {/* Back button */}
      <button onClick={onBack} className="absolute top-5 left-5 z-20 px-4 py-2 rounded-lg
        border border-slate-700 bg-slate-900/60 hover:bg-slate-800 hover:border-emerald-500/50
        text-slate-400 hover:text-emerald-400 transition-all duration-200 text-sm font-mono">
        &#8592; Back
      </button>

      {/* Title */}
      <h2 className="absolute top-5 left-1/2 -translate-x-1/2 z-10" style={{
        fontFamily: '"Press Start 2P","Courier New",monospace',
        fontSize: 'clamp(0.7rem, 1.5vw, 1rem)',
        color: '#94a3b8', letterSpacing: '0.15em',
      }}>CHAPTER SELECT</h2>

      {/* Chapter map */}
      <div className="relative w-full h-full max-w-4xl max-h-[500px] mx-auto my-16">
        <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 1 }}>
          {connections.map(([from, to], i) => {
            const a = chapters[from];
            const b = chapters[to];
            return (
              <line key={i}
                x1={`${a.x}%`} y1={`${a.y}%`}
                x2={`${b.x}%`} y2={`${b.y}%`}
                stroke="rgba(100,116,139,0.3)"
                strokeWidth="2"
                strokeDasharray="6,4"
              />
            );
          })}
        </svg>

        {chapters.map((ch) => {
          const isHovered = hoveredChapter === ch.num;
          const isActive = ch.unlocked;
          return (
            <button
              key={ch.num}
              className="absolute flex items-center justify-center rounded-full transition-all duration-300"
              style={{
                left: `${ch.x}%`, top: `${ch.y}%`,
                transform: 'translate(-50%, -50%)',
                width: 'clamp(48px, 6vw, 64px)', height: 'clamp(48px, 6vw, 64px)',
                border: `2px solid ${isActive ? (isHovered ? '#86efac' : '#4ade80') : '#334155'}`,
                background: isActive
                  ? (isHovered ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.08)')
                  : 'rgba(15,23,42,0.8)',
                boxShadow: isActive && isHovered
                  ? '0 0 25px rgba(74,222,128,0.3)'
                  : 'none',
                cursor: isActive ? 'pointer' : 'not-allowed',
                zIndex: 2,
                fontFamily: '"Press Start 2P",monospace',
                fontSize: 'clamp(0.8rem, 1.5vw, 1.1rem)',
                color: isActive ? (isHovered ? '#bbf7d0' : '#4ade80') : '#475569',
                textShadow: isActive && isHovered ? '0 0 10px rgba(74,222,128,0.5)' : 'none',
              }}
              onClick={() => isActive && onStartChapter(ch.num)}
              onMouseEnter={() => isActive && setHoveredChapter(ch.num)}
              onMouseLeave={() => setHoveredChapter(null)}
            >
              {ch.num}
            </button>
          );
        })}
      </div>

      {/* Locked hint */}
      <p className="absolute bottom-6" style={{
        fontFamily: '"Courier New",monospace', fontSize: '0.75rem',
        color: 'rgba(148,163,184,0.3)', letterSpacing: '0.1em',
      }}>Complete each chapter to unlock the next</p>
    </div>
  );
}
