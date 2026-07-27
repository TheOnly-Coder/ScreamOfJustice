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
    const mel: [number,number,number][] = [
      [523.25,0,0.5],[587.33,0.5,0.5],[659.25,1,0.5],[523.25,1.5,0.5],[659.25,2,0.5],[698.46,2.5,0.5],[783.99,3,1],
      [698.46,4,0.5],[659.25,4.5,0.5],[523.25,5,0.5],[440,5.5,0.5],[523.25,6,0.5],[587.33,6.5,0.5],[523.25,7,1],
      [349.23,8,0.5],[392,8.5,0.5],[440,9,0.5],[523.25,9.5,0.5],[587.33,10,0.5],[523.25,10.5,0.5],
      [440,11,0.5],[392,11.5,0.5],[349.23,12,0.5],[392,12.5,0.5],[440,13,0.5],[349.23,13.5,0.5],
      [329.63,14,0.5],[349.23,14.5,0.5],[261.63,15,1],
    ];
    const bas: [number,number,number][] = [
      [130.81,0,2],[110,2,2],[87.31,4,2],[98,6,2],[130.81,8,2],[146.83,10,2],[110,12,2],[130.81,14,2],
    ];
    const bd = 60/140;
    const loopLen = 16*bd;
    const play = () => {
      if (!ctx||!musicGainRef.current) return;
      musicNodesRef.current.forEach(n=>{try{n.stop()}catch(e){}});
      musicNodesRef.current=[];
      const now=ctx.currentTime;
      mel.forEach(([f,sb,db])=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type='square';o.frequency.value=f;o.detune.value=(Math.random()-0.5)*6;
        const t=now+sb*bd,d=db*bd;
        g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.28,t+0.01);
        g.gain.setValueAtTime(0.22,t+d*0.7);g.gain.linearRampToValueAtTime(0,t+d);
        o.connect(g);g.connect(musicGainRef.current!);o.start(t);o.stop(t+d);
        musicNodesRef.current.push(o);
      });
      bas.forEach(([f,sb,db])=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type='triangle';o.frequency.value=f;
        const t=now+sb*bd,d=db*bd;
        g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.22,t+0.02);
        g.gain.setValueAtTime(0.18,t+d*0.8);g.gain.linearRampToValueAtTime(0,t+d);
        o.connect(g);g.connect(musicGainRef.current!);o.start(t);o.stop(t+d);
        musicNodesRef.current.push(o);
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
