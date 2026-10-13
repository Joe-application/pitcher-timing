// テスト用：投げ方の方針（ポリシー）と、たくさんの打席を回す道具

import type { BatterSpot, BatterType, Cell, TimingPattern } from '../../types';
import { initGame, isBatterOut, throwPitch, type GameConfig } from '../atBat';
import { CARD_LEVELS, DEFAULT_BASELINE } from '../constants';
import { createRng, hashSeed, type Rng } from '../rng';
import { fromCards, liftToRelease, NORMAL_CARDS, type Cards } from '../timing';

export const BASE = { ...DEFAULT_BASELINE };
export const ALL_CARDS: Cards[] = CARD_LEVELS.s1.flatMap((s1) => CARD_LEVELS.s2.flatMap((s2) => CARD_LEVELS.s3.map((s3) => ({ s1, s2, s3 }))));

export const pat = (c: Cards): TimingPattern => fromCards(BASE, c);
export const NORMAL = pat(NORMAL_CARDS);

/** 前の球のカード（最初は null）から、次のカードを決める */
export type Policy = (prev: Cards | null, rng: Rng) => Cards;

const diffCount = (a: Cards, b: Cards) => (['s1', 's2', 's3'] as const).filter((k) => a[k] !== b[k]).length;

export const policies = {
  /** いつも「ふつう」 */
  normal: (): Cards => NORMAL_CARDS,
  /** でたらめに選ぶ */
  random: (_prev: Cards | null, rng: Rng): Cards => rng.pick(ALL_CARDS),
  /** 毎球、前の球から2区間以上を変える */
  twoSegments: (prev: Cards | null, rng: Rng): Cards => rng.pick(ALL_CARDS.filter((c) => diffCount(c, prev ?? NORMAL_CARDS) >= 2)),
  /** 「ふつう」から1区間だけ変える */
  oneSegment: (_prev: Cards | null, rng: Rng): Cards => {
    const k = rng.pick(['s1', 's2', 's3'] as const);
    return { ...NORMAL_CARDS, [k]: rng.pick([-1, 1] as const) };
  },
  /** 直前の球と「足上げ〜リリース」を大きく変え、止まる長さも変える */
  bigChange: (prev: Cards | null, rng: Rng): Cards => {
    const p = pat(prev ?? NORMAL_CARDS);
    const far = ALL_CARDS.filter((c) => Math.abs(liftToRelease(pat(c)) - liftToRelease(p)) >= 0.4 && c.s1 !== (prev ?? NORMAL_CARDS).s1);
    return rng.pick(far);
  },
};

/** テスト用の打順（右打ち・打順は並び順） */
export const spot = (type: BatterType, i = 0): BatterSpot => ({ type, hand: 'R', order: i + 1 });

export function config(lineup: BatterType[], seed: number, extra: Partial<GameConfig> = {}): GameConfig {
  return { stageId: 'test', lineup: lineup.map(spot), base: BASE, seed, stealing: false, outsToClear: 3, maxRuns: 99, ...extra };
}

export interface AtBatStats {
  outRate: number;
  hitRate: number;
  walkRate: number;
  longRate: number;
  pitches: number;
}

/** 1人の打者との打席を n 回くり返す */
export function simulateAtBats(type: BatterType, policy: Policy, n: number, seed0 = 1, aim?: (rng: Rng) => Cell): AtBatStats {
  let outs = 0;
  let hits = 0;
  let walks = 0;
  let longs = 0;
  let pitches = 0;
  for (let i = 0; i < n; i++) {
    const seed = hashSeed(seed0, i);
    const cfg = config([type], seed);
    const rng = createRng(hashSeed(seed, 777));
    let s = initGame(cfg);
    let prev: Cards | null = null;
    for (;;) {
      const cards = policy(prev, rng);
      prev = cards;
      const o = throwPitch(cfg, s, pat(cards), aim?.(rng));
      s = o.state;
      pitches++;
      const r = o.record;
      if (!r.atBatEnd) continue;
      if (isBatterOut(r)) outs++;
      else if (r.result === 'ball') walks++;
      else {
        hits++;
        if (r.result !== 'hit') longs++;
      }
      break;
    }
  }
  return { outRate: outs / n, hitRate: hits / n, walkRate: walks / n, longRate: longs / n, pitches: pitches / n };
}
