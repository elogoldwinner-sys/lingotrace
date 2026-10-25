/**
 * Small synthesized sound effects (Web Audio API) — no audio files to host or
 * download. Used by the wheel of names and the mark reinforcement. The mute
 * choice is remembered on this device.
 */
const KEY = "lingotrace-sound-muted";

let ctx: AudioContext | null = null;
let muted = false;
try {
  muted = typeof window !== "undefined" && window.localStorage.getItem(KEY) === "1";
} catch {
  muted = false;
}
const listeners = new Set<() => void>();

export function isSoundMuted(): boolean {
  return muted;
}

export function setSoundMuted(next: boolean) {
  muted = next;
  try {
    window.localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    /* storage unavailable — keep the choice for this visit only */
  }
  listeners.forEach((l) => l());
}

export function subscribeSound(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getCtx(): AudioContext | null {
  if (muted || typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Call from a click handler so the browser allows sound later (autoplay rules). */
export function unlockSound() {
  getCtx();
}

interface Tone {
  freq: number;
  start?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
  lowpass?: number;
}

function play(tones: Tone[]) {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  for (const tn of tones) {
    const t0 = now + (tn.start ?? 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = tn.type ?? "sine";
    osc.frequency.setValueAtTime(tn.freq, t0);
    if (tn.slideTo) osc.frequency.exponentialRampToValueAtTime(tn.slideTo, t0 + tn.dur);
    const peak = (tn.gain ?? 0.25) * 0.8;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + tn.dur);
    let node: AudioNode = osc;
    if (tn.lowpass) {
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = tn.lowpass;
      osc.connect(f);
      node = f;
    }
    node.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + tn.dur + 0.05);
  }
}

/** One click as a wheel segment passes the pointer. */
export function playTick() {
  play([{ freq: 1250 + Math.random() * 150, dur: 0.035, type: "square", gain: 0.12, slideTo: 700 }]);
}

/** The wheel has stopped and the name appears: a short rising fanfare. */
export function playReveal() {
  play([
    { freq: 523.25, start: 0, dur: 0.16, type: "triangle", gain: 0.28 },
    { freq: 659.25, start: 0.12, dur: 0.16, type: "triangle", gain: 0.28 },
    { freq: 783.99, start: 0.24, dur: 0.18, type: "triangle", gain: 0.28 },
    { freq: 1046.5, start: 0.38, dur: 0.55, type: "triangle", gain: 0.32 },
    { freq: 2093, start: 0.38, dur: 0.4, type: "sine", gain: 0.1 },
  ]);
}

/** Marks added: a happy chime — the bigger the award, the longer the run of notes. */
export function playGain(amount: number) {
  const notes = [659.25, 783.99, 987.77, 1318.5, 1567.98];
  const count = Math.min(notes.length, 2 + Math.max(0, Math.abs(amount) - 1));
  play(
    notes.slice(0, count).map((freq, i) => ({
      freq,
      start: i * 0.09,
      dur: i === count - 1 ? 0.6 : 0.2,
      type: "triangle" as OscillatorType,
      gain: 0.26,
    }))
  );
}

/** Marks deducted: two soft falling "wah-wah" notes. */
export function playLoss() {
  play([
    { freq: 330, slideTo: 262, start: 0, dur: 0.32, type: "sawtooth", gain: 0.2, lowpass: 900 },
    { freq: 247, slideTo: 175, start: 0.3, dur: 0.5, type: "sawtooth", gain: 0.2, lowpass: 700 },
  ]);
}
