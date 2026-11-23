// audio.js — all of Solmar's sound is synthesised with WebAudio: a sawtooth engine that follows
// the car's speed, a two-tone siren that swells as a unit closes in, looping filtered noise for
// the sea, and little one-shot voices for impacts, cash and jingles. Nothing is a file, so
// nothing loads; everything waits for the first click or keypress, as browsers require.

/** Create the audio driver. Every method is safe to call before unlock() — it just stays silent. */
export function createAudio(G) {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;

  /** Build the graph on the first user gesture; later calls do nothing. */
  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // The engine: a saw and a square an octave down through a lowpass, gain driven by speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter).connect(engineGain).connect(master);
      engineOsc.start();
      // The siren: a square wave whose pitch an LFO swings between two tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 780;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 1.4;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 130;
      lfo.connect(lfoGain).connect(sirenOsc.frequency);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(master);
      sirenOsc.start();
      lfo.start();
      // The sea: looped noise through a low sweep, barely there, everywhere.
      const noise = noiseSource();
      const seaFilter = ctx.createBiquadFilter();
      seaFilter.type = 'lowpass';
      seaFilter.frequency.value = 380;
      const seaGain = ctx.createGain();
      seaGain.gain.value = 0.028;
      noise.connect(seaFilter).connect(seaGain).connect(master);
      noise.start();
      api.master = master;
    } catch {
      ctx = null; // No audio on this machine: the game plays silent rather than not at all.
    }
  }

  /** A looping white-noise buffer source, shared by the sea and the impact thuds. */
  function noiseSource() {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  /** One short tone with an envelope: the building block of dings, clicks and jingles. */
  function tone(freq, at, dur, type = 'sine', vol = 0.12) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    const t = ctx.currentTime + at;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(api.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  const api = {
    master: null,
    unlock,
    /** Engine on/off and how hard it pulls, 0..1 of the car's top speed. */
    setEngine(on, ratio) {
      if (!ctx || !engineGain) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(on ? 0.05 + ratio * 0.05 : 0, t, 0.09);
      engineOsc.frequency.setTargetAtTime(52 + ratio * 175, t, 0.06);
    },
    /** Siren loudness, 0..1 by the nearest unit's distance (police.js computes it). */
    setSiren(level) {
      if (!ctx || !sirenGain) return;
      sirenGain.gain.setTargetAtTime(level * 0.055, ctx.currentTime, 0.15);
    },
    /** A collision thud: a burst of lowpassed noise and a falling sine. */
    thud(strength) {
      if (!ctx) return;
      const noise = noiseSource();
      noise.loop = false;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 260;
      const gain = ctx.createGain();
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0.3 * strength, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      noise.connect(filter).connect(gain).connect(api.master);
      noise.start(t);
      noise.stop(t + 0.2);
      tone(82, 0, 0.14, 'sine', 0.22 * strength);
    },
    /** The cash ding: two bright notes, the sound of a job done. */
    ding() {
      tone(880, 0, 0.12, 'sine', 0.1);
      tone(1318, 0.07, 0.16, 'sine', 0.1);
    },
    /** The mission-complete jingle: a little rising run. */
    jingle() {
      [523, 659, 784, 1046].forEach((freq, i) => tone(freq, i * 0.09, 0.22, 'triangle', 0.12));
    },
    /** The failure sting: three falling notes, no celebration. */
    sting() {
      [330, 262, 196].forEach((freq, i) => tone(freq, i * 0.13, 0.24, 'sawtooth', 0.05));
    },
    /** A UI click for doors and menus. */
    click() {
      tone(1150, 0, 0.05, 'square', 0.05);
    },
  };
  G.audio = api;
  return api;
}
