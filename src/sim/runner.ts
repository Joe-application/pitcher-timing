// 走者・牽制モデル（§4.5）。走者は投手の「とまる（S1）」の長さを予想し、
// 足上げ開始に合わせてスタートを切る。純粋関数のみ。

import type { PickoffBase, PickoffMove, PitchType, Seconds } from '../types';
import { PITCH, RUNNER } from './constants';
import { flightOf, liftToRelease, type Segments } from './timing';

export interface RunnerState {
  /** 走者が予想している S1（次に足を上げる時刻） */
  expS1: Seconds;
  /** 牽制された直後で、リードが小さい */
  cautious: boolean;
}

export function initRunner(base: Segments): RunnerState {
  return { expS1: base.s1, cautious: false };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 走者がスタートを切る確率 */
export function stealTryChance(r: RunnerState): number {
  return RUNNER.stealTry * (r.cautious ? RUNNER.stealTryAfterPickoff : 1);
}

/**
 * 盗塁の成功率。S1 が走者の予想どおりだと好スタートになる。
 * @param z 標準正規分布の乱数（スタートのばらつき）
 * @param toThird 三盗か
 */
export function stealSuccessChance(r: RunnerState, p: Segments & { pitchType?: PitchType }, base: Segments, z: number, toThird = false): number {
  // 走者のスタートのずれ（予想より早く足が上がると出遅れ、遅いと体が止まる）
  const miss = Math.abs(p.s1 - r.expS1 + z * RUNNER.jumpSigma);
  let s = RUNNER.successGoodJump - RUNNER.successDropPerSecond * Math.max(0, miss - RUNNER.goodJumpWindow);
  // クイックや、ためずにすぐ投げると、そのぶん走者は間に合わない（ゆっくり・ためると走られやすい）
  // スローボールも、届くのがおそいぶん走られやすい
  s += RUNNER.successPerDeliverySecond * (liftToRelease(p) - liftToRelease(base) + flightOf(p) - PITCH.BALL_FLIGHT);
  if (toThird) s *= RUNNER.stealThirdFactor;
  return Math.min(0.97, Math.max(RUNNER.successMin, s));
}

/**
 * 牽制でアウトにできる確率。走者が「そろそろ足が上がる」と思って
 * リードを大きく取っている瞬間（予想した足上げ時刻）に近いほど高い。
 * @param t セット完了から牽制の動きを始めるまでの時間
 * @param base 牽制する塁
 * @param move 一塁牽制のやり方（足を上げる・クイック）
 */
export function pickoffOutChance(r: RunnerState, t: Seconds, base: PickoffBase = 1, move: PickoffMove = 'quick'): number {
  const d = (t - r.expS1) / RUNNER.pickoffWindow;
  const p = RUNNER.pickoffMin + (RUNNER.pickoffMax - RUNNER.pickoffMin) * Math.exp(-d * d);
  const f = RUNNER.pickoffFactor;
  const factor = base === 1 ? (move === 'lift' ? f.firstLift : f.firstQuick) : base === 2 ? f.second : f.third;
  return clamp01(p * factor * (r.cautious ? 0.5 : 1));
}

/** 投球を見たあとの走者の予想の更新 */
export function updateRunner(r: RunnerState, p: Segments): RunnerState {
  return { expS1: r.expS1 + RUNNER.alpha * (p.s1 - r.expS1), cautious: false };
}

/** 牽制・プレートを外されたとき：予想が「ふつう」の方へ戻る */
export function resetRunner(r: RunnerState, base: Segments, amount: number, cautious: boolean): RunnerState {
  return { expS1: r.expS1 + amount * (base.s1 - r.expS1), cautious };
}
