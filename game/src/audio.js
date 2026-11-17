// Original WebAudio sound for Solara City: every sound is synthesised, no audio
// files. Engine hum, police siren, gunshots, explosions, pickups, a mission jingle
// and a slow ambient pad loop. Nothing plays until the first user gesture.
export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    muted: false,
    musicGain: null,
    engineOsc: null,
    engineOsc2: null,
    engineGain: null,
    engineFilter: null,
    sirenOsc: null,
    sirenGain: null,
    sirenTimer: 0,
    sirenHigh: false,
    musicTimer: 0,
    musicStep: 0,
    started: false,
  };

  function ensure() {
    if (audio.ctx) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      audio.ctx = new Ctx();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = audio.muted ? 0 : 0.55;
      audio.master.connect(audio.ctx.destination);
      audio.musicGain = audio.ctx.createGain();
      audio.musicGain.gain.value = 0.16;
      audio.musicGain.connect(audio.master);
      // Engine: two detuned saws through a lowpass, gain by speed.
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 55;
      audio.engineOsc2 = audio.ctx.createOscillator();
      audio.engineOsc2.type = 'square';
      audio.engineOsc2.frequency.value = 28;
      audio.engineFilter = audio.ctx.createBiquadFilter();
      audio.engineFilter.type = 'lowpass';
      audio.engineFilter.frequency.value = 320;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      audio.engineOsc.connect(audio.engineFilter);
      audio.engineOsc2.connect(audio.engineFilter);
      audio.engineFilter.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();
      audio.engineOsc2.start();
      // Siren: a square wave that alternates between two tones.
      audio.sirenOsc = audio.ctx.createOscillator();
      audio.sirenOsc.type = 'square';
      audio.sirenOsc.frequency.value = 720;
      audio.sirenGain = audio.ctx.createGain();
      audio.sirenGain.gain.value = 0;
      audio.sirenOsc.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.master);
      audio.sirenOsc.start();
      audio.started = true;
      return true;
    } catch {
      return false;
    }
  }

  function resume() {
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
  }

  /** Call on the first click/keypress; safe to call repeatedly. */
  audio.unlock = function unlock() {
    if (ensure()) resume();
  };

  audio.setMuted = function setMuted(m) {
    audio.muted = m;
    if (audio.master) audio.master.gain.value = m ? 0 : 0.55;
  };

  audio.toggleMute = function toggleMute() {
    audio.setMuted(!audio.muted);
    return audio.muted;
  };

  /** speed 0..1 while driving; 0 and not driving silences the engine. */
  audio.engine = function engine(speed01, driving) {
    if (!audio.ctx) return;
    const t = audio.ctx.currentTime;
    const target = driving ? 0.05 + speed01 * 0.11 : 0;
    audio.engineGain.gain.setTargetAtTime(target, t, 0.08);
    const freq = 52 + speed01 * 130;
    audio.engineOsc.frequency.setTargetAtTime(freq, t, 0.06);
    audio.engineOsc2.frequency.setTargetAtTime(freq * 0.5, t, 0.06);
    audio.engineFilter.frequency.setTargetAtTime(280 + speed01 * 900, t, 0.1);
  };

  /** strength 0..1: how loud/close the nearest siren sounds. */
  audio.siren = function siren(strength, dt) {
    if (!audio.ctx) return;
    const t = audio.ctx.currentTime;
    audio.sirenGain.gain.setTargetAtTime(strength * 0.05, t, 0.1);
    if (strength <= 0.01) return;
    audio.sirenTimer += dt;
    if (audio.sirenTimer > 0.42) {
      audio.sirenTimer = 0;
      audio.sirenHigh = !audio.sirenHigh;
      audio.sirenOsc.frequency.setTargetAtTime(audio.sirenHigh ? 950 : 680, t, 0.02);
    }
  };

  function noiseBuffer(seconds) {
    const len = Math.floor(audio.ctx.sampleRate * seconds);
    const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type, vol, when) {
    const t = audio.ctx.currentTime + (when || 0);
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  audio.shot = function shot() {
    if (!ensure()) return;
    resume();
    const t = audio.ctx.currentTime;
    const src = audio.ctx.createBufferSource();
    src.buffer = noiseBuffer(0.16);
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, t);
    filter.frequency.exponentialRampToValueAtTime(320, t + 0.14);
    const gain = audio.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(audio.master);
    src.start(t);
    blip(140, 0.09, 'square', 0.22, 0);
  };

  audio.explosion = function explosion() {
    if (!ensure()) return;
    resume();
    const t = audio.ctx.currentTime;
    const src = audio.ctx.createBufferSource();
    src.buffer = noiseBuffer(0.7);
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(90, t + 0.65);
    const gain = audio.ctx.createGain();
    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(audio.master);
    src.start(t);
    blip(70, 0.5, 'sine', 0.5, 0);
  };

  audio.pickup = function pickup() {
    if (!ensure()) return;
    resume();
    blip(880, 0.09, 'sine', 0.25, 0);
    blip(1318, 0.14, 'sine', 0.25, 0.08);
  };

  audio.click = function click() {
    if (!ensure()) return;
    resume();
    blip(520, 0.06, 'sine', 0.2, 0);
  };

  audio.horn = function horn() {
    if (!ensure()) return;
    resume();
    blip(233, 0.35, 'square', 0.16, 0);
    blip(175, 0.35, 'square', 0.14, 0);
  };

  audio.busted = function busted() {
    if (!ensure()) return;
    resume();
    blip(392, 0.22, 'triangle', 0.3, 0);
    blip(311, 0.22, 'triangle', 0.3, 0.22);
    blip(233, 0.45, 'triangle', 0.3, 0.44);
  };

  audio.jingle = function jingle() {
    if (!ensure()) return;
    resume();
    const notes = [523, 659, 784, 1046];
    for (let i = 0; i < notes.length; i += 1) blip(notes[i], 0.22, 'triangle', 0.28, i * 0.11);
  };

  // Ambient pad: a slow original chord loop (Am - F - C - G), three soft
  // triangle voices per chord plus a low root, stepped every 2.4 s.
  const CHORDS = [
    [220, 261.6, 329.6, 110],
    [174.6, 220, 261.6, 87.3],
    [196, 261.6, 329.6, 98],
    [164.8, 246.9, 293.7, 82.4],
  ];

  audio.music = function music(dt) {
    if (!audio.ctx || audio.muted) return;
    audio.musicTimer += dt;
    if (audio.musicTimer < 2.4) return;
    audio.musicTimer = 0;
    const chord = CHORDS[audio.musicStep % CHORDS.length];
    audio.musicStep += 1;
    const t = audio.ctx.currentTime;
    for (const freq of chord) {
      const osc = audio.ctx.createOscillator();
      const gain = audio.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.05, t + 0.9);
      gain.gain.linearRampToValueAtTime(0.0001, t + 2.4);
      osc.connect(gain);
      gain.connect(audio.musicGain);
      osc.start(t);
      osc.stop(t + 2.45);
    }
  };

  return audio;
}
