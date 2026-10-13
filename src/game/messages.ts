// 子ども向けの文言はすべてここに集める。保護者・コーチが直しやすいように。
// ふりがなは {漢字|よみ} と書くと <ruby> で表示される。

import { isBatterOut } from '../sim/atBat';
import { PITCH, RULES } from '../sim/constants';
import type { CardLevel } from '../sim/constants';
import type { Segments } from '../sim/timing';
import type { BatterType, PitchRecord, PitchResult, RuleWarning, SegmentKey, ShiftKind, TimingGrade } from '../types';

export const APP_TITLE = 'タイミング{外|はず}しピッチャー';
export const APP_TITLE_PLAIN = 'タイミング外しピッチャー';

// ---- 区間・カード ----

export const SEGMENT: Record<SegmentKey, { name: string; desc: string }> = {
  s1: { name: 'とまる', desc: 'セットでピタッと{止|と}まってから、{足|あし}を{上|あ}げはじめるまで' },
  s2: { name: 'あしあげ', desc: '{足|あし}を{上|あ}げはじめてから、いちばん{高|たか}いところまで' },
  s3: { name: 'ため', desc: 'いちばん{高|たか}いところから、{前|まえ}へ{動|うご}き{出|だ}すまで' },
  s4: { name: 'ふみだし', desc: '{前|まえ}へ{動|うご}き{出|だ}してから、ボールをはなすまで' },
};

export const CARD: Record<'s1' | 's2' | 's3', Record<CardLevel, string>> = {
  s1: { [-1]: 'みじかく', 0: 'ふつう', 1: 'ながく' },
  s2: { [-1]: 'クイック', 0: 'ふつう', 1: 'ゆっくり' },
  s3: { [-1]: 'すぐ', 0: 'ふつう', 1: 'ためる' },
};

export const KIND: Record<ShiftKind, string> = {
  s1Short: 'みじかく{止|と}まる',
  s1Long: '{長|なが}く{止|と}まる',
  s2Quick: 'クイック',
  s2Slow: 'ゆっくり{足|あし}あげ',
  s3Quick: 'すぐ{前|まえ}へ',
  s3Hold: 'ため',
  pickoff: 'けんせい',
  stepOff: 'プレートを{外|はず}す',
};

export const BUTTONS = {
  pitch: '⚾ {投|な}げる！',
  pickoff: '👉 けんせい',
  stepOff: '🦶 {外|はず}す',
  set: 'セット！',
  hold: '{指|ゆび}を{置|お}く ＝ {足|あし}を{上|あ}げる',
  release: '{指|ゆび}をはなす ＝ {投|な}げる',
  next: '{次|つぎ}へ',
  nextBatter: '{次|つぎ}の{打者|だしゃ}へ',
  seeResult: '{結果|けっか}を{見|み}る',
  retry: 'もう1{回|かい}',
  home: 'ホームへ',
  back: '← もどる',
};

/** 秒を「1.2秒」の形に */
export const sec = (v: number, digits = 1) => `${v.toFixed(digits)}{秒|びょう}`;
/** 差を「+1.0秒」の形に */
export const diffSec = (v: number, digits = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}{秒|びょう}`;

/** 「ふつう」とのちがいを言葉にする（例：「とまる +1.3秒・あしあげ −0.2秒」） */
export function describeDiff(p: Segments, base: Segments): string {
  const parts: string[] = [];
  if (Math.abs(p.s1 - base.s1) >= 0.15) parts.push(`${SEGMENT.s1.name} ${diffSec(p.s1 - base.s1)}`);
  if (Math.abs(p.s2 - base.s2) >= 0.05) parts.push(`${SEGMENT.s2.name} ${diffSec(p.s2 - base.s2, 2)}`);
  if (Math.abs(p.s3 - base.s3) >= 0.05) parts.push(`${SEGMENT.s3.name} ${diffSec(p.s3 - base.s3, 2)}`);
  return parts.length ? parts.join('・') : 'ふつうと{同|おな}じ';
}

// ---- 打者 ----

export const BATTER: Record<BatterType, { name: string; icon: string; desc: string; tip: string }> = {
  straight: {
    name: 'まっすぐ{待|ま}ち',
    icon: '🙂',
    desc: 'いつものリズムを{待|ま}っている。ずらされるのに{弱|よわ}い。',
    tip: 'どこか1つ{変|か}えるだけでくずれる',
  },
  hasty: {
    name: 'せっかち',
    icon: '😤',
    desc: '{早|はや}く{振|ふ}りたがる。「ため」や「ゆっくり」に{特|とく}に{弱|よわ}い。',
    tip: '「ため」「ゆっくり」で{泳|およ}がせよう',
  },
  patient: {
    name: 'じっくり{型|がた}',
    icon: '🧐',
    desc: '{長|なが}く{止|と}まっても{力|りき}まない。クイックに{弱|よわ}い。',
    tip: '「クイック」「すぐ」で{差|さ}しこもう',
  },
  slugger: {
    name: '{強打者|きょうだしゃ}',
    icon: '😎',
    desc: 'すぐ{合|あ}わせてくる。1つ{変|か}えただけでは{見|み}て{合|あ}わせられる。',
    tip: '2つ{以上|いじょう}まぜて、{毎球|まいきゅう}{変|か}えよう',
  },
  boss: {
    name: 'あの{日|ひ}の{強打者|きょうだしゃ}',
    icon: '🔥',
    desc: '{前|まえ}の{球|たま}と{同|おな}じ{間|ま}なら{必|かなら}ず{打|う}つ。{少|すこ}しの{変化|へんか}も{合|あ}わせてくる。',
    tip: '{前|まえ}の{球|たま}と{大|おお}きく{変|か}えろ（クイック⇔ゆっくり＋ため）',
  },
};

// ---- 結果 ----

export const RESULT: Record<PitchResult, { text: string; tone: 'good' | 'bad' | 'even' }> = {
  swingMiss: { text: '{空振|からぶ}り！', tone: 'good' },
  foul: { text: 'ファウル', tone: 'even' },
  take: { text: '{見逃|みのが}しストライク！', tone: 'good' },
  ball: { text: 'ボール', tone: 'even' },
  groundOut: { text: 'ゴロでアウト！', tone: 'good' },
  flyOut: { text: 'フライでアウト！', tone: 'good' },
  hit: { text: 'ヒット…', tone: 'bad' },
  extraBase: { text: '{長打|ちょうだ}を{打|う}たれた…', tone: 'bad' },
  homeRun: { text: 'ホームラン…', tone: 'bad' },
  balk: { text: 'ボーク！', tone: 'bad' },
  pickoffOut: { text: 'けんせいでアウト！', tone: 'good' },
  pickoffSafe: { text: 'けんせい…セーフ', tone: 'even' },
  stepOff: { text: 'プレートを{外|はず}した', tone: 'even' },
};

/** 短い結果名（タイムラインの行に出す） */
export const RESULT_SHORT: Record<PitchResult, string> = {
  swingMiss: '{空振|からぶ}り',
  foul: 'ファウル',
  take: '{見逃|みのが}し',
  ball: 'ボール',
  groundOut: 'ゴロ アウト',
  flyOut: 'フライ アウト',
  hit: 'ヒット',
  extraBase: '{長打|ちょうだ}',
  homeRun: 'ホームラン',
  balk: 'ボーク',
  pickoffOut: 'けんせい アウト',
  pickoffSafe: 'けんせい',
  stepOff: '{外|はず}す',
};

export const TIMING: Record<TimingGrade, string> = {
  just: 'ジャスト（{合|あ}わされた）',
  slight: '{少|すこ}しずれた',
  off: 'ずれた',
  broken: '{完全|かんぜん}にくずした',
};

/** 打者のタイミングを言葉にする */
export function timingText(r: PitchRecord): string {
  if (!r.timing) return '';
  if (r.timing === 'just') return `${TIMING.just}`;
  const dir = r.timingErrorMs > 0 ? '{泳|およ}がせた（{早|はや}く{振|ふ}りすぎ）' : '{差|さ}しこんだ（{振|ふ}りおくれ）';
  return `${TIMING[r.timing]}：${dir}`;
}

export const RUNNER_EVENT = {
  steal: '{盗塁|とうるい}された…',
  caughtStealing: '{盗塁|とうるい}をさした！アウト！',
};

export const WARNING: Record<RuleWarning, string> = {
  balk: 'セットで{止|と}まる{時間|じかん}が{足|た}りない。ランナーがいるときは、ピタッと{止|と}まってから{投|な}げよう。',
  topHold: '【ルール{注意|ちゅうい}】{足|あし}を{上|あ}げて{止|と}める{時間|じかん}が{長|なが}い。{大会|たいかい}や{審判|しんぱん}によっては{反則|はんそく}になることがある。',
  delay: '{長|なが}く{止|と}まりすぎ。{審判|しんぱん}に{注意|ちゅうい}されて、ボールが1つ{増|ふ}えた。',
  tooManyPickoffs: `けんせい・{外|はず}すは{続|つづ}けて${RULES.MAX_PICKOFFS_IN_ROW}{回|かい}まで。やりすぎは{遅延|ちえん}で、ボールが1つ{増|ふ}える。`,
};

export const RULE_NOTE = '{所属|しょぞく}チーム・{連盟|れんめい}の{規則|きそく}を{監督|かんとく}・{審判|しんぱん}に{確認|かくにん}してから{試合|しあい}で{使|つか}おう。';

// ---- 監督のひとこと ----

/** 投げる前のひとこと（同じリズムが続いているときの注意など） */
export function preHint(streak: number, type: BatterType): string {
  if (streak >= 2) return `👀 {同|おな}じリズムが${streak}{球|きゅう}{続|つづ}いた。{読|よ}まれているぞ！`;
  return `💡 ${BATTER[type].tip}`;
}

/** 1打席が終わったあとの、監督のひとこと */
export function managerComment(atBat: PitchRecord[]): string {
  const last = atBat[atBat.length - 1];
  if (!last) return '';
  const pitches = atBat.filter((r) => !r.pattern.event && r.result !== 'balk');
  const prev = pitches.length >= 2 ? pitches[pitches.length - 2] : null;
  const out = isBatterOut(last);
  const hit = last.result === 'hit' || last.result === 'extraBase' || last.result === 'homeRun';
  const maxStreak = Math.max(0, ...pitches.map((r) => r.sameStreak));

  if (atBat.some((r) => r.result === 'balk')) return 'ボークはもったいない。ランナーがいるときは、まずピタッと{止|と}まること。それから{長|なが}さを{変|か}えよう。';

  if (hit) {
    if (last.sameStreak >= 3) return `{同|おな}じリズムが${last.sameStreak}{球|きゅう}{続|つづ}いたぞ。{強|つよ}いバッターはもう{合|あ}わせてる。`;
    if (last.sameStreak === 2) return '{前|まえ}の{球|たま}と{同|おな}じリズムだった。1{球|きゅう}{見|み}せたら、{次|つぎ}は{変|か}えよう。';
    if (last.pattern.s3 > PITCH.HOLD_LOSS_START + 0.05) return 'ためすぎると{球|たま}の{勢|いきお}いが{落|お}ちる。{合|あ}わされたときに{長打|ちょうだ}になるぞ。';
    if (last.batterType === 'boss' || last.batterType === 'slugger')
      return '{変|か}えたつもりでも、{差|さ}が{小|ちい}さいと{見|み}て{合|あ}わせられる。{強|つよ}いバッターには、もっと{大|おお}きく、2つ{以上|いじょう}{変|か}えよう。';
    return '{打者|だしゃ}の{予想|よそう}どおりのリズムだった。{下|した}の{図|ず}で、どの{球|たま}が{合|あ}わされたか{見|み}てみよう。';
  }

  if (last.result === 'ball' && last.atBatEnd) {
    if (pitches.some((r) => r.pattern.s2 < PITCH.QUICK_S2 || r.pattern.s1 < PITCH.RUSHED_S1))
      return '{急|いそ}ぎすぎるとコントロールが{乱|みだ}れる。クイックや{短|みじか}いセットは、ここぞの1{球|きゅう}に{使|つか}おう。';
    return 'フォアボールはもったいない。ずらしは{十分|じゅうぶん}だ、{落|お}ち{着|つ}いていこう。';
  }

  if (out) {
    if (prev && prev.kinds.includes('s1Long') && (last.kinds.includes('s2Quick') || last.kinds.includes('s3Quick')))
      return '{長|なが}く{止|と}まってからのクイック、いいずらし{方|かた}だ！';
    if (prev && (prev.kinds.includes('s2Quick') || prev.kinds.includes('s3Quick')) && (last.kinds.includes('s3Hold') || last.kinds.includes('s2Slow')))
      return '{速|はや}い{動|うご}きを{見|み}せてから、ゆっくり。{打者|だしゃ}は{待|ま}ちきれずに{泳|およ}いだぞ！';
    if (last.timing === 'broken') return '{完全|かんぜん}にタイミングをくずした！いまの{間|ま}の{変|か}え{方|かた}を{覚|おぼ}えておこう。';
    if (maxStreak <= 1 && pitches.length >= 3) return '{毎球|まいきゅう}リズムを{変|か}えられた。これなら{強|つよ}いバッターも{合|あ}わせられない！';
    if (last.timing === 'just') return 'タイミングは{合|あ}わされたが、{正面|しょうめん}をついて{助|たす}かった。{次|つぎ}はリズムを{変|か}えよう。';
    return 'ナイスピッチ！{前|まえ}の{球|たま}と{変|か}えたのがきいた。';
  }

  if (last.result === 'pickoffOut') return 'ナイスけんせい！ランナーが「そろそろ{投|な}げる」と{思|おも}ったところをさした。';
  if (last.runnerEvent === 'caughtStealing') return '「とまる」の{長|なが}さを{変|か}えたから、ランナーはいいスタートが{切|き}れなかった。';
  return 'いいぞ、その{調子|ちょうし}だ。';
}

/** 走られたときのひとこと */
export const STEAL_COMMENT = 'ランナーに「とまる」の{長|なが}さを{読|よ}まれた。{長|なが}さを{変|か}えるか、けんせいを{入|い}れよう。';

/** ステージの結果のひとこと */
export function stageComment(cleared: boolean, stars: number, kinds: number): string {
  if (!cleared) return '{点|てん}を{取|と}られてしまった。{振|ふ}り{返|かえ}りを{見|み}て、どの{球|たま}が{読|よ}まれたか{確|たし}かめよう。もう1{回|かい}だ！';
  if (stars >= 3) return '{文句|もんく}なし！いろいろなずらしを{使|つか}って、しっかり{打|う}ち{取|と}った。';
  if (kinds < 3) return 'クリア！{次|つぎ}は、もっといろいろなずらしを{使|つか}ってみよう（3{種類|しゅるい}{以上|いじょう}で★が{増|ふ}える）。';
  return 'クリア！{打|う}ち{取|と}る{数|かず}を{増|ふ}やせば、★がもっともらえるぞ。';
}

// ---- 入門（チュートリアル） ----

export interface TutorialPage {
  title: string;
  body: string[];
  /** 図の種類 */
  figure?: 'segments' | 'same' | 'mix' | 'cost' | 'rules' | 'safety';
}

export const TUTORIAL: TutorialPage[] = [
  {
    title: '{速|はや}い{球|たま}がなくても、{打|う}ち{取|と}れる',
    body: [
      'バッターは、ピッチャーの{動|うご}きを{見|み}て「いち、にの、さん」とタイミングを{合|あ}わせて{振|ふ}っている。',
      'だから、{投|な}げるまでの「{間|ま}」を{変|か}えると、バッターのタイミングがずれる。',
      '{球|たま}の{速|はや}さやコントロールはすぐには{伸|の}びないけれど、「{間|ま}」は{練習|れんしゅう}すればすぐ{試合|しあい}で{使|つか}える。',
    ],
  },
  {
    title: '{投|な}げる{動|うご}きは4つに{分|わ}けられる',
    body: [
      'セットで{止|と}まってからボールをはなすまでを、4つの{区間|くかん}に{分|わ}けて{考|かんが}えよう。',
      'このアプリでは、「とまる」「あしあげ」「ため」の{長|なが}さを{変|か}えて、バッターをずらす。',
    ],
    figure: 'segments',
  },
  {
    title: '{同|おな}じリズムは、すぐ{合|あ}わされる',
    body: [
      '{同|おな}じリズムで{投|な}げ{続|つづ}けると、{強|つよ}いバッターほどすぐに{合|あ}わせてくる。',
      '3{球|きゅう}{続|つづ}けて{同|おな}じリズムだと、もう{完全|かんぜん}に{読|よ}まれている。',
    ],
    figure: 'same',
  },
  {
    title: '{前|まえ}の{球|たま}と{変|か}える',
    body: [
      'ずらす{場所|ばしょ}は1つじゃない。{止|と}まる{長|なが}さ、{足|あし}を{上|あ}げる{速|はや}さ、ため、そして、けんせい。',
      '{大事|だいじ}なのは{組|く}み{合|あ}わせと{順番|じゅんばん}。「{長|なが}く{止|と}まる → クイック」のように、{前|まえ}の{球|たま}と{比|くら}べて{変|か}えよう。',
    ],
    figure: 'mix',
  },
  {
    title: 'ずらしすぎは{損|そん}もある',
    body: [
      'ためすぎると、{球|たま}の{勢|いきお}いが{落|お}ちて、{当|あ}たったときに{長打|ちょうだ}になりやすい。',
      '{急|いそ}ぎすぎると、コントロールが{乱|みだ}れてボールが{増|ふ}える。',
      'なんでも{変|か}えればいいわけじゃない。「ここぞ」で{使|つか}おう。',
    ],
    figure: 'cost',
  },
  {
    title: 'ルールに{気|き}をつけよう',
    body: [
      `ランナーがいるときは、セットで{完全|かんぜん}に{止|と}まらないとボークになる。`,
      '{足|あし}を{上|あ}げて{途中|とちゅう}で{止|と}める・2{段階|だんかい}で{上|あ}げる{動|うご}きは、{大会|たいかい}や{審判|しんぱん}によっては{反則|はんそく}になることがある。',
      RULE_NOTE,
    ],
    figure: 'rules',
  },
  {
    title: '{体|からだ}を{大切|たいせつ}に',
    body: [
      '{家|いえ}ではシャドーピッチング（タオルを{使|つか}ってもOK）で{練習|れんしゅう}しよう。',
      '{実際|じっさい}にボールを{投|な}げる{練習|れんしゅう}は、チームの{投球数|とうきゅうすう}ルールを{守|まも}って。',
      'ひじや{肩|かた}が{痛|いた}いときは、{練習|れんしゅう}しない。おうちの{人|ひと}やコーチに{伝|つた}えよう。',
    ],
    figure: 'safety',
  },
];

// ---- モード2 ----

export const PRACTICE = {
  painQuestion: 'ひじや{肩|かた}に、{痛|いた}いところはない？',
  painYes: '{痛|いた}いところがある',
  painNo: '{痛|いた}くない',
  painStop: '{今日|きょう}は{練習|れんしゅう}をお{休|やす}みしよう。{痛|いた}みがあることを、おうちの{人|ひと}やコーチに{伝|つた}えてね。',
  shadowNote: '{家|いえ}ではシャドーピッチングで。{実際|じっさい}にボールを{投|な}げる{練習|れんしゅう}は、チームの{投球数|とうきゅうすう}ルールを{守|まも}ってね。',
  rest: '{休|きゅう}けい。{水|みず}を{飲|の}んで、{肩|かた}を{回|まわ}そう。',
  limit: '{今日|きょう}の{練習|れんしゅう}はここまで！よくがんばった。',
  cueNames: { lift: 'ピッ ＝ {足|あし}を{上|あ}げる', forward: 'ポン ＝ {前|まえ}へ', release: 'パン ＝ リリース' },
  taps: ['① {足|あし}を{上|あ}げた', '② {前|まえ}へ{動|うご}いた', '③ はなした'],
  tapSet: 'セット（{止|と}まった）',
  mark: { great: '◎', ok: '○', miss: '△' },
  part: { s1: 'とまる', s2s3: 'あしあげ＋ため', s4: 'ふみだし' },
  notClear: '「ふつう」との{差|さ}がはっきり{出|で}ていない。{変|か}えたつもりで{変|か}わっていないのが、いちばんもったいない！もっと{大|おお}げさに。',
  clear: '「ふつう」との{差|さ}がはっきり{出|で}ている。{打者|だしゃ}にもちゃんと{伝|つた}わるぞ。',
};
