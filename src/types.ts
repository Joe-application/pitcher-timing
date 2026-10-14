// アプリ全体で使うデータの形（仕様書 §8）。ここには型だけを書く。

export type Seconds = number;

/** 区間の名前。S1=とまる、S2=あしあげ、S3=ため、S4=ふみだし */
export type SegmentKey = 's1' | 's2' | 's3' | 's4';

export type PitchEvent = 'pickoff' | 'stepOff';

export interface TimingPattern {
  id: string;
  /** 子どもがつけた名前 */
  name: string;
  /** とまる */
  s1: Seconds;
  /** あしあげ */
  s2: Seconds;
  /** ため */
  s3: Seconds;
  /** ふみだし */
  s4: Seconds;
  /** 牽制・プレートを外す（S1 の長さ＝その動きを始めるタイミング） */
  event?: PitchEvent | null;
  createdFrom: 'preset' | 'game' | 'custom';
}

/** 「自分のふつう」 */
export interface Baseline {
  s1: Seconds;
  s2: Seconds;
  s3: Seconds;
  s4: Seconds;
  measuredAt: string;
  samples: number;
}

export type BatterType = 'straight' | 'hasty' | 'patient' | 'slugger' | 'boss';

/** 右打ち・左打ち */
export type Hand = 'R' | 'L';

/** 投げるコースと高さのマス（7×7）。投手から見て x = 0 が左（一塁側）〜 6 が右（三塁側）、y = 0 が高め 〜 6 が低め。
 * まん中の 3×3（2〜4）がストライクゾーン、まわりの2周がボールゾーン */
export interface Cell {
  x: number;
  y: number;
}

/** 打者から見たコース（内角・真ん中・外角）と高さ */
export type ZoneCol = 'in' | 'mid' | 'out';
export type ZoneRow = 'high' | 'mid' | 'low';
export type ZoneSpot = `${ZoneCol}-${ZoneRow}`;
/** その打者にとって、得意・苦手・ふつうのコースか。ball = ボールゾーン */
export type ZoneKind = 'hot' | 'cold' | 'normal' | 'ball';

/** 打順の1人 */
export interface BatterSpot {
  type: BatterType;
  hand: Hand;
  /** 何番バッターか */
  order: number;
  /** 得意・苦手コース（打者から見た向き）。書かなければタイプごとの決まりを使う */
  hot?: ZoneSpot[];
  cold?: ZoneSpot[];
  /** 身長（cm）。打者カードに出す */
  height?: number;
}

/** スイングのタイミングのずれ方 */
export type TimingGrade = 'just' | 'slight' | 'off' | 'broken';

export type PitchResult =
  | 'swingMiss'
  | 'foul'
  /** 見逃しストライク */
  | 'take'
  | 'ball'
  | 'groundOut'
  | 'flyOut'
  | 'hit'
  | 'extraBase'
  | 'homeRun'
  | 'balk'
  | 'pickoffOut'
  /** 牽制したがセーフ */
  | 'pickoffSafe'
  /** プレートを外した */
  | 'stepOff';

/** 投球の間に走者がしたこと（仕様書では result の 'steal' だったが、投球の結果と同時に起きるので分けた） */
export type RunnerEvent = 'steal' | 'caughtStealing';

/** ずらしの種類（振り返り・バッジ・星の判定に使う） */
export type ShiftKind = 's1Short' | 's1Long' | 's2Quick' | 's2Slow' | 's3Quick' | 's3Hold' | 's3Long' | 'pickoff' | 'stepOff';

export interface PitchRecord {
  stageId: string;
  batterType: BatterType;
  /** 右打ち・左打ちと打順 */
  batterHand: Hand;
  batterOrder: number;
  pattern: TimingPattern;
  /** ねらったマスと、実際に行ったマス（牽制などは無し） */
  aim?: Cell;
  location?: Cell;
  /** 実際に行ったマスが、打者の得意・苦手のどれだったか */
  zone?: ZoneKind;
  /** 前の球と同じマスだった */
  sameSpot?: boolean;
  /** 投げる前に打者が予想していた間 */
  batterExpectation: { s1: Seconds; liftToRelease: Seconds };
  /** 正なら打者が早すぎ（泳ぐ）、負なら差し込まれる。牽制などスイングがない球は 0 */
  timingErrorMs: number;
  result: PitchResult;
  seed: number;
  // ---- ここから下は仕様書 §8 に足した項目（振り返り画面用） ----
  timing?: TimingGrade;
  swung?: boolean;
  runnerEvent?: RunnerEvent;
  /** 走者が予想していた S1 */
  runnerExpectationS1?: Seconds;
  kinds: ShiftKind[];
  /** ルール上の注意 */
  warnings: RuleWarning[];
  /** この球のあとのカウント・アウト・得点 */
  after: { balls: number; strikes: number; outs: number; runs: number; bases: Bases };
  /** この球で打席が終わったか */
  atBatEnd: boolean;
  /** この球で増えたアウト */
  outsMade: number;
  /** この球で入った点 */
  runsScored: number;
  /** 同じリズムが何球続いているか（この球を含む） */
  sameStreak: number;
}

export type RuleWarning = 'balk' | 'topHold' | 'delay' | 'tooManyPickoffs';

/** 一塁・二塁・三塁に走者がいるか */
export type Bases = [boolean, boolean, boolean];

export interface PracticeRecord {
  mode: 'guide' | 'challenge' | 'video';
  target: TimingPattern;
  measured?: { s1: Seconds; s2s3: Seconds; s4: Seconds };
  score?: number;
  at: string;
}

export interface Settings {
  /** ランナーがいるときのボーク判定 */
  balkCheck: boolean;
  /** セットで止まる最短の時間 */
  minSetStop: Seconds;
  /** 足を上げて止める動きへの「ルール注意」 */
  topHoldWarning: boolean;
  /** これより長く止めたら注意 */
  maxTopHold: Seconds;
  /** 0〜1 */
  volume: number;
  cueSound: 'beep' | 'wood' | 'drum';
  /** モード2の1回の練習の上限 */
  practiceLimit: number;
  /** ねらったところに投げられる割合（コーチ向け）。名前は古い版のまま */
  strikeRate: number;
}

export interface Stats {
  pitches: number;
  atBats: number;
  outs: number;
  /** ずらしの種類ごとの回数 */
  kinds: Partial<Record<ShiftKind, number>>;
  s3HoldSwingMiss: number;
  pickoffOuts: number;
  bestCombo: number;
  /** 練習した日（YYYY-MM-DD）。新しい順に最大60日 */
  practiceDays: string[];
  practiceReps: number;
  tutorialDone: boolean;
}

export interface Profile {
  nickname: string;
  baseline?: Baseline;
  patterns: TimingPattern[];
  rank: number;
  /** ステージID → 星の数 */
  stars: Record<string, number>;
  badges: string[];
  settings: Settings;
  // ---- 仕様書 §8 に足した項目 ----
  stats: Stats;
  practice: PracticeRecord[];
  /** 保存形式のバージョン */
  version: number;
}
