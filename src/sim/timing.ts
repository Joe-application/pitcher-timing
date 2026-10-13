// 区間の計算と、ルール（ボーク・二段モーション・遅延）の判定。純粋関数のみ。

import type { Baseline, PitchEvent, RuleWarning, Seconds, SegmentKey, ShiftKind, TimingPattern } from '../types';
import { BASELINE_LIMITS, CARD_DELTA, CARD_LIMITS, DEFAULT_BASELINE, RULES, SAME_TOLERANCE, SHIFT_THRESHOLD, type CardKey, type CardLevel } from './constants';

export type Segments = Record<SegmentKey, Seconds>;

/** カードの組み合わせ（とまる・あしあげ・ため） */
export interface Cards {
  s1: CardLevel;
  s2: CardLevel;
  s3: CardLevel;
}

export const NORMAL_CARDS: Cards = { s1: 0, s2: 0, s3: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** 足上げ開始からリリースまで（S2+S3+S4）。打者はこの長さを予想して振る */
export const liftToRelease = (p: Segments): Seconds => p.s2 + p.s3 + p.s4;

/** セット完了からリリースまで */
export const totalTime = (p: Segments): Seconds => p.s1 + p.s2 + p.s3 + p.s4;

/** 実測した「ふつう」があればそれを、なければ目安を返す */
export function baselineOf(b?: Baseline | null): Segments {
  if (!b) return { ...DEFAULT_BASELINE };
  const out = { ...DEFAULT_BASELINE };
  for (const k of ['s1', 's2', 's3', 's4'] as const) {
    const v = b[k];
    if (Number.isFinite(v)) out[k] = clamp(v, BASELINE_LIMITS[k][0], BASELINE_LIMITS[k][1]);
  }
  return out;
}

/** カードから実際の区間の長さを作る（「ふつう」からの差で決まる） */
export function fromCards(base: Segments, cards: Cards, event: PitchEvent | null = null, name = ''): TimingPattern {
  const seg = (k: CardKey): Seconds => {
    const delta = CARD_DELTA[k][cards[k]] ?? 0;
    if (delta === 0) return round3(base[k]);
    const [lo, hi] = CARD_LIMITS[k];
    return round3(clamp(base[k] + delta, lo, hi));
  };
  return {
    id: `c${cards.s1}${cards.s2}${cards.s3}${event ?? ''}`,
    name,
    s1: seg('s1'),
    s2: seg('s2'),
    s3: seg('s3'),
    s4: round3(base.s4),
    event,
    createdFrom: 'preset',
  };
}

/** 2つの投球が同じリズムか（打者に「また同じだ」と思われるか） */
export function sameRhythm(a: Segments, b: Segments): boolean {
  return (['s1', 's2', 's3'] as const).every((k) => Math.abs(a[k] - b[k]) <= SAME_TOLERANCE[k]);
}

/** 前の球から変えた区間 */
export function changedSegments(a: Segments, b: Segments): ('s1' | 's2' | 's3')[] {
  return (['s1', 's2', 's3'] as const).filter((k) => Math.abs(a[k] - b[k]) > SAME_TOLERANCE[k]);
}

/** 「ふつう」と比べて、どのずらしを使ったか */
export function shiftKinds(p: TimingPattern, base: Segments): ShiftKind[] {
  if (p.event === 'pickoff') return ['pickoff'];
  if (p.event === 'stepOff') return ['stepOff'];
  const kinds: ShiftKind[] = [];
  const d1 = p.s1 - base.s1;
  if (d1 <= -SHIFT_THRESHOLD.s1) kinds.push('s1Short');
  if (d1 >= SHIFT_THRESHOLD.s1) kinds.push('s1Long');
  const d2 = p.s2 - base.s2;
  if (d2 <= -SHIFT_THRESHOLD.s2) kinds.push('s2Quick');
  if (d2 >= SHIFT_THRESHOLD.s2) kinds.push('s2Slow');
  const d3 = p.s3 - base.s3;
  if (d3 <= -SHIFT_THRESHOLD.s3) kinds.push('s3Quick');
  if (d3 >= SHIFT_THRESHOLD.s3Long) kinds.push('s3Long');
  else if (d3 >= SHIFT_THRESHOLD.s3) kinds.push('s3Hold');
  return kinds;
}

export interface RuleOptions {
  runnerOn: boolean;
  balkCheck?: boolean;
  minSetStop?: Seconds;
  topHoldWarning?: boolean;
  maxTopHold?: Seconds;
}

/** ルール上の注意。balk はボーク（投球は無効）、delay は遅延、topHold は「止める動き」への注意 */
export function checkRules(p: TimingPattern, o: RuleOptions): RuleWarning[] {
  const w: RuleWarning[] = [];
  // 牽制・プレートを外すのは、静止の前でも反則ではない
  if (p.event) return w;
  const minStop = o.minSetStop ?? RULES.MIN_SET_STOP;
  if (o.runnerOn && (o.balkCheck ?? true) && p.s1 < minStop) w.push('balk');
  if (p.s1 > RULES.MAX_SET_STOP) w.push('delay');
  if ((o.topHoldWarning ?? true) && p.s3 > (o.maxTopHold ?? RULES.MAX_TOP_HOLD)) w.push('topHold');
  return w;
}

/** リリースまでの各時刻（セット完了を 0 とする）。アニメーションと合図音で使う */
export function marks(p: Segments): { lift: Seconds; top: Seconds; forward: Seconds; release: Seconds } {
  const lift = p.s1;
  const top = lift + p.s2;
  const forward = top + p.s3;
  return { lift, top, forward, release: forward + p.s4 };
}
