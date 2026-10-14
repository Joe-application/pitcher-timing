import { describe, expect, it } from 'vitest';
import { initGame, throwPitch } from '../../sim/atBat';
import { DEFAULT_BASELINE } from '../../sim/constants';
import { zoneKind } from '../../sim/location';
import { fromCards } from '../../sim/timing';
import { exportProfile, importProfile, newProfile, normalizeProfile } from '../../storage/profile';
import type { PitchRecord } from '../../types';
import { earnedBadges, practiceStreak, rankIndex, summarize } from '../progression';
import { isStageOpen, STAGES } from '../stages';

const BASE = { ...DEFAULT_BASELINE };

function playStage(stageId: string, seed: number): { records: PitchRecord[]; outs: number; runs: number } {
  const st = STAGES.find((s) => s.id === stageId)!;
  const cfg = { stageId, lineup: st.lineup, base: BASE, seed, stealing: st.stealing, outsToClear: st.outsToClear, maxRuns: st.maxRuns };
  let s = initGame(cfg, st.situation);
  const records: PitchRecord[] = [];
  const levels = [-1, 0, 1] as const;
  for (let i = 0; i < 60 && s.outs < st.outsToClear && s.runs <= st.maxRuns; i++) {
    const o = throwPitch(cfg, s, fromCards(BASE, { s1: levels[i % 3], s2: levels[(i * 2 + 1) % 3], s3: ([-1, 0, 1, 2] as const)[(i + 2) % 4] }));
    s = o.state;
    records.push(o.record);
  }
  return { records, outs: s.outs, runs: s.runs };
}

describe('ステージ', () => {
  it('どのステージも最後まで遊べる', () => {
    for (const st of STAGES) {
      for (let seed = 1; seed <= 30; seed++) {
        const r = playStage(st.id, seed);
        expect(r.outs >= st.outsToClear || r.runs > st.maxRuns).toBe(true);
      }
    }
  });

  it('リベンジは「最終回裏・1アウト・ランナー二塁・同点」から始まり、1点も取られてはいけない', () => {
    const st = STAGES.find((s) => s.id === 'revenge')!;
    expect(st.situation).toMatchObject({ outs: 1, bases: [false, true, false], scoreDiff: 0, score: [4, 4] });
    expect(st.lineup[0]).toMatchObject({ type: 'boss', order: 3, hand: 'L', height: 165, hot: ['out-high', 'mid-mid', 'mid-low'] });
    // 左打者の外角は、投手から見て右側。外角高めは得意、外角低めは苦手
    expect(zoneKind(st.lineup[0], { x: 4, y: 2 })).toBe('hot');
    expect(zoneKind(st.lineup[0], { x: 4, y: 4 })).toBe('cold');
    expect(zoneKind(st.lineup[0], { x: 2, y: 2 })).toBe('cold');
    expect(zoneKind(st.lineup[0], { x: 3, y: 4 })).toBe('hot');
    expect(st.maxRuns).toBe(0);
    expect(st.lineup.length).toBeGreaterThanOrEqual(2);
  });

  it('前のステージをクリアすると次が開く', () => {
    expect(isStageOpen(STAGES[0], {})).toBe(true);
    expect(isStageOpen(STAGES[1], {})).toBe(false);
    expect(isStageOpen(STAGES[1], { practice: 1 })).toBe(true);
  });
});

describe('星・ランク・バッジ', () => {
  it('クリアしていなければ星はなし、クリアで1つ以上', () => {
    const { records } = playStage('practice', 7);
    expect(summarize(records, false).stars).toBe(0);
    const s = summarize(records, true);
    expect(s.stars).toBeGreaterThanOrEqual(1);
    expect(s.stars).toBeLessThanOrEqual(3);
    expect(s.pitches).toBe(records.length);
  });

  it('ランクはポイントで上がる', () => {
    expect(rankIndex(0)).toBe(0);
    expect(rankIndex(6)).toBe(2);
    expect(rankIndex(99)).toBe(4);
  });

  it('連続練習日数と「毎日シャドー」', () => {
    const days = ['2026-10-13', '2026-10-12', '2026-10-11', '2026-10-09'];
    expect(practiceStreak(days, '2026-10-13')).toBe(3);
    expect(practiceStreak(days, '2026-10-14')).toBe(0);
    const p = newProfile('a');
    p.stats.practiceDays = ['2026-10-13', '2026-10-12', '2026-10-11', '2026-10-10', '2026-10-09', '2026-10-08', '2026-10-07'];
    expect(earnedBadges(p, undefined, '2026-10-13')).toContain('daily');
  });
});

describe('保存データ', () => {
  it('壊れたデータでも初期状態で動く', () => {
    const p = normalizeProfile({ stars: 'x', patterns: [{ id: 1 }, null], settings: { volume: 9 } }, 'a');
    expect(p.patterns).toEqual([]);
    expect(p.stars).toEqual({});
    expect(p.settings.volume).toBe(1);
    expect(p.settings.practiceLimit).toBe(30);
  });

  it('古い版のデータ：ルール注意の長さを新しい最初の値にし、知らない名前のずらしの記録は捨てる', () => {
    const p = normalizeProfile({ version: 1, settings: { maxTopHold: 0.3 }, stats: { kinds: { むかしのずらし: 4, s2Quick: 1, s3Hold: 2 } } }, 'a');
    expect(p.settings.maxTopHold).toBe(0.9);
    expect(p.stats.kinds).toEqual({ s2Quick: 1, s3Hold: 2 });
    // 自分で変えた値はそのまま
    expect(normalizeProfile({ version: 1, settings: { maxTopHold: 0.5 } }, 'a').settings.maxTopHold).toBe(0.5);
  });

  it('書き出して読み込むと元に戻る', () => {
    const p = newProfile('たろう');
    p.stars = { practice: 3 };
    p.patterns = [{ id: 'm1', name: 'ためため', s1: 1.2, s2: 0.42, s3: 0.3, s4: 0.48, event: null, createdFrom: 'custom' }];
    p.baseline = { s1: 1.1, s2: 0.4, s3: 0.1, s4: 0.5, measuredAt: '2026-10-13T00:00:00.000Z', samples: 5 };
    expect(importProfile(exportProfile(p))).toEqual(p);
    expect(importProfile('{"app":"other"}')).toBeNull();
    expect(importProfile('こわれたファイル')).toBeNull();
  });
});
