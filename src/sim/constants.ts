// シミュレーションの数値パラメータはすべてここに集約する。
// 単位：時間はすべて秒（s）。確率・割合は 0〜1。
// 学童軟式（小6）を想定した目安値。仕様書に数値がなく、ここで決めたものには【追加】、
// 仕様書の値から変えたものには【調整】と書く（理由は README の表）。

import type { BatterType, Seconds, SegmentKey } from '../types';

// ---- 区間の目安（§2） ----

/** まだ「自分のふつう」を測っていないときに使う基準 */
export const DEFAULT_BASELINE: Record<SegmentKey, Seconds> = {
  /** とまる：セットで静止してから足を上げ始めるまで（目安 1.0〜1.5） */
  s1: 1.2,
  /** あしあげ：足を上げ始めてから最高点まで（目安 0.35〜0.50） */
  s2: 0.42,
  /** ため：最高点から前へ動き出すまで（目安 0.05〜0.20） */
  s3: 0.12,
  /** ふみだし：前へ動き出してからリリースまで（目安 0.40〜0.55） */
  s4: 0.48,
};

/** 実測した「ふつう」がおかしな値にならないようにする範囲 */
export const BASELINE_LIMITS: Record<SegmentKey, [Seconds, Seconds]> = {
  s1: [0.7, 3.0],
  s2: [0.2, 0.9],
  s3: [0.0, 0.3],
  s4: [0.25, 0.9],
};

// ---- ルール（§2） ----
export const RULES = {
  /** ランナーがいるとき、S1 がこれ未満ならボーク */
  MIN_SET_STOP: 0.5,
  /** S3 がこれを超えたら「ルール注意」（二段モーション・途中で止める動き） */
  MAX_TOP_HOLD: 0.3,
  /** S1 がこれを超えたら「遅延」（審判に注意される） */
  MAX_SET_STOP: 4.0,
  /** 連続で牽制できる回数。これを超えると「遅延」の注意 */
  MAX_PICKOFFS_IN_ROW: 3,
};

// ---- カード（§4.2 A）。「ふつう」からの差で表す ----
export type CardLevel = -1 | 0 | 1;

/** 各カードで「ふつう」に足す秒数。[短い・速い, ふつう, 長い・遅い] */
export const CARD_DELTA: Record<'s1' | 's2' | 's3', Record<CardLevel, Seconds>> = {
  /** とまる：みじかく(0.6) / ふつう(1.2) / ながく(2.5) */
  s1: { [-1]: -0.6, 0: 0, 1: 1.3 },
  /** あしあげ：クイック(0.2) / ふつう(0.42) / ゆっくり(0.7) */
  s2: { [-1]: -0.22, 0: 0, 1: 0.28 },
  /** ため：すぐ(0.0) / ふつう(0.12) / ためる(0.30)。
   * 【調整】仕様の例は「ためる 0.4秒」だが、MAX_TOP_HOLD(0.3) を超えて毎回ルール注意が出てしまうので 0.30 にした */
  s3: { [-1]: -0.12, 0: 0, 1: 0.18 },
};

/** カードで作る値の下限・上限（「ふつう」が人によって違っても反則にならないように） */
export const CARD_LIMITS: Record<'s1' | 's2' | 's3', [Seconds, Seconds]> = {
  s1: [0.6, 3.5],
  s2: [0.18, 1.0],
  s3: [0, 0.3],
};

/** 2つの区間が「同じ」とみなす差。これ以内なら変えたことにならない */
export const SAME_TOLERANCE: Record<SegmentKey, Seconds> = {
  s1: 0.25,
  s2: 0.08,
  s3: 0.08,
  s4: 0.08,
};

/** 「ふつう」からこれ以上はなれていたら、その区間をずらしたと数える */
export const SHIFT_THRESHOLD: Record<'s1' | 's2' | 's3', Seconds> = {
  s1: 0.4,
  s2: 0.1,
  s3: 0.08,
};

// ---- 打者モデル（§4.3） ----

export interface BatterParams {
  /** 学習の速さ（指数移動平均の係数）。大きいほど直前の球にすぐ合わせる */
  alpha: number;
  /** パワー。ジャストのときの長打の出やすさ */
  power: number;
  /** スイングのタイミングのばらつき（標準偏差・秒） */
  sigma: Seconds;
  /** 【追加】見てから合わせられる幅（秒）。予想とのずれがこの幅におさまれば、動きを見て合わせてしまう。
   * 強い打者ほど広い。この幅を超えたぶんだけがタイミングのずれになる */
  adjust: Seconds;
  /** 【追加】予想より遅い球（ため・ゆっくり）に対するずれの倍率。1より大きいと「泳ぎやすい」 */
  earlyGain: number;
  /** 【追加】予想より速い球（クイック）に対するずれの倍率。1より大きいと「差し込まれやすい」 */
  lateGain: number;
  /** 長いセットで力むか */
  tenseOnLongSet: boolean;
  /** ストライクを振る確率に足す値（せっかちは＋、じっくり型は−） */
  eagerness: number;
}

export const BATTERS: Record<BatterType, BatterParams> = {
  /** まっすぐ待ち：初心者向け。ずれに弱い */
  straight: { alpha: 0.15, power: 0.45, sigma: 0.05, adjust: 0.03, earlyGain: 1, lateGain: 1, tenseOnLongSet: true, eagerness: 0 },
  /** せっかち：早く振りがち。「ため」に特に弱い */
  hasty: { alpha: 0.35, power: 0.25, sigma: 0.045, adjust: 0.06, earlyGain: 1.7, lateGain: 0.7, tenseOnLongSet: true, eagerness: 0.12 },
  /** じっくり型：長いセットでは力まない。クイックに弱い */
  patient: { alpha: 0.35, power: 0.5, sigma: 0.04, adjust: 0.06, earlyGain: 0.7, lateGain: 1.7, tenseOnLongSet: false, eagerness: -0.12 },
  /** 強打者：すぐ合わせてくる。1区間だけのずらしは見て合わせるので、2つ以上まぜる必要がある */
  slugger: { alpha: 0.6, power: 0.8, sigma: 0.035, adjust: 0.1, earlyGain: 1, lateGain: 1, tenseOnLongSet: true, eagerness: 0 },
  /** ボス「あの日の強打者」：直前の球にぴったり合わせる。長いセットでも動じない。直前から大きく（0.35秒より多く）変えないと崩れない */
  boss: { alpha: 1.0, power: 1.0, sigma: 0.022, adjust: 0.35, earlyGain: 1, lateGain: 1, tenseOnLongSet: false, eagerness: 0.05 },
};

export const BATTER_MODEL = {
  /** S1 が予想よりこれ以上長いと打者が力む */
  S1_LONG_MARGIN: 1.0,
  /** 力んだときのばらつきの倍率 */
  S1_LONG_SIGMA_FACTOR: 1.8,
  /** S1 が予想よりこれ以上短いと打者の準備が遅れる */
  S1_SHORT_MARGIN: 0.5,
  /** 準備が遅れたときに差し込まれる量 */
  S1_SHORT_LATE_SHIFT: 0.09,
  /** 同じパターンがこの球数続いたら読まれる */
  SAME_STREAK_FOR_BONUS: 3,
  /** 読まれたときに α に足す値 */
  SAME_STREAK_ALPHA_BONUS: 0.3,
  /** 【追加】読まれたときのばらつきの倍率（ぴったり合いやすくなる） */
  SAME_STREAK_SIGMA_FACTOR: 0.8,
};

/** |e| の境界（秒）。これ以下ならその判定 */
export const TIMING_BANDS = {
  /** 〜40ms：ジャスト */
  just: 0.04,
  /** 40〜100ms：少しずれ */
  slight: 0.1,
  /** 100〜180ms：ずれ。これを超えると「完全に崩した」 */
  off: 0.18,
};

// ---- 投球（コントロールは主題ではないので乱数で処理する） ----
export const PITCH = {
  /** ストライクが入る割合（設定で変更可） */
  STRIKE_RATE: 0.7,
  /** S2 がこれ未満（クイックすぎ）だとコントロールが乱れる */
  QUICK_S2: 0.25,
  QUICK_S2_PENALTY: 0.12,
  /** S1 がこれ未満（急ぎすぎ）だとコントロールが乱れる */
  RUSHED_S1: 0.7,
  RUSHED_S1_PENALTY: 0.1,
  /** S3 がここから長くなるほど球の勢いが落ち始める */
  HOLD_LOSS_START: 0.25,
  /** S3 がここで勢いの落ち方が最大になる */
  HOLD_LOSS_FULL: 0.6,
  /** 勢いが最大まで落ちたとき、ジャストの長打確率に足す値 */
  HOLD_LOSS_LONG_HIT_BONUS: 0.3,
  /** リリースからホームベースまでの時間（アニメーション用。16m を 約85km/h） */
  BALL_FLIGHT: 0.62,
};

/** 振る確率。カウントで変わる */
export const SWING = {
  /** ストライクを振る確率 */
  strike: 0.72,
  /** 2ストライクでストライクを振る確率 */
  strikeTwoStrikes: 0.95,
  /** 3ボール0ストライクではあまり振らない */
  strikeThreeOh: 0.25,
  /** ボール球を振る確率 */
  ball: 0.2,
  ballTwoStrikes: 0.36,
  /** 【追加】大きくタイミングをずらされたとき（ずれ・完全に崩した）に、ボール球を追いかける確率に足す値 */
  ballChaseWhenFooled: 0.15,
};

/** スイングしたときの結果の割合。p はパワー(0〜1) */
export const CONTACT = {
  just: {
    /** 長打（二塁打以上）= longBase + longPerPower × p */
    longBase: 0.1,
    longPerPower: 0.38,
    /** 長打のうちホームランの割合 = hrBase + hrPerPower × p */
    hrBase: 0.1,
    hrPerPower: 0.45,
    single: 0.4,
    /** のこりは良い当たりの正面（アウト）。ゴロとフライの割合 */
    groundShare: 0.45,
  },
  slight: {
    foul: 0.4,
    /** ポテンヒット = hitBase + hitPerPower × p */
    hitBase: 0.08,
    hitPerPower: 0.2,
    /** のこりは詰まったゴロ・フライ */
    groundShare: 0.65,
  },
  off: {
    swingMiss: 0.55,
    foul: 0.05,
    hit: 0.02,
    /** のこりはボテボテのゴロ・ポップフライ */
    groundShare: 0.65,
  },
  /** ボール球を振ったときは、判定を1段階わるくする */
  chaseDowngrade: true,
};

// ---- 走者モデル（§4.5） ----
export const RUNNER = {
  /** 走者が S1 を覚える速さ */
  alpha: 0.5,
  /** 走者がスタートを切る確率（1球ごと） */
  stealTry: 0.4,
  /** 牽制されたあとの次の1球は走りにくい（確率の倍率） */
  stealTryAfterPickoff: 0.4,
  /** 走者のスタートのばらつき（秒） */
  jumpSigma: 0.08,
  /** 予想どおりのとき（好スタート）の盗塁成功率 */
  successGoodJump: 0.9,
  /** スタートが |ずれ| 1秒ごとに、成功率がこれだけ下がる */
  successDropPerSecond: 1.4,
  /** これ以内のずれは好スタート */
  goodJumpWindow: 0.12,
  /** 最低の成功率 */
  successMin: 0.08,
  /** 足上げ〜リリースが「ふつう」より1秒短いと、成功率がこれだけ下がる（クイックは盗塁対策になる） */
  successPerDeliverySecond: 0.6,
  /** 三盗は二盗よりむずかしい（成功率に掛ける） */
  stealThirdFactor: 0.85,
  /** 牽制：走者の予想した足上げ時刻とぴったりのときのアウト率 */
  pickoffMax: 0.22,
  /** 牽制：タイミングがこれだけずれるとアウト率が約 1/e に下がる */
  pickoffWindow: 0.3,
  /** 牽制：最低のアウト率 */
  pickoffMin: 0.02,
  /** プレートを外したとき、打者・走者の予想を「ふつう」へ戻す割合 */
  stepOffReset: 0.4,
  /** 牽制したとき、走者の予想を「ふつう」へ戻す割合（走者だけ） */
  pickoffReset: 0.2,
};
