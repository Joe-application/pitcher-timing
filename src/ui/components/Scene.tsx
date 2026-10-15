// 投球の場面（横から見た図）。時刻（PitchClock）から、その瞬間の姿勢を計算して描く。
// カード方式でもリアルタイム方式でも同じ描き方を使う。

import { useEffect, useRef, useState } from 'react';
import { PITCH } from '../../sim/constants';
import type { PitchEvent, PitchRecord, Seconds } from '../../types';

/** 1球の時刻表。時刻は performance.now() のミリ秒。まだ決まっていないものは null */
export interface PitchClock {
  /** セット完了（静止） */
  setAt: number;
  /** 足上げ開始 */
  liftAt: number | null;
  /** 足上げの長さ */
  s2: Seconds;
  /** 前へ動き出す */
  forwardAt: number | null;
  /** ふみだしの長さ */
  s4: Seconds;
  /** 牽制・プレートを外す */
  event?: PitchEvent | null;
  eventAt?: number | null;
  /** 足を上げてからの牽制：足を上げる時間（秒）。この間は投球と同じ動きに見える */
  eventLift?: Seconds;
  /** シーンの上に出す文字（例：ファースト けんせい！） */
  eventLabel?: string;
  /** リリースからホームベースまでの時間（秒）。書かなければストレート */
  flight?: Seconds;
}

/** 画面を毎フレーム描きなおすための時計 */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const tick = (t: number) => {
      setNow(t);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active]);
  return now;
}

type P = { x: number; y: number };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const mix = (a: P, b: P, k: number): P => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (k: number) => k * k * (3 - 2 * k);

const GROUND = 172;
const RUBBER_X = 78;
const PLATE_X = 330;
/** スイングにかかる時間 */
const SWING_MS = 170;

/** 腕やひざの曲がった関節の位置。a→b の中間から、横に bend だけずらす */
function joint(a: P, b: P, bend: number): P {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: mx - (dy / len) * bend, y: my + (dx / len) * bend };
}

/** 区間ごとの点をなめらかにつなぐ。keys は [0〜1 の位置, 点] */
function path(keys: [number, P][], k: number): P {
  for (let i = 1; i < keys.length; i++) {
    const [k0, p0] = keys[i - 1];
    const [k1, p1] = keys[i];
    if (k <= k1) return mix(p0, p1, ease(clamp01((k - k0) / (k1 - k0))));
  }
  return keys[keys.length - 1][1];
}

/**
 * 投手（左投げ）の姿勢。lift = 足の上がり具合、stride = 前への動き（どちらも 0〜1）。
 * 打者の方（右）を向いて、セット → 足上げ → ため → 踏み出し → リリース。
 */
function pitcherPose(lift: number, stride: number) {
  const st = ease(stride);
  // 腰：足を上げると少し上がり、踏み出すと前へ低く
  const hip: P = { x: RUBBER_X + 2 + 30 * st, y: 121 - 3 * lift * (1 - stride) + 10 * st };
  // 上体：足を上げると少し後ろへ、踏み出すと前へ倒れる
  const shoulder: P = { x: hip.x + 2 - 3 * lift * (1 - stride) + 17 * st, y: hip.y - 34 + 5 * st };
  const head: P = { x: shoulder.x + 4 + 4 * st, y: shoulder.y - 13 + 2 * st };
  // 軸足（後ろ足）：プレートに残り、踏み出すと伸びてかかとが上がる
  const backFoot: P = { x: RUBBER_X - 2 + 12 * st, y: GROUND - 2 * st };
  const backKnee = joint(hip, backFoot, -3 - 6 * st);
  // 踏み出す足：立つ → ひざを腰の高さまで上げる → 前に大きく踏み出す
  const up = lift * (1 - stride);
  const frontFoot: P = stride > 0 ? path([[0, { x: hip.x + 9, y: hip.y + 20 }], [0.55, { x: RUBBER_X + 62, y: GROUND - 10 }], [1, { x: RUBBER_X + 76, y: GROUND }]], stride) : mix({ x: hip.x + 7, y: GROUND }, { x: hip.x + 9, y: hip.y + 20 }, up);
  const frontKnee: P = stride > 0 ? mix({ x: hip.x + 16, y: hip.y - 2 }, { x: frontFoot.x - 4, y: frontFoot.y - 24 }, st) : mix(joint(hip, { x: hip.x + 7, y: GROUND }, 3), { x: hip.x + 17, y: hip.y - 4 }, up);
  // 投げる腕（左）：胸の前 → 下から後ろへ → 後ろで高く → 前でリリース
  const chest: P = { x: shoulder.x + 9, y: shoulder.y + 16 };
  const hand = path(
    [
      [0, chest],
      [0.35, { x: shoulder.x - 20, y: shoulder.y + 16 }],
      [0.7, { x: shoulder.x - 14, y: shoulder.y - 22 }],
      [1, { x: shoulder.x + 22, y: shoulder.y - 12 }],
    ],
    stride,
  );
  const elbow = stride > 0.05 ? joint(shoulder, hand, stride < 0.7 ? 7 : -5) : { x: shoulder.x + 1, y: shoulder.y + 14 };
  // グラブの腕（右）：胸の前 → 打者の方へのばす → 胸に引きつける
  const glove = path(
    [
      [0, { x: chest.x + 1, y: chest.y - 1 }],
      [0.5, { x: shoulder.x + 24, y: shoulder.y + 2 }],
      [1, { x: shoulder.x + 8, y: shoulder.y + 14 }],
    ],
    stride,
  );
  const gloveElbow = joint(shoulder, glove, -6);
  return { hip, shoulder, head, backFoot, backKnee, frontKnee, frontFoot, hand, elbow, glove, gloveElbow };
}

/** ボールがバットに当たったあとの飛び方 */
function ballAfterContact(result: PitchRecord['result'], k: number): P {
  const from: P = { x: PLATE_X, y: 112 };
  switch (result) {
    case 'homeRun':
      return { x: lerp(from.x, -40, k), y: from.y - 190 * k + 40 * k * k };
    case 'extraBase':
      return { x: lerp(from.x, -30, k), y: from.y - 150 * k + 80 * k * k };
    case 'hit':
      return { x: lerp(from.x, -20, k), y: from.y - 90 * k + 110 * k * k };
    case 'flyOut':
      return { x: lerp(from.x, 200, k), y: from.y - 260 * k + 250 * k * k };
    case 'groundOut':
      return { x: lerp(from.x, 150, k), y: Math.min(GROUND - 4, from.y + 200 * k) - Math.abs(Math.sin(k * 9)) * 6 * (1 - k) };
    case 'foul':
      return { x: lerp(from.x, 410, k), y: from.y - 200 * k + 60 * k * k };
    default:
      return from;
  }
}

interface Props {
  clock: PitchClock | null;
  /** 結果（決まったら渡す）。null の間は投球の動きだけ描く */
  record: PitchRecord | null;
  /** アニメーションが終わったら呼ばれる */
  onDone?: () => void;
}

export function Scene({ clock, record, onDone }: Props) {
  const now = useNow(clock !== null);
  const doneRef = useRef<PitchClock | null>(null);

  // ---- 投手 ----
  let lift = 0;
  let stride = 0;
  let turned = false;
  let label = '';
  let releaseAt: number | null = null;
  if (clock) {
    const liftMs = (clock.eventLift ?? 0) * 1000;
    if (clock.event && clock.eventAt != null && now >= clock.eventAt && now < clock.eventAt + liftMs) {
      // 足を上げる牽制：途中までは投球と同じに見える
      lift = ease(clamp01((now - clock.eventAt) / liftMs));
      label = 'あしあげ';
    } else if (clock.event && clock.eventAt != null && now >= clock.eventAt) {
      turned = clock.event === 'pickoff';
      label = clock.event === 'pickoff' ? (clock.eventLabel ?? 'けんせい！') : 'はずす';
    } else if (now < clock.setAt) label = '';
    else if (clock.liftAt == null || now < clock.liftAt) label = 'とまる';
    else {
      lift = ease(clamp01((now - clock.liftAt) / (clock.s2 * 1000)));
      label = lift < 1 ? 'あしあげ' : 'ため';
      if (clock.forwardAt != null && now >= clock.forwardAt) {
        stride = clamp01((now - clock.forwardAt) / (clock.s4 * 1000));
        label = stride < 1 ? 'ふみだし' : '';
      }
    }
    if (clock.forwardAt != null) releaseAt = clock.forwardAt + clock.s4 * 1000;
  }
  // 投球が無効になる球（ボーク・遅延）は、足を上げたところで止める
  const voided = record !== null && !record.pattern.event && (record.result === 'balk' || record.warnings.includes('delay'));
  if (voided) {
    stride = 0;
    releaseAt = null;
  }
  const pose = pitcherPose(lift, stride);

  // ---- ボールと打者 ----
  const FLIGHT_MS = (clock?.flight ?? PITCH.BALL_FLIGHT) * 1000;
  // スローボールは山なりに見せる
  const arc = (clock?.flight ?? PITCH.BALL_FLIGHT) > PITCH.BALL_FLIGHT + 0.1 ? 34 : 6;
  const plateAt = releaseAt != null ? releaseAt + FLIGHT_MS : null;
  const swung = record?.swung === true;
  // 打者は予想した時刻に合わせて振る。誤差が正なら早すぎ、負なら振りおくれ
  const swingAt = plateAt != null && swung ? plateAt - (record?.timingErrorMs ?? 0) : null;
  const swingK = swingAt != null ? clamp01((now - (swingAt - SWING_MS * 0.6)) / SWING_MS) : 0;
  const contact = swung && record !== null && record.result !== 'swingMiss';

  let ball: P | null = null;
  const throwAt = clock?.eventAt != null ? clock.eventAt + (clock.eventLift ?? 0) * 1000 : null;
  if (clock?.event === 'pickoff' && throwAt != null && now >= throwAt + 150) {
    const k = clamp01((now - throwAt - 150) / 450);
    ball = { x: lerp(pose.shoulder.x - 20, -20, k), y: lerp(pose.shoulder.y, 70, k) };
  } else if (releaseAt != null && plateAt != null && now >= releaseAt) {
    const high = record?.result === 'ball' ? -18 : 0;
    if (now < plateAt || !record) {
      const k = clamp01((now - releaseAt) / FLIGHT_MS);
      ball = { x: lerp(pose.hand.x, PLATE_X, k), y: lerp(pose.hand.y, 112 + high, k) - arc * 4 * k * (1 - k) };
    } else if (contact) {
      ball = ballAfterContact(record.result, clamp01((now - plateAt) / 900));
    } else {
      const k = clamp01((now - plateAt) / 120);
      ball = { x: lerp(PLATE_X, 366, k), y: lerp(112 + high, 116 + high, k) };
    }
  } else if (!turned) {
    ball = pose.hand;
  }

  // ---- 終わりの合図 ----
  let endAt: number | null = null;
  if (clock) {
    if (clock.event && clock.eventAt != null) endAt = clock.eventAt + (clock.eventLift ?? 0) * 1000 + 900;
    else if (voided) endAt = (clock.liftAt ?? clock.setAt) + 500;
    else if (record && plateAt != null) endAt = plateAt + (contact ? 1000 : 600);
  }
  // 描画（requestAnimationFrame）は画面が裏にあると止まるので、終わりの合図はタイマーで出す
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    if (!clock || endAt == null || doneRef.current === clock) return;
    const id = window.setTimeout(() => {
      doneRef.current = clock;
      onDoneRef.current?.();
    }, Math.max(0, endAt - performance.now()));
    return () => window.clearTimeout(id);
  }, [clock, endAt]);

  // ---- 打者の姿勢（投手の方＝左を向いて構える） ----
  const broken = swung && record?.timing === 'broken' && swingK > 0.3;
  const batX = 346;
  const sk = ease(swingK);
  const bHip: P = { x: batX + 3 - 4 * sk, y: 124 };
  const bShoulder: P = { x: batX - 3 - 6 * sk, y: 91 + 2 * sk };
  const bHead: P = { x: bShoulder.x - 3, y: 77 + sk };
  const bFrontFoot: P = { x: batX - 15 - 4 * sk, y: GROUND };
  const bBackFoot: P = { x: batX + 13, y: GROUND };
  // グリップ：後ろの肩の上 → ミートポイント（体の前） → 振り切る
  const hands = path(
    [
      [0, { x: batX + 6, y: 84 }],
      [0.55, { x: batX - 14, y: 104 }],
      [1, { x: batX - 8, y: 80 }],
    ],
    swingK,
  );
  // バット：上・後ろに立てる → 投手の方へ水平 → 振り切って背中側へ
  const angle = lerp(-105, 330, sk) * (Math.PI / 180);
  const batEnd: P = { x: hands.x + Math.cos(angle) * 32, y: hands.y + Math.sin(angle) * 32 };
  const lean = broken ? (record!.timingErrorMs > 0 ? -14 : 8) : 0;

  const body = 'var(--fg)';
  const limb = (w: number) => ({ stroke: body, strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' });
  const poly = (...ps: P[]) => ps.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
  /** 奥側の手足は少しうすくして、立体に見せる */
  const far = 0.7;

  return (
    <svg className="scene" viewBox="0 0 400 200" role="img" aria-label="投球の場面">
      <rect x="0" y="0" width="400" height="200" fill="var(--sky)" />
      <rect x="0" y={GROUND} width="400" height={200 - GROUND} fill="var(--grass)" />
      {/* マウンドとホームベース */}
      <path d={`M20 ${GROUND} Q${RUBBER_X} ${GROUND - 12} 190 ${GROUND} Z`} fill="var(--dirt)" />
      <rect x={RUBBER_X - 8} y={GROUND - 5} width="16" height="3" fill="#fff" />
      <path d={`M${PLATE_X - 28} ${GROUND} h70 v6 h-70 Z`} fill="var(--dirt)" />
      <rect x={PLATE_X - 6} y={GROUND - 1} width="12" height="3" fill="#fff" />

      {/* 投手（左投げのシルエット） */}
      <g transform={turned ? `translate(${pose.hip.x * 2} 0) scale(-1 1)` : undefined}>
        {/* 奥：軸足とグラブの腕 */}
        <polyline points={poly(pose.hip, pose.backKnee, pose.backFoot)} {...limb(9)} opacity={far} />
        <line x1={pose.backFoot.x - 3} y1={pose.backFoot.y} x2={pose.backFoot.x + 6} y2={pose.backFoot.y} {...limb(5)} opacity={far} />
        <polyline points={poly(pose.shoulder, pose.gloveElbow, pose.glove)} {...limb(5.5)} opacity={far} />
        <ellipse cx={pose.glove.x} cy={pose.glove.y} rx="5" ry="4.2" fill="var(--dirt-dark)" />
        {/* 体 */}
        <polygon points={poly({ x: pose.hip.x - 7, y: pose.hip.y + 4 }, { x: pose.hip.x + 7, y: pose.hip.y + 3 }, { x: pose.shoulder.x + 8, y: pose.shoulder.y + 2 }, { x: pose.shoulder.x - 6, y: pose.shoulder.y - 2 })} fill={body} stroke={body} strokeWidth="4" strokeLinejoin="round" />
        <line x1={pose.shoulder.x} y1={pose.shoulder.y} x2={pose.head.x - 1} y2={pose.head.y + 4} {...limb(5)} />
        {/* 手前：踏み出す足と投げる腕 */}
        <polyline points={poly(pose.hip, pose.frontKnee, pose.frontFoot)} {...limb(9.5)} />
        <line x1={pose.frontFoot.x - 2} y1={pose.frontFoot.y} x2={pose.frontFoot.x + 8} y2={pose.frontFoot.y} {...limb(5.5)} />
        <polyline points={poly(pose.shoulder, pose.elbow, pose.hand)} {...limb(6)} />
        {/* 頭と帽子（つばは打者の方） */}
        <circle cx={pose.head.x} cy={pose.head.y} r="8.5" fill={body} />
        <path d={`M${pose.head.x - 8.5} ${pose.head.y - 1} a8.5 8.5 0 0 1 17 0 Z`} fill="var(--cap)" />
        <path d={`M${pose.head.x + 6} ${pose.head.y - 2} l8 1.5 l-8 1.5 Z`} fill="var(--cap)" />
      </g>
      {label && (
        <text x={pose.hip.x} y="34" textAnchor="middle" className="scene-label">
          {label}
        </text>
      )}

      {/* 打者（シルエット。投手の方を向いて構える） */}
      <g transform={`rotate(${lean} ${batX} ${GROUND})`}>
        {/* 奥の足と腕 */}
        <polyline points={poly(bHip, joint(bHip, bBackFoot, 5), bBackFoot)} {...limb(9.5)} opacity={far} />
        <polyline points={poly(bShoulder, joint(bShoulder, hands, 4), hands)} {...limb(5.5)} opacity={far} />
        {/* 体とおしり */}
        <ellipse cx={bHip.x + 4} cy={bHip.y + 1} rx="10" ry="8" fill={body} />
        <polygon points={poly({ x: bHip.x - 6, y: bHip.y + 2 }, { x: bHip.x + 8, y: bHip.y }, { x: bShoulder.x + 8, y: bShoulder.y }, { x: bShoulder.x - 6, y: bShoulder.y + 2 })} fill={body} stroke={body} strokeWidth="4" strokeLinejoin="round" />
        {/* 手前の足（ひざを曲げて踏み出す） */}
        <polyline points={poly(bHip, joint(bHip, bFrontFoot, -6), bFrontFoot)} {...limb(10)} />
        <line x1={bFrontFoot.x - 7} y1={GROUND} x2={bFrontFoot.x + 2} y2={GROUND} {...limb(5.5)} />
        <line x1={bBackFoot.x - 2} y1={GROUND} x2={bBackFoot.x + 7} y2={GROUND} {...limb(5.5)} opacity={far} />
        {/* バットと手前の腕 */}
        <line x1={hands.x} y1={hands.y} x2={batEnd.x} y2={batEnd.y} stroke="var(--dirt-dark)" strokeWidth="5" strokeLinecap="round" />
        <polyline points={poly(bShoulder, joint(bShoulder, hands, -5), hands)} {...limb(6)} />
        {/* 頭とヘルメット（つばは投手の方） */}
        <line x1={bShoulder.x} y1={bShoulder.y} x2={bHead.x} y2={bHead.y + 5} {...limb(5)} />
        <circle cx={bHead.x} cy={bHead.y} r="8.5" fill={body} />
        <path d={`M${bHead.x - 9} ${bHead.y} a9 9 0 0 1 18 0 Z`} fill="var(--offense)" />
        <path d={`M${bHead.x - 7} ${bHead.y - 1} l-8 1.5 l8 1.5 Z`} fill="var(--offense)" />
      </g>
      {/* 捕手のミット */}
      <circle cx="372" cy="118" r="8" fill="var(--dirt-dark)" />

      {ball && <circle cx={ball.x} cy={ball.y} r="4" fill="#fff" stroke="#b91c1c" strokeWidth="1.2" />}
    </svg>
  );
}
