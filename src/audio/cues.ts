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

// ---- 効果音（モード1） ----

function now(): [AudioContext, number] | null {
  const c = audioContext();
  return c ? [c, c.currentTime] : null;
}

export const sfx = {
  /** いい当たり */
  bat() {
    const a = now();
    if (!a) return;
    noise(a[0], a[1], 0.12, 0.9, 2400, 0.8);
    tone(a[0], a[1], 1400, 0.08, 0.3, 'triangle');
  },
  /** 詰まった当たり */
  weak() {
    const a = now();
    if (!a) return;
    noise(a[0], a[1], 0.09, 0.7, 700, 1.2);
  },
  /** ミットに入る */
  mitt() {
    const a = now();
    if (!a) return;
    noise(a[0], a[1], 0.07, 0.9, 900, 1.5);
  },
  /** 空振り */
  whiff() {
    const a = now();
    if (!a) return;
    noise(a[0], a[1], 0.18, 0.35, 3200, 0.6);
  },
  good() {
    const a = now();
    if (!a) return;
    tone(a[0], a[1], 660, 0.12, 0.25, 'triangle');
    tone(a[0], a[1] + 0.11, 880, 0.2, 0.25, 'triangle');
  },
  bad() {
    const a = now();
    if (!a) return;
    tone(a[0], a[1], 300, 0.14, 0.3, 'sawtooth');
    tone(a[0], a[1] + 0.13, 220, 0.35, 0.3, 'sawtooth', 160);
  },
  buzzer() {
    const a = now();
    if (!a) return;
    tone(a[0], a[1], 140, 0.4, 0.3, 'square');
  },
  fanfare() {
    const a = now();
    if (!a) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(a[0], a[1] + i * 0.12, f, i === 3 ? 0.5 : 0.14, 0.22, 'triangle'));
  },
  tap() {
    const a = now();
    if (!a) return;
    tone(a[0], a[1], 990, 0.04, 0.2, 'square');
  },
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
