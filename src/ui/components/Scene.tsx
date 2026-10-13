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
const FLIGHT_MS = PITCH.BALL_FLIGHT * 1000;
/** スイングにかかる時間 */
const SWING_MS = 170;

/** 投手の姿勢。lift = 足の上がり具合、stride = 前への動き（どちらも 0〜1） */
function pitcherPose(lift: number, stride: number) {
  const hip: P = { x: RUBBER_X + 26 * stride, y: 118 + 12 * stride };
  const shoulder: P = { x: hip.x + 4 + 16 * stride, y: hip.y - 36 + 4 * stride };
  const head: P = { x: shoulder.x + 2 + 5 * stride, y: shoulder.y - 14 };
  const backFoot: P = { x: RUBBER_X - 2, y: GROUND };
  const backKnee: P = { x: lerp(RUBBER_X + 1, RUBBER_X + 14, stride), y: lerp(146, 152, stride) };
  // 前足：立つ → 上げる → 踏み出す
  const standKnee: P = { x: hip.x + 5, y: 146 };
  const standFoot: P = { x: hip.x + 8, y: GROUND };
  const liftKnee: P = { x: hip.x + 20, y: hip.y - 10 };
  const liftFoot: P = { x: hip.x + 16, y: hip.y + 18 };
  const stepKnee: P = { x: hip.x + 22, y: hip.y + 24 };
  const stepFoot: P = { x: RUBBER_X + 70, y: GROUND };
  const up = Math.max(0, lift - stride);
  const frontKnee = mix(mix(standKnee, liftKnee, up + stride * (1 - stride)), stepKnee, stride);
  const frontFoot = mix(mix(standFoot, liftFoot, up + stride * (1 - stride) * 0.6), stepFoot, ease(stride));
  // 投げる腕：胸の前 → 後ろに引く → 前に振る
  const chest: P = { x: shoulder.x + 9, y: shoulder.y + 17 };
  const back: P = { x: shoulder.x - 22, y: shoulder.y - 2 };
  const top: P = { x: shoulder.x - 6, y: shoulder.y - 24 };
  const front: P = { x: shoulder.x + 26, y: shoulder.y - 8 };
  let hand: P;
  if (stride < 0.45) hand = mix(chest, back, ease(stride / 0.45));
  else if (stride < 0.8) hand = mix(back, top, (stride - 0.45) / 0.35);
  else hand = mix(top, front, (stride - 0.8) / 0.2);
  const glove = mix(chest, { x: shoulder.x + 20, y: shoulder.y + 6 }, ease(stride));
  return { hip, shoulder, head, backFoot, backKnee, frontKnee, frontFoot, hand, glove };
}

const line = (a: P, b: P) => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });

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
    if (clock.event && clock.eventAt != null && now >= clock.eventAt) {
      turned = clock.event === 'pickoff';
      label = clock.event === 'pickoff' ? 'けんせい！' : 'はずす';
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
  const plateAt = releaseAt != null ? releaseAt + FLIGHT_MS : null;
  const swung = record?.swung === true;
  // 打者は予想した時刻に合わせて振る。誤差が正なら早すぎ、負なら振りおくれ
  const swingAt = plateAt != null && swung ? plateAt - (record?.timingErrorMs ?? 0) : null;
  const swingK = swingAt != null ? clamp01((now - (swingAt - SWING_MS * 0.6)) / SWING_MS) : 0;
  const contact = swung && record !== null && record.result !== 'swingMiss';

  let ball: P | null = null;
  if (clock?.event === 'pickoff' && clock.eventAt != null && now >= clock.eventAt + 150) {
    const k = clamp01((now - clock.eventAt - 150) / 450);
    ball = { x: lerp(pose.shoulder.x - 20, -20, k), y: lerp(pose.shoulder.y, 70, k) };
  } else if (releaseAt != null && plateAt != null && now >= releaseAt) {
    const high = record?.result === 'ball' ? -18 : 0;
    if (now < plateAt || !record) {
      const k = clamp01((now - releaseAt) / FLIGHT_MS);
      ball = { x: lerp(pose.hand.x, PLATE_X, k), y: lerp(pose.hand.y, 112 + high, k) };
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
    if (clock.event && clock.eventAt != null) endAt = clock.eventAt + 900;
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

  // ---- 打者の姿勢 ----
  const broken = swung && record?.timing === 'broken' && swingK > 0.3;
  const batX = 346;
  const hands: P = { x: batX - 8 + swingK * -6, y: 98 + swingK * 10 };
  const angle = lerp(-65, 205, ease(swingK)) * (Math.PI / 180);
  const batEnd: P = { x: hands.x + Math.cos(angle) * 30, y: hands.y + Math.sin(angle) * 30 };
  const lean = broken ? (record!.timingErrorMs > 0 ? -14 : 8) : 0;

  const stroke = { stroke: 'var(--fg)', strokeWidth: 4, strokeLinecap: 'round' as const, fill: 'none' };
  const cap = { fill: 'var(--cap)' };

  return (
    <svg className="scene" viewBox="0 0 400 200" role="img" aria-label="投球の場面">
      <rect x="0" y="0" width="400" height="200" fill="var(--sky)" />
      <rect x="0" y={GROUND} width="400" height={200 - GROUND} fill="var(--grass)" />
      {/* マウンドとホームベース */}
      <path d={`M20 ${GROUND} Q${RUBBER_X} ${GROUND - 12} 190 ${GROUND} Z`} fill="var(--dirt)" />
      <rect x={RUBBER_X - 8} y={GROUND - 5} width="16" height="3" fill="#fff" />
      <path d={`M${PLATE_X - 28} ${GROUND} h70 v6 h-70 Z`} fill="var(--dirt)" />
      <rect x={PLATE_X - 6} y={GROUND - 1} width="12" height="3" fill="#fff" />

      {/* 投手 */}
      <g transform={turned ? `translate(${pose.hip.x * 2} 0) scale(-1 1)` : undefined}>
        <line {...line(pose.hip, pose.backKnee)} {...stroke} />
        <line {...line(pose.backKnee, pose.backFoot)} {...stroke} />
        <line {...line(pose.hip, pose.frontKnee)} {...stroke} stroke="var(--s2)" />
        <line {...line(pose.frontKnee, pose.frontFoot)} {...stroke} stroke="var(--s2)" />
        <line {...line(pose.hip, pose.shoulder)} {...stroke} strokeWidth={6} />
        <line {...line(pose.shoulder, pose.glove)} {...stroke} strokeWidth={3} />
        <circle cx={pose.glove.x} cy={pose.glove.y} r="4.5" fill="var(--dirt-dark)" />
        <line {...line(pose.shoulder, pose.hand)} {...stroke} strokeWidth={3} />
        <circle cx={pose.head.x} cy={pose.head.y} r="9" fill="var(--card)" stroke="var(--fg)" strokeWidth="3" />
        <path d={`M${pose.head.x - 9} ${pose.head.y - 2} a9 9 0 0 1 18 0 h6 v2 h-24 Z`} {...cap} />
      </g>
      {label && (
        <text x={pose.hip.x} y="34" textAnchor="middle" className="scene-label">
          {label}
        </text>
      )}

      {/* 打者 */}
      <g transform={`rotate(${lean} ${batX} ${GROUND})`}>
        <line x1={batX} y1="124" x2={batX - 7} y2={GROUND} {...stroke} />
        <line x1={batX} y1="124" x2={batX + 9} y2={GROUND} {...stroke} />
        <line x1={batX} y1="124" x2={batX - 1} y2="90" {...stroke} strokeWidth={6} stroke="var(--offense)" />
        <line x1={batX - 1} y1="92" x2={hands.x} y2={hands.y} {...stroke} strokeWidth={3} />
        <line {...line(hands, batEnd)} stroke="var(--dirt-dark)" strokeWidth="4.5" strokeLinecap="round" />
        <circle cx={batX - 2} cy="77" r="9" fill="var(--card)" stroke="var(--fg)" strokeWidth="3" />
        <path d={`M${batX - 17} 75 h6 a9 9 0 0 1 18 0 v2 h-24 Z`} fill="var(--offense)" />
      </g>
      {/* 捕手のミット */}
      <circle cx="372" cy="118" r="8" fill="var(--dirt-dark)" />

      {ball && <circle cx={ball.x} cy={ball.y} r="4" fill="#fff" stroke="#b91c1c" strokeWidth="1.2" />}
    </svg>
  );
}
