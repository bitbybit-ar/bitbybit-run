/**
 * Tiny synthesized sound effects via the Web Audio API. Zero assets, zero
 * bytes — every effect is generated from oscillators at runtime. The audio
 * context is created lazily on the first play (which always happens after a
 * user gesture, since the game starts from the "Start" button), and a mute flag
 * (persisted to localStorage) lets the player turn it off.
 */

const STORAGE_KEY = "bbr-muted";

let ctx: AudioContext | null = null;
let muted = false;
let reverb: ConvolverNode | null = null;

/** Path (under /public) to the boost jingle clip. */
const BOOST_CLIP = "/sfx/boost.mp3";

/** Decoded one-shot clips, cached after the first fetch + decode. */
const sampleCache = new Map<string, AudioBuffer>();
const sampleLoading = new Map<string, Promise<AudioBuffer | null>>();

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function initMutedFromStorage(): void {
  if (typeof localStorage === "undefined") return;
  muted = localStorage.getItem(STORAGE_KEY) === "1";
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  }
}

/** Fetch + decode an audio clip into an AudioBuffer, cached and de-duped. */
function loadSample(url: string): Promise<AudioBuffer | null> {
  const cached = sampleCache.get(url);
  if (cached) return Promise.resolve(cached);
  const inFlight = sampleLoading.get(url);
  if (inFlight) return inFlight;

  const c = getCtx();
  if (!c) return Promise.resolve(null);

  const p = fetch(url)
    .then((r) => r.arrayBuffer())
    .then((buf) => c.decodeAudioData(buf))
    .then((decoded) => {
      sampleCache.set(url, decoded);
      sampleLoading.delete(url);
      return decoded;
    })
    .catch(() => {
      sampleLoading.delete(url);
      return null;
    });
  sampleLoading.set(url, p);
  return p;
}

/** Warm the clip cache ahead of time (e.g. on race start) so the first play is
 *  instant. Safe to call repeatedly. */
export function preloadSounds(): void {
  void loadSample(BOOST_CLIP);
}

/** Play a decoded clip once. Loads it on demand if not cached yet. */
function playSample(url: string, gain = 0.6): void {
  const c = getCtx();
  if (!c || muted) return;
  void loadSample(url).then((buffer) => {
    // Re-check mute: the user may have toggled it while the clip was loading.
    if (!buffer || muted) return;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g).connect(c.destination);
    src.start();
  });
}

type BlipOptions = {
  type?: OscillatorType;
  dur?: number;
  gain?: number;
  slideTo?: number;
  delay?: number;
};

/** One enveloped oscillator note. */
function blip(freq: number, opts: BlipOptions = {}): void {
  const c = getCtx();
  if (!c || muted) return;
  const { type = "square", dur = 0.12, gain = 0.12, slideTo, delay = 0 } = opts;
  const t0 = c.currentTime + delay;

  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** A burst of filtered white noise (for splats / static). */
function noiseBurst(
  dur: number,
  gain: number,
  filterFreq: number,
  when?: number
): void {
  const c = getCtx();
  if (!c || muted) return;
  const t0 = when ?? c.currentTime;
  const frames = Math.floor(c.sampleRate * dur);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buffer;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.connect(lp).connect(g).connect(c.destination);
  src.start(t0);
  src.stop(t0 + dur);
}

/** Lazily built reverb (ConvolverNode) with a synthesized decaying-noise impulse
 *  response — gives the finish jingle a "stadium" tail. */
function getReverb(c: AudioContext): ConvolverNode {
  if (!reverb) {
    reverb = c.createConvolver();
    const dur = 1.4;
    const frames = Math.floor(c.sampleRate * dur);
    const ir = c.createBuffer(2, frames, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < frames; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 2.5);
      }
    }
    reverb.buffer = ir;
    const wet = c.createGain();
    wet.gain.value = 0.5;
    reverb.connect(wet).connect(c.destination);
  }
  return reverb;
}

export const Sound = {
  go() {
    blip(523, { type: "square", dur: 0.1, gain: 0.12 });
    blip(784, { type: "square", dur: 0.16, gain: 0.13, delay: 0.1 });
  },
  eatGood() {
    blip(680, { type: "sine", dur: 0.1, gain: 0.1, slideTo: 1020 });
    blip(1020, { type: "sine", dur: 0.08, gain: 0.08, delay: 0.07 });
  },
  eatJunk() {
    blip(200, { type: "sawtooth", dur: 0.18, gain: 0.12, slideTo: 110 });
  },
  boost() {
    // 🚀 lift-off: a short music clip instead of the synthesized whoosh.
    playSample(BOOST_CLIP);
  },
  bathroom() {
    // Long & deliberately annoying: a dissonant alarm with a pulsing tremolo
    // (LFO on the gain), a wet noise "splat", then a deflating pitch droop.
    const c = getCtx();
    if (!c || muted) return;
    const t0 = c.currentTime;
    const buzzEnd = 1.3;

    const master = c.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
    master.gain.setValueAtTime(0.16, t0 + buzzEnd);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + buzzEnd + 0.35);

    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100;
    lp.connect(master);
    master.connect(c.destination);

    // Two detuned sawtooths a dissonant ~semitone apart → "beating" harshness.
    const a = c.createOscillator();
    a.type = "sawtooth";
    a.frequency.setValueAtTime(380, t0);
    const b = c.createOscillator();
    b.type = "sawtooth";
    b.frequency.setValueAtTime(404, t0);
    a.connect(lp);
    b.connect(lp);

    // Tremolo LFO pulsing the master gain (the "nyeh-nyeh-nyeh").
    const lfo = c.createOscillator();
    lfo.type = "square";
    lfo.frequency.value = 9;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.1;
    lfo.connect(lfoGain).connect(master.gain);

    // Deflating droop at the end.
    a.frequency.setValueAtTime(380, t0 + buzzEnd);
    a.frequency.exponentialRampToValueAtTime(110, t0 + buzzEnd + 0.35);
    b.frequency.setValueAtTime(404, t0 + buzzEnd);
    b.frequency.exponentialRampToValueAtTime(118, t0 + buzzEnd + 0.35);

    for (const o of [a, b, lfo]) {
      o.start(t0);
      o.stop(t0 + buzzEnd + 0.4);
    }

    // Wet splat.
    noiseBurst(0.28, 0.14, 900, t0);
  },
  finish() {
    // Ascending jingle, routed dry + through reverb for a stadium tail.
    const c = getCtx();
    if (!c || muted) return;
    const rev = getReverb(c);
    const t0 = c.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => {
      const tt = t0 + i * 0.12;
      const osc = c.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.12, tt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.18);
      osc.connect(g);
      g.connect(c.destination); // dry
      g.connect(rev); // wet (reverb)
      osc.start(tt);
      osc.stop(tt + 0.2);
    });
  },
  lane() {
    blip(900, { type: "triangle", dur: 0.05, gain: 0.05 });
  },
  drunk() {
    // Woozy beer wobble: a sine with a slow vibrato LFO + a pitch droop.
    const c = getCtx();
    if (!c || muted) return;
    const t0 = c.currentTime;
    const dur = 0.9;

    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, t0);
    osc.frequency.exponentialRampToValueAtTime(170, t0 + dur);

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    // Vibrato: LFO modulating the oscillator frequency (±45 Hz).
    const lfo = c.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 6;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 45;
    lfo.connect(lfoGain).connect(osc.frequency);

    osc.connect(g).connect(c.destination);
    for (const o of [osc, lfo]) {
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    }
  },
};
