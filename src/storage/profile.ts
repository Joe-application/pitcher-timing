// localStorage の読み書き（§8）。壊れていても、空でも、初期状態で動くようにする。
// 保存するのはニックネームと記録だけ。個人情報は扱わない。

import { RULES, PITCH } from '../sim/constants';
import type { Baseline, PracticeRecord, Profile, Settings, ShiftKind, Stats, TimingPattern } from '../types';

/** 保存形式のバージョン。形を変えたら上げて、loadProfile で読み替える */
/** 2 = 「あしあげ」の速さを固定し、「ため」を主なずらしにした版（2026-10-13）。ルール注意の長さの最初の値が 0.3 → 0.9 */
export const SCHEMA_VERSION = 2;
const PREFIX = 'pitcherTiming:v1';

export const KEYS = {
  profile: (nickname: string) => `${PREFIX}:${nickname}`,
  /** ニックネームの一覧 */
  list: `${PREFIX}::profiles`,
  current: `${PREFIX}::current`,
};

export const MAX_PROFILES = 10;
export const MAX_PATTERNS = 30;
export const MAX_PRACTICE = 300;

export const DEFAULT_SETTINGS: Settings = {
  balkCheck: true,
  minSetStop: RULES.MIN_SET_STOP,
  topHoldWarning: true,
  maxTopHold: RULES.MAX_TOP_HOLD,
  volume: 0.8,
  cueSound: 'beep',
  practiceLimit: 30,
  strikeRate: PITCH.STRIKE_RATE,
};

export const emptyStats = (): Stats => ({
  pitches: 0,
  atBats: 0,
  outs: 0,
  kinds: {},
  s3HoldSwingMiss: 0,
  pickoffOuts: 0,
  bestCombo: 0,
  practiceDays: [],
  practiceReps: 0,
  tutorialDone: false,
});

export const newProfile = (nickname: string): Profile => ({
  nickname,
  patterns: [],
  rank: 0,
  stars: {},
  badges: [],
  settings: { ...DEFAULT_SETTINGS },
  stats: emptyStats(),
  practice: [],
  version: SCHEMA_VERSION,
});

// ---- 低レベル ----

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 容量不足・プライベートモードなど：保存できなくても遊べるようにする
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // 何もしない
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const KINDS: string[] = ['s1Short', 's1Long', 's2Quick', 's2Slow', 's3Quick', 's3Hold', 's3Long', 'pickoff', 'stepOff'] satisfies ShiftKind[];
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

// ---- 読み込んだものを正しい形にそろえる ----

function normalizePattern(v: unknown): TimingPattern | null {
  if (!isObj(v) || typeof v.id !== 'string') return null;
  const seg = (x: unknown) => clamp(num(x, NaN), 0, 10);
  const p: TimingPattern = {
    id: v.id,
    name: typeof v.name === 'string' ? v.name.slice(0, 16) : '',
    s1: seg(v.s1),
    s2: seg(v.s2),
    s3: seg(v.s3),
    s4: seg(v.s4),
    event: v.event === 'pickoff' || v.event === 'stepOff' ? v.event : null,
    createdFrom: v.createdFrom === 'game' || v.createdFrom === 'preset' ? v.createdFrom : 'custom',
  };
  return [p.s1, p.s2, p.s3, p.s4].every(Number.isFinite) ? p : null;
}

function normalizeBaseline(v: unknown): Baseline | undefined {
  if (!isObj(v)) return undefined;
  const b: Baseline = {
    s1: num(v.s1, NaN),
    s2: num(v.s2, NaN),
    s3: num(v.s3, NaN),
    s4: num(v.s4, NaN),
    measuredAt: typeof v.measuredAt === 'string' ? v.measuredAt : '',
    samples: num(v.samples, 0),
  };
  return [b.s1, b.s2, b.s3, b.s4].every((x) => Number.isFinite(x) && x >= 0) ? b : undefined;
}

function normalizeSettings(v: unknown, version: number): Settings {
  const o = isObj(v) ? v : {};
  const d = DEFAULT_SETTINGS;
  // 古い版の最初の値（0.3）のままなら、新しい最初の値にする。0.3 のままだと「ためる」カードで毎回注意が出てしまう
  const oldHold = version < 2 && o.maxTopHold === 0.3;
  return {
    balkCheck: bool(o.balkCheck, d.balkCheck),
    minSetStop: clamp(num(o.minSetStop, d.minSetStop), 0.2, 2),
    topHoldWarning: bool(o.topHoldWarning, d.topHoldWarning),
    maxTopHold: oldHold ? d.maxTopHold : clamp(num(o.maxTopHold, d.maxTopHold), 0.1, 1.5),
    volume: clamp(num(o.volume, d.volume), 0, 1),
    cueSound: o.cueSound === 'wood' || o.cueSound === 'drum' ? o.cueSound : 'beep',
    practiceLimit: Math.round(clamp(num(o.practiceLimit, d.practiceLimit), 5, 100)),
    strikeRate: clamp(num(o.strikeRate, d.strikeRate), 0.3, 0.95),
  };
}

function normalizeStats(v: unknown): Stats {
  const o = isObj(v) ? v : {};
  const kinds: Stats['kinds'] = {};
  // 知らない名前のずらしは捨てる
  if (isObj(o.kinds)) for (const [k, x] of Object.entries(o.kinds)) if (KINDS.includes(k)) (kinds as Record<string, number>)[k] = num(x, 0);
  return {
    pitches: num(o.pitches, 0),
    atBats: num(o.atBats, 0),
    outs: num(o.outs, 0),
    kinds,
    s3HoldSwingMiss: num(o.s3HoldSwingMiss, 0),
    pickoffOuts: num(o.pickoffOuts, 0),
    bestCombo: num(o.bestCombo, 0),
    practiceDays: strings(o.practiceDays).slice(0, 60),
    practiceReps: num(o.practiceReps, 0),
    tutorialDone: bool(o.tutorialDone, false),
  };
}

function normalizePractice(v: unknown): PracticeRecord[] {
  if (!Array.isArray(v)) return [];
  const out: PracticeRecord[] = [];
  for (const r of v) {
    if (!isObj(r)) continue;
    const target = normalizePattern(r.target);
    if (!target || typeof r.at !== 'string') continue;
    const m = isObj(r.measured) ? r.measured : null;
    out.push({
      mode: r.mode === 'challenge' || r.mode === 'video' ? r.mode : 'guide',
      target,
      measured: m ? { s1: num(m.s1, 0), s2s3: num(m.s2s3, 0), s4: num(m.s4, 0) } : undefined,
      score: typeof r.score === 'number' ? r.score : undefined,
      at: r.at,
    });
  }
  return out.slice(-MAX_PRACTICE);
}

/** どんな値が来ても Profile の形にして返す（JSON の読み込みにも使う） */
export function normalizeProfile(v: unknown, nickname: string): Profile {
  const o = isObj(v) ? v : {};
  const stars: Record<string, number> = {};
  if (isObj(o.stars)) for (const [k, x] of Object.entries(o.stars)) stars[k] = clamp(Math.round(num(x, 0)), 0, 3);
  return {
    nickname,
    baseline: normalizeBaseline(o.baseline),
    patterns: (Array.isArray(o.patterns) ? o.patterns : [])
      .map(normalizePattern)
      .filter((p): p is TimingPattern => p !== null)
      .slice(0, MAX_PATTERNS),
    rank: num(o.rank, 0),
    stars,
    badges: strings(o.badges),
    settings: normalizeSettings(o.settings, num(o.version, 1)),
    stats: normalizeStats(o.stats),
    practice: normalizePractice(o.practice),
    version: SCHEMA_VERSION,
  };
}

// ---- プロフィール ----

export const cleanNickname = (s: string) => s.trim().replace(/[:\s]+/g, ' ').slice(0, 12);

export function loadNicknames(): string[] {
  return strings(read(KEYS.list)).slice(0, MAX_PROFILES);
}

export function loadProfile(nickname: string): Profile {
  return normalizeProfile(read(KEYS.profile(nickname)), nickname);
}

export function saveProfile(p: Profile): void {
  write(KEYS.profile(p.nickname), p);
  const list = loadNicknames();
  if (!list.includes(p.nickname)) write(KEYS.list, [...list, p.nickname].slice(0, MAX_PROFILES));
}

/** 同じ名前がある・人数がいっぱいのときは null */
export function createProfile(name: string): Profile | null {
  const nickname = cleanNickname(name);
  const list = loadNicknames();
  if (!nickname || list.includes(nickname) || list.length >= MAX_PROFILES) return null;
  const p = newProfile(nickname);
  saveProfile(p);
  return p;
}

export function deleteProfile(nickname: string): void {
  write(
    KEYS.list,
    loadNicknames().filter((n) => n !== nickname),
  );
  remove(KEYS.profile(nickname));
  if (loadCurrent() === nickname) remove(KEYS.current);
}

export function loadCurrent(): string | null {
  const v = read(KEYS.current);
  return typeof v === 'string' ? v : null;
}

export function saveCurrent(nickname: string): void {
  write(KEYS.current, nickname);
}

// ---- JSON の書き出し／読み込み（端末を変えるとき用） ----

export function exportProfile(p: Profile): string {
  return JSON.stringify({ app: 'pitcherTiming', version: SCHEMA_VERSION, profile: p }, null, 2);
}

/** 読めなかったら null */
export function importProfile(json: string): Profile | null {
  try {
    const v: unknown = JSON.parse(json);
    if (!isObj(v) || v.app !== 'pitcherTiming' || !isObj(v.profile)) return null;
    const nickname = cleanNickname(typeof v.profile.nickname === 'string' ? v.profile.nickname : '');
    if (!nickname) return null;
    return normalizeProfile(v.profile, nickname);
  } catch {
    return null;
  }
}
