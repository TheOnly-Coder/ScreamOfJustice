import React, { useState } from 'react';
import { sounds } from '../lib/sounds';
import { Lock, Check, Flag, Timer, ChevronRight } from 'lucide-react';

interface Props {
  onBack: () => void;
  onStartChapter: (chapter: number) => void;
}

interface ChapterInfo {
  num: number;
  x: number;
  y: number;
  unlocked: boolean;
  codename: string;
  title: string;
  objective: string;
  location: string;
  kind: 'training' | 'combat' | 'cinematic' | 'locked';
}

// Chapter 4 mission was retired — node stays locked until it ships again.
const CHAPTERS: ChapterInfo[] = [
  {
    num: 1, x: 12, y: 15, unlocked: true, kind: 'training',
    codename: 'FIRST LIGHT', title: 'Basic Training',
    objective: 'Learn to move, aim, shoot and reload under Sergeant Briggs.',
    location: 'Fort Drayton — Training Grounds',
  },
  {
    num: 2, x: 30, y: 30, unlocked: true, kind: 'combat',
    codename: 'HOLLOW POINT', title: 'Behind Enemy Lines',
    objective: 'Infiltrate the occupied district. Eliminate patrols. Reach extraction.',
    location: 'Occupied Riverside District',
  },
  {
    num: 3, x: 18, y: 50, unlocked: true, kind: 'cinematic',
    codename: 'LONG ROAD', title: 'The Road Home',
    objective: 'A quiet interlude on the road back. No rounds fired.',
    location: 'Rural Highway 9',
  },
  {
    num: 4, x: 35, y: 65, unlocked: false, kind: 'locked',
    codename: 'THE SIGNAL', title: 'Classified',
    objective: 'This operation has been archived. Requisition pending.',
    location: 'Unknown',
  },
  {
    num: 5, x: 55, y: 15, unlocked: false, kind: 'locked',
    codename: '??????', title: 'Classified',
    objective: 'Complete preceding operations to decrypt.',
    location: 'Unknown',
  },
  {
    num: 6, x: 70, y: 35, unlocked: false, kind: 'locked',
    codename: '??????', title: 'Classified',
    objective: 'Complete preceding operations to decrypt.',
    location: 'Unknown',
  },
  {
    num: 7, x: 60, y: 58, unlocked: false, kind: 'locked',
    codename: '??????', title: 'Classified',
    objective: 'Complete preceding operations to decrypt.',
    location: 'Unknown',
  },
  {
    num: 8, x: 80, y: 78, unlocked: false, kind: 'locked',
    codename: '??????', title: 'Classified',
    objective: 'Complete preceding operations to decrypt.',
    location: 'Unknown',
  },
];

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 6], [6, 7], [3, 6],
];

const KIND_STYLE: Record<ChapterInfo['kind'], { ring: string; glow: string; text: string; chip: string }> = {
  training: { ring: '#4ade80', glow: 'rgba(74,222,128,0.35)', text: '#bbf7d0', chip: 'TRAINING' },
  combat: { ring: '#34d399', glow: 'rgba(52,211,153,0.4)', text: '#a7f3d0', chip: 'COMBAT' },
  cinematic: { ring: '#38bdf8', glow: 'rgba(56,189,248,0.35)', text: '#bae6fd', chip: 'CINEMATIC' },
  locked: { ring: '#334155', glow: 'transparent', text: '#475569', chip: 'LOCKED' },
};

export function ChapterSelect({ onBack, onStartChapter }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number>(1);

  const sel = CHAPTERS.find(c => c.num === selected) || CHAPTERS[0];
  const selStyle = KIND_STYLE[sel.kind];

  return (
    <div className="absolute inset-0 flex flex-col select-none overflow-hidden text-white"
      style={{ background: 'linear-gradient(180deg, #000510 0%, #020b1a 40%, #0a1628 100%)' }}>

      {/* faint grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.10]" style={{
        backgroundImage: 'linear-gradient(rgba(148,163,184,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.5) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      {/* Back */}
      <button onClick={() => { sounds.playUi('back'); onBack(); }} className="absolute top-5 left-5 z-30 px-4 py-2 rounded-lg
        border border-slate-700 bg-slate-900/60 hover:bg-slate-800 hover:border-emerald-500/50
        text-slate-400 hover:text-emerald-400 transition-all duration-200 text-sm font-mono flex items-center gap-2">
        <span className="text-base leading-none">&#8592;</span> Back
      </button>

      {/* Title block */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 text-center">
        <h2 className="text-lg md:text-xl font-black tracking-[0.18em] text-slate-200"
          style={{ fontFamily: 'var(--soj-font-display, sans-serif)' }}>CAMPAIGN THEATRE</h2>
        <p className="text-[10px] font-mono tracking-[0.35em] text-slate-500 uppercase mt-1">
          United States Sector — select an operation
        </p>
      </div>

      {/* Progress */}
      <div className="absolute top-6 right-6 z-20 text-right">
        <div className="text-[9px] font-mono tracking-[0.3em] text-slate-500 uppercase">Operations</div>
        <div className="text-sm font-mono font-bold text-emerald-400">3 AVAILABLE / 5 LOCKED</div>
      </div>

      {/* Body: map + briefing */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 pt-24 pb-8 px-8 max-w-7xl mx-auto w-full">

        {/* Map */}
        <div className="lg:col-span-7 relative min-h-[320px]">
          <div className="relative w-full h-full">
            <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 1 }}>
              {CONNECTIONS.map(([from, to], i) => {
                const a = CHAPTERS[from];
                const b = CHAPTERS[to];
                const active = a.unlocked && b.unlocked;
                const inPath = hovered !== null && (CHAPTERS[hovered - 1] === a || CHAPTERS[hovered - 1] === b);
                return (
                  <line key={i}
                    x1={`${a.x}%`} y1={`${a.y}%`}
                    x2={`${b.x}%`} y2={`${b.y}%`}
                    stroke={active ? 'rgba(52,211,153,0.45)' : 'rgba(100,116,139,0.25)'}
                    strokeWidth={inPath ? 2.5 : 1.5}
                    strokeDasharray="5,5"
                    className={active ? 'soj-route-active' : undefined}
                  />
                );
              })}
            </svg>

            {CHAPTERS.map((ch) => {
              const st = KIND_STYLE[ch.kind];
              const isHovered = hovered === ch.num;
              const isSelected = selected === ch.num;
              return (
                <button
                  key={ch.num}
                  className="absolute flex items-center justify-center rounded-full transition-all duration-300"
                  style={{
                    left: `${ch.x}%`, top: `${ch.y}%`,
                    transform: `translate(-50%, -50%) scale(${isSelected ? 1.12 : isHovered ? 1.06 : 1})`,
                    width: 'clamp(46px, 5.4vw, 62px)', height: 'clamp(46px, 5.4vw, 62px)',
                    border: `2px solid ${ch.unlocked ? st.ring : '#334155'}`,
                    background: ch.unlocked
                      ? (isSelected ? 'rgba(16,185,129,0.25)' : isHovered ? 'rgba(34,197,94,0.16)' : 'rgba(15,23,42,0.85)')
                      : 'rgba(15,23,42,0.9)',
                    boxShadow: isSelected ? `0 0 30px ${st.glow}` : isHovered ? `0 0 18px ${st.glow}` : 'none',
                    cursor: ch.unlocked ? 'pointer' : 'not-allowed',
                    zIndex: 2,
                    fontFamily: '"Press Start 2P",monospace',
                    fontSize: 'clamp(0.7rem, 1.2vw, 1rem)',
                    color: ch.unlocked ? st.text : '#475569',
                    textShadow: isSelected ? `0 0 10px ${st.glow}` : 'none',
                  }}
                  onClick={() => {
                    if (!ch.unlocked) { sounds.playUi('back'); return; }
                    sounds.playUi('click');
                    setSelected(ch.num);
                  }}
                  onMouseEnter={() => { if (ch.unlocked) { setHovered(ch.num); sounds.playUi('hover'); } }}
                  onMouseLeave={() => setHovered(null)}
                  onDoubleClick={() => ch.unlocked && onStartChapter(ch.num)}
                >
                  {ch.unlocked ? ch.num : <Lock className="w-4 h-4" strokeWidth={2.5} />}
                  {/* selection halo */}
                  {isSelected && (
                    <span className="absolute -inset-1.5 rounded-full border border-emerald-400/60 soj-node-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Briefing panel */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden flex-1 flex flex-col"
            style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.45)' }}>
            <div className="px-5 py-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
              <span className="text-[9px] font-mono font-black tracking-[0.35em] text-slate-500 uppercase">Mission Briefing</span>
              <span className="text-[9px] font-mono font-black tracking-[0.25em] px-2 py-0.5 rounded-sm border"
                style={{
                  color: sel.unlocked ? selStyle.text : '#64748b',
                  borderColor: sel.unlocked ? selStyle.ring + '55' : '#334155',
                  background: sel.unlocked ? 'rgba(15,23,42,0.6)' : 'rgba(15,23,42,0.6)',
                }}>
                {selStyle.chip}
              </span>
            </div>

            <div className="p-5 flex-1 flex flex-col gap-4">
              <div>
                <div className="text-[10px] font-mono tracking-[0.3em] text-slate-500 uppercase">Chapter {sel.num} — {sel.codename}</div>
                <h3 className="text-2xl font-black tracking-tight mt-1" style={{ fontFamily: 'var(--soj-font-display, sans-serif)', color: sel.unlocked ? '#f1f5f9' : '#64748b' }}>
                  {sel.title}
                </h3>
              </div>

              <p className={`text-sm leading-relaxed ${sel.unlocked ? 'text-slate-400' : 'text-slate-600'}`}>
                {sel.objective}
              </p>

              <div className="mt-auto space-y-2.5">
                <BriefRow icon={<Flag className="w-3.5 h-3.5" />} label="Location" value={sel.location} dim={!sel.unlocked} />
                <BriefRow icon={<Timer className="w-3.5 h-3.5" />} label="Rules of engagement" value={sel.kind === 'cinematic' ? 'Weapons cold' : 'Weapons free'} dim={!sel.unlocked} />
                <BriefRow icon={<Check className="w-3.5 h-3.5" />} label="Status" value={sel.unlocked ? (sel.kind === 'cinematic' ? 'Interlude available' : 'Ready to deploy') : 'Encrypted'} dim={!sel.unlocked} />
              </div>
            </div>

            <div className="p-5 pt-0">
              <button
                disabled={!sel.unlocked}
                onClick={() => { if (sel.unlocked) { sounds.playUi('deploy'); onStartChapter(sel.num); } }}
                onMouseEnter={() => sel.unlocked && sounds.playUi('hover')}
                className={`w-full py-3.5 rounded-xl font-black tracking-[0.3em] text-xs uppercase flex items-center justify-center gap-2 transition-all duration-300
                  ${sel.unlocked
                    ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.3)] hover:shadow-[0_0_34px_rgba(16,185,129,0.45)]'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
              >
                {sel.unlocked ? 'Deploy to Operation' : 'Locked'}
                {sel.unlocked && <ChevronRight className="w-4 h-4" />}
              </button>
              <p className="mt-3 text-center text-[9px] font-mono tracking-[0.2em] text-slate-600 uppercase">
                Tip: double-click a node to jump straight in
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes twinkle { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
        @keyframes sojRouteDash { to { stroke-dashoffset: -20; } }
        .soj-route-active { animation: sojRouteDash 1.1s linear infinite; }
        @keyframes sojNodePulse { 0% { opacity: 0.9; transform: scale(1); } 100% { opacity: 0; transform: scale(1.35); } }
        .soj-node-pulse { animation: sojNodePulse 1.4s ease-out infinite; }
      `}</style>
    </div>
  );
}

const BriefRow: React.FC<{ icon: React.ReactNode; label: string; value: string; dim?: boolean }> = ({ icon, label, value, dim }) => (
  <div className="flex items-center gap-3">
    <span className={dim ? 'text-slate-700' : 'text-emerald-500/80'}>{icon}</span>
    <span className="text-[9px] font-mono font-black tracking-[0.25em] text-slate-500 uppercase w-40 shrink-0">{label}</span>
    <span className={`text-xs truncate ${dim ? 'text-slate-600' : 'text-slate-300'} font-mono`}>{value}</span>
  </div>
);
