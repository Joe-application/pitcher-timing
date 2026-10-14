// 投げるコースと高さ。7×7 のマスで表し、まん中の 3×3 がストライクゾーン、そのまわりの2周（40マス）がボールゾーン。
// 内側の1周は「きわどいボール」、外側の1周は「はっきりしたボール」。
// マスは投手から見た向き：x = 0 が左（一塁側）〜 6 が右（三塁側）、y = 0 が高め 〜 6 が低め。
// 右打者は投手から見て右（三塁側）に立つので、右打者の内角は x が大きい側になる。純粋関数のみ。

import type { BatterSpot, BatterType, Cell, Hand, ZoneCol, ZoneKind, ZoneRow, ZoneSpot } from '../types';
import { LOCATION } from './constants';

export const GRID = 7;
/** ストライクゾーンの端（2〜4 がストライク） */
export const ZONE_MIN = 2;
export const ZONE_MAX = 4;
export const CENTER: Cell = { x: 3, y: 3 };

export const isStrike = (c: Cell) => c.x >= ZONE_MIN && c.x <= ZONE_MAX && c.y >= ZONE_MIN && c.y <= ZONE_MAX;
/** いちばん外側の1周＝はっきりしたボール（打者はほとんど振らない） */
export const isFarBall = (c: Cell) => c.x === 0 || c.y === 0 || c.x === GRID - 1 || c.y === GRID - 1;
export const sameCell = (a: Cell | null | undefined, b: Cell | null | undefined) => !!a && !!b && a.x === b.x && a.y === b.y;

/** 打者から見たコース。ボールゾーンも、内角側・外角側に寄せて答える */
export function colOf(c: Cell, hand: Hand): ZoneCol {
  const fromInside = hand === 'R' ? GRID - 1 - c.x : c.x;
  return fromInside < CENTER.x ? 'in' : fromInside === CENTER.x ? 'mid' : 'out';
}

export function rowOf(c: Cell): ZoneRow {
  return c.y < CENTER.y ? 'high' : c.y === CENTER.y ? 'mid' : 'low';
}

/** 打者タイプごとの得意・苦手コース（打者から見た向き）。ステージ側で打者ごとに上書きできる */
export const ZONE_PROFILE: Record<BatterType, { hot: ZoneSpot[]; cold: ZoneSpot[] }> = {
  straight: { hot: ['mid-mid', 'mid-high'], cold: ['out-low', 'in-low', 'in-high'] },
  hasty: { hot: ['in-high', 'mid-high', 'in-mid'], cold: ['out-low', 'out-mid', 'mid-low'] },
  patient: { hot: ['out-mid', 'mid-mid', 'out-high'], cold: ['in-high', 'in-mid', 'in-low'] },
  slugger: { hot: ['mid-mid', 'in-mid', 'mid-high', 'in-low'], cold: ['out-low', 'in-high'] },
  boss: { hot: ['mid-mid', 'in-mid', 'mid-high', 'mid-low', 'out-mid'], cold: ['out-low', 'in-high'] },
};

/** そのマスが、この打者の得意・苦手・ふつうのどれか。ボールゾーンは 'ball' */
export function zoneKind(spot: BatterSpot, c: Cell): ZoneKind {
  if (!isStrike(c)) return 'ball';
  const key = `${colOf(c, spot.hand)}-${rowOf(c)}` as ZoneSpot;
  const prof = ZONE_PROFILE[spot.type];
  if ((spot.hot ?? prof.hot).includes(key)) return 'hot';
  if ((spot.cold ?? prof.cold).includes(key)) return 'cold';
  return 'normal';
}

const DIRS: [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];
const clampCell = (v: number) => Math.min(GRID - 1, Math.max(0, v));

/**
 * ねらったマスに対して、実際にボールが行ったマス。
 * @param onTarget ねらいどおりに行く確率
 * @param u1 当たり外れを決める乱数（0〜1）
 * @param u2 外れる向きを決める乱数（0〜1）
 */
export function actualCell(aim: Cell, onTarget: number, u1: number, u2: number): Cell {
  if (u1 < onTarget) return aim;
  // 外れたうちの一部は、2マスぶん大きく外れる
  const far = (u1 - onTarget) / Math.max(1e-9, 1 - onTarget) > 1 - LOCATION.FAR_MISS;
  const [dx, dy] = DIRS[Math.min(DIRS.length - 1, Math.floor(u2 * DIRS.length))];
  const k = far ? 2 : 1;
  return { x: clampCell(aim.x + dx * k), y: clampCell(aim.y + dy * k) };
}

/** コース・高さが、当たったときの結果に与える影響 */
export interface ContactMod {
  /** ヒットになる確率の倍率 */
  hit: number;
  /** 長打になる確率の倍率 */
  long: number;
  /** ゴロになる割合に足す値（低めはゴロ、高めはフライ） */
  ground: number;
}

export const NO_MOD: ContactMod = { hit: 1, long: 1, ground: 0 };

export function contactMod(kind: ZoneKind, c: Cell, repeated: boolean): ContactMod {
  let hit = kind === 'hot' ? LOCATION.HOT_HIT : kind === 'cold' ? LOCATION.COLD_HIT : 1;
  if (repeated) hit *= LOCATION.REPEAT_HIT;
  const row = rowOf(c);
  return {
    hit,
    long: row === 'high' ? LOCATION.HIGH_LONG : row === 'low' ? LOCATION.LOW_LONG : 1,
    ground: row === 'low' ? LOCATION.LOW_GROUND : row === 'high' ? -LOCATION.LOW_GROUND : 0,
  };
}

/** コースによるタイミングのずれ（秒）。内角は早く振らないと差し込まれ、外角は待たないと泳ぐ */
export function timingShift(c: Cell, hand: Hand): number {
  const col = colOf(c, hand);
  return col === 'in' ? -LOCATION.SIDE_TIMING_SHIFT : col === 'out' ? LOCATION.SIDE_TIMING_SHIFT : 0;
}

/** 得意・苦手コースで、ストライクを振る確率に足す値 */
export function swingAdjust(kind: ZoneKind): number {
  return kind === 'hot' ? LOCATION.HOT_SWING : kind === 'cold' ? -LOCATION.HOT_SWING : 0;
}
