import React from 'react';
import { sounds } from '../lib/sounds';

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
      <button onClick={() => { sounds.playUi('back'); onBack(); }} className="absolute top-5 left-5 z-20 px-4 py-2 rounded-lg
        border border-slate-700 bg-slate-900/60 hover:bg-slate-800 hover:border-emerald-500/50
        text-slate-400 hover:text-emerald-400 transition-all duration-200 text-sm font-mono flex items-center gap-2">
        <span className="text-base leading-none">&#8592;</span> Back
      </button>

      {/* Title block */}
      <div className="relative z-10 text-center mb-10">
        <h2 className="text-lg md:text-xl font-black tracking-[0.18em] text-slate-200"
          style={{ fontFamily: 'var(--soj-font-display, sans-serif)' }}>SELECT THEATRE</h2>
        <p className="text-[10px] font-mono tracking-[0.35em] text-slate-500 uppercase mt-1">
          Where the story takes you
        </p>
      </div>

      {/* Left arrow — more theatres ship later */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10 opacity-60">
        <button disabled className="w-14 h-14 rounded-full border-2 border-slate-700 bg-slate-900/40
          text-slate-600 text-2xl flex items-center justify-center cursor-not-allowed select-none">&#8249;</button>
        <span className="text-center" style={{
          fontFamily: '"Courier New",monospace', fontSize: '0.6rem',
          color: 'rgba(148,163,184,0.4)', letterSpacing: '0.12em',
        }}>MORE<br />SOON</span>
      </div>

      {/* Globe with rotating atmosphere */}
      <div className="relative z-10 cursor-pointer group" onClick={() => { sounds.playUi('click'); onSelectRegion(); }}>
        <div className="relative" style={{
          width: 'clamp(200px, 32vw, 320px)', height: 'clamp(200px, 32vw, 320px)',
        }}>
          {/* Ocean sphere */}
          <div className="absolute inset-0 rounded-full transition-transform duration-700 group-hover:scale-[1.03]" style={{
            background: 'radial-gradient(circle at 35% 35%, #1e3a5f 0%, #0c1929 60%, #060d18 100%)',
            boxShadow: 'inset -20px -10px 40px rgba(0,0,0,0.6), 0 0 60px rgba(30,58,95,0.3), 0 0 120px rgba(14,30,50,0.2)',
          }} />
          {/* Rotating latitude scan */}
          <div className="absolute inset-0 rounded-full overflow-hidden" style={{ opacity: 0.18 }}>
            <div className="absolute top-0 left-1/2 w-px h-full bg-sky-300" />
            <div className="absolute top-1/2 left-0 w-full h-px bg-sky-300" />
            <div className="absolute top-[15%] left-0 w-full h-px bg-sky-300" style={{ transform: 'rotate(-5deg)' }} />
            <div className="absolute top-[85%] left-0 w-full h-px bg-sky-300" style={{ transform: 'rotate(5deg)' }} />
            <div className="absolute top-0 left-[25%] w-px h-full bg-sky-300" style={{ transform: 'rotate(10deg)' }} />
            <div className="absolute top-0 left-[75%] w-px h-full bg-sky-300" style={{ transform: 'rotate(-10deg)' }} />
          </div>
          {/* US landmass */}
          <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" style={{ filter: 'drop-shadow(0 0 3px rgba(74,222,128,0.4))' }}>
            <path d="M18,28 L30,25 L38,27 L45,24 L52,26 L55,30 L53,35 L56,38 L52,42 L48,45 L42,44 L38,47 L35,44 L30,46 L25,43 L22,38 L18,35 Z"
              fill="#22c55e" opacity="0.85" stroke="#4ade80" strokeWidth="0.5" />
            <path d="M10,18 L16,16 L18,20 L14,22 L10,20 Z" fill="#22c55e" opacity="0.7" stroke="#4ade80" strokeWidth="0.3" />
            <path d="M42,50 L44,48 L46,52 L45,56 L42,54 Z" fill="#22c55e" opacity="0.7" stroke="#4ade80" strokeWidth="0.3" />
          </svg>
          {/* Orbiting satellite dot */}
          <div className="absolute inset-[-10px] soj-orbit">
            <div className="absolute top-0 left-1/2 w-1.5 h-1.5 rounded-full bg-emerald-300/90 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
          </div>
          {/* Glow ring on hover */}
          <div className="absolute inset-[-4px] rounded-full border-2 border-transparent group-hover:border-emerald-500/40
            transition-all duration-500 group-hover:shadow-[0_0_30px_rgba(74,222,128,0.25)]" />
          {/* Region label + CTA */}
          <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap flex flex-col items-center gap-1.5">
            <div style={{
              fontFamily: '"Press Start 2P",monospace', fontSize: 'clamp(0.5rem,1vw,0.7rem)',
              color: '#4ade80', letterSpacing: '0.1em',
            }}>UNITED STATES</div>
            <div className="text-[9px] font-mono tracking-[0.3em] text-slate-500 uppercase group-hover:text-emerald-400 transition-colors">
              Click to open operations
            </div>
          </div>
        </div>
      </div>

      {/* Right arrow */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10 opacity-60">
        <button disabled className="w-14 h-14 rounded-full border-2 border-slate-700 bg-slate-900/40
          text-slate-600 text-2xl flex items-center justify-center cursor-not-allowed select-none">&#8250;</button>
        <span className="text-center" style={{
          fontFamily: '"Courier New",monospace', fontSize: '0.6rem',
          color: 'rgba(148,163,184,0.4)', letterSpacing: '0.12em',
        }}>MORE<br />SOON</span>
      </div>

      {/* Operation dossier strip */}
      <div className="absolute bottom-7 left-1/2 -translate-x-1/2 z-10 flex items-center gap-5 bg-slate-950/70 border border-slate-800 rounded-xl px-6 py-3">
        <DossierItem label="Operations" value="3 briefings open" />
        <span className="w-px h-8 bg-slate-800" />
        <DossierItem label="Theatre status" value="Active" highlight />
        <span className="w-px h-8 bg-slate-800" />
        <DossierItem label="Reinforcements" value="More regions in production" />
      </div>

      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 1; }
        }
        @keyframes sojOrbit {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .soj-orbit { animation: sojOrbit 9s linear infinite; }
      `}</style>
    </div>
  );
}

const DossierItem: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div className="text-left">
    <div className="text-[8px] font-mono font-black tracking-[0.3em] text-slate-500 uppercase">{label}</div>
    <div className={`text-[11px] font-mono font-bold ${highlight ? 'text-emerald-400' : 'text-slate-300'}`}>{value}</div>
  </div>
);
