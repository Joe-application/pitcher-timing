import { describe, expect, it } from 'vitest';
import { DEFAULT_BASELINE } from '../../sim/constants';
import { fromCards } from '../../sim/timing';
import { baselineFrom, fromTaps, robustMean } from '../measure';
import { scoreChallenge } from '../score';

const BASE = { ...DEFAULT_BASELINE };

describe('計測', () => {
  it('4つのタップから区間を出す', () => {
    expect(fromTaps(1000, 2200, 2740, 3220)).toEqual({ s1: 1.2, s2s3: 0.54, s4: 0.48 });
    // 順番がおかしいものは測りまちがい
    expect(fromTaps(1000, 900, 2000, 3000)).toBeNull();
  });

  it('外れ値を除いて平均する', () => {
    expect(robustMean([1.2, 1.25, 1.15, 1.2, 3.0])).toBeCloseTo(1.2);
    expect(robustMean([1, 2])).toBeCloseTo(1.5);
  });

  it('「自分のふつう」：S2 と S3 は目安の比率で分ける', () => {
    const b = baselineFrom([
      { s1: 1.0, s2s3: 0.54, s4: 0.5 },
      { s1: 1.1, s2s3: 0.54, s4: 0.5 },
      { s1: 0.9, s2s3: 0.54, s4: 0.5 },
    ])!;
    expect(b.s1).toBeCloseTo(1.0);
    expect(b.s2 + b.s3).toBeCloseTo(0.54);
    expect(b.s2).toBeCloseTo(0.42);
    expect(b.samples).toBe(3);
    expect(baselineFrom([])).toBeNull();
  });
});

describe('計測チャレンジの採点', () => {
  // ながく止まって、ためずにすぐ投げる
  const longQuick = fromCards(BASE, { s1: 1, s3: -1 });

  it('目標どおりなら満点', () => {
    const s = scoreChallenge(longQuick, { s1: 2.4, s2s3: 0.4, s4: 0.5 }, BASE);
    expect(s.score).toBe(100);
    expect(s.clear).toBe(true);
  });

  it('変えたつもりで「ふつう」のままだと、はっきり差が出ていないと言われる', () => {
    const s = scoreChallenge(longQuick, { s1: 1.3, s2s3: 0.55, s4: 0.48 }, BASE);
    expect(s.clear).toBe(false);
    expect(s.score).toBeLessThanOrEqual(50);
    expect(s.parts.find((p) => p.key === 's1')).toMatchObject({ intended: true, clear: false, mark: 'miss' });
  });

  it('「ふつう」が目標のときは、変える区間がない', () => {
    const s = scoreChallenge(fromCards(BASE, { s1: 0, s3: 0 }), { s1: 1.3, s2s3: 0.6, s4: 0.5 }, BASE);
    expect(s.parts.every((p) => !p.intended)).toBe(true);
    expect(s.clear).toBe(true);
  });
});
