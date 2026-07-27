import React, { useState, useEffect, useRef, useCallback } from 'react';

interface MainMenuProps {
  onClassicMode: () => void;
  user: any;
}

export function MainMenu({ onClassicMode, user }: MainMenuProps) {
  const [hoveredButton, setHoveredButton] = useState<'classic' | 'campaign' | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const musicNodesRef = useRef<OscillatorNode[]>([]);
  const musicStartedRef = useRef(false);
  const hoverPlayedRef = useRef<Record<string, boolean>>({});

  const getCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
      musicGainRef.current = audioCtxRef.current.createGain();
      musicGainRef.current.gain.value = 0.15;
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

    // Dramatic intense 16-bit shooter theme - D minor, 160 BPM
    const bpm = 160;
    const bd = 60 / bpm;

    // Lead melody - tense, driving
    const mel: [number,number,number][] = [
      // Bar 1-2: Descending tension
      [587.33,0,0.25],[554.37,0.25,0.25],[523.25,0.5,0.25],[493.88,0.75,0.25],
      [440,1,0.5],[493.88,1.5,0.25],[523.25,1.75,0.25],
      // Bar 3-4: Building
      [587.33,2,0.25],[622.25,2.25,0.25],[587.33,2.5,0.5],[523.25,3,0.25],[493.88,3.25,0.25],[440,3.5,0.5],
      // Bar 5-6: Aggressive peak
      [587.33,4,0.25],[698.46,4.25,0.25],[659.25,4.5,0.25],[587.33,4.75,0.25],
      [523.25,5,0.5],[493.88,5.5,0.25],[440,5.75,0.25],
      // Bar 7-8: Resolution drop
      [392,6,0.5],[440,6.5,0.25],[493.88,6.75,0.25],[523.25,7,0.5],[493.88,7.5,0.5],
      // Bar 9-10: Second phrase - darker
      [349.23,8,0.25],[392,8.25,0.25],[440,8.5,0.5],[392,9,0.5],[349.23,9.5,0.5],
      // Bar 11-12: Rise again
      [440,10,0.25],[493.88,10.25,0.25],[523.25,10.5,0.25],[587.33,10.75,0.25],
      [622.25,11,0.5],[587.33,11.5,0.25],[523.25,11.75,0.25],
      // Bar 13-14: Climax
      [698.46,12,0.25],[659.25,12.25,0.25],[622.25,12.5,0.25],[587.33,12.75,0.25],
      [523.25,13,0.5],[493.88,13.5,0.25],[440,13.75,0.25],
      // Bar 15-16: Final resolution
      [392,14,0.5],[349.23,14.5,0.5],[293.66,15,0.5],[293.66,15.5,0.5],
    ];

    // Fast arpeggio layer - adds intensity
    const arp: [number,number,number][] = [
      [146.83,0,0.25],[174.61,0.25,0.25],[220,0.5,0.25],[174.61,0.75,0.25],
      [146.83,1,0.25],[174.61,1.25,0.25],[220,1.5,0.25],[174.61,1.75,0.25],
      [146.83,2,0.25],[174.61,2.25,0.25],[220,2.5,0.25],[174.61,2.75,0.25],
      [146.83,3,0.25],[174.61,3.25,0.25],[220,3.5,0.25],[174.61,3.75,0.25],
      [130.81,4,0.25],[164.81,4.25,0.25],[196,4.5,0.25],[164.81,4.75,0.25],
      [130.81,5,0.25],[164.81,5.25,0.25],[196,5.5,0.25],[164.81,5.75,0.25],
      [116.54,6,0.25],[146.83,6.25,0.25],[174.61,6.5,0.25],[146.83,6.75,0.25],
      [116.54,7,0.25],[146.83,7.25,0.25],[174.61,7.5,0.25],[146.83,7.75,0.25],
      [116.54,8,0.25],[146.83,8.25,0.25],[174.61,8.5,0.25],[146.83,8.75,0.25],
      [130.81,9,0.25],[164.81,9.25,0.25],[196,9.5,0.25],[164.81,9.75,0.25],
      [146.83,10,0.25],[174.61,10.25,0.25],[220,10.5,0.25],[174.61,10.75,0.25],
      [146.83,11,0.25],[174.61,11.25,0.25],[220,11.5,0.25],[174.61,11.75,0.25],
      [164.81,12,0.25],[196,12.25,0.25],[246.94,12.5,0.25],[196,12.75,0.25],
      [164.81,13,0.25],[196,13.25,0.25],[246.94,13.5,0.25],[196,13.75,0.25],
      [146.83,14,0.25],[174.61,14.25,0.25],[220,14.5,0.25],[174.61,14.75,0.25],
      [130.81,15,0.25],[146.83,15.25,0.25],[174.61,15.5,0.25],[146.83,15.75,0.25],
    ];

    // Deep driving bass
    const bas: [number,number,number][] = [
      [73.42,0,1],[73.42,1,0.5],[87.31,1.5,0.5],
      [98,2,1],[87.31,3,1],
      [65.41,4,1],[73.42,5,0.5],[87.31,5.5,0.5],
      [58.27,6,1],[65.41,7,1],
      [58.27,8,1],[65.41,9,0.5],[73.42,9.5,0.5],
      [73.42,10,1],[65.41,11,1],
      [82.41,12,1],[73.42,13,0.5],[65.41,13.5,0.5],
      [73.42,14,1],[65.41,15,1],
    ];

    // Punchy drum-like noise hits
    const drums: [number,number][] = [
      [0],[0.5],[1],[1.5],[2],[2.5],[3],[3.5],
      [4],[4.5],[5],[5.5],[6],[6.5],[7],[7.5],
      [8],[8.25],[8.5],[8.75],[9],[9.5],[10],[10.5],[11],[11.5],[12],[12.5],[13],[13.5],[14],[14.5],[15],[15.5],
    ];

    const loopLen = 16 * bd;

    const play = () => {
      if (!ctx||!musicGainRef.current) return;
      musicNodesRef.current.forEach(n=>{try{n.stop()}catch(e){}});
      musicNodesRef.current=[];
      const now=ctx.currentTime;

      // Melody - sawtooth for aggression
      mel.forEach(([f,sb,db])=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type='sawtooth';o.frequency.value=f;o.detune.value=(Math.random()-0.5)*8;
        const t=now+sb*bd,d=db*bd;
        g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.18,t+0.008);
        g.gain.setValueAtTime(0.14,t+d*0.6);g.gain.linearRampToValueAtTime(0,t+d);
        o.connect(g);g.connect(musicGainRef.current!);o.start(t);o.stop(t+d);
        musicNodesRef.current.push(o);
      });

      // Arpeggio - square wave, quieter
      arp.forEach(([f,sb,db])=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type='square';o.frequency.value=f*2;
        const t=now+sb*bd,d=db*bd;
        g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.06,t+0.005);
        g.gain.setValueAtTime(0.04,t+d*0.5);g.gain.linearRampToValueAtTime(0,t+d);
        o.connect(g);g.connect(musicGainRef.current!);o.start(t);o.stop(t+d);
        musicNodesRef.current.push(o);
      });

      // Bass - triangle, deep
      bas.forEach(([f,sb,db])=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type='triangle';o.frequency.value=f;
        const t=now+sb*bd,d=db*bd;
        g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.3,t+0.015);
        g.gain.setValueAtTime(0.25,t+d*0.7);g.gain.linearRampToValueAtTime(0,t+d);
        o.connect(g);g.connect(musicGainRef.current!);o.start(t);o.stop(t+d);
        musicNodesRef.current.push(o);
      });

      // Drum hits - noise bursts
      drums.forEach(([sb])=>{
        const bufSize = ctx.sampleRate * 0.04;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for(let i=0;i<bufSize;i++) data[i]=(Math.random()*2-1)*Math.exp(-i/(bufSize*0.15));
        const src=ctx.createBufferSource(),g=ctx.createGain(),filt=ctx.createBiquadFilter();
        src.buffer=buf;
        filt.type='highpass';filt.frequency.value=sb%1===0?8000:4000;
        const t=now+sb*bd;
        g.gain.setValueAtTime(sb%1===0?0.15:0.08,t);
        g.gain.exponentialRampToValueAtTime(0.001,t+0.04);
        src.connect(filt);filt.connect(g);g.connect(musicGainRef.current!);
        src.start(t);
        musicNodesRef.current.push(src as any);
      });
    };

    play();
    const iv=setInterval(()=>{if(ctx.state==='closed'){clearInterval(iv);return}play()},loopLen*1000);
    (musicGainRef.current as any).__iv=iv;
  },[getCtx]);

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
    fontFamily:'"Press Start 2P","Courier New",monospace',
    fontSize:'clamp(0.9rem,1.8vw,1.2rem)',
    padding:'16px 48px',border:'2px solid #4ade80',borderRadius:'4px',
    color:'#4ade80',background:'rgba(34,197,94,0.08)',cursor:'pointer',
    transition:'all 0.25s cubic-bezier(0.22,1,0.36,1)',outline:'none',
    letterSpacing:'0.1em',position:'relative',overflow:'hidden',textTransform:'uppercase',
  };

  const getStyle=(id:'classic'|'campaign'):React.CSSProperties=>{
    const h=hoveredButton===id;
    return{...btnBase,
      transform:h?'scale(1.12)':'scale(1)',
      borderColor:h?'#86efac':'#4ade80',
      color:h?'#bbf7d0':'#4ade80',
      background:h?'linear-gradient(135deg,rgba(34,197,94,0.25),rgba(34,197,94,0.12))':'rgba(34,197,94,0.08)',
      boxShadow:h?'0 0 30px rgba(74,222,128,0.3),inset 0 0 20px rgba(74,222,128,0.05)':'none',
      textShadow:h?'0 0 12px rgba(74,222,128,0.6)':'none',
    };
  };

  const particles = Array.from({length:50},(_,i)=>({
    w:1+Math.random()*2, l:Math.random()*100, t:Math.random()*100,
    h:140+Math.random()*40, s:80, li:40+Math.random()*30,
    o:0.12+Math.random()*0.2,
    dur:3+Math.random()*4, del:Math.random()*3,
  }));

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center select-none cursor-default"
      style={{background:'radial-gradient(ellipse at 50% 40%,#0a1628 0%,#020810 70%,#000000 100%)'}}
      onClick={startMusic}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((p,i)=>(
          <div key={i} className="absolute rounded-full" style={{
            width:`${p.w}px`,height:`${p.w}px`,left:`${p.l}%`,top:`${p.t}%`,
            background:`hsl(${p.h},${p.s}%,${p.li}%)`,opacity:p.o,
            animation:`mmFloat ${p.dur}s ease-in-out ${p.del}s infinite`,
          }}/>
        ))}
      </div>
      <div className="relative z-10 mb-20">
        <h1 style={{
          fontSize:'clamp(2rem,5.5vw,4.5rem)',
          fontFamily:'"Press Start 2P","Courier New",monospace',
          color:'transparent',
          background:'linear-gradient(90deg,#00ff88,#00ccff,#cc44ff,#ffcc00,#00ff88)',
          backgroundSize:'400% 100%',WebkitBackgroundClip:'text',backgroundClip:'text',
          animation:'mmHue 6s linear infinite',
          filter:'drop-shadow(0 0 25px rgba(0,255,136,0.35))',
          letterSpacing:'0.08em',fontWeight:700,whiteSpace:'nowrap',
        }}>SCREAM OF JUSTICE</h1>
        {user?.username&&<p className="text-center mt-4" style={{
          fontFamily:'"Courier New",monospace',color:'rgba(255,255,255,0.3)',
          fontSize:'clamp(0.55rem,1.1vw,0.8rem)',letterSpacing:'0.3em',
        }}>Welcome, {user.username}</p>}
      </div>
      <div className="relative z-10 flex flex-col gap-5">
        <button onClick={e=>{e.stopPropagation();onClassicMode()}}
          onMouseEnter={()=>onEnter('classic')} onMouseLeave={onLeave}
          style={getStyle('classic')}>Classic</button>
        <button onClick={e=>e.stopPropagation()}
          onMouseEnter={()=>onEnter('campaign')} onMouseLeave={onLeave}
          style={getStyle('campaign')}>Campaign</button>
      </div>
      <style>{`
        @keyframes mmHue{0%{background-position:0% 50%}100%{background-position:400% 50%}}
        @keyframes mmFloat{0%,100%{transform:translateY(0) translateX(0);opacity:0.15}
          25%{transform:translateY(-15px) translateX(5px);opacity:0.3}
          50%{transform:translateY(-8px) translateX(-5px);opacity:0.2}
          75%{transform:translateY(-20px) translateX(3px);opacity:0.25}}
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
      `}</style>
    </div>
  );
}
