// Pure Web Audio procedural aviation soundscape: prop engine, airflow rush,
// ring chimes, bullseye shimmer, servos, stall/gear warnings, touchdown & fanfare.

export function createAudio() {
  let ctx = null, master = null, engOsc1 = null, engOsc2 = null, engGain = null, engFilter = null;
  let windGain = null, windFilter = null, muted = false, started = false, warnCooldown = 0;

  function ensureStarted() {
    if (started || muted) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      ctx = new AudioCtx();
      master = ctx.createGain(); master.gain.value = 0.28; master.connect(ctx.destination);

      engFilter = ctx.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 240; engFilter.Q.value = 1.6;
      engGain = ctx.createGain(); engGain.gain.value = 0.0001;
      engOsc1 = ctx.createOscillator(); engOsc1.type = 'sawtooth'; engOsc1.frequency.value = 54;
      engOsc2 = ctx.createOscillator(); engOsc2.type = 'triangle'; engOsc2.frequency.value = 108;
      engOsc1.connect(engFilter); engOsc2.connect(engFilter); engFilter.connect(engGain); engGain.connect(master);
      engOsc1.start(); engOsc2.start();

      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
      windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 420; windFilter.Q.value = 0.8;
      windGain = ctx.createGain(); windGain.gain.value = 0.0001;
      noise.connect(windFilter); windFilter.connect(windGain); windGain.connect(master); noise.start();
      started = true;
    } catch { started = false; }
  }

  function tone(freq, startOffset, dur, type = 'sine', vol = 0.22, freqEnd = null) {
    if (!started || muted || !ctx) return;
    const now = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, now);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + dur);
    g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(vol, now + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g); g.connect(master); osc.start(now); osc.stop(now + dur + 0.02);
  }

  function update(plane, active, stallWarn, gearWarn, dt) {
    if (!started || !ctx) return;
    if (ctx.state === 'suspended' && !muted) ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    if (muted || !active) {
      engGain.gain.setTargetAtTime(0.0001, now, 0.08);
      windGain.gain.setTargetAtTime(0.0001, now, 0.08);
      return;
    }
    const baseFreq = 42 + plane.rpm * 78 + plane.speed * 0.25;
    engOsc1.frequency.setTargetAtTime(baseFreq, now, 0.06);
    engOsc2.frequency.setTargetAtTime(baseFreq * 1.99, now, 0.06);
    engFilter.frequency.setTargetAtTime(170 + plane.rpm * 460, now, 0.08);
    engGain.gain.setTargetAtTime(0.11 + plane.rpm * 0.14, now, 0.08);

    const air = Math.min(1, plane.speed / 65);
    windFilter.frequency.setTargetAtTime(280 + air * 920 + plane.flapAnim * 240, now, 0.08);
    windGain.gain.setTargetAtTime(air * (0.045 + plane.flapAnim * 0.03 + plane.gearAnim * 0.015), now, 0.08);

    warnCooldown = Math.max(0, warnCooldown - dt);
    if ((stallWarn || gearWarn) && warnCooldown <= 0) {
      tone(gearWarn ? 880 : 1240, 0, 0.11, 'square', 0.09);
      warnCooldown = gearWarn ? 0.55 : 0.34;
    }
  }

  return {
    ensureStarted,
    update,
    playRing(streak, bullseye) {
      const root = 523.25 * 2 ** (Math.min(12, streak - 1) / 12);
      tone(root, 0, 0.24, 'triangle', 0.25);
      tone(root * 1.25, 0.05, 0.28, 'sine', 0.22);
      if (bullseye) { tone(root * 1.5, 0.1, 0.34, 'sine', 0.22); tone(root * 2, 0.15, 0.42, 'triangle', 0.18); }
    },
    playMiss: () => tone(290, 0, 0.18, 'sine', 0.14, 190),
    playServo: (up) => { tone(up ? 240 : 320, 0, 0.22, 'sawtooth', 0.08, up ? 360 : 210); tone(680, 0.2, 0.04, 'triangle', 0.11); },
    playLiftoff: () => { tone(392, 0, 0.18, 'triangle', 0.16); tone(523.25, 0.07, 0.26, 'triangle', 0.16); },
    playTouchdown: () => { tone(1450, 0, 0.07, 'sawtooth', 0.14, 720); tone(110, 0, 0.14, 'sine', 0.22, 52); },
    playApproach: () => { tone(660, 0, 0.14, 'sine', 0.16); tone(880, 0.14, 0.24, 'sine', 0.16); },
    playComplete: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.42, 'triangle', 0.22)),
    playCrash: () => { tone(140, 0, 0.48, 'sawtooth', 0.26, 38); tone(95, 0.04, 0.52, 'square', 0.18, 28); },
    toggleMute() { muted = !muted; if (!muted) ensureStarted(); return muted; },
    isMuted: () => muted,
  };
}
