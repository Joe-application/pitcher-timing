// モード2の記録をプロフィールに足す。純粋関数のみ。

import { dayKey, earnedBadges } from '../game/progression';
import { MAX_PRACTICE } from '../storage/profile';
import type { PracticeRecord, Profile } from '../types';

export function addPractice(p: Profile, rec: PracticeRecord): Profile {
  const day = dayKey(new Date(rec.at));
  const days = p.stats.practiceDays.includes(day) ? p.stats.practiceDays : [day, ...p.stats.practiceDays].slice(0, 60);
  const next: Profile = {
    ...p,
    practice: [...p.practice, rec].slice(-MAX_PRACTICE),
    stats: { ...p.stats, practiceDays: days, practiceReps: p.stats.practiceReps + 1 },
  };
  return { ...next, badges: earnedBadges(next, undefined, day) };
}

/** 休憩を入れる間隔（回） */
export const REST_EVERY = 10;
