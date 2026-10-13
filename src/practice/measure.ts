// モード2：タップでの計測と「自分のふつう」の計算（§5.1）。純粋関数のみ。

import { DEFAULT_BASELINE } from '../sim/constants';
import type { Baseline, Seconds } from '../types';

/** 1回ぶんの計測。S2 と S3 は「足上げ開始→前へ動き出す」でまとめて測る */
export interface Measured {
  s1: Seconds;
  s2s3: Seconds;
  s4: Seconds;
}

/** 4つのタップ時刻（ミリ秒）：セット・足上げ開始・前へ動き出す・リリース */
export function fromTaps(setMs: number, liftMs: number, forwardMs: number, releaseMs: number): Measured | null {
  const m = { s1: (liftMs - setMs) / 1000, s2s3: (forwardMs - liftMs) / 1000, s4: (releaseMs - forwardMs) / 1000 };
  // 順番がおかしい・長すぎるものは測りまちがい
  if (!(m.s1 > 0 && m.s2s3 > 0 && m.s4 > 0) || m.s1 > 15 || m.s2s3 > 5 || m.s4 > 5) return null;
  return m;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

/** 外れ値（中央値から大きくはなれた値）を除いた平均 */
export function robustMean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  if (xs.length < 4) return xs.reduce((a, b) => a + b, 0) / xs.length;
  const med = median(xs);
  const mad = median(xs.map((x) => Math.abs(x - med)));
  // ばらつきがほとんどないときでも、少しの差は残す
  const limit = Math.max(3 * 1.4826 * mad, 0.05);
  const kept = xs.filter((x) => Math.abs(x - med) <= limit);
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

/** S2+S3 を、目安の比率で S2 と S3 に分ける */
export function splitS2S3(s2s3: Seconds): { s2: Seconds; s3: Seconds } {
  const ratio = DEFAULT_BASELINE.s2 / (DEFAULT_BASELINE.s2 + DEFAULT_BASELINE.s3);
  return { s2: s2s3 * ratio, s3: s2s3 * (1 - ratio) };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** 何回かの計測から「自分のふつう」を作る */
export function baselineFrom(samples: Measured[], now = new Date()): Baseline | null {
  if (samples.length === 0) return null;
  const s1 = robustMean(samples.map((m) => m.s1));
  const { s2, s3 } = splitS2S3(robustMean(samples.map((m) => m.s2s3)));
  const s4 = robustMean(samples.map((m) => m.s4));
  return { s1: round2(s1), s2: round2(s2), s3: round2(s3), s4: round2(s4), measuredAt: now.toISOString(), samples: samples.length };
}
