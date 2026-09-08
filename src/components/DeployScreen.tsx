import React, { useEffect, useRef, useState } from 'react';
import { CharacterClass, MatchConfig, MAPS } from '../types';
import { Shield, MapPin, Timer, Users, ChevronRight, Crosshair, Zap } from 'lucide-react';
import { sounds } from '../lib/sounds';

interface DeployScreenProps {
  config: MatchConfig;
  playerClass: CharacterClass;
  playerName: string;
  onDeploy: () => void;
  onAbort: () => void;
}

// Campaign chapter intel (chapter 4 was retired)
const CHAPTER_INTEL: Record<string, { name: string; objective: string; location: string }> = {
  tutorial: {
    name: 'Operation First Light — Basic Training',
    objective: 'Complete training. Learn to move, aim, shoot and reload.',
    location: 'Fort Drayton Training Grounds',
  },
  campaign2: {
    name: 'Operation Hollow Point — Behind Enemy Lines',
    objective: 'Infiltrate the occupied district. Eliminate patrols. Reach extraction.',
    location: 'Occupied Riverside District',
  },
  campaign3: {
    name: 'Operation Long Road — The Road Home',
    objective: 'Survive the journey home.',
    location: 'Rural Highway 9',
  },
};

const BOOT_LINES = [
  'ESTABLISHING THEATRE LINK',
  'PREPPING SOLDIER MODELS',
  'CALIBRATING WEAPON SYSTEMS',
  'SYNCING AUDIO COMBAT NET',
  'FINALISING TACTICAL MAP',
];

export const DeployScreen: React.FC<DeployScreenProps> = ({
  config, playerClass, playerName, onDeploy, onAbort,
}) => {
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [lineIdx, setLineIdx] = useState(0);
  const startedRef = useRef(false);

  const isCampaign = !!config.isCampaign;
  const chapter = CHAPTER_INTEL[config.mapId] || null;
  const map = MAPS.find(m => m.id === config.mapId);
  const title = chapter ? chapter.name : (map?.name || config.mapId).toUpperCase();
  const location = chapter ? chapter.location : (map?.name || 'UNKNOWN GRID');

  // Real asset loading — models + SFX bank. Menu browsing usually warmed
  // these already, so this finishes near-instantly on repeat deployments.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let raf = 0;
    const targetRef = { v: 0 };
    Promise.all([
      import('../game/CharacterModelLoader').then(m => m.preloadCharacterModel()),
      import('../game/WeaponModelLoader').then(m => m.preloadWeaponModels()),
      import('../lib/sounds').then(m => m.sounds.preloadAll(p => { targetRef.v = Math.max(targetRef.v, p * 0.5); })),
    ]).then(() => { targetRef.v = 1; }).catch(() => { targetRef.v = 1; });

    // Smooth eased bar — the % climbs toward the real target, no snapping.
    // (setInterval rather than rAF: the loading screen is DOM-only, and some
    // browsers throttle frame production for static pages — timers always run.)
    const tick = () => {
      setProgress(p => {
        const target = targetRef.v;
        const next = p + (target - p) * 0.12 + 0.002;
        return Math.min(1, next);
      });
    };
    const iv = setInterval(tick, 32);
    return () => {
      clearInterval(iv);
      startedRef.current = false; // allow StrictMode remount to restart
    };
  }, []);

  useEffect(() => {
    if (progress >= 0.995 && !ready) {
      setProgress(1);
      setReady(true);
    }
  }, [progress, ready]);

  // Cycle the boot status lines while loading
  useEffect(() => {
    if (ready) return;
    const iv = setInterval(() => setLineIdx(i => (i + 1) % BOOT_LINES.length), 700);
    return () => clearInterval(iv);
  }, [ready]);

  const pct = Math.round(progress * 100);

  return (
    <div className="absolute inset-0 z-50 select-none overflow-hidden text-white"
      style={{ background: 'radial-gradient(ellipse at 30% 20%, #101a2b 0%, #0a0e14 55%, #05070c 100%)' }}>

      {/* Tactical grid backdrop */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.16]" style={{
        backgroundImage: 'linear-gradient(rgba(16,185,129,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.35) 1px, transparent 1px)',
        backgroundSize: '44px 44px',
        maskImage: 'radial-gradient(ellipse at 50% 40%, black 30%, transparent 75%)',
        WebkitMaskImage: 'radial-gradient(ellipse at 50% 40%, black 30%, transparent 75%)',
      }} />

      {/* Corner brackets */}
      <div className="absolute top-4 left-4 w-10 h-10 border-t-2 border-l-2 border-emerald-500/50" />
      <div className="absolute top-4 right-4 w-10 h-10 border-t-2 border-r-2 border-emerald-500/50" />
      <div className="absolute bottom-4 left-4 w-10 h-10 border-b-2 border-l-2 border-emerald-500/50" />
      <div className="absolute bottom-4 right-4 w-10 h-10 border-b-2 border-r-2 border-emerald-500/50" />

      {/* Wordmark */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center">
        <div className="text-[10px] font-mono tracking-[0.5em] text-emerald-500/70 uppercase">SCREAM OF JUSTICE</div>
        <div className="text-[9px] font-mono tracking-[0.3em] text-slate-500 uppercase mt-1">Pre-Deployment Briefing</div>
      </div>

      {/* Main layout */}
      <div className="relative h-full max-w-5xl mx-auto flex flex-col justify-center gap-8 px-8 pt-16 pb-10">

        {/* Mission title */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[9px] font-mono font-black tracking-[0.3em] px-2 py-0.5 rounded-sm ${isCampaign ? 'bg-amber-500/15 text-amber-400 border border-amber-500/40' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40'}`}>
              {isCampaign ? 'CAMPAIGN OPERATION' : 'CLASSIC DEPLOYMENT'}
            </span>
            {config.difficulty && (
              <span className="text-[9px] font-mono font-black tracking-[0.3em] px-2 py-0.5 rounded-sm bg-slate-800/80 text-slate-300 border border-slate-700">
                {config.difficulty}
              </span>
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white" style={{ fontFamily: 'var(--soj-font-display, sans-serif)' }}>
            {title}
          </h1>
          {chapter?.objective && (
            <p className="mt-2 text-sm text-slate-400 font-mono max-w-2xl leading-relaxed">{chapter.objective}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-8 items-start">
          {/* LEFT: intel panel */}
          <div className="md:col-span-3 space-y-3">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800 text-[9px] font-mono font-black tracking-[0.35em] text-slate-500 uppercase">
                Mission Intel
              </div>
              <div className="p-4 grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                <IntelRow icon={<MapPin className="w-3.5 h-3.5" />} label="Location" value={location} />
                <IntelRow icon={<Users className="w-3.5 h-3.5" />} label="Callsign" value={playerName} mono />
                <IntelRow icon={<Shield className="w-3.5 h-3.5" />} label="Class" value={playerClass.name} />
                <IntelRow
                  icon={<Timer className="w-3.5 h-3.5" />}
                  label="Time Limit"
                  value={`${Math.floor(config.timeLimit / 60)} min`}
                  mono
                />
              </div>
            </div>

            {/* Loadout */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800 text-[9px] font-mono font-black tracking-[0.35em] text-slate-500 uppercase">
                Loadout
              </div>
              <div className="p-4 space-y-2.5">
                <WeaponRow slot="PRIMARY" name={playerClass.primaryWeapon.name} type={playerClass.primaryWeapon.type} accent="#34d399" />
                <WeaponRow slot="SECONDARY" name={playerClass.secondaryWeapon.name} type={playerClass.secondaryWeapon.type} accent="#38bdf8" />
                {playerClass.ability?.name && playerClass.ability.name !== 'None' && (
                  <div className="flex items-center gap-3 pt-1">
                    <span className="w-16 text-[9px] font-mono font-black tracking-widest text-slate-500">ABILITY</span>
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-sm text-slate-200 font-semibold">{playerClass.ability.name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: loading gauge */}
          <div className="md:col-span-2 flex flex-col items-center justify-center gap-5 py-2">
            <div className="relative w-40 h-40">
              {/* dial rings */}
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#1e293b" strokeWidth="7" />
                <circle
                  cx="60" cy="60" r="52" fill="none"
                  stroke={ready ? '#34d399' : '#10b981'}
                  strokeWidth="7" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 52}`}
                  strokeDashoffset={`${2 * Math.PI * 52 * (1 - progress)}`}
                  style={{ transition: 'stroke-dashoffset 120ms linear', filter: 'drop-shadow(0 0 6px rgba(16,185,129,0.55))' }}
                />
                {/* tick marks */}
                {Array.from({ length: 12 }).map((_, i) => {
                  const a = (i / 12) * Math.PI * 2;
                  const x1 = 60 + Math.cos(a) * 42, y1 = 60 + Math.sin(a) * 42;
                  const x2 = 60 + Math.cos(a) * 46, y2 = 60 + Math.sin(a) * 46;
                  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#334155" strokeWidth="1.5" />;
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-black font-mono text-emerald-400 tabular-nums">{pct}</span>
                <span className="text-[9px] font-mono tracking-[0.4em] text-slate-500 uppercase">percent</span>
              </div>
            </div>

            <div className="h-5 font-mono text-[10px] tracking-[0.3em] uppercase">
              {ready ? (
                <span className="text-emerald-400">All systems nominal</span>
              ) : (
                <span className="text-slate-400">
                  <span className="text-emerald-500">&gt;</span> {BOOT_LINES[lineIdx]}
                  <span className="animate-pulse">_</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-6">
          <button
            disabled={!ready}
            onClick={() => { sounds.playUi('deploy'); onDeploy(); }}
            onMouseEnter={() => ready && sounds.playUi('hover')}
            className={`group relative px-12 py-4 rounded-xl font-black tracking-[0.35em] text-sm uppercase transition-all duration-300 overflow-hidden
              ${ready
                ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.35)] cursor-pointer scale-100 hover:scale-[1.03]'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
          >
            <span className="relative z-10 flex items-center gap-2">
              <Crosshair className="w-4 h-4" />
              {ready ? 'Deploy' : 'Deploying…'}
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </span>
            {ready && <span className="absolute inset-0 soj-sweep bg-gradient-to-r from-transparent via-white/25 to-transparent" />}
          </button>
          <button
            onClick={() => { sounds.playUi('back'); onAbort(); }}
            className="text-[10px] font-mono font-bold tracking-[0.3em] uppercase text-slate-500 hover:text-rose-400 transition-colors"
          >
            Abort
          </button>
        </div>
      </div>
    </div>
  );
};

const IntelRow: React.FC<{ icon: React.ReactNode; label: string; value: string; mono?: boolean }> = ({ icon, label, value, mono }) => (
  <div className="flex items-center gap-2.5">
    <span className="text-emerald-500/80">{icon}</span>
    <div className="min-w-0">
      <div className="text-[8px] font-mono font-black tracking-[0.3em] text-slate-500 uppercase">{label}</div>
      <div className={`text-slate-200 truncate ${mono ? 'font-mono text-xs' : 'text-sm font-semibold'}`}>{value}</div>
    </div>
  </div>
);

const WeaponRow: React.FC<{ slot: string; name: string; type: string; accent: string }> = ({ slot, name, type, accent }) => (
  <div className="flex items-center gap-3">
    <span className="w-16 text-[9px] font-mono font-black tracking-widest text-slate-500">{slot}</span>
    <span className="w-1 h-6 rounded-full" style={{ background: accent, boxShadow: `0 0 8px ${accent}66` }} />
    <span className="text-sm font-semibold text-slate-100 flex-1">{name}</span>
    <span className="text-[9px] font-mono font-black px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">{type}</span>
  </div>
);
