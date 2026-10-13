// 打席・イニングの進行。1球ごとに「状態＋投球 → 新しい状態＋記録」を返す純粋関数。
// 乱数は球ごとのシードから決まった順番で引くので、同じシードと入力なら同じ結果になる（もしもリプレイ用）。

import type { Bases, BatterType, PitchRecord, PitchResult, RuleWarning, RunnerEvent, Seconds, TimingPattern } from '../types';
import { initBatter, resetBatter, streakWith, swingChance, swingResult, swingTiming, updateBatter, type BatterState } from './batter';
import { PITCH, RULES, RUNNER } from './constants';
import { createRng, hashSeed } from './rng';
import { initRunner, pickoffOutChance, resetRunner, stealSuccessChance, stealTryChance, updateRunner, type RunnerState } from './runner';
import { checkRules, shiftKinds, type Segments } from './timing';

/** 試合の設定（ステージごとに決まり、途中で変わらないもの） */
export interface GameConfig {
  stageId: string;
  /** 打順。最後まで行ったら先頭に戻る */
  lineup: BatterType[];
  /** 投手の「ふつう」 */
  base: Segments;
  /** ステージのシード。球ごとのシードはここから作る */
  seed: number;
  /** 走者が盗塁を狙うか */
  stealing: boolean;
  /** これだけアウトを取ればクリア */
  outsToClear: number;
  /** これを超えて点を取られたら失敗 */
  maxRuns: number;
  /** ストライクが入る割合 */
  strikeRate?: number;
  balkCheck?: boolean;
  minSetStop?: Seconds;
  topHoldWarning?: boolean;
  maxTopHold?: Seconds;
}

export interface GameState {
  batterIndex: number;
  batter: BatterState;
  balls: number;
  strikes: number;
  outs: number;
  runs: number;
  bases: Bases;
  /** 走者（とベンチ）が読んでいる投手の間 */
  runner: RunnerState;
  /** 牽制・プレートを外すを続けた回数 */
  pickoffsInRow: number;
  /** これまでに投げた球数（牽制も数える。シード用） */
  pitchCount: number;
  /** いまの打席で投げた球（牽制をのぞく） */
  atBatPitches: number;
}

export interface StartSituation {
  outs?: number;
  bases?: Bases;
  balls?: number;
  strikes?: number;
}

export function initGame(cfg: GameConfig, start: StartSituation = {}): GameState {
  return {
    batterIndex: 0,
    batter: initBatter(cfg.lineup[0], cfg.base),
    balls: start.balls ?? 0,
    strikes: start.strikes ?? 0,
    outs: start.outs ?? 0,
    runs: 0,
    bases: start.bases ? [...start.bases] : [false, false, false],
    runner: initRunner(cfg.base),
    pickoffsInRow: 0,
    pitchCount: 0,
    atBatPitches: 0,
  };
}

export const runnerOn = (bases: Bases) => bases[0] || bases[1] || bases[2];

/** 盗塁を狙える走者（次の塁が空いている、いちばん前の走者）。1 = 一塁走者、2 = 二塁走者 */
export function stealingRunner(bases: Bases): 1 | 2 | null {
  if (bases[1] && !bases[2]) return 2;
  if (bases[0] && !bases[1]) return 1;
  return null;
}

/** 牽制する相手。盗塁を狙える走者がいなければ、塁にいる走者 */
export function pickoffTarget(bases: Bases): 1 | 2 | null {
  return stealingRunner(bases) ?? (bases[1] ? 2 : bases[0] ? 1 : null);
}

export function isCleared(cfg: GameConfig, s: GameState): boolean {
  return !isFailed(cfg, s) && s.outs >= cfg.outsToClear;
}

export function isFailed(cfg: GameConfig, s: GameState): boolean {
  return s.runs > cfg.maxRuns;
}

export const isOver = (cfg: GameConfig, s: GameState) => isCleared(cfg, s) || isFailed(cfg, s);

/** 球ごとのシード */
export const pitchSeed = (cfg: GameConfig, s: GameState) => hashSeed(cfg.seed, s.pitchCount + 1);

// ---- 走者の進み方（単純化：アウトでは進まない、併殺なし） ----

function advance(bases: Bases, n: number, batterReaches: boolean): { bases: Bases; runs: number } {
  let runs = 0;
  const next: Bases = [false, false, false];
  for (let i = 2; i >= 0; i--) {
    if (!bases[i]) continue;
    if (i + n >= 3) runs++;
    else next[i + n] = true;
  }
  if (batterReaches) {
    if (n >= 4) runs++;
    else next[n - 1] = true;
  }
  return { bases: next, runs };
}

/** 四球：押し出される走者だけ進む */
function walk(bases: Bases): { bases: Bases; runs: number } {
  const next: Bases = [...bases];
  let runs = 0;
  if (next[0]) {
    if (next[1]) {
      if (next[2]) runs++;
      next[2] = true;
    }
    next[1] = true;
  }
  next[0] = true;
  return { bases: next, runs };
}

export interface PitchOutcome {
  state: GameState;
  record: PitchRecord;
}

/** 1球投げる（牽制・プレートを外すも含む） */
export function throwPitch(cfg: GameConfig, s: GameState, p: TimingPattern): PitchOutcome {
  const seed = pitchSeed(cfg, s);
  const rng = createRng(seed);
  // 乱数は使う・使わないに関係なく、いつも同じ順番で全部引く（もしもリプレイで結果を比べられるように）
  const d = {
    zone: rng.next(),
    swing: rng.next(),
    timing: rng.normal(),
    contact: rng.next(),
    stealTry: rng.next(),
    jump: rng.normal(),
    steal: rng.next(),
    pickoff: rng.next(),
  };

  const base = cfg.base;
  const anyRunner = runnerOn(s.bases);
  const warnings: RuleWarning[] = checkRules(p, {
    runnerOn: anyRunner,
    balkCheck: cfg.balkCheck,
    minSetStop: cfg.minSetStop,
    topHoldWarning: cfg.topHoldWarning,
    maxTopHold: cfg.maxTopHold,
  });

  let { balls, strikes, outs, runs } = s;
  let bases: Bases = [...s.bases];
  let batter = s.batter;
  let runner = s.runner;
  let pickoffsInRow = s.pickoffsInRow;
  let atBatPitches = s.atBatPitches;
  let result: PitchResult;
  let timingErrorMs = 0;
  let timing: PitchRecord['timing'];
  let swung: boolean | undefined;
  let runnerEvent: RunnerEvent | undefined;
  let atBatEnd = false;
  const sameStreak = p.event ? 0 : streakWith(batter, p);

  const addBall = () => {
    balls++;
    if (balls >= 4) {
      const w = walk(bases);
      bases = w.bases;
      runs += w.runs;
      atBatEnd = true;
    }
  };

  if (p.event) {
    // ---- 牽制・プレートを外す ----
    pickoffsInRow++;
    const tooMany = pickoffsInRow > RULES.MAX_PICKOFFS_IN_ROW;
    if (tooMany) warnings.push('tooManyPickoffs');
    const target = pickoffTarget(bases);
    if (p.event === 'pickoff' && target && !tooMany) {
      if (d.pickoff < pickoffOutChance(runner, p.s1)) {
        result = 'pickoffOut';
        bases[target - 1] = false;
        outs++;
      } else {
        result = 'pickoffSafe';
      }
      runner = resetRunner(runner, base, RUNNER.pickoffReset, true);
    } else {
      // 外す（走者がいないときの牽制も、仕切り直しとして扱う）
      result = 'stepOff';
      batter = resetBatter(batter, base, RUNNER.stepOffReset);
      runner = resetRunner(runner, base, RUNNER.stepOffReset, false);
    }
    // やりすぎは遅延：ボールが1つ増える
    if (tooMany) addBall();
  } else if (warnings.includes('balk')) {
    // ---- ボーク：投球は無効、走者が1つずつ進む ----
    result = 'balk';
    const a = advance(bases, 1, false);
    bases = a.bases;
    runs += a.runs;
    pickoffsInRow = 0;
  } else if (warnings.includes('delay')) {
    // ---- 遅延：投げる前に審判に止められ、ボールが1つ増える ----
    result = 'ball';
    addBall();
    pickoffsInRow = 0;
  } else {
    // ---- 投球 ----
    pickoffsInRow = 0;
    atBatPitches++;
    let strikeRate = cfg.strikeRate ?? PITCH.STRIKE_RATE;
    if (p.s2 < PITCH.QUICK_S2) strikeRate -= PITCH.QUICK_S2_PENALTY;
    if (p.s1 < PITCH.RUSHED_S1) strikeRate -= PITCH.RUSHED_S1_PENALTY;
    const inZone = d.zone < strikeRate;

    const t = swingTiming(batter, p, d.timing);
    timingErrorMs = Math.round(t.error * 1000);
    timing = t.grade;
    swung = d.swing < swingChance(batter.type, inZone, balls, strikes, t.grade);

    if (swung) result = swingResult(batter.type, t.grade, inZone, p.s3, d.contact);
    else result = inZone ? 'take' : 'ball';

    // 走者のスタート（打球が前に飛ばなかったときだけ盗塁になる）
    const who = cfg.stealing ? stealingRunner(bases) : null;
    const going = who !== null && d.stealTry < stealTryChance(runner);
    const stealOk = going && d.steal < stealSuccessChance(runner, p, base, d.jump, who === 2);

    switch (result) {
      case 'swingMiss':
      case 'take':
        strikes++;
        if (strikes >= 3) {
          outs++;
          atBatEnd = true;
        }
        break;
      case 'foul':
        if (strikes < 2) strikes++;
        break;
      case 'ball':
        addBall();
        break;
      case 'groundOut':
      case 'flyOut':
        outs++;
        atBatEnd = true;
        break;
      case 'hit':
      case 'extraBase':
      case 'homeRun': {
        const n = result === 'hit' ? 1 : result === 'extraBase' ? 2 : 4;
        const a = advance(bases, n, true);
        bases = a.bases;
        runs += a.runs;
        atBatEnd = true;
        break;
      }
      default:
        break;
    }

    // 四球で押し出されたときは盗塁にならない
    const walked = result === 'ball' && atBatEnd;
    if (going && who && !walked && (result === 'swingMiss' || result === 'take' || result === 'ball')) {
      if (stealOk) {
        runnerEvent = 'steal';
        bases[who - 1] = false;
        bases[who] = true;
      } else {
        runnerEvent = 'caughtStealing';
        bases[who - 1] = false;
        outs++;
      }
    }

    batter = updateBatter(batter, p);
    runner = updateRunner(runner, p);
  }

  let batterIndex = s.batterIndex;
  const record: PitchRecord = {
    stageId: cfg.stageId,
    batterType: s.batter.type,
    pattern: p,
    batterExpectation: { s1: s.batter.expS1, liftToRelease: s.batter.expLtr },
    timingErrorMs,
    result,
    seed,
    timing,
    swung,
    runnerEvent,
    runnerExpectationS1: s.runner.expS1,
    kinds: shiftKinds(p, base),
    warnings,
    after: { balls, strikes, outs, runs, bases: [...bases] },
    atBatEnd,
    outsMade: outs - s.outs,
    runsScored: runs - s.runs,
    sameStreak,
  };

  if (atBatEnd) {
    batterIndex = (s.batterIndex + 1) % cfg.lineup.length;
    batter = initBatter(cfg.lineup[batterIndex], base);
    balls = 0;
    strikes = 0;
    atBatPitches = 0;
  }

  return {
    record,
    state: {
      batterIndex,
      batter,
      balls,
      strikes,
      outs,
      runs,
      bases,
      runner,
      pickoffsInRow,
      pitchCount: s.pitchCount + 1,
      atBatPitches,
    },
  };
}

/** 打者をアウトにした球か（三振・ゴロ・フライ） */
export function isBatterOut(r: PitchRecord): boolean {
  if (!r.atBatEnd) return false;
  return r.result === 'groundOut' || r.result === 'flyOut' || ((r.result === 'swingMiss' || r.result === 'take') && r.after.strikes >= 3);
}

/** 打者に出塁された球か（ヒット・四球） */
export function isBatterOnBase(r: PitchRecord): boolean {
  return r.atBatEnd && !isBatterOut(r);
}
