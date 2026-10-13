// キャリブレーションテスト（仕様書 §10）。「体感として正しい挙動」になっているかを、
// シードを変えた 1,000 打席以上のシミュレーションで確かめる。
// src/sim/constants.ts の数値を変えたら、必ずこのテストを通すこと。
import { describe, expect, it } from 'vitest';
import type { BatterType } from '../../types';
import { initGame, throwPitch } from '../atBat';
import { initBatter, longHitChance, swingTiming, updateBatter } from '../batter';
import { RULES } from '../constants';
import { createRng, hashSeed } from '../rng';
import { initRunner, stealSuccessChance, updateRunner } from '../runner';
import { checkRules, fromCards } from '../timing';
import { BASE, config, NORMAL, pat, policies, simulateAtBats, type Policy } from './helpers';

const N = 3000;
const show = (label: string, v: number) => console.log(`${label}: ${(v * 100).toFixed(1)}%`);

function outRate(type: BatterType, policy: Policy, label: string): number {
  const r = simulateAtBats(type, policy, N);
  console.log(
    `${label}: 打ち取り ${(r.outRate * 100).toFixed(1)}% / ヒット ${(r.hitRate * 100).toFixed(1)}%（長打 ${(r.longRate * 100).toFixed(1)}%）/ 四球 ${(r.walkRate * 100).toFixed(1)}% / ${r.pitches.toFixed(1)}球`,
  );
  return r.outRate;
}

describe('キャリブレーション（§10）', () => {
  it('1. 同じパターンを続けると打たれる：強打者に「ふつう」5球で、4球目以降のジャスト率 60%以上', () => {
    let just = 0;
    let total = 0;
    for (let i = 0; i < N; i++) {
      const rng = createRng(hashSeed(11, i));
      let b = initBatter('slugger', BASE);
      for (let k = 0; k < 5; k++) {
        const t = swingTiming(b, NORMAL, rng.normal());
        if (k >= 3) {
          total++;
          if (t.grade === 'just') just++;
        }
        b = updateBatter(b, NORMAL);
      }
    }
    show('強打者・ふつう×5 の4球目以降ジャスト率', just / total);
    expect(just / total).toBeGreaterThanOrEqual(0.6);
    // 打席の結果としても、混ぜたときよりはっきり打たれる
    const same = outRate('slugger', policies.normal, '強打者 × いつもふつう');
    expect(same).toBeLessThan(0.45);
  });

  it('2. 混ぜると打ち取れる：強打者に毎球「とまる」と「ため」の両方を変えると、打ち取り率 55%以上', () => {
    expect(outRate('slugger', policies.twoSegments, '強打者 × 毎球2区間とも変える')).toBeGreaterThanOrEqual(0.55);
  });

  it('3. 弱い打者は少しのずれで崩れる：まっすぐ待ちは1区間を変えるだけで 60%以上', () => {
    outRate('straight', policies.normal, 'まっすぐ待ち × いつもふつう');
    expect(outRate('straight', policies.oneSegment, 'まっすぐ待ち × 1区間だけ変える')).toBeGreaterThanOrEqual(0.6);
  });

  it('4. ずらしすぎは損：S3 を0.6秒以上ためると、ジャスト時の長打率がはっきり上がる', () => {
    for (const type of ['straight', 'slugger', 'boss'] as const) {
      const normal = longHitChance(type, BASE.s3);
      const held = longHitChance(type, 0.6);
      console.log(`${type}: ジャスト時の長打率 ふつう ${(normal * 100).toFixed(0)}% → ためすぎ ${(held * 100).toFixed(0)}%`);
      expect(held - normal).toBeGreaterThanOrEqual(0.2);
    }
  });

  it('5. ランナー対策：S1 がいつも同じだと盗塁成功率 70%以上、ばらつかせると 40%以下', () => {
    const run = (vary: boolean) => {
      let ok = 0;
      let total = 0;
      for (let i = 0; i < N; i++) {
        const rng = createRng(hashSeed(55, i));
        let r = initRunner(BASE);
        for (let k = 0; k < 6; k++) {
          const p = pat({ s1: vary ? rng.pick([-1, 0, 1] as const) : 0, s3: 0 });
          const chance = stealSuccessChance(r, p, BASE, rng.normal());
          total++;
          if (rng.next() < chance) ok++;
          r = updateRunner(r, p);
        }
      }
      return ok / total;
    };
    const same = run(false);
    const varied = run(true);
    show('盗塁成功率（S1 いつも同じ）', same);
    show('盗塁成功率（S1 ばらつかせる）', varied);
    expect(same).toBeGreaterThanOrEqual(0.7);
    expect(varied).toBeLessThanOrEqual(0.4);
  });

  it('6. ボス：でたらめでは打ち取り率 30%未満、「直前と大きく変える」なら 50%以上', () => {
    outRate('boss', policies.normal, 'ボス × いつもふつう');
    outRate('boss', policies.twoSegments, 'ボス × 毎球2区間とも変える');
    expect(outRate('boss', policies.random, 'ボス × でたらめ')).toBeLessThan(0.3);
    expect(outRate('boss', policies.bigChange, 'ボス × 直前と大きく変える')).toBeGreaterThanOrEqual(0.5);
  });

  it('7. ルール判定：S1 < MIN_SET_STOP（ランナーあり）でボーク、S3 > MAX_TOP_HOLD で警告', () => {
    const quickSet = { ...NORMAL, s1: RULES.MIN_SET_STOP - 0.1 };
    expect(checkRules(quickSet, { runnerOn: true })).toContain('balk');
    expect(checkRules(quickSet, { runnerOn: false })).not.toContain('balk');
    expect(checkRules(quickSet, { runnerOn: true, balkCheck: false })).not.toContain('balk');
    const held = { ...NORMAL, s3: RULES.MAX_TOP_HOLD + 0.05 };
    expect(checkRules(held, { runnerOn: false })).toContain('topHold');
    expect(checkRules(held, { runnerOn: false, topHoldWarning: false })).not.toContain('topHold');
    expect(checkRules({ ...NORMAL, s1: RULES.MAX_SET_STOP + 0.1 }, { runnerOn: false })).toContain('delay');
    // カードだけで投げているかぎり、反則や注意にはならない
    for (const s1 of [-1, 0, 1] as const)
      for (const s3 of [-1, 0, 1, 2] as const) expect(checkRules(fromCards(BASE, { s1, s3 }), { runnerOn: true })).toEqual([]);
    // ボークになると走者が進む
    const cfg = config(['straight'], 1);
    const o = throwPitch(cfg, initGame(cfg, { bases: [false, false, true] }), quickSet);
    expect(o.record.result).toBe('balk');
    expect(o.state.runs).toBe(1);
  });

  it('8. 再現性：同じシードと入力で同じ結果になる', () => {
    const play = (seed: number) => {
      const cfg = config(['slugger', 'hasty', 'patient'], seed, { stealing: true });
      const rng = createRng(seed);
      let s = initGame(cfg, { bases: [true, false, false] });
      const log: string[] = [];
      for (let i = 0; i < 30; i++) {
        const o = throwPitch(cfg, s, pat(policies.random(null, rng)));
        s = o.state;
        log.push(`${o.record.result}/${o.record.timingErrorMs}/${o.record.runnerEvent ?? ''}`);
      }
      return log.join(',');
    };
    expect(play(123)).toBe(play(123));
    expect(play(123)).not.toBe(play(124));
  });
});
