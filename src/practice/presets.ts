// ずらしパターンのプリセット。「ふつう」からの差（カード）で決めてあるので、
// 「自分のふつう」を測りなおすと、プリセットの長さも自動で変わる。

import { fromCards, type Cards, type Segments } from '../sim/timing';
import type { TimingPattern } from '../types';

export interface PresetDef {
  id: string;
  name: string;
  /** 読み上げ用 */
  say: string;
  cards: Cards;
  hint: string;
}

export const PRESETS: PresetDef[] = [
  { id: 'normal', name: 'ふつう', say: 'ふつう', cards: { s1: 0, s2: 0, s3: 0 }, hint: 'いつものリズム。これが{基準|きじゅん}' },
  { id: 'long', name: 'ながセット', say: 'ながセット', cards: { s1: 1, s2: 0, s3: 0 }, hint: '{長|なが}く{止|と}まってから、ふつうに{投|な}げる' },
  { id: 'short', name: 'みじかセット', say: 'みじかセット', cards: { s1: -1, s2: 0, s3: 0 }, hint: 'ピタッと{止|と}まったら、すぐ{足|あし}を{上|あ}げる' },
  { id: 'quick', name: 'クイック', say: 'クイック', cards: { s1: 0, s2: -1, s3: -1 }, hint: '{足|あし}を{小|ちい}さくすばやく{上|あ}げて、すぐ{前|まえ}へ' },
  { id: 'slow', name: 'ゆっくり', say: 'ゆっくり', cards: { s1: 0, s2: 1, s3: 0 }, hint: '{足|あし}をゆっくり{上|あ}げる' },
  { id: 'hold', name: 'ためため', say: 'ためため', cards: { s1: 0, s2: 0, s3: 1 }, hint: '{足|あし}を{上|あ}げたところで、ひと{呼吸|こきゅう}ためる' },
  { id: 'longQuick', name: 'ながクイック', say: 'ながクイック', cards: { s1: 1, s2: -1, s3: -1 }, hint: '{長|なが}く{止|と}まってから、ササッと{投|な}げる' },
  { id: 'shortHold', name: 'みじかため', say: 'みじかため', cards: { s1: -1, s2: 1, s3: 1 }, hint: 'すぐ{足|あし}を{上|あ}げて、ゆっくりためる' },
];

export function presetPattern(def: PresetDef, base: Segments): TimingPattern {
  return { ...fromCards(base, def.cards), id: `preset:${def.id}`, name: def.name, createdFrom: 'preset' };
}

/** 組み立て練習：3球1セットの順番 */
export const SEQUENCES: { name: string; ids: string[] }[] = [
  { name: 'ふつう → ながセット → クイック', ids: ['normal', 'long', 'quick'] },
  { name: 'ゆっくり → クイック → ためため', ids: ['slow', 'quick', 'hold'] },
  { name: 'ながクイック → ふつう → みじかため', ids: ['longQuick', 'normal', 'shortHold'] },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id) ?? PRESETS[0];
