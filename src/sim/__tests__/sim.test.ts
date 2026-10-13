// シミュレーションの部品ごとのテスト
import { describe, expect, it } from 'vitest';
import { initGame, isBatterOut, isCleared, isFailed, stealingRunner, throwPitch } from '../atBat';
import { gradeOf, initBatter, resetBatter, swingTiming, updateBatter } from '../batter';
import { BATTERS, DEFAULT_BASELINE, RULES, RUNNER } from '../constants';
import { initRunner, pickoffOutChance, stealSuccessChance } from '../runner';
import { baselineOf, changedSegments, fromCards, liftToRelease, marks, sameRhythm, shiftKinds } from '../timing';
import { BASE, config, NORMAL, pat } from './helpers';

describe('区間の計算', () => {
  it('カードは「ふつう」からの差で決まる', () => {
    expect(NORMAL).toMatchObject({ s1: 1.2, s2: 0.42, s3: 0.12, s4: 0.48 });
    expect(pat({ s1: -1, s2: -1, s3: -1 })).toMatchObject({ s1: 0.6, s2: 0.2, s3: 0 });
    expect(pat({ s1: 1, s2: 1, s3: 1 })).toMatchObject({ s1: 2.5, s2: 0.7, s3: 0.3 });
  });

  it('「ふつう」が人によって違っても、カードでは反則にならない', () => {
    const quickKid = { s1: 0.8, s2: 0.25, s3: 0.02, s4: 0.4 };
    const p = fromCards(quickKid, { s1: -1, s2: -1, s3: 1 });
    expect(p.s1).toBeGreaterThanOrEqual(RULES.MIN_SET_STOP);
    expect(p.s3).toBeLessThanOrEqual(RULES.MAX_TOP_HOLD);
    expect(p.s2).toBeGreaterThan(0);
  });

  it('実測した「ふつう」がなければ目安を使い、おかしな値は範囲におさめる', () => {
    expect(baselineOf(undefined)).toEqual(DEFAULT_BASELINE);
    const b = baselineOf({ s1: 99, s2: 0.4, s3: 0.1, s4: 0.5, measuredAt: '', samples: 5 });
    expect(b.s1).toBe(3);
    expect(b.s2).toBe(0.4);
  });

  it('同じリズム・変えた区間・ずらしの種類', () => {
    expect(sameRhythm(NORMAL, { ...NORMAL, s1: 1.3 })).toBe(true);
    expect(sameRhythm(NORMAL, pat({ s1: 0, s2: -1, s3: 0 }))).toBe(false);
    expect(changedSegments(NORMAL, pat({ s1: 1, s2: 0, s3: 1 }))).toEqual(['s1', 's3']);
    expect(shiftKinds(pat({ s1: 1, s2: -1, s3: 0 }), BASE)).toEqual(['s1Long', 's2Quick']);
    expect(shiftKinds(NORMAL, BASE)).toEqual([]);
    expect(shiftKinds(fromCards(BASE, { s1: 0, s2: 0, s3: 0 }, 'pickoff'), BASE)).toEqual(['pickoff']);
  });

  it('合図の時刻はセット完了からの積み上げ', () => {
    const m = marks(NORMAL);
    expect(m.lift).toBeCloseTo(1.2);
    expect(m.forward).toBeCloseTo(1.74);
    expect(m.release).toBeCloseTo(2.22);
  });
});

describe('打者モデル', () => {
  it('予想どおりなら誤差はばらつきだけ、長くすると早く振りすぎ（正）、短くすると振りおくれ（負）', () => {
    const b = initBatter('straight', BASE);
    expect(swingTiming(b, NORMAL, 0).error).toBeCloseTo(0);
    expect(swingTiming(b, pat({ s1: 0, s2: 1, s3: 0 }), 0).error).toBeGreaterThan(0.18);
    expect(swingTiming(b, pat({ s1: 0, s2: -1, s3: 0 }), 0).error).toBeLessThan(-0.18);
  });

  it('予想は指数移動平均で更新される', () => {
    const slow = pat({ s1: 0, s2: 1, s3: 0 });
    const b = updateBatter(initBatter('slugger', BASE), slow);
    const want = liftToRelease(BASE) + BATTERS.slugger.alpha * (liftToRelease(slow) - liftToRelease(BASE));
    expect(b.expLtr).toBeCloseTo(want);
    // ボスは直前の球にぴったり合わせる
    expect(updateBatter(initBatter('boss', BASE), slow).expLtr).toBeCloseTo(liftToRelease(slow));
  });

  it('強い打者は少しのずれなら見て合わせる', () => {
    const hold = pat({ s1: 0, s2: 0, s3: 1 });
    expect(swingTiming(initBatter('boss', BASE), hold, 0).grade).toBe('just');
    expect(swingTiming(initBatter('straight', BASE), hold, 0).grade).not.toBe('just');
  });

  it('せっかちは「ため」に、じっくり型はクイックに弱い', () => {
    const hold = pat({ s1: 0, s2: 0, s3: 1 });
    const quick = pat({ s1: 0, s2: -1, s3: 0 });
    const err = (t: 'hasty' | 'patient', p: typeof hold) => Math.abs(swingTiming(initBatter(t, BASE), p, 0).error);
    expect(err('hasty', hold)).toBeGreaterThan(err('patient', hold));
    expect(err('patient', quick)).toBeGreaterThan(err('hasty', quick));
  });

  it('長いセットで力む（じっくり型とボスは力まない）、短いセットで差し込まれる', () => {
    const long = pat({ s1: 1, s2: 0, s3: 0 });
    expect(swingTiming(initBatter('straight', BASE), long, 0).tense).toBe(true);
    expect(swingTiming(initBatter('patient', BASE), long, 0).tense).toBe(false);
    const short = swingTiming(initBatter('straight', BASE), pat({ s1: -1, s2: 0, s3: 0 }), 0);
    expect(short.rushed).toBe(true);
    expect(short.error).toBeLessThan(0);
  });

  it('同じリズムが続くと数えられ、プレートを外すと仕切り直しになる', () => {
    let b = initBatter('slugger', BASE);
    const slow = pat({ s1: 0, s2: 1, s3: 0 });
    b = updateBatter(updateBatter(b, slow), slow);
    expect(b.streak).toBe(2);
    const reset = resetBatter(b, BASE, RUNNER.stepOffReset);
    expect(reset.streak).toBe(0);
    expect(Math.abs(reset.expLtr - liftToRelease(BASE))).toBeLessThan(Math.abs(b.expLtr - liftToRelease(BASE)));
  });

  it('判定の境界', () => {
    expect(gradeOf(0.04)).toBe('just');
    expect(gradeOf(-0.07)).toBe('slight');
    expect(gradeOf(0.15)).toBe('off');
    expect(gradeOf(-0.3)).toBe('broken');
  });
});

describe('走者・牽制', () => {
  it('予想どおりの S1 だと好スタート、クイックは盗塁対策になる', () => {
    const r = initRunner(BASE);
    const normal = stealSuccessChance(r, NORMAL, BASE, 0);
    expect(normal).toBeGreaterThan(0.85);
    expect(stealSuccessChance(r, pat({ s1: 1, s2: 0, s3: 0 }), BASE, 0)).toBeLessThan(0.3);
    expect(stealSuccessChance(r, pat({ s1: 0, s2: -1, s3: -1 }), BASE, 0)).toBeLessThan(normal);
    expect(stealSuccessChance(r, NORMAL, BASE, 0, true)).toBeLessThan(normal);
  });

  it('牽制は、走者が予想した足上げ時刻に近いほどアウトにしやすい', () => {
    const r = initRunner(BASE);
    expect(pickoffOutChance(r, BASE.s1)).toBeCloseTo(RUNNER.pickoffMax);
    expect(pickoffOutChance(r, 0.3)).toBeLessThan(0.05);
    expect(pickoffOutChance({ ...r, cautious: true }, BASE.s1)).toBeLessThan(RUNNER.pickoffMax);
  });

  it('盗塁を狙うのは、次の塁が空いている前の走者', () => {
    expect(stealingRunner([true, false, false])).toBe(1);
    expect(stealingRunner([true, true, false])).toBe(2);
    expect(stealingRunner([true, true, true])).toBe(null);
    expect(stealingRunner([false, false, true])).toBe(null);
  });
});

describe('打席の進行', () => {
  const play = (seed: number, n: number, extra = {}) => {
    const cfg = config(['straight', 'hasty'], seed, extra);
    let s = initGame(cfg);
    const out = [];
    for (let i = 0; i < n; i++) {
      const o = throwPitch(cfg, s, NORMAL);
      s = o.state;
      out.push(o.record);
    }
    return { cfg, s, records: out };
  };

  it('カウント・アウト・得点のつじつまが合う', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { records } = play(seed, 25);
      let outs = 0;
      let runs = 0;
      for (const r of records) {
        outs += r.outsMade;
        runs += r.runsScored;
        expect(r.after.outs).toBe(outs);
        expect(r.after.runs).toBe(runs);
        expect(r.after.balls).toBeLessThanOrEqual(4);
        expect(r.after.strikes).toBeLessThanOrEqual(3);
        if (isBatterOut(r)) expect(r.outsMade).toBeGreaterThanOrEqual(1);
        if (r.result === 'homeRun') expect(r.runsScored).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('打席が終わると次の打者になり、予想は「ふつう」に戻る', () => {
    const { cfg, records } = play(3, 30);
    const i = records.findIndex((r) => r.atBatEnd);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(records[i + 1].batterType).toBe(cfg.lineup[1]);
    expect(records[i + 1].batterExpectation.liftToRelease).toBeCloseTo(liftToRelease(BASE));
  });

  it('満塁の四球は押し出し', () => {
    const cfg = config(['straight'], 1, { strikeRate: 0 });
    let s = initGame(cfg, { bases: [true, true, true], balls: 3 });
    // ストライクが入らない設定なので、見送ればボール。振ってしまう球はとばす
    for (let i = 0; i < 20 && s.runs === 0 && s.outs === 0; i++) {
      const o = throwPitch(cfg, { ...s, balls: 3, strikes: 0 }, NORMAL);
      if (o.record.result === 'ball') s = o.state;
      else s = { ...s, pitchCount: s.pitchCount + 1 };
    }
    expect(s.runs).toBe(1);
    expect(s.bases).toEqual([true, true, true]);
  });

  it('牽制・外すは続けて3回まで。4回目はボールが増える', () => {
    const cfg = config(['straight'], 5);
    let s = initGame(cfg, { bases: [true, false, false] });
    const stepOff = fromCards(BASE, { s1: 0, s2: 0, s3: 0 }, 'stepOff');
    for (let i = 0; i < 3; i++) {
      const o = throwPitch(cfg, s, stepOff);
      expect(o.record.warnings).toEqual([]);
      expect(o.record.result).toBe('stepOff');
      s = o.state;
    }
    const o = throwPitch(cfg, s, stepOff);
    expect(o.record.warnings).toContain('tooManyPickoffs');
    expect(o.state.balls).toBe(1);
  });

  it('牽制でアウトにすると走者がいなくなる', () => {
    const pickoff = fromCards(BASE, { s1: 0, s2: 0, s3: 0 }, 'pickoff');
    let got = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const cfg = config(['straight'], seed);
      const o = throwPitch(cfg, initGame(cfg, { bases: [false, true, false] }), pickoff);
      if (o.record.result === 'pickoffOut') {
        got++;
        expect(o.state.bases).toEqual([false, false, false]);
        expect(o.state.outs).toBe(1);
      } else expect(o.record.result).toBe('pickoffSafe');
    }
    expect(got / 300).toBeGreaterThan(RUNNER.pickoffMax - 0.08);
    expect(got / 300).toBeLessThan(RUNNER.pickoffMax + 0.08);
  });

  it('長く止まりすぎは遅延でボール、クリアと失敗の判定', () => {
    const cfg = config(['straight'], 1, { outsToClear: 3, maxRuns: 0 });
    const s = initGame(cfg);
    const o = throwPitch(cfg, s, { ...NORMAL, s1: RULES.MAX_SET_STOP + 0.5 });
    expect(o.record.result).toBe('ball');
    expect(o.record.warnings).toContain('delay');
    expect(isCleared(cfg, { ...s, outs: 3 })).toBe(true);
    expect(isFailed(cfg, { ...s, outs: 3, runs: 1 })).toBe(true);
    expect(isCleared(cfg, { ...s, outs: 3, runs: 1 })).toBe(false);
  });

  it('もしもリプレイ：同じ状態から別の間で投げると、同じシードで計算しなおせる', () => {
    const cfg = config(['slugger'], 42);
    const s = initGame(cfg);
    const a = throwPitch(cfg, s, NORMAL);
    const b = throwPitch(cfg, s, pat({ s1: 1, s2: -1, s3: -1 }));
    expect(a.record.seed).toBe(b.record.seed);
    expect(throwPitch(cfg, s, NORMAL).record).toEqual(a.record);
  });
});
