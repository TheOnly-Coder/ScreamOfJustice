import React from 'react';

interface Props {
  onBack: () => void;
  onSelectRegion: () => void;
}

export function CampaignGlobe({ onBack, onSelectRegion }: Props) {
  // Generate random stars once
  const stars = React.useMemo(() =>
    Array.from({ length: 200 }, (_, i) => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      s: 0.5 + Math.random() * 2,
      o: 0.2 + Math.random() * 0.8,
      delay: Math.random() * 4,
      dur: 2 + Math.random() * 3,
    })), []);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center select-none overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #000510 0%, #020b1a 40%, #0a1628 100%)' }}>

      {/* Stars */}
      <div className="absolute inset-0 pointer-events-none">
        {stars.map((st, i) => (
          <div key={i} className="absolute rounded-full bg-white" style={{
            left: `${st.x}%`, top: `${st.y}%`,
            width: `${st.s}px`, height: `${st.s}px`,
            opacity: st.o,
            animation: `twinkle ${st.dur}s ease-in-out ${st.delay}s infinite`,
          }} />
        ))}
      </div>

      {/* Back button */}
      <button onClick={onBack} className="absolute top-5 left-5 z-20 px-4 py-2 rounded-lg
        border border-slate-700 bg-slate-900/60 hover:bg-slate-800 hover:border-emerald-500/50
        text-slate-400 hover:text-emerald-400 transition-all duration-200 text-sm font-mono">
        &#8592; Back
      </button>

      {/* Title */}
      <h2 className="relative z-10 mb-12" style={{
        fontFamily: '"Press Start 2P","Courier New",monospace',
        fontSize: 'clamp(1rem, 2.5vw, 1.6rem)',
        color: '#94a3b8', letterSpacing: '0.15em',
      }}>SELECT OPERATION</h2>

      {/* Left arrow */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10">
        <button className="w-14 h-14 rounded-full border-2 border-slate-600 bg-slate-900/50
          text-slate-500 text-2xl flex items-center justify-center hover:border-slate-400 hover:text-slate-300
          transition-all cursor-pointer select-none">&#8249;</button>
        <span style={{
          fontFamily: '"Courier New",monospace', fontSize: '0.65rem',
          color: 'rgba(148,163,184,0.4)', letterSpacing: '0.1em',
        }}>Coming soon...</span>
      </div>

      {/* Globe - emoji style with US highlighted */}
      <div className="relative z-10 cursor-pointer group" onClick={onSelectRegion}>
        <div className="relative" style={{
          width: 'clamp(180px, 30vw, 300px)', height: 'clamp(180px, 30vw, 300px)',
        }}>
          {/* Ocean sphere */}
          <div className="absolute inset-0 rounded-full" style={{
            background: 'radial-gradient(circle at 35% 35%, #1e3a5f 0%, #0c1929 60%, #060d18 100%)',
            boxShadow: 'inset -20px -10px 40px rgba(0,0,0,0.6), 0 0 60px rgba(30,58,95,0.3), 0 0 120px rgba(14,30,50,0.2)',
          }} />
          {/* Grid lines */}
          <div className="absolute inset-0 rounded-full overflow-hidden" style={{ opacity: 0.15 }}>
            <div className="absolute top-0 left-1/2 w-px h-full bg-sky-300" />
            <div className="absolute top-1/2 left-0 w-full h-px bg-sky-300" />
            <div className="absolute top-[15%] left-0 w-full h-px bg-sky-300" style={{ transform: 'rotate(-5deg)' }} />
            <div className="absolute top-[85%] left-0 w-full h-px bg-sky-300" style={{ transform: 'rotate(5deg)' }} />
            <div className="absolute top-0 left-[25%] w-px h-full bg-sky-300" style={{ transform: 'rotate(10deg)' }} />
            <div className="absolute top-0 left-[75%] w-px h-full bg-sky-300" style={{ transform: 'rotate(-10deg)' }} />
          </div>
          {/* US landmass - simplified emoji-style shape */}
          <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" style={{ filter: 'drop-shadow(0 0 3px rgba(74,222,128,0.4))' }}>
            {/* Main US body */}
            <path d="M18,28 L30,25 L38,27 L45,24 L52,26 L55,30 L53,35 L56,38 L52,42 L48,45 L42,44 L38,47 L35,44 L30,46 L25,43 L22,38 L18,35 Z"
              fill="#22c55e" opacity="0.85" stroke="#4ade80" strokeWidth="0.5" />
            {/* Alaska */}
            <path d="M10,18 L16,16 L18,20 L14,22 L10,20 Z" fill="#22c55e" opacity="0.7" stroke="#4ade80" strokeWidth="0.3" />
            {/* Florida */}
            <path d="M42,50 L44,48 L46,52 L45,56 L42,54 Z" fill="#22c55e" opacity="0.7" stroke="#4ade80" strokeWidth="0.3" />
          </svg>
          {/* Glow ring on hover */}
          <div className="absolute inset-[-4px] rounded-full border-2 border-transparent group-hover:border-emerald-500/40
            transition-all duration-500 group-hover:shadow-[0_0_30px_rgba(74,222,128,0.2)]" />
          {/* US label */}
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap" style={{
            fontFamily: '"Press Start 2P",monospace', fontSize: 'clamp(0.5rem,1vw,0.7rem)',
            color: '#4ade80', letterSpacing: '0.1em',
          }}>UNITED STATES</div>
        </div>
      </div>

      {/* Right arrow */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10">
        <button className="w-14 h-14 rounded-full border-2 border-slate-600 bg-slate-900/50
          text-slate-500 text-2xl flex items-center justify-center hover:border-slate-400 hover:text-slate-300
          transition-all cursor-pointer select-none">&#8250;</button>
        <span style={{
          fontFamily: '"Courier New",monospace', fontSize: '0.65rem',
          color: 'rgba(148,163,184,0.4)', letterSpacing: '0.1em',
        }}>Coming soon...</span>
      </div>

      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
