// ステージと「リベンジ」場面の定義。保護者・コーチが直しやすいように、ここに集めてある。
// 数字を変えるだけで、相手・状況・クリア条件を変えられる。

import type { Bases, BatterSpot, BatterType, Hand } from '../types';

/** 打順の1人を書く。b(何番, タイプ, 右打ち 'R' か左打ち 'L') */
const b = (order: number, type: BatterType, hand: Hand = 'R'): BatterSpot => ({ order, type, hand });

export interface Situation {
  /** 画面に出す回（例：「最終回ウラ」） */
  inning: string;
  /** はじめのアウトカウント */
  outs: number;
  /** はじめのランナー [一塁, 二塁, 三塁] */
  bases: Bases;
  /** 点差（自分のチーム − 相手）。0 = 同点、1 = 1点リード */
  scoreDiff: number;
  /** 画面に出す点数 [自分のチーム, 相手]。書かなければ点差だけを出す。scoreDiff と合わせること */
  score?: [number, number];
  /** はじめのカウント */
  balls: number;
  strikes: number;
}

export interface StageDef {
  id: string;
  no: number;
  name: string;
  /** 相手の説明 */
  opponent: string;
  /** 打順。最後まで行ったら先頭に戻る。打者ごとに 得意・苦手コース（hot / cold）を書くこともできる */
  lineup: BatterSpot[];
  situation: Situation;
  /** アウトカウントがここまで行けばクリア */
  outsToClear: number;
  /** これを超えて点を取られたら失敗（0 = 1点も取られてはいけない） */
  maxRuns: number;
  /** ランナーが盗塁を狙うか */
  stealing: boolean;
  /** このステージから使えるもの */
  cards: { /** 「ながくためる」のカード */ s3Long: boolean; events: boolean; realtime: boolean };
  /** クリアしたらもらえる称号 */
  title?: string;
  /** はじめに出すひとこと */
  intro: string;
}

export const STAGES: StageDef[] = [
  {
    id: 'practice',
    no: 1,
    name: '{練習|れんしゅう}{試合|じあい}',
    opponent: 'まっすぐ{待|ま}ちの3{人|にん}',
    lineup: [b(7, 'straight', 'R'), b(8, 'straight', 'L'), b(9, 'straight', 'R')],
    situation: { inning: '1{回|かい}', outs: 0, bases: [false, false, false], scoreDiff: 0, balls: 0, strikes: 0 },
    outsToClear: 3,
    maxRuns: 1,
    stealing: false,
    cards: { s3Long: false, events: false, realtime: false },
    intro: 'まずは「とまる」「あしあげ」「ため」を{変|か}えてみよう。{同|おな}じリズムばかりだと{打|う}たれるぞ。',
  },
  {
    id: 'district',
    no: 2,
    name: '{地区|ちく}{大会|たいかい}',
    opponent: 'せっかち と じっくり{型|がた}',
    lineup: [b(1, 'hasty', 'L'), b(2, 'patient', 'R'), b(6, 'hasty', 'R'), b(7, 'patient', 'L')],
    situation: { inning: '3{回|かい}', outs: 0, bases: [false, false, false], scoreDiff: 0, balls: 0, strikes: 0 },
    outsToClear: 3,
    maxRuns: 1,
    stealing: false,
    cards: { s3Long: true, events: false, realtime: false },
    intro: '「ながくためる」のカードが{使|つか}えるようになった。せっかちには「ためる」「ゆっくり」、じっくり{型|がた}には「クイック」「すぐ」がきくぞ。',
  },
  {
    id: 'semifinal',
    no: 3,
    name: '{準決勝|じゅんけっしょう}',
    opponent: 'いろいろな{打者|だしゃ}＋{一塁|いちるい}ランナー',
    lineup: [b(1, 'hasty', 'L'), b(2, 'straight', 'R'), b(3, 'patient', 'R'), b(5, 'straight', 'L')],
    situation: { inning: '5{回|かい}', outs: 0, bases: [true, false, false], scoreDiff: 1, balls: 0, strikes: 0 },
    outsToClear: 3,
    maxRuns: 1,
    stealing: true,
    cards: { s3Long: true, events: true, realtime: false },
    intro: 'ランナーは「とまる」の{長|なが}さを{読|よ}んで{走|はし}ってくる。{長|なが}さを{変|か}えたり、けんせいを{入|い}れたりしよう。{止|と}まらずに{投|な}げるとボークだ。',
  },
  {
    id: 'final',
    no: 4,
    name: '{決勝|けっしょう}',
    opponent: '{強打者|きょうだしゃ}がいる{打線|だせん}',
    lineup: [b(2, 'patient', 'R'), b(3, 'slugger', 'L'), b(4, 'slugger', 'R'), b(5, 'hasty', 'R')],
    situation: { inning: '6{回|かい}ウラ', outs: 0, bases: [false, false, false], scoreDiff: 1, balls: 0, strikes: 0 },
    outsToClear: 3,
    maxRuns: 0,
    stealing: true,
    cards: { s3Long: true, events: true, realtime: true },
    intro: '1{点|てん}リードの{終盤|しゅうばん}。{強打者|きょうだしゃ}は{少|すこ}しの{変化|へんか}なら{合|あ}わせてくる。2つ{以上|いじょう}まぜよう。',
  },
  {
    // ---- リベンジ：あの日の場面 ----
    // アウト・ランナー・点数（4-4）・打者（3番・左打ち）は実際の場面どおり。カウントは仮置きなので、わかったら直す。
    id: 'revenge',
    no: 5,
    name: 'リベンジ',
    opponent: 'あの{日|ひ}の{強打者|きょうだしゃ} → {次|つぎ}の{打者|だしゃ}',
    // あの日の強打者：3番・左打ち・小6で身長165cmくらい。得意は外角高め・ど真ん中・真ん中低め、苦手は外角低め・内角高め（実際の場面どおり）。
    // 4番・5番のタイプと右左は仮置き
    lineup: [
      { ...b(3, 'boss', 'L'), height: 165, hot: ['out-high', 'mid-mid', 'mid-low'], cold: ['out-low', 'in-high'] },
      b(4, 'slugger', 'R'),
      b(5, 'patient', 'R'),
    ],
    situation: { inning: '{最終回|さいしゅうかい}ウラ', outs: 1, bases: [false, true, false], scoreDiff: 0, score: [4, 4], balls: 0, strikes: 0 },
    outsToClear: 3,
    maxRuns: 0,
    stealing: true,
    cards: { s3Long: true, events: true, realtime: true },
    title: 'サヨナラを{止|と}めた{男|おとこ}',
    intro: '4{対|たい}4の{同点|どうてん}、1アウト{二塁|にるい}。1{点|てん}でも{取|と}られたらサヨナラ{負|ま}けだ。あの{強打者|きょうだしゃ}は、{前|まえ}の{球|たま}と{同|おな}じ{間|ま}なら{必|かなら}ず{打|う}つ。{大|おお}きく{変|か}えろ。',
  },
];

export const stageById = (id: string) => STAGES.find((s) => s.id === id);

/** そのステージで遊べるか（1つ前をクリアしていれば遊べる） */
export function isStageOpen(stage: StageDef, stars: Record<string, number>): boolean {
  if (stage.no === 1) return true;
  const prev = STAGES.find((s) => s.no === stage.no - 1);
  return !!prev && (stars[prev.id] ?? 0) > 0;
}
