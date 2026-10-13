// ランク・星・バッジ（§6）

import { isBatterOut } from '../sim/atBat';
import type { PitchRecord, Profile, ShiftKind, Stats } from '../types';
import { STAGES } from './stages';

export interface RankDef {
  name: string;
  /** このランクになるのに必要なポイント（星の合計 ＋ 練習10回ごとに1） */
  points: number;
}

export const RANKS: RankDef[] = [
  { name: '{見習|みなら}い', points: 0 },
  { name: '{控|ひか}え{投手|とうしゅ}', points: 3 },
  { name: 'エース{候補|こうほ}', points: 6 },
  { name: 'エース', points: 10 },
  { name: '{試合|しあい}を{作|つく}る{投手|とうしゅ}', points: 14 },
];

/** リアルタイム方式が使えるランク（エース候補） */
export const REALTIME_RANK = 2;

export const totalStars = (stars: Record<string, number>) => Object.values(stars).reduce((a, b) => a + b, 0);

export const rankPoints = (p: Pick<Profile, 'stars' | 'stats'>) => totalStars(p.stars) + Math.floor(p.stats.practiceReps / 10);

export function rankIndex(points: number): number {
  let i = 0;
  RANKS.forEach((r, k) => {
    if (points >= r.points) i = k;
  });
  return i;
}

export const nextRank = (points: number): RankDef | null => RANKS[rankIndex(points) + 1] ?? null;

// ---- ステージの成績 ----

export interface StageSummary {
  cleared: boolean;
  stars: number;
  atBats: number;
  /** 打者をアウトにした打席 */
  batterOuts: number;
  outRate: number;
  kinds: ShiftKind[];
  balks: number;
  runs: number;
  pitches: number;
  bestCombo: number;
}

/** 打席ごとに球を分ける */
export function splitAtBats(records: PitchRecord[]): PitchRecord[][] {
  const out: PitchRecord[][] = [];
  let cur: PitchRecord[] = [];
  for (const r of records) {
    cur.push(r);
    if (r.atBatEnd) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

/** 星2に必要な打ち取り率 */
export const STAR_OUT_RATE = 0.6;
/** 星3に必要なずらしの種類 */
export const STAR_KINDS = 3;

export function summarize(records: PitchRecord[], cleared: boolean): StageSummary {
  const atBats = splitAtBats(records).filter((a) => a[a.length - 1].atBatEnd);
  const batterOuts = atBats.filter((a) => isBatterOut(a[a.length - 1])).length;
  const kinds = [...new Set(records.flatMap((r) => r.kinds))];
  const balks = records.filter((r) => r.result === 'balk').length;
  const runs = records.reduce((a, r) => a + r.runsScored, 0);
  const outRate = atBats.length ? batterOuts / atBats.length : 0;
  let combo = 0;
  let bestCombo = 0;
  for (const a of atBats) {
    combo = isBatterOut(a[a.length - 1]) ? combo + 1 : 0;
    bestCombo = Math.max(bestCombo, combo);
  }
  let stars = 0;
  if (cleared) {
    stars = 1;
    if (outRate >= STAR_OUT_RATE) stars++;
    if (kinds.length >= STAR_KINDS && balks === 0) stars++;
  }
  return { cleared, stars, atBats: atBats.length, batterOuts, outRate, kinds, balks, runs, pitches: records.length, bestCombo };
}

// ---- バッジ ----

export interface BadgeDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
}

export const BADGES: BadgeDef[] = [
  { id: 'tame', name: 'ためマスター', desc: '「ため」で{空振|からぶ}りを10{回|かい}', icon: '⏳' },
  { id: 'pickoff', name: 'けんせい{職人|しょくにん}', desc: 'けんせいでアウト3{回|かい}', icon: '👉' },
  { id: 'rainbow', name: '{七色|なないろ}のリズム', desc: '1{打席|だせき}で4{種類|しゅるい}{以上|いじょう}のずらしを{使|つか}って{打|う}ち{取|と}る', icon: '🌈' },
  { id: 'nobalk', name: 'ボークゼロ', desc: 'ランナーありのステージをボークなしでクリア', icon: '🧘' },
  { id: 'daily', name: '{毎日|まいにち}シャドー', desc: 'シャドー{練習|れんしゅう}を7{日|か}{連続|れんぞく}', icon: '📅' },
  { id: 'revenge', name: 'サヨナラを{止|と}めた{男|おとこ}', desc: 'リベンジをクリア', icon: '🏆' },
];

/** 今日まで何日つづけて練習したか。days は YYYY-MM-DD */
export function practiceStreak(days: string[], today: string): number {
  const set = new Set(days);
  let n = 0;
  const d = new Date(`${today}T00:00:00`);
  while (set.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** ステージの記録を統計に足す */
export function addGameStats(stats: Stats, records: PitchRecord[], summary: StageSummary): Stats {
  const kinds = { ...stats.kinds };
  for (const r of records) for (const k of r.kinds) kinds[k] = (kinds[k] ?? 0) + 1;
  return {
    ...stats,
    pitches: stats.pitches + records.length,
    atBats: stats.atBats + summary.atBats,
    outs: stats.outs + summary.batterOuts,
    kinds,
    s3HoldSwingMiss: stats.s3HoldSwingMiss + records.filter((r) => r.result === 'swingMiss' && r.kinds.includes('s3Hold')).length,
    pickoffOuts: stats.pickoffOuts + records.filter((r) => r.result === 'pickoffOut').length,
    bestCombo: Math.max(stats.bestCombo, summary.bestCombo),
  };
}

/** いま持っているはずのバッジ（すでに持っているものも含む） */
export function earnedBadges(p: Profile, lastStage?: { stageId: string; records: PitchRecord[]; summary: StageSummary }, today = dayKey(new Date())): string[] {
  const got = new Set(p.badges);
  if (p.stats.s3HoldSwingMiss >= 10) got.add('tame');
  if (p.stats.pickoffOuts >= 3) got.add('pickoff');
  if (practiceStreak(p.stats.practiceDays, today) >= 7) got.add('daily');
  if (lastStage) {
    const { stageId, records, summary } = lastStage;
    const stage = STAGES.find((s) => s.id === stageId);
    for (const a of splitAtBats(records)) {
      const last = a[a.length - 1];
      if (isBatterOut(last) && new Set(a.flatMap((r) => r.kinds)).size >= 4) got.add('rainbow');
    }
    const hadRunner = !!stage && (stage.stealing || stage.situation.bases.some(Boolean));
    if (summary.cleared && hadRunner && summary.balks === 0) got.add('nobalk');
    if (summary.cleared && stageId === 'revenge') got.add('revenge');
  }
  return BADGES.map((b) => b.id).filter((id) => got.has(id));
}
