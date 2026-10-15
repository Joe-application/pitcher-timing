// シミュレーションの部品ごとのテスト
import { describe, expect, it } from 'vitest';
import { initGame, isBatterOut, isCleared, isFailed, stealingRunner, throwPitch } from '../atBat';
import { gradeOf, initBatter, liftWeight, resetBatter, swingTiming, updateBatter } from '../batter';
import { BATTER_MODEL, BATTERS, DEFAULT_BASELINE, RULES, RUNNER } from '../constants';
import { initRunner, pickoffOutChance, stealSuccessChance } from '../runner';
import { baselineOf, changedSegments, flightOf, fromCards, liftToRelease, marks, sameRhythm, shiftKinds } from '../timing';
import { actualCell, colOf, GRID, isFarBall, isStrike, rowOf, zoneKind } from '../location';
import { ALL_CARDS, BASE, config, NORMAL, pat, policies, simulateAtBats, spot } from './helpers';

describe('区間の計算', () => {
  it('カードは「ふつう」からの差で決まる', () => {
    expect(NORMAL).toMatchObject({ s1: 1.2, s2: 0.42, s3: 0.12, s4: 0.48 });
    expect(pat({ s1: -1, s2: 0, s3: -1 })).toMatchObject({ s1: 0.6, s3: 0 });
    expect(pat({ s1: 1, s2: 0, s3: 1 })).toMatchObject({ s1: 2.5, s3: 0.45 });
    expect(pat({ s1: 0, s2: 0, s3: 2 })).toMatchObject({ s1: 1.2, s3: 0.8 });
  });

  it('ずらしの要素は3つ：とまる・あしあげの速さ・ため（ふみだしはいつも同じ）', () => {
    expect(ALL_CARDS.length).toBe(3 * 3 * 4);
    expect(pat({ s1: 0, s2: -1, s3: 0 }).s2).toBe(0.2);
    expect(pat({ s1: 0, s2: 1, s3: 0 }).s2).toBe(0.7);
    for (const c of ALL_CARDS) expect(pat(c).s4).toBe(BASE.s4);
  });

  it('「ふつう」が人によって違っても、カードでは反則にならない', () => {
    const quickKid = { s1: 0.8, s2: 0.25, s3: 0.02, s4: 0.4 };
    const p = fromCards(quickKid, { s1: -1, s2: 0, s3: 1 });
    expect(p.s1).toBeGreaterThanOrEqual(RULES.MIN_SET_STOP);
    expect(p.s3).toBeLessThanOrEqual(RULES.MAX_TOP_HOLD);
    expect(p.s2).toBe(quickKid.s2);
    expect(fromCards(quickKid, { s1: 0, s2: -1, s3: 0 }).s2).toBeGreaterThan(0);
  });

  it('実測した「ふつう」がなければ目安を使い、おかしな値は範囲におさめる', () => {
    expect(baselineOf(undefined)).toEqual(DEFAULT_BASELINE);
    const b = baselineOf({ s1: 99, s2: 0.4, s3: 0.1, s4: 0.5, measuredAt: '', samples: 5 });
    expect(b.s1).toBe(3);
    expect(b.s2).toBe(0.4);
  });

  it('同じリズム・変えた区間・ずらしの種類', () => {
    expect(sameRhythm(NORMAL, { ...NORMAL, s1: 1.3 })).toBe(true);
    expect(sameRhythm(NORMAL, pat({ s1: 0, s2: 0, s3: -1 }))).toBe(false);
    expect(changedSegments(NORMAL, pat({ s1: 1, s2: 0, s3: 1 }))).toEqual(['s1', 's3']);
    expect(shiftKinds(pat({ s1: 1, s2: 0, s3: -1 }), BASE)).toEqual(['s1Long', 's3Quick']);
    expect(shiftKinds(pat({ s1: 0, s2: -1, s3: 1 }), BASE)).toEqual(['s2Quick', 's3Hold']);
    expect(shiftKinds(pat({ s1: 0, s2: 1, s3: 0 }), BASE)).toEqual(['s2Slow']);
    expect(shiftKinds(pat({ s1: 0, s2: 0, s3: 2 }), BASE)).toEqual(['s3Long']);
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
    expect(swingTiming(b, pat({ s1: 0, s2: 0, s3: 1 }), 0).error).toBeGreaterThan(0.18);
    expect(swingTiming(b, pat({ s1: 0, s2: 0, s3: -1 }), 0).error).toBeLessThan(-0.05);
  });

  it('予想は指数移動平均で更新される', () => {
    const slow = pat({ s1: 0, s2: 0, s3: 1 });
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

  it('足を上げる速さは、ためずに投げるとよく効き、上で長く止まると打者に取りなおされる', () => {
    const b = initBatter('straight', BASE);
    const err = (s2: -1 | 1, s3: -1 | 0 | 2) => {
      const p = pat({ s1: 0, s2, s3 });
      // 「ため」だけのずれを引いて、足上げの速さのぶんだけを取り出す
      return Math.abs(swingTiming(b, p, 0).error - swingTiming(b, pat({ s1: 0, s2: 0, s3 }), 0).error);
    };
    expect(liftWeight(0)).toBe(1);
    expect(liftWeight(0.8)).toBeCloseTo(1 - BATTER_MODEL.RESYNC_MAX);
    expect(err(-1, -1)).toBeGreaterThan(0.15);
    expect(err(-1, 2)).toBeLessThan(err(-1, -1) / 2);
    expect(err(1, 2)).toBeLessThan(err(1, 0));
  });

  it('せっかちは「ため」に、じっくり型は「すぐ」に弱い', () => {
    const hold = pat({ s1: 0, s2: 0, s3: 1 });
    const quick = pat({ s1: 0, s2: 0, s3: -1 });
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
    const slow = pat({ s1: 0, s2: 0, s3: 1 });
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
  it('予想どおりの S1 だと好スタート、ためずにすぐ投げると盗塁対策になる', () => {
    const r = initRunner(BASE);
    const normal = stealSuccessChance(r, NORMAL, BASE, 0);
    expect(normal).toBeGreaterThan(0.85);
    expect(stealSuccessChance(r, pat({ s1: 1, s2: 0, s3: 0 }), BASE, 0)).toBeLessThan(0.3);
    expect(stealSuccessChance(r, pat({ s1: 0, s2: 0, s3: -1 }), BASE, 0)).toBeLessThan(normal);
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
    expect(records[i + 1].batterType).toBe(cfg.lineup[1].type);
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
    // 二塁への牽制は、ふつう（一塁クイック）より刺しにくい
    const want = RUNNER.pickoffMax * RUNNER.pickoffFactor.second;
    expect(got / 300).toBeGreaterThan(want - 0.07);
    expect(got / 300).toBeLessThan(want + 0.07);
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
    const b = throwPitch(cfg, s, pat({ s1: 1, s2: 0, s3: -1 }));
    expect(a.record.seed).toBe(b.record.seed);
    expect(throwPitch(cfg, s, NORMAL).record).toEqual(a.record);
  });
});

describe('コースと高さ', () => {
  const cells = Array.from({ length: GRID * GRID }, (_, i) => ({ x: i % GRID, y: Math.floor(i / GRID) }));

  it('ストライクゾーンは9マス、まわりのボールゾーンは2周で40マス（内側16・外側24）', () => {
    expect(cells.filter(isStrike).length).toBe(9);
    expect(cells.filter((c) => !isStrike(c)).length).toBe(40);
    expect(cells.filter(isFarBall).length).toBe(24);
    expect(cells.filter((c) => zoneKind(spot('slugger'), c) === 'ball').length).toBe(40);
    // ボールゾーンも、内角側・外角側、高め・低めに分かれる
    expect(colOf({ x: 0, y: 3 }, 'R')).toBe('out');
    expect(colOf({ x: 6, y: 3 }, 'R')).toBe('in');
    expect(rowOf({ x: 3, y: 0 })).toBe('high');
    expect(rowOf({ x: 3, y: 6 })).toBe('low');
  });

  it('右打者は投手から見て右に立つので、内角は右側。左打者は逆', () => {
    expect(colOf({ x: 4, y: 3 }, 'R')).toBe('in');
    expect(colOf({ x: 2, y: 3 }, 'R')).toBe('out');
    expect(colOf({ x: 4, y: 3 }, 'L')).toBe('out');
    expect(colOf({ x: 2, y: 3 }, 'L')).toBe('in');
    expect(rowOf({ x: 3, y: 2 })).toBe('high');
    expect(rowOf({ x: 3, y: 4 })).toBe('low');
    // 強打者は外角低めが苦手、ど真ん中が得意。左右で場所が入れかわる
    expect(zoneKind({ type: 'slugger', hand: 'R', order: 4 }, { x: 2, y: 4 })).toBe('cold');
    expect(zoneKind({ type: 'slugger', hand: 'L', order: 4 }, { x: 4, y: 4 })).toBe('cold');
    expect(zoneKind({ type: 'slugger', hand: 'R', order: 4 }, { x: 3, y: 3 })).toBe('hot');
    // 打者ごとに上書きできる
    expect(zoneKind({ type: 'slugger', hand: 'R', order: 4, hot: ['out-low'], cold: [] }, { x: 2, y: 4 })).toBe('hot');
  });

  it('ねらいどおりか、となり（まれに2マス先）に外れる。マスの外には出ない', () => {
    const aim = { x: 2, y: 4 };
    expect(actualCell(aim, 0.7, 0.5, 0.3)).toEqual(aim);
    for (let i = 0; i < 200; i++) {
      const corner = { x: 0, y: 6 };
      const c = actualCell(corner, 0.7, 0.7 + (0.3 * i) / 200, (i * 37) % 100 / 100);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThanOrEqual(6);
      expect(Math.max(Math.abs(c.x - corner.x), Math.abs(c.y - corner.y))).toBeLessThanOrEqual(2);
    }
  });

  const rate = (type: 'slugger' | 'boss' | 'straight', aim: { x: number; y: number }, label: string) => {
    const r = simulateAtBats(type, policies.normal, 3000, 1, () => aim);
    console.log(`${label}: 打ち取り ${(r.outRate * 100).toFixed(0)}% / ヒット ${(r.hitRate * 100).toFixed(0)}%（長打 ${(r.longRate * 100).toFixed(0)}%）/ 四球 ${(r.walkRate * 100).toFixed(0)}%`);
    return r;
  };

  it('得意なコースは打たれ、苦手なコースは打ち取りやすい（リズムは「ふつう」のまま）', () => {
    const hot = rate('slugger', { x: 3, y: 3 }, '強打者 × ど真ん中（得意）');
    const cold = rate('slugger', { x: 2, y: 4 }, '強打者 × 外角低め（苦手）');
    expect(cold.outRate).toBeGreaterThan(hot.outRate + 0.1);
    expect(cold.longRate).toBeLessThan(hot.longRate);
    const bossHot = rate('boss', { x: 3, y: 3 }, 'ボス × ど真ん中（得意）');
    const bossCold = rate('boss', { x: 2, y: 4 }, 'ボス × 外角低め（苦手）');
    expect(bossCold.outRate).toBeGreaterThan(bossHot.outRate);
  });

  it('はっきりしたボール（外側の1周）は、きわどいボールより振ってもらえない', () => {
    const swings = (aim: { x: number; y: number }) => {
      let n = 0;
      for (let seed = 1; seed <= 2000; seed++) {
        const cfg = config(['straight'], seed, { strikeRate: 1 });
        if (throwPitch(cfg, initGame(cfg), NORMAL, aim).record.swung) n++;
      }
      return n / 2000;
    };
    const near = swings({ x: 1, y: 3 });
    const far = swings({ x: 0, y: 3 });
    expect(near).toBeGreaterThan(0.1);
    expect(far).toBeLessThan(near / 2);
  });

  it('ボールゾーンばかりねらうと四球が増える', () => {
    const ball = rate('straight', { x: 1, y: 5 }, 'まっすぐ待ち × 外角低めのボール');
    const strike = rate('straight', { x: 2, y: 4 }, 'まっすぐ待ち × 外角低め');
    expect(ball.walkRate).toBeGreaterThan(strike.walkRate + 0.2);
  });

  it('同じマスが続くと記録され、打席が変わるとリセットされる', () => {
    const cfg = config(['straight', 'straight'], 3, { strikeRate: 1 });
    let s = initGame(cfg);
    const aim = { x: 3, y: 4 };
    const a = throwPitch(cfg, s, NORMAL, aim);
    expect(a.record.location).toEqual(aim);
    expect(a.record.sameSpot).toBe(false);
    s = a.state;
    if (!a.record.atBatEnd) expect(throwPitch(cfg, s, NORMAL, aim).record.sameSpot).toBe(true);
    else expect(s.lastCell).toBeNull();
    // ねらいを指定しなければ、コースの記録はつかない
    expect(throwPitch(cfg, initGame(cfg), NORMAL).record.location).toBeUndefined();
  });
});

describe('対戦モード（人が打者）', () => {
  it('人のタイミングで結果が決まる：ぴったりなら当たり、大きくずれたら空振り、振らなければ見送り', () => {
    const cfg = config(['straight'], 9, { strikeRate: 1 });
    const s = initGame(cfg);
    const aim = { x: 3, y: 3 };
    const miss = throwPitch(cfg, s, NORMAL, aim, { swung: true, errorMs: 250 }).record;
    expect(miss.result).toBe('swingMiss');
    expect(miss.timingErrorMs).toBe(250);
    expect(miss.timing).toBe('broken');
    const take = throwPitch(cfg, s, NORMAL, aim, { swung: false, errorMs: 0 }).record;
    expect(take.result).toBe('take');
    expect(throwPitch(cfg, s, NORMAL, { x: 1, y: 1 }, { swung: false, errorMs: 0 }).record.result).toBe('ball');
    let contact = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const c = config(['straight'], seed, { strikeRate: 1 });
      const r = throwPitch(c, initGame(c), NORMAL, aim, { swung: true, errorMs: 10 }).record;
      expect(r.timing).toBe('just');
      if (r.result !== 'swingMiss') contact++;
    }
    expect(contact).toBe(200);
  });

  it('ボールが行く場所は、振る・振らないに関係なく同じ（投げる前に計算しておける）', () => {
    const cfg = config(['straight'], 4);
    const s = initGame(cfg);
    const a = throwPitch(cfg, s, NORMAL, { x: 2, y: 4 }, { swung: false, errorMs: 0 }).record.location;
    const b = throwPitch(cfg, s, NORMAL, { x: 2, y: 4 }, { swung: true, errorMs: -90 }).record.location;
    expect(a).toEqual(b);
  });
});

describe('牽制（左投手）', () => {
  const pickoff = (base: 1 | 2 | 3, move: 'lift' | 'quick' = 'quick') => ({ ...fromCards(BASE, { s1: 0, s2: 0, s3: 0 }, 'pickoff'), pickoffBase: base, pickoffMove: move });
  const outRate = (base: 1 | 2 | 3, move: 'lift' | 'quick', bases: [boolean, boolean, boolean]) => {
    let out = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const cfg = config(['straight'], seed);
      const o = throwPitch(cfg, initGame(cfg, { bases }), pickoff(base, move));
      if (o.record.result === 'pickoffOut') {
        out++;
        expect(o.state.bases[base - 1]).toBe(false);
      }
    }
    return out / 3000;
  };

  it('一塁は足を上げる牽制がいちばん刺しやすく、二塁・三塁は刺しにくい', () => {
    const lift = outRate(1, 'lift', [true, false, false]);
    const quick = outRate(1, 'quick', [true, false, false]);
    const second = outRate(2, 'quick', [false, true, false]);
    const third = outRate(3, 'quick', [false, false, true]);
    console.log(`牽制アウト率：一塁（足を上げる）${(lift * 100).toFixed(0)}% / 一塁（クイック）${(quick * 100).toFixed(0)}% / 二塁 ${(second * 100).toFixed(0)}% / 三塁 ${(third * 100).toFixed(0)}%`);
    expect(lift).toBeGreaterThan(quick);
    expect(quick).toBeGreaterThan(second);
    expect(second).toBeGreaterThan(third);
  });

  it('選んだ塁に牽制する（満塁なら三塁にも投げられる）', () => {
    const cfg = config(['straight'], 2);
    for (let seed = 1; seed <= 300; seed++) {
      const c = config(['straight'], seed);
      const o = throwPitch(c, initGame(c, { bases: [true, true, true] }), pickoff(3));
      if (o.record.result === 'pickoffOut') {
        expect(o.state.bases).toEqual([true, true, false]);
        return;
      }
    }
    void cfg;
    throw new Error('三塁牽制でアウトにならなかった');
  });

  it('牽制のあとの1球は、打者のリズムがくずれる（予想が仕切り直しになり、ばらつきが増える）', () => {
    const cfg = config(['slugger'], 5);
    let s = initGame(cfg, { bases: [true, false, false] });
    // 同じ「ゆっくり」を2球見せて、打者に合わせさせる
    const slow = pat({ s1: 0, s2: 1, s3: 1 });
    s = throwPitch(cfg, s, slow, { x: 3, y: 3 }).state;
    if (s.atBatPitches === 0) return;
    const before = s.batter;
    const after = throwPitch(cfg, s, pickoff(1)).state.batter;
    expect(after.unsettled).toBe(true);
    expect(Math.abs(after.expLtr - liftToRelease(BASE))).toBeLessThan(Math.abs(before.expLtr - liftToRelease(BASE)));
    // 次に投げたら、集中は戻る
    const next = throwPitch(cfg, { ...s, batter: after }, NORMAL, { x: 3, y: 3 }).state.batter;
    expect(next.unsettled ?? false).toBe(false);
  });
});

describe('球種（ストレート・スローボール）', () => {
  const slow = { ...NORMAL, pitchType: 'slow' as const };

  it('スローボールは届くのがおそい', () => {
    expect(flightOf(slow)).toBeGreaterThan(flightOf(NORMAL) + 0.2);
  });

  it('ストレートを待っている打者は、スローボールで早く振ってしまう。続けると慣れられ、そのあとのストレートには振りおくれる', () => {
    let b = initBatter('straight', BASE);
    const first = swingTiming(b, slow, 0).error;
    expect(first).toBeGreaterThan(0.1);
    for (let i = 0; i < 4; i++) b = updateBatter(b, slow);
    expect(swingTiming(b, slow, 0).error).toBeLessThan(first / 2);
    expect(swingTiming(b, NORMAL, 0).error).toBeLessThan(-0.05);
  });

  it('スローボールのときは走られやすい', () => {
    const r = initRunner(BASE);
    expect(stealSuccessChance(r, slow, BASE, 0)).toBeGreaterThan(stealSuccessChance(r, NORMAL, BASE, 0));
  });
});
