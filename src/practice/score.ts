// モード2：計測チャレンジの採点（§5.3）。純粋関数のみ。

import type { Segments } from '../sim/timing';
import type { Seconds, TimingPattern } from '../types';
import type { Measured } from './measure';

export type Mark = 'great' | 'ok' | 'miss';
export type PartKey = 's1' | 's2s3' | 's4';

/** 目標との差がこれ以内なら ◎ / ○（秒）。S1 は長いのでゆるめ、ほかは短いのできびしめ */
export const TOLERANCE: Record<PartKey, { great: Seconds; ok: Seconds }> = {
  s1: { great: 0.2, ok: 0.4 },
  s2s3: { great: 0.15, ok: 0.3 },
  s4: { great: 0.15, ok: 0.3 },
};

/** 「ふつう」との差が、ねらった差のこの割合以上出ていれば「はっきり変えられた」 */
export const CLEAR_RATIO = 0.5;
/** ねらった差がこれより小さい区間は「変える区間」と数えない */
export const INTENDED_MIN: Record<PartKey, Seconds> = { s1: 0.3, s2s3: 0.1, s4: 0.1 };

export const POINTS: Record<Mark, number> = { great: 100, ok: 60, miss: 20 };

export interface PartScore {
  key: PartKey;
  target: Seconds;
  measured: Seconds;
  diff: Seconds;
  mark: Mark;
  /** この区間を「ふつう」から変えるつもりだったか */
  intended: boolean;
  /** 変えるつもりの区間で、はっきり差が出たか */
  clear: boolean;
}

export interface ChallengeScore {
  parts: PartScore[];
  /** 0〜100 */
  score: number;
  /** 変えるつもりだった区間が、すべてはっきり変わっていたか（変える区間がないときは true） */
  clear: boolean;
}

export const toParts = (p: Segments): Measured => ({ s1: p.s1, s2s3: p.s2 + p.s3, s4: p.s4 });

export function scoreChallenge(target: TimingPattern, measured: Measured, base: Segments): ChallengeScore {
  const t = toParts(target);
  const b = toParts(base);
  const parts = (['s1', 's2s3', 's4'] as const).map((key): PartScore => {
    const diff = measured[key] - t[key];
    const a = Math.abs(diff);
    const mark: Mark = a <= TOLERANCE[key].great ? 'great' : a <= TOLERANCE[key].ok ? 'ok' : 'miss';
    const want = t[key] - b[key];
    const intended = Math.abs(want) >= INTENDED_MIN[key];
    const got = measured[key] - b[key];
    // 同じ向きに、ねらった差の半分以上
    const clear = !intended || got * Math.sign(want) >= Math.abs(want) * CLEAR_RATIO;
    return { key, target: t[key], measured: measured[key], diff, mark, intended, clear };
  });
  const clear = parts.every((p) => p.clear);
  let score = Math.round(parts.reduce((a, p) => a + POINTS[p.mark], 0) / parts.length);
  // 変えたつもりで変わっていないのが一番もったいない
  if (!clear) score = Math.min(score, 50);
  return { parts, score, clear };
}
