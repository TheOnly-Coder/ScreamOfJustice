// Scream of Justice — hybrid audio engine.
//
// Layer 1: real CC0 sound samples (public/sfx/*.mp3) decoded once into
//          AudioBuffers, played through a master bus with a compressor so
//          overlapping gunfire never clips into that "loud wall" effect.
// Layer 2: the original Web Audio synthesizer as a graceful fallback for
//          every effect, in case a sample failed to fetch/decode.
//
// Sample sources (all CC0, see public/sfx/CREDITS.txt):
//   - Kenney "Impact / Interface / Sci-Fi / UI Audio" packs (kenney.nl)
//   - OpenGameArt: "Gunshot Sounds" (Raassh), "Gun reload sounds" (Joaken),
//     "Gunshots" (LarkPay), "Shotgun Reload Sound effects"

const SFX_LIST = [
  // gunshots
  'shot-ar', 'shot-ar-b', 'shot-sniper', 'shot-sniper-b', 'shot-shotgun',
  'shot-pistol', 'shot-smg', 'shot-revolver', 'shot-lmg', 'shot-rpg',
  'shot-blaster-light', 'shot-blaster-heavy', 'shot-blaster-retro', 'explosion',
  // mechanical
  'dryfire', 'reload-mag', 'reload-ar', 'reload-pump', 'reload-shell',
  // feedback
  'hit', 'headshot', 'kill', 'hurt', 'death', 'ability', 'victory', 'defeat',
  'type', 'tut',
  // footsteps
  'step-1', 'step-2', 'step-3', 'step-wood-1', 'step-wood-2', 'step-wood-3',
  // ui
  'ui-click', 'ui-open', 'ui-back', 'ui-toggle', 'deploy',
] as const;

type SfxName = (typeof SFX_LIST)[number];

interface PlayOpts {
  vol?: number;      // linear gain multiplier
  rate?: number;     // base playback rate (pitch)
  jitter?: number;   // random pitch variation ±, e.g. 0.05 = ±5%
  dist?: number;     // distance in meters — applies falloff + lowpass
  maxDist?: number;  // cutoff distance (default 65)
}

class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;
  private buffers = new Map<SfxName, AudioBuffer>();
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private activeVoices = 0;
  private preloadPromise: Promise<void> | null = null;
  private _alternate = false;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      // Master bus: gentle compression keeps layered gunfire/explosions
      // punchy without the deafening clipping the old synth suffered.
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -16;
      this.compressor.knee.value = 22;
      this.compressor.ratio.value = 5;
      this.compressor.attack.value = 0.002;
      this.compressor.release.value = 0.18;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.72;
      this.master.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle(state?: boolean) {
    this.enabled = state !== undefined ? state : !this.enabled;
    if (this.master && this.ctx) {
      this.master.gain.value = this.enabled ? 0.72 : 0;
    }
  }

  getIsEnabled() {
    return this.enabled;
  }

  /** True once at least some samples are decoded. */
  get bankReady() {
    return this.buffers.size > 0;
  }

  /**
   * Fetch + decode every sample. Safe to call repeatedly (single flight).
   * onProgress receives 0..1 as each file lands — used by the deploy screen.
   */
  preloadAll(onProgress?: (p: number) => void): Promise<void> {
    if (this.preloadPromise) return this.preloadPromise;
    this.init();
    if (!this.ctx) return Promise.resolve();
    const ctx = this.ctx;
    let done = 0;
    const total = SFX_LIST.length;

    this.preloadPromise = (async () => {
      // Small batches keep the main thread snappy while decoding.
      const BATCH = 6;
      for (let i = 0; i < SFX_LIST.length; i += BATCH) {
        const batch = SFX_LIST.slice(i, i + BATCH);
        await Promise.all(batch.map(async (name) => {
          if (this.buffers.has(name)) { done++; return; }
          try {
            const base = (import.meta as any).env?.BASE_URL || '/';
            const res = await fetch(`${base}sfx/${name}.mp3`);
            if (!res.ok) throw new Error(String(res.status));
            const arr = await res.arrayBuffer();
            const buf = await ctx.decodeAudioData(arr);
            this.buffers.set(name, buf);
          } catch {
            // Missing/broken sample — synth fallback still covers this effect.
          }
          done++;
          onProgress?.(done / total);
        }));
      }
    })();

    return this.preloadPromise;
  }

  /** Play a decoded sample with pitch jitter + optional distance modeling. */
  private playBuf(name: SfxName, opts: PlayOpts = {}): boolean {
    const buf = this.buffers.get(name);
    if (!buf || !this.ctx || !this.master || !this.enabled) return false;
    // Voice cap: under heavy crossfire skip quiet extras instead of building
    // an undistinguishable wall of noise.
    if (this.activeVoices > 10) return false;

    const { vol = 1, rate = 1, jitter = 0.05, dist = 0, maxDist = 65 } = opts;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);

    const g = this.ctx.createGain();
    let node: AudioNode = g;
    let volume = vol;

    if (dist > 1) {
      // Distance: linear falloff plus an increasingly muffled lowpass,
      // like distant gunfire through air.
      const t = Math.min(1, dist / maxDist);
      volume *= Math.max(0.04, 1 - t) ** 1.4;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.max(900, 8000 - t * 6800);
      g.connect(lp);
      lp.connect(this.master);
      node = g;
    } else {
      g.connect(this.master);
    }
    g.gain.value = volume;

    this.activeVoices++;
    src.onended = () => { this.activeVoices--; };
    src.connect(node);
    src.start();
    return true;
  }

  // ================= WEAPON FIRE =================

  private shootSampleFor(type: string): SfxName {
    this._alternate = !this._alternate;
    switch (type) {
      case 'SNIPER': return this._alternate ? 'shot-sniper' : 'shot-sniper-b';
      case 'SHOTGUN': return 'shot-shotgun';
      case 'PISTOL': return 'shot-pistol';
      case 'LMG': return 'shot-lmg';
      case 'LAUNCHER': return 'shot-rpg';
      case 'AR': return this._alternate ? 'shot-ar' : 'shot-ar-b';
      case 'SMG': return 'shot-smg';
      default: return 'shot-ar';
    }
  }

  /** First-person shot: present but not deafening, small pitch jitter so it never drones. */
  playShoot(type: string) {
    if (!this.enabled) return;
    this.init();
    if (this.playBuf(this.shootSampleFor(type), { vol: 0.5, jitter: 0.045 })) return;

    // --- synth fallback (legacy) ---
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const bufferSize = ctx.sampleRate * 0.4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    switch (type) {
      case 'SNIPER':
        filter.frequency.setValueAtTime(400, now);
        filter.frequency.exponentialRampToValueAtTime(10, now + 0.35);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.25);
        oscGain.gain.setValueAtTime(0.8, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        break;
      case 'LMG':
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(40, now + 0.12);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.1);
        oscGain.gain.setValueAtTime(0.3, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        break;
      case 'SMG':
        filter.frequency.setValueAtTime(1200, now);
        filter.frequency.exponentialRampToValueAtTime(80, now + 0.08);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.06);
        oscGain.gain.setValueAtTime(0.2, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        break;
      case 'SHOTGUN':
        filter.frequency.setValueAtTime(600, now);
        filter.frequency.exponentialRampToValueAtTime(10, now + 0.3);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.15);
        oscGain.gain.setValueAtTime(0.7, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        break;
      case 'PISTOL':
        filter.frequency.setValueAtTime(1000, now);
        filter.frequency.exponentialRampToValueAtTime(50, now + 0.15);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.1);
        oscGain.gain.setValueAtTime(0.4, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        break;
      case 'KNIFE': {
        const swooshOsc = ctx.createOscillator();
        const swooshGain = ctx.createGain();
        swooshOsc.type = 'sine';
        swooshOsc.frequency.setValueAtTime(600, now);
        swooshOsc.frequency.exponentialRampToValueAtTime(150, now + 0.15);
        swooshGain.gain.setValueAtTime(0.3, now);
        swooshGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        swooshOsc.connect(swooshGain);
        swooshGain.connect(ctx.destination);
        swooshOsc.start(now);
        swooshOsc.stop(now + 0.16);
        return;
      }
      default:
        filter.frequency.setValueAtTime(900, now);
        filter.frequency.exponentialRampToValueAtTime(50, now + 0.15);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(130, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.1);
        oscGain.gain.setValueAtTime(0.4, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
    }
    const noiseGain = ctx.createGain();
    const duration = type === 'SNIPER' ? 0.35 : type === 'SHOTGUN' ? 0.25 : type === 'LMG' ? 0.12 : type === 'SMG' ? 0.08 : 0.15;
    noiseGain.gain.setValueAtTime(type === 'SNIPER' ? 0.8 : type === 'SHOTGUN' ? 0.9 : 0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + duration);
    osc.start(now);
    osc.stop(now + duration);
  }

  /**
   * Distant gunshot (bots, remote players): volume falloff + muffling.
   * This was silent before — battles now actually sound like battles.
   */
  playShootAt(type: string, dist: number) {
    if (!this.enabled) return;
    this.init();
    if (dist > 65) return;
    if (this.playBuf(this.shootSampleFor(type), { vol: 0.42, jitter: 0.08, dist })) return;
    // Fallback: quiet synth shot
    if (dist < 22) this.playShoot(type);
  }

  /** RPG / explosive impact. */
  playExplosion() {
    if (!this.enabled) return;
    this.init();
    if (this.playBuf('explosion', { vol: 0.6, jitter: 0.04 })) return;
    // Synth fallback: filtered noise burst
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const bufferSize = ctx.sampleRate * 0.8;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, now);
    lp.frequency.exponentialRampToValueAtTime(60, now + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.75);
    noise.connect(lp); lp.connect(g); g.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.8);
  }

  /**
   * Empty-mag click. Deliberately quiet and mechanical — holding the trigger
   * on an empty mag used to blast the reload sound every frame.
   */
  playDryFire() {
    if (!this.enabled) return;
    this.init();
    if (this.playBuf('dryfire', { vol: 0.4, jitter: 0.06 })) return;
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.03);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  // ================= MECHANICAL / FEEDBACK =================

  playReload(weaponType?: string) {
    if (!this.enabled) return;
    this.init();
    const t = weaponType || '';
    if (t === 'SHOTGUN') {
      if (this.playBuf('reload-pump', { vol: 0.5, jitter: 0.04 })) return;
    } else if (t === 'SNIPER') {
      if (this.playBuf('reload-pump', { vol: 0.45, rate: 0.9 })) return;
    } else if (t === 'AR' || t === 'LMG') {
      if (this.playBuf('reload-ar', { vol: 0.5, jitter: 0.03 })) return;
    } else {
      if (this.playBuf('reload-mag', { vol: 0.5, jitter: 0.04 })) return;
    }

    // --- synth fallback (legacy two-click) ---
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(400, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.06);
    setTimeout(() => {
      if (!ctx || ctx.state === 'closed') return;
      const tNow = ctx.currentTime;
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(800, tNow);
      osc2.frequency.setValueAtTime(500, tNow + 0.04);
      gain2.gain.setValueAtTime(0.15, tNow);
      gain2.gain.exponentialRampToValueAtTime(0.01, tNow + 0.08);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(tNow);
      osc2.stop(tNow + 0.1);
    }, 350);
  }

  playHit() {
    if (!this.enabled) return;
    this.init();
    if (this.playBuf('hit', { vol: 0.32, jitter: 0.09 })) return;
    this.synthBlip('sine', 2000, 0.15, 0.04);
  }

  playHeadshot() {
    if (!this.enabled) return;
    this.init();
    if (this.playBuf('headshot', { vol: 0.42, jitter: 0.05 })) return;
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(2800, now);
    osc1.frequency.exponentialRampToValueAtTime(1400, now + 0.08);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(3200, now);
    osc2.frequency.exponentialRampToValueAtTime(800, now + 0.1);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.12);
    osc2.start(now);
    osc2.stop(now + 0.12);
  }

  playKill() {
    if (!this.enabled) return;
    this.init();
    if (this.playBuf('kill', { vol: 0.5, jitter: 0.03 })) return;
    this.synthBlip('triangle', 880, 0.35, 0.3, 1320);
  }

  playHurt() {
    if (!this.enabled) return;
    this.init();
    if (this.playBuf('hurt', { vol: 0.42, jitter: 0.08 })) return;
    this.synthBlip('sawtooth', 140, 0.18, 0.3, 50, true);
  }

  playDeath() {
    if (!this.enabled) return;
    this.init();
    if (this.playBuf('death', { vol: 0.5, jitter: 0.05 })) return;
    this.synthBlip('sawtooth', 110, 0.65, 0.4, 25, true);
  }

  playAbility() {
    if (!this.enabled) return;
    this.init();
    if (this.playBuf('ability', { vol: 0.5, jitter: 0.03 })) return;
    this.synthBlip('sine', 300, 0.55, 0.35, 1200, false, 0.5);
  }

  playMatchEnd(isVictory: boolean) {
    if (!this.enabled) return;
    this.init();
    if (isVictory) {
      if (this.playBuf('victory', { vol: 0.6 })) return;
    } else {
      if (this.playBuf('defeat', { vol: 0.55, rate: 0.9 })) return;
    }
    // Legacy chord fallback
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const notes = isVictory ? [261.63, 329.63, 392.00, 523.25] : [261.63, 246.94, 220.00, 196.00];
    const duration = 0.35;
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.2);
      gain.gain.setValueAtTime(0, now);
      gain.gain.setValueAtTime(0.2, now + idx * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.2 + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + (idx + 1) * 0.2 + duration);
    });
  }

  playTypeSound() {
    if (!this.enabled) return;
    this.init();
    if (this.playBuf('type', { vol: 0.28, jitter: 0.15 })) return;
    this.synthBlip('sine', 800 + Math.random() * 400, 0.03, 0.035);
  }

  playTutComplete() {
    if (!this.enabled) return;
    this.init();
    if (this.playBuf('tut', { vol: 0.5 })) return;
    this.synthBlip('sine', 660, 0.25, 0.15, 880);
  }

  // ================= FOOTSTEPS =================

  private stepAlternate = false;
  playFootstep(surface: 'concrete' | 'wood' = 'concrete', running = false) {
    if (!this.enabled) return;
    this.init();
    this.stepAlternate = !this.stepAlternate;
    const idx = this.stepAlternate ? 1 : 2;
    const name: SfxName = surface === 'wood' ? `step-wood-${idx}` as SfxName : `step-${idx}` as SfxName;
    this.playBuf(name, { vol: running ? 0.24 : 0.15, jitter: 0.12, rate: running ? 1.06 : 0.96 });
  }

  // ================= UI =================

  playUi(kind: 'click' | 'hover' | 'open' | 'back' | 'toggle' | 'deploy' = 'click') {
    if (!this.enabled) return;
    this.init();
    switch (kind) {
      case 'hover': return; // hover ticks were annoying — intentionally silent
      case 'open': this.playBuf('ui-open', { vol: 0.32, jitter: 0.04 }); return;
      case 'back': this.playBuf('ui-back', { vol: 0.36, jitter: 0.06 }); return;
      case 'toggle': this.playBuf('ui-toggle', { vol: 0.32, jitter: 0.05 }); return;
      case 'deploy': this.playBuf('deploy', { vol: 0.5, jitter: 0.02 }); return;
      default: this.playBuf('ui-click', { vol: 0.4, jitter: 0.05 });
    }
  }

  // ================= helpers =================

  private synthBlip(type: OscillatorType, from: number, dur: number, vol: number, to?: number, linear = false, peakDelay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    if (to !== undefined) {
      if (linear) osc.frequency.linearRampToValueAtTime(to, now + dur);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + dur);
    }
    if (peakDelay > 0) {
      gain.gain.setValueAtTime(vol * 0.5, now);
      gain.gain.linearRampToValueAtTime(vol, now + peakDelay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    } else {
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    }
    osc.connect(gain);
    gain.connect(this.master || ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }
}

export const sounds = new SoundManager();
export default sounds;
