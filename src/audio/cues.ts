// 合図音と効果音。すべて Web Audio API で合成する（音声ファイルなし＝オフラインでも鳴る）。
// 合図は AudioContext.currentTime で先に予約する。setTimeout では鳴らさない（ずれるため）。

import { marks, type Segments } from '../sim/timing';
import type { Settings } from '../types';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.8;

export function setVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  if (master) master.gain.value = volume;
}

export function audioContext(): AudioContext | null {
  try {
    if (!ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      ctx = new C({ latencyHint: 'interactive' });
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** ユーザー操作のタイミングで呼ぶ（iOS は操作中でないと音が出ない） */
export function unlockAudio() {
  const c = audioContext();
  if (!c || !master) return;
  // 無音を1回鳴らしておくと、iOS でそのあとの予約再生が通る
  const o = c.createOscillator();
  const g = c.createGain();
  g.gain.value = 0;
  o.connect(g).connect(master);
  o.start();
  o.stop(c.currentTime + 0.02);
}

type Stoppable = { stop(when?: number): void };

function tone(c: AudioContext, at: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine', slideTo?: number): Stoppable {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + dur + 0.02);
  return o;
}

function noise(c: AudioContext, at: number, dur: number, gain: number, freq: number, q = 1): Stoppable {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master!);
  src.start(at);
  return src;
}

export type CueName = 'set' | 'lift' | 'forward' | 'release';

/** 合図音1つを時刻 at に予約する。lift=ピッ、forward=ポン、release=パン */
function cue(c: AudioContext, name: CueName, at: number, sound: Settings['cueSound']): Stoppable[] {
  if (name === 'set') return [tone(c, at, 330, 0.22, 0.35, 'sine')];
  if (sound === 'wood') {
    const f = name === 'lift' ? 1800 : name === 'forward' ? 1100 : 2600;
    return [noise(c, at, 0.07, 1.2, f, 6), tone(c, at, f, 0.04, 0.25, 'triangle')];
  }
  if (sound === 'drum') {
    if (name === 'release') return [noise(c, at, 0.14, 1.0, 1800, 0.8), tone(c, at, 180, 0.12, 0.5, 'sine', 90)];
    return [tone(c, at, name === 'lift' ? 220 : 150, 0.14, 0.7, 'sine', name === 'lift' ? 150 : 90)];
  }
  if (name === 'lift') return [tone(c, at, 1320, 0.09, 0.45, 'square')];
  if (name === 'forward') return [tone(c, at, 660, 0.16, 0.6, 'sine')];
  return [noise(c, at, 0.12, 1.1, 2400, 0.8), tone(c, at, 1500, 0.07, 0.3, 'triangle')];
}

export interface ScheduledCues {
  /** セット完了（合図の基準）の時刻。performance.now() と同じ時計・ミリ秒 */
  setAtMs: number;
  /** 各合図の時刻（setAtMs からの秒） */
  marks: ReturnType<typeof marks>;
  cancel(): void;
}

/**
 * 1球ぶんの合図を予約する。
 * @param leadIn いまからセット完了の音までの秒数
 * @param silent true なら「セット」の音だけ鳴らす（計測チャレンジ用）
 */
export function scheduleCues(p: Segments, sound: Settings['cueSound'], leadIn = 0.6, silent = false): ScheduledCues | null {
  const c = audioContext();
  if (!c) return null;
  const t0 = c.currentTime + leadIn;
  const m = marks(p);
  const nodes: Stoppable[] = [...cue(c, 'set', t0, sound)];
  if (!silent) {
    nodes.push(...cue(c, 'lift', t0 + m.lift, sound), ...cue(c, 'forward', t0 + m.forward, sound), ...cue(c, 'release', t0 + m.release, sound));
  }
  // 画面のバーを音に合わせるため、音の時計を performance.now() の時計に直す
  const setAtMs = performance.now() + (t0 - c.currentTime) * 1000;
  return {
    setAtMs,
    marks: m,
    cancel() {
      for (const n of nodes) {
        try {
          n.stop();
        } catch {
          // もう止まっている
        }
      }
    },
  };
}

/** いますぐ1つ鳴らす（設定画面の試聴用） */
export function previewCue(name: CueName, sound: Settings['cueSound']) {
  const c = audioContext();
  if (c) cue(c, name, c.currentTime + 0.02, sound);
}

// ---- 効果音 ----
// 野球の音に寄せて作る（金属バット・ミット・観客）。ふざけた音は入れない。

function now(): [AudioContext, number] | null {
  const c = audioContext();
  return c ? [c, c.currentTime] : null;
}

/** 「シュッ」という風の音。帯域を動かしながら鳴らす */
function sweep(c: AudioContext, at: number, dur: number, from: number, to: number, gain: number): Stoppable {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, at);
  f.frequency.exponentialRampToValueAtTime(to, at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(at);
  return src;
}

/** 観客のどよめき・歓声。ふくらんでからしぼむ */
function crowd(c: AudioContext, at: number, dur: number, gain: number, freq = 1300): Stoppable {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const k = i / len;
    const env = Math.min(1, k / 0.18) * Math.pow(1 - k, 1.4);
    // ゆらぎを入れて、人の声の集まりらしくする
    d[i] = (Math.random() * 2 - 1) * env * (0.7 + 0.3 * Math.sin(i / 900) * Math.sin(i / 2300));
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 0.4;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master!);
  src.start(at);
  return src;
}

/** 金属バットの「カキーン」。strength 1 = 芯、0.5 = ふつうの当たり */
function ping(c: AudioContext, at: number, strength: number): Stoppable[] {
  return [
    noise(c, at, 0.05, 0.9 * strength, 3000, 0.7),
    tone(c, at, 2150, 0.55 * strength + 0.15, 0.32 * strength, 'sine'),
    tone(c, at, 3230, 0.4 * strength + 0.1, 0.16 * strength, 'sine'),
    tone(c, at, 4700, 0.25 * strength + 0.05, 0.07 * strength, 'sine'),
  ];
}

/** 詰まった当たりの「ゴッ」 */
function dull(c: AudioContext, at: number): Stoppable[] {
  return [noise(c, at, 0.08, 0.8, 650, 1.2), tone(c, at, 820, 0.09, 0.2, 'triangle', 500)];
}

/** キャッチャーミットの「バシッ」 */
function mitt(c: AudioContext, at: number, gain = 1): Stoppable[] {
  return [noise(c, at, 0.09, 1.3 * gain, 1000, 1.1), tone(c, at, 170, 0.1, 0.5 * gain, 'sine', 90)];
}

/** 心臓の「ドクン」。足を上げて止まっている間の緊張 */
function heartbeat(c: AudioContext, at: number): Stoppable[] {
  return [tone(c, at, 62, 0.11, 0.55, 'sine', 45), tone(c, at + 0.14, 55, 0.13, 0.4, 'sine', 40)];
}

/** 低い太鼓の「ドン」 */
function drum(c: AudioContext, at: number, gain = 0.8): Stoppable[] {
  return [tone(c, at, 95, 0.4, gain, 'sine', 45), noise(c, at, 0.06, 0.35 * gain, 250, 0.8)];
}

/** 1球の中で鳴らす音の時刻表。時刻は performance.now() のミリ秒。ないものは鳴らさない */
export interface PitchSoundTimes {
  /** セット完了：グラブをたたく音 */
  setAt?: number;
  /** 足上げ開始：足が動く音 */
  liftAt?: number;
  /** 足が上がりきった時刻。ここから holdUntil まで、ためが長ければ心臓の音 */
  topAt?: number;
  holdUntil?: number;
  /** 前へ動き出す：腕を振る風の音。releaseAt でボールが手をはなれる */
  forwardAt?: number;
  releaseAt?: number;
  /** ボールがホームベースに届く */
  plateAt?: number;
  /** 打者が振る */
  swingAt?: number;
}

/** ホームベースで鳴る音 */
export type PlateSound = 'mitt' | 'ping' | 'pingBig' | 'homeRun' | 'dull' | 'none';

/** 心臓の音を入れる「ため」の長さ（秒）と間隔 */
const HEART_MIN_HOLD = 0.28;
const HEART_EVERY = 0.42;

/**
 * 1球ぶんの音を、動きの時刻に合わせて予約する。返り値を呼ぶと、まだ鳴っていない音を取り消す。
 * リアルタイム方式では、時刻が決まった部分から順に何回かに分けて呼ぶ。
 */
export function schedulePitchSounds(t: PitchSoundTimes, plate: PlateSound = 'none'): () => void {
  const c = audioContext();
  if (!c) return () => {};
  const base = c.currentTime - performance.now() / 1000;
  const at = (ms: number) => Math.max(c.currentTime, base + ms / 1000);
  const nodes: Stoppable[] = [];
  const add = (...n: Stoppable[]) => void nodes.push(...n);

  if (t.setAt != null) add(noise(c, at(t.setAt), 0.05, 0.5, 500, 1.5), tone(c, at(t.setAt), 140, 0.06, 0.25, 'sine', 90));
  if (t.liftAt != null) add(noise(c, at(t.liftAt), 0.07, 0.3, 1900, 0.9));
  if (t.topAt != null && t.holdUntil != null && t.holdUntil - t.topAt >= HEART_MIN_HOLD * 1000) {
    for (let ms = t.topAt + 60; ms < t.holdUntil - 120; ms += HEART_EVERY * 1000) add(...heartbeat(c, at(ms)));
  }
  if (t.forwardAt != null && t.releaseAt != null) {
    const dur = Math.max(0.12, (t.releaseAt - t.forwardAt) / 1000);
    add(sweep(c, at(t.forwardAt), dur, 500, 2600, 0.3));
    add(noise(c, at(t.releaseAt), 0.06, 0.6, 4200, 0.8));
  }
  if (t.swingAt != null) add(sweep(c, at(t.swingAt) - 0.05, 0.16, 900, 3600, 0.45));
  if (t.plateAt != null) {
    const p = at(t.plateAt);
    if (plate === 'mitt') add(...mitt(c, p));
    else if (plate === 'dull') add(...dull(c, p));
    else if (plate === 'ping') add(...ping(c, p, 0.6), crowd(c, p + 0.15, 1.2, 0.25));
    else if (plate === 'pingBig') add(...ping(c, p, 0.85), crowd(c, p + 0.15, 1.8, 0.4));
    else if (plate === 'homeRun') add(...ping(c, p, 1), crowd(c, p + 0.2, 3.2, 0.6), crowd(c, p + 0.5, 2.8, 0.4, 2600));
  }
  return () => {
    for (const n of nodes) {
      try {
        n.stop();
      } catch {
        // もう止まっている
      }
    }
  };
}

function play(fn: (c: AudioContext, t: number) => void) {
  const a = now();
  if (a) fn(a[0], a[1]);
}

export const sfx = {
  /** カードを選ぶ */
  select: () => play((c, t) => void tone(c, t, 520, 0.035, 0.12, 'triangle')),
  tap: () => play((c, t) => void tone(c, t, 990, 0.04, 0.2, 'square')),
  /** ミットに入る（牽制・モード2のリリースのあと） */
  mitt: (delay = 0) => play((c, t) => void mitt(c, t + delay, 0.8)),
  /** アウトを取った：拍手のようなざわめき。combo が大きいほど大きい */
  out: (combo = 1) => play((c, t) => void crowd(c, t, 1.0 + 0.2 * Math.min(combo, 4), 0.18 + 0.07 * Math.min(combo, 4), 2200)),
  /** 三振：ミットのあと、短い歓声 */
  strikeout: () =>
    play((c, t) => {
      crowd(c, t, 1.6, 0.4, 2000);
      tone(c, t, 784, 0.1, 0.16, 'triangle');
      tone(c, t + 0.1, 1047, 0.22, 0.16, 'triangle');
    }),
  /** 点を取られた：低い太鼓 */
  run: () => play((c, t) => void drum(c, t + 0.3, 0.7)),
  /** 走られた */
  steal: () => play((c, t) => void [0, 0.09, 0.18, 0.27].forEach((d) => noise(c, t + d, 0.04, 0.35, 380, 1.5))),
  /** ボスが打席に入る：太鼓を2つ */
  boss: () =>
    play((c, t) => {
      drum(c, t, 0.9);
      drum(c, t + 0.45, 1.0);
      crowd(c, t + 0.2, 1.8, 0.2, 500);
    }),
  /** 同じリズムが続いている注意 */
  warn: () => play((c, t) => void [0, 0.14].forEach((d) => tone(c, t + d, 330, 0.09, 0.18, 'triangle'))),
  good: () =>
    play((c, t) => {
      tone(c, t, 660, 0.12, 0.25, 'triangle');
      tone(c, t + 0.11, 880, 0.2, 0.25, 'triangle');
    }),
  /** 満点・バッジ */
  sparkle: () => play((c, t) => void [1319, 1568, 2093].forEach((f, i) => tone(c, t + i * 0.07, f, 0.35, 0.14, 'sine'))),
  bad: () =>
    play((c, t) => {
      tone(c, t, 300, 0.14, 0.3, 'sawtooth');
      tone(c, t + 0.13, 220, 0.35, 0.3, 'sawtooth', 160);
    }),
  /** ボーク・反則 */
  buzzer: () => play((c, t) => void tone(c, t, 140, 0.4, 0.3, 'square')),
  /** 休憩の合図：審判の笛のような音 */
  whistle: () => play((c, t) => void [0, 0.28].forEach((d) => tone(c, t + d, 2350, 0.2, 0.2, 'sine', 2250))),
  /** ステージクリア */
  fanfare: () =>
    play((c, t) => {
      [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.12, f, i === 3 ? 0.6 : 0.14, 0.22, 'triangle'));
      [262, 330, 392].forEach((f) => tone(c, t + 0.36, f, 0.7, 0.1, 'triangle'));
      crowd(c, t + 0.3, 2.6, 0.45);
    }),
};

// ---- 読み上げ（「セット」やパターン名）。時刻の正確さがいらないところだけに使う ----

/** 読み終わったら（または読み上げが使えなければすぐ）解決する */
export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth || volume === 0) return resolve();
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      u.rate = 1.1;
      u.volume = volume;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      u.onend = finish;
      u.onerror = finish;
      // 読み上げが止まったままになる端末があるので、待ちすぎない
      setTimeout(finish, 2500);
      synth.speak(u);
    } catch {
      resolve();
    }
  });
}

export function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    // 何もしない
  }
}
