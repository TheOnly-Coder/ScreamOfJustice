import React, { useState, useEffect, useRef, useCallback } from 'react';

interface MainMenuProps {
  onClassicMode: () => void;
  onCampaignMode: () => void;
  user: any;
}

export function MainMenu({ onClassicMode, onCampaignMode, user }: MainMenuProps) {
   const [hoveredButton, setHoveredButton] = useState<'classic' | 'campaign' | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const musicNodesRef = useRef<OscillatorNode[]>([]);
  const musicStartedRef = useRef(false);
  const hoverPlayedRef = useRef<Record<string, boolean>>({});
  const [musicPlaying] = useState(true);

  const getCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
      musicGainRef.current = audioCtxRef.current.createGain();
      musicGainRef.current.gain.value = 0.35;
      musicGainRef.current.connect(audioCtxRef.current.destination);
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    return audioCtxRef.current;
  }, []);

  const startMusic = useCallback(() => {
    if (musicStartedRef.current) return;
    musicStartedRef.current = true;
    const ctx = getCtx();
    if (!ctx || !musicGainRef.current) return;

    // Dramatic 16-bit theme - D minor, 108 BPM, SNES-style
    const bpm = 108;
    const bd = 60 / bpm;

    // Lead melody - square wave, dramatic minor key
    const mel: [number,number,number][] = [
      // Phrase 1: Tense opening (bars 1-4)
      [293.66,0,1],[349.23,1,0.5],[392,1.5,0.5],[440,2,1],[392,3,1],
      // Phrase 2: Rising action (bars 5-8)
      [440,4,0.5],[493.88,4.5,0.5],[523.25,5,1],[493.88,6,0.5],[440,6.5,0.5],[392,7,1],
      // Phrase 3: Dark climax (bars 9-12)
      [349.23,8,0.5],[293.66,8.5,0.5],[261.63,9,1.5],[293.66,10.5,0.5],[349.23,11,0.5],
      // Phrase 4: Resolution (bars 13-16)
      [392,12,1],[440,13,0.5],[523.25,13.5,0.5],[493.88,14,1],[440,15,0.5],[392,15.5,0.5],
    ];

    // Harmony - square wave, octave lower, softer
    const harm: [number,number,number][] = [
      [146.83,0,2],[174.61,2,2],[220,4,2],[196,6,2],
      [146.83,8,2],[130.81,10,2],[174.61,12,2],[196,14,2],
    ];

    // Bass - triangle, deep and driving
    const bas: [number,number,number][] = [
      [73.42,0,2],[65.41,2,2],[87.31,4,2],[98,6,2],
      [73.42,8,2],[65.41,10,2],[87.31,12,2],[98,14,2],
    ];

    // Rhythm - pulse on beats 1 and 3
    const rhythm: [number][] = [[0],[2],[4],[6],[8],[10],[12],[14]];

    const loopLen = 16 * bd;

    const play = () => {
      if (!ctx||!musicGainRef.current) return;
      musicNodesRef.current.forEach(n=>{try{n.stop()}catch(e){}});
      musicNodesRef.current=[];
      const now=ctx.currentTime;

      // Melody - square wave
      mel.forEach(([f,sb,db])=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type='square';o.frequency.value=f;o.detune.value=(Math.random()-0.5)*4;
        const t=now+sb*bd,d=db*bd;
        g.gain.setValueAtTime(0,t);
        g.gain.linearRampToValueAtTime(0.22,t+0.02);
        g.gain.setValueAtTime(0.18,t+d*0.6);
        g.gain.linearRampToValueAtTime(0,t+d);
        o.connect(g);g.connect(musicGainRef.current!);o.start(t);o.stop(t+d);
        musicNodesRef.current.push(o);
      });

      // Harmony
      harm.forEach(([f,sb,db])=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type='square';o.frequency.value=f;
        const t=now+sb*bd,d=db*bd;
        g.gain.setValueAtTime(0,t);
        g.gain.linearRampToValueAtTime(0.08,t+0.02);
        g.gain.setValueAtTime(0.06,t+d*0.7);
        g.gain.linearRampToValueAtTime(0,t+d);
        o.connect(g);g.connect(musicGainRef.current!);o.start(t);o.stop(t+d);
        musicNodesRef.current.push(o);
      });

      // Bass
      bas.forEach(([f,sb,db])=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type='triangle';o.frequency.value=f;
        const t=now+sb*bd,d=db*bd;
        g.gain.setValueAtTime(0,t);
        g.gain.linearRampToValueAtTime(0.28,t+0.02);
        g.gain.setValueAtTime(0.22,t+d*0.7);
        g.gain.linearRampToValueAtTime(0,t+d);
        o.connect(g);g.connect(musicGainRef.current!);o.start(t);o.stop(t+d);
        musicNodesRef.current.push(o);
      });

      // Rhythm hits - short noise pulse
      rhythm.forEach(([sb])=>{
        const bufSize = Math.floor(ctx.sampleRate * 0.06);
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for(let i=0;i<bufSize;i++) data[i]=(Math.random()*2-1)*Math.exp(-i/(bufSize*0.12));
        const src=ctx.createBufferSource(),g=ctx.createGain();
        src.buffer=buf;
        const t=now+sb*bd;
        g.gain.setValueAtTime(0.12,t);
        g.gain.exponentialRampToValueAtTime(0.001,t+0.06);
        src.connect(g);g.connect(musicGainRef.current!);
        src.start(t);
      });
    };

    play();
    const iv=setInterval(()=>{
      if(ctx.state==='closed'){clearInterval(iv);return}
      play();
    },loopLen*1000);
    (musicGainRef.current as any).__iv=iv;
  },[getCtx]);

  useEffect(()=>{ startMusic(); },[startMusic]);

  const playHover = useCallback((id:string)=>{
    if(hoverPlayedRef.current[id])return;
    hoverPlayedRef.current[id]=true;
    const ctx=getCtx();if(!ctx)return;
    const now=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain();
    o.type='square';
    o.frequency.setValueAtTime(880,now);
    o.frequency.exponentialRampToValueAtTime(1320,now+0.06);
    g.gain.setValueAtTime(0,now);
    g.gain.linearRampToValueAtTime(0.1,now+0.008);
    g.gain.exponentialRampToValueAtTime(0.001,now+0.1);
    o.connect(g);g.connect(ctx.destination);o.start(now);o.stop(now+0.1);
  },[getCtx]);

  useEffect(()=>{
    return ()=>{
      musicNodesRef.current.forEach(n=>{try{n.stop()}catch(e){}});
      if(musicGainRef.current){const iv=(musicGainRef.current as any).__iv;if(iv)clearInterval(iv)}
      if(audioCtxRef.current)audioCtxRef.current.close();
    };
  },[]);

  const onEnter=(id:'classic'|'campaign')=>{setHoveredButton(id);hoverPlayedRef.current[id]=false;playHover(id)};
  const onLeave=()=>{setHoveredButton(null);hoverPlayedRef.current={};};

  const btnBase:React.CSSProperties={
    fontFamily:'var(--soj-font-display)',
    fontSize:'clamp(0.95rem,1.6vw,1.15rem)',
    padding:'18px 56px',border:'1px solid #3d4a5c',
    color:'#e2e8f0',background:'linear-gradient(180deg,#1a212e 0%,#11161f 100%)',cursor:'pointer',
    transition:'all 0.2s cubic-bezier(0.22,1,0.36,1)',outline:'none',
    letterSpacing:'0.14em',position:'relative',overflow:'hidden',textTransform:'uppercase',
    clipPath:'polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))',
  };

  const getStyle=(id:'classic'|'campaign'):React.CSSProperties=>{
    const h=hoveredButton===id;
    const isPrimary = id === 'classic';
    if (isPrimary) {
      return{...btnBase,
        transform:h?'scale(1.04)':'scale(1)',
        borderColor:h?'#fbbf24':'#f59e0b',
        color:'#0a0e14',
        background:h?'linear-gradient(180deg,#fcd34d 0%,#fbbf24 100%)':'linear-gradient(180deg,#fbbf24 0%,#f59e0b 100%)',
        boxShadow:h?'0 0 32px rgba(245,158,11,0.45),inset 0 0 16px rgba(255,255,255,0.1)':'0 0 12px rgba(245,158,11,0.15)',
        textShadow:h?'0 1px 0 rgba(255,255,255,0.3)':'none',
        fontWeight:700,
      };
    }
    return{...btnBase,
      transform:h?'scale(1.04)':'scale(1)',
      borderColor:h?'#f59e0b':'#3d4a5c',
      color:h?'#fbbf24':'#e2e8f0',
      background:h?'linear-gradient(180deg,#1a212e 0%,#11161f 100%)':'linear-gradient(180deg,#1a212e 0%,#11161f 100%)',
      boxShadow:h?'0 0 24px rgba(245,158,11,0.25),inset 0 0 12px rgba(245,158,11,0.05)':'none',
      textShadow:h?'0 0 10px rgba(245,158,11,0.5)':'none',
    };
  };

  // Atmospheric embers/dust motes — warmer palette to match the amber theme
  const particles = Array.from({length:60},()=>({
    w:1+Math.random()*2.5, l:Math.random()*100, t:Math.random()*100,
    // Amber/orange/red ember tones
    h:25+Math.random()*35, s:70+Math.random()*30, li:45+Math.random()*30,
    o:0.10+Math.random()*0.22,
    dur:4+Math.random()*5, del:Math.random()*4,
  }));

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center select-none cursor-default overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at 50% 35%, #1a1208 0%, #0a0e14 55%, #020408 100%)',
      }}>
      {/* Vignette + subtle grid overlay for tactical feel */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(245,158,11,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(245,158,11,0.025) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse at 50% 50%, black 30%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, black 30%, transparent 80%)',
        }}/>
      {/* Floating embers */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((p,i)=>(
          <div key={i} className="absolute rounded-full" style={{
            width:`${p.w}px`,height:`${p.w}px`,left:`${p.l}%`,top:`${p.t}%`,
            background:`hsl(${p.h},${p.s}%,${p.li}%)`,opacity:p.o,
            animation:`mmFloat ${p.dur}s ease-in-out ${p.del}s infinite`,
            boxShadow:`0 0 6px hsl(${p.h},${p.s}%,${p.li}%)`,
          }}/>
        ))}
      </div>
      {/* Title block */}
      <div className="relative z-10 mb-16 text-center">
        <div className="text-amber-500/60 font-tactical text-xs tracking-[0.4em] mb-3 uppercase">
          Tactical Combat FPS
        </div>
        <h1 style={{
          fontSize:'clamp(2.2rem,6vw,5rem)',
          fontFamily:'var(--soj-font-display)',
          color:'transparent',
          background:'linear-gradient(180deg, #fef3c7 0%, #fbbf24 45%, #d97706 100%)',
          WebkitBackgroundClip:'text',backgroundClip:'text',
          filter:'drop-shadow(0 4px 24px rgba(245,158,11,0.35)) drop-shadow(0 1px 0 rgba(0,0,0,0.5))',
          letterSpacing:'0.06em',fontWeight:400,whiteSpace:'nowrap',
          lineHeight:1,
        }}>SCREAM OF JUSTICE</h1>
        {/* Amber accent bar under title */}
        <div className="mx-auto mt-4" style={{
          width: '120px', height: '2px',
          background: 'linear-gradient(90deg, transparent, #f59e0b, transparent)',
        }}/>
        {user?.username && (
          <p className="text-center mt-5 font-tactical text-xs"
            style={{color:'rgba(226,232,240,0.45)', letterSpacing:'0.3em'}}>
            AUTHENTICATED · <span style={{color:'#fbbf24'}}>{user.username.toUpperCase()}</span>
          </p>
        )}
      </div>
      {/* Buttons */}
      <div className="relative z-10 flex flex-col gap-4 items-center">
        <button onClick={e=>{e.stopPropagation();onClassicMode()}}
          onMouseEnter={()=>onEnter('classic')} onMouseLeave={onLeave}
          style={getStyle('classic')}>Deploy · Classic</button>
        <button onClick={e=>{e.stopPropagation();onCampaignMode()}}
          onMouseEnter={()=>onEnter('campaign')} onMouseLeave={onLeave}
          style={getStyle('campaign')}>Campaign</button>
        <div className="mt-6 font-tactical text-[10px] tracking-[0.3em] uppercase text-slate-600">
          Click to begin · Audio enabled
        </div>
      </div>
      <style>{`
        @keyframes mmFloat{0%,100%{transform:translateY(0) translateX(0);opacity:0.15}
          25%{transform:translateY(-18px) translateX(6px);opacity:0.35}
          50%{transform:translateY(-10px) translateX(-6px);opacity:0.22}
          75%{transform:translateY(-24px) translateX(4px);opacity:0.3}}
      `}</style>
    </div>
  );
}
