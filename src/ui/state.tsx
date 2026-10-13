// アプリ全体の状態（useReducer + Context）

import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react';
import { setVolume } from '../audio/cues';
import { rankIndex, rankPoints, type StageSummary } from '../game/progression';
import { loadCurrent, loadNicknames, loadProfile, saveCurrent, saveProfile } from '../storage/profile';
import type { PitchRecord, Profile, TimingPattern } from '../types';

export type Screen =
  | 'home'
  | 'tutorial'
  | 'stages'
  | 'battle'
  | 'stageResult'
  | 'practice'
  | 'measure'
  | 'guide'
  | 'challenge'
  | 'video'
  | 'patterns'
  | 'versus'
  | 'records'
  | 'settings';

export interface StageResult {
  stageId: string;
  records: PitchRecord[];
  summary: StageSummary;
  /** 今回ふえた★ */
  starsGained: number;
  newBadges: string[];
  rankUp: boolean;
}

/** ガイド練習のやり方 */
export type GuideKind = 'single' | 'random' | 'sequence';

export interface State {
  screen: Screen;
  profile: Profile | null;
  /** いま遊んでいるステージ。key を変えると最初からやり直しになる */
  battle: { stageId: string; key: number } | null;
  result: StageResult | null;
  /** モード2で練習するパターン（モード1の振り返りやパターン帳から渡す） */
  practiceTarget: TimingPattern | null;
  guide: { kind: GuideKind; sequence: number };
  /** モード2に入るときの「痛いところはない？」に答えたか（ホームに戻るとリセット） */
  painOk: boolean;
  /** 今回の練習でやった回数（ホームに戻るとリセット） */
  sessionReps: number;
}

export type Action =
  | { type: 'go'; screen: Screen }
  | { type: 'profile'; profile: Profile | null }
  | { type: 'startStage'; stageId: string }
  | { type: 'finishStage'; result: StageResult; profile: Profile }
  | { type: 'practiceTarget'; pattern: TimingPattern | null; screen?: Screen }
  | { type: 'guide'; kind: GuideKind; sequence?: number }
  | { type: 'painOk' }
  /** 練習を1回やった */
  | { type: 'rep'; profile: Profile };

/** ランクは星と練習回数から決まるので、プロフィールを変えるたびに計算しなおす */
export function withRank(p: Profile): Profile {
  const rank = rankIndex(rankPoints(p));
  return rank === p.rank ? p : { ...p, rank };
}

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'go':
      return a.screen === 'home' ? { ...state, screen: 'home', painOk: false, sessionReps: 0 } : { ...state, screen: a.screen };
    case 'painOk':
      return { ...state, painOk: true };
    case 'rep':
      return { ...state, profile: withRank(a.profile), sessionReps: state.sessionReps + 1 };
    case 'profile':
      return { ...state, profile: a.profile ? withRank(a.profile) : null };
    case 'startStage':
      return { ...state, battle: { stageId: a.stageId, key: (state.battle?.key ?? 0) + 1 }, result: null, screen: 'battle' };
    case 'finishStage':
      return { ...state, result: a.result, profile: withRank(a.profile), screen: 'stageResult' };
    case 'practiceTarget':
      return { ...state, practiceTarget: a.pattern, screen: a.screen ?? state.screen };
    case 'guide':
      return { ...state, guide: { kind: a.kind, sequence: a.sequence ?? 0 }, screen: 'guide' };
  }
}

function init(): State {
  const name = loadCurrent();
  const exists = name !== null && loadNicknames().includes(name);
  return {
    screen: 'home',
    profile: exists ? withRank(loadProfile(name)) : null,
    battle: null,
    result: null,
    practiceTarget: null,
    guide: { kind: 'single', sequence: 0 },
    painOk: false,
    sessionReps: 0,
  };
}

const Ctx = createContext<{ state: State; dispatch: Dispatch<Action> } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);

  // 保存は state の変化に合わせてまとめて行う
  useEffect(() => {
    if (!state.profile) return;
    saveProfile(state.profile);
    saveCurrent(state.profile.nickname);
    setVolume(state.profile.settings.volume);
  }, [state.profile]);

  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider がありません');
  return v;
}

/** プロフィールがある画面で使う（ない画面では呼ばない） */
export function useProfile(): [Profile, (p: Profile) => void] {
  const { state, dispatch } = useApp();
  if (!state.profile) throw new Error('プロフィールがありません');
  return [state.profile, (profile) => dispatch({ type: 'profile', profile })];
}
