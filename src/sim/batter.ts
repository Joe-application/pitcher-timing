// 打者モデル（§4.3）。打者は「この投手はこのリズムで投げてくる」という予想を持ち、
// 予想とのずれでスイングのタイミングが決まる。純粋関数のみ。

import type { BatterType, PitchResult, Seconds, TimingGrade } from '../types';
import { BATTER_MODEL, BATTERS, CONTACT, PITCH, SWING, TIMING_BANDS } from './constants';
import { liftToRelease, sameRhythm, type Segments } from './timing';

export interface BatterState {
  type: BatterType;
  /** 予想している「とまる」の長さ */
  expS1: Seconds;
  /** 予想している「足上げ開始→リリース」の長さ */
  expLtr: Seconds;
  /** 同じリズムが続いている球数 */
  streak: number;
  /** 直前の投球 */
  last: Segments | null;
}

/** 打席に入るとき。ベンチで見ていたので、投手の「ふつう」を予想している */
export function initBatter(type: BatterType, base: Segments): BatterState {
  return { type, expS1: base.s1, expLtr: liftToRelease(base), streak: 0, last: null };
}

/** この球を投げたら、同じリズムが何球続くことになるか */
export function streakWith(b: BatterState, p: Segments): number {
  return b.last && sameRhythm(b.last, p) ? b.streak + 1 : 1;
}

export interface SwingTiming {
  /** 正なら打者が早すぎ（泳ぐ）、負なら差し込まれる */
  error: Seconds;
  grade: TimingGrade;
  /** 長いセットで力んだ */
  tense: boolean;
  /** 短いセットで準備が遅れた */
  rushed: boolean;
}

export function gradeOf(error: Seconds): TimingGrade {
  const a = Math.abs(error);
  if (a <= TIMING_BANDS.just) return 'just';
  if (a <= TIMING_BANDS.slight) return 'slight';
  if (a <= TIMING_BANDS.off) return 'off';
  return 'broken';
}

/**
 * スイングのタイミング誤差。
 * @param z 標準正規分布の乱数（打者固有のばらつき用）
 */
export function swingTiming(b: BatterState, p: Segments, z: number): SwingTiming {
  const prm = BATTERS[b.type];
  // 主な誤差：実際の長さ − 予想の長さ
  let e = liftToRelease(p) - b.expLtr;
  e *= e > 0 ? prm.earlyGain : prm.lateGain;
  // 短いセットで準備が遅れると、そのぶん差し込まれる
  const rushed = p.s1 < b.expS1 - BATTER_MODEL.S1_SHORT_MARGIN;
  if (rushed) e -= BATTER_MODEL.S1_SHORT_LATE_SHIFT;
  // 強い打者は、少しのずれなら動きを見て合わせてしまう
  e = Math.sign(e) * Math.max(0, Math.abs(e) - prm.adjust);

  let sigma = prm.sigma;
  const tense = prm.tenseOnLongSet && p.s1 > b.expS1 + BATTER_MODEL.S1_LONG_MARGIN;
  if (tense) sigma *= BATTER_MODEL.S1_LONG_SIGMA_FACTOR;
  // 同じリズムが続くと読まれる
  if (b.streak >= BATTER_MODEL.SAME_STREAK_FOR_BONUS - 1 && b.last && sameRhythm(b.last, p)) {
    sigma *= BATTER_MODEL.SAME_STREAK_SIGMA_FACTOR;
  }

  const error = e + z * sigma;
  return { error, grade: gradeOf(error), tense, rushed };
}

/** 投球を見たあとの予想の更新（指数移動平均） */
export function updateBatter(b: BatterState, p: Segments): BatterState {
  const prm = BATTERS[b.type];
  const streak = streakWith(b, p);
  let alpha = prm.alpha;
  if (streak >= BATTER_MODEL.SAME_STREAK_FOR_BONUS) alpha = Math.min(1, alpha + BATTER_MODEL.SAME_STREAK_ALPHA_BONUS);
  return {
    type: b.type,
    expS1: b.expS1 + alpha * (p.s1 - b.expS1),
    expLtr: b.expLtr + alpha * (liftToRelease(p) - b.expLtr),
    streak,
    last: { s1: p.s1, s2: p.s2, s3: p.s3, s4: p.s4 },
  };
}

/** プレートを外されたとき：予想が「ふつう」の方へ少し戻る（仕切り直し） */
export function resetBatter(b: BatterState, base: Segments, amount: number): BatterState {
  return {
    ...b,
    expS1: b.expS1 + amount * (base.s1 - b.expS1),
    expLtr: b.expLtr + amount * (liftToRelease(base) - b.expLtr),
    streak: 0,
    last: null,
  };
}

/** 振る確率 */
export function swingChance(type: BatterType, inZone: boolean, balls: number, strikes: number, grade: TimingGrade): number {
  const eager = BATTERS[type].eagerness;
  if (inZone) {
    if (strikes >= 2) return SWING.strikeTwoStrikes;
    if (balls === 3 && strikes === 0) return SWING.strikeThreeOh;
    return Math.min(0.98, Math.max(0.05, SWING.strike + eager));
  }
  let p = strikes >= 2 ? SWING.ballTwoStrikes : SWING.ball;
  // タイミングを崩されると、体が止まらずボール球にも手が出る
  if (grade === 'off' || grade === 'broken') p += SWING.ballChaseWhenFooled;
  return Math.min(0.9, Math.max(0.02, p + eager));
}

/** S3（ため）が長すぎて球の勢いが落ちた度合い（0〜1） */
export function holdLoss(s3: Seconds): number {
  const k = (s3 - PITCH.HOLD_LOSS_START) / (PITCH.HOLD_LOSS_FULL - PITCH.HOLD_LOSS_START);
  return Math.min(1, Math.max(0, k));
}

/** ジャストで当たったときの長打（二塁打以上）の確率 */
export function longHitChance(type: BatterType, s3: Seconds): number {
  const c = CONTACT.just;
  return Math.min(0.9, c.longBase + c.longPerPower * BATTERS[type].power + PITCH.HOLD_LOSS_LONG_HIT_BONUS * holdLoss(s3));
}

const DOWNGRADE: Record<TimingGrade, TimingGrade> = { just: 'slight', slight: 'off', off: 'broken', broken: 'broken' };

/**
 * スイングの結果。
 * @param u 0〜1 の一様乱数
 */
export function swingResult(type: BatterType, grade: TimingGrade, inZone: boolean, s3: Seconds, u: number): PitchResult {
  const power = BATTERS[type].power;
  const g = !inZone && CONTACT.chaseDowngrade ? DOWNGRADE[grade] : grade;
  // u を「区切り」で順番に切っていく
  let acc = 0;
  const hit = (p: number) => u < (acc += p);

  if (g === 'just') {
    const c = CONTACT.just;
    const long = longHitChance(type, s3);
    const hr = long * (c.hrBase + c.hrPerPower * power);
    if (hit(hr)) return 'homeRun';
    if (hit(long - hr)) return 'extraBase';
    if (hit(c.single)) return 'hit';
    const rest = 1 - acc;
    return hit(rest * c.groundShare) ? 'groundOut' : 'flyOut';
  }
  if (g === 'slight') {
    const c = CONTACT.slight;
    if (hit(c.foul)) return 'foul';
    if (hit(c.hitBase + c.hitPerPower * power)) return 'hit';
    const rest = 1 - acc;
    return hit(rest * c.groundShare) ? 'groundOut' : 'flyOut';
  }
  if (g === 'off') {
    const c = CONTACT.off;
    if (hit(c.swingMiss)) return 'swingMiss';
    if (hit(c.foul)) return 'foul';
    if (hit(c.hit)) return 'hit';
    const rest = 1 - acc;
    return hit(rest * c.groundShare) ? 'groundOut' : 'flyOut';
  }
  return 'swingMiss';
}
