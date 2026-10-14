// ねらうコースと高さを選ぶ図。投手から見た向きで、打者の体に合わせてストライクゾーンを描く。
// ストライクゾーン（9マス）の下の線は打者のひざ頭の下、上の線はベルトと胸のロゴの中間。
// 打者はバットを構えたシルエットで、ゾーンの横（右打者は右、左打者は左）に、ゾーンの方を向いて立つ。
// そのまわりの2周（40マス）がボールゾーン。

import { ZONE } from '../../game/messages';
import { GRID, isFarBall, isStrike, sameCell, ZONE_MAX, ZONE_MIN, zoneKind } from '../../sim/location';
import type { BatterSpot, Cell } from '../../types';
import { R } from './Ruby';

/** 1マスの大きさ（正方形）。ストライクゾーンは 3×3 で、高さは打者の体（ひざ頭の下〜ベルトと胸のロゴの中間）に合わせる */
const SIZE = 24;
const CW = SIZE;
/** 打者の体を、内角側のボールゾーンにどれだけ重ねて描くか。
 * 実際の打者はホームベースのすぐ横に立つので、内角のボールゾーンは打者の体の近くになる */
const OVERLAP = SIZE * 1.6;
const TOP = 16;
/** ストライクゾーンの上下の線 */
const ZONE_TOP = TOP + SIZE * ZONE_MIN;
const ZONE_BOTTOM = TOP + SIZE * (ZONE_MAX + 1);
/** 打者の体：胸のロゴ・ベルト・ひざ頭の高さ。ゾーンの上の線がロゴとベルトの中間、下の線がひざ頭のすぐ下になるように決める */
const LOGO_Y = ZONE_TOP - 16;
const BELT_Y = ZONE_TOP + 16;
const KNEE_Y = ZONE_BOTTOM - 5;
/** 上半身（頭・腕・バット）は、胸のロゴの高さに合わせて上下にずらす */
const UP = LOGO_Y - 46;
const FOOT_Y = KNEE_Y + 40;
const BODY_W = 62;
const W = 8 + CW * GRID + BODY_W - OVERLAP;
const H = TOP + SIZE * GRID + 34;

interface Props {
  spot: BatterSpot;
  aim: Cell | null;
  onAim?: (c: Cell) => void;
  /** 直前の球が実際に行ったマス */
  last?: Cell | null;
  disabled?: boolean;
}

/**
 * 投手から見た打者のシルエット。バットを構えて、ホームベース（ゾーン）の方を向いている。
 * 右打者はゾーンの右側、左打者は左側に立つ。x は体の中心。右打者の形で描き、左打者は左右を反転する。
 */
function BatterSilhouette({ x, hand }: { x: number; hand: 'R' | 'L' }) {
  const hip = BELT_Y + 6;
  const limb = { fill: 'none', stroke: 'var(--fg)', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <g transform={hand === 'L' ? `translate(${x * 2} 0) scale(-1 1)` : undefined}>
      {/* バット（後ろの肩の上に立てて構える） */}
      <line x1={x - 15} y1={34 + UP} x2={x + 12} y2={2 + UP} stroke="var(--fg)" strokeWidth="5" strokeLinecap="round" />
      {/* 後ろ足・前足（足を開いて、ひざを曲げる） */}
      <path d={`M${x + 10} ${hip} Q${x + 17} ${hip + 18} ${x + 12} ${KNEE_Y - 3} L${x + 19} ${FOOT_Y - 4}`} {...limb} strokeWidth="13" />
      <path d={`M${x - 1} ${hip} Q${x - 8} ${hip + 16} ${x - 13} ${KNEE_Y - 3} L${x - 11} ${FOOT_Y - 4}`} {...limb} strokeWidth="13" />
      <path d={`M${x + 14} ${FOOT_Y} h11 M${x - 21} ${FOOT_Y} h13`} {...limb} strokeWidth="7" />
      {/* 腰と上半身（おしりを引いて、前かがみ） */}
      <ellipse cx={x + 8} cy={hip + 3} rx="15" ry="12" fill="var(--fg)" />
      <path d={`M${x - 14} ${40 + UP} Q${x - 4} ${30 + UP} ${x + 10} ${36 + UP} Q${x + 20} ${52 + UP} ${x + 20} ${BELT_Y + 4} L${x - 7} ${BELT_Y + 4} Q${x - 14} ${58 + UP} ${x - 14} ${40 + UP} Z`} fill="var(--fg)" />
      {/* 腕（グリップは顔の前、ひじを上げる） */}
      <path d={`M${x + 4} ${40 + UP} L${x - 12} ${50 + UP} L${x - 15} ${34 + UP}`} {...limb} strokeWidth="9" />
      <path d={`M${x - 8} ${38 + UP} L${x - 20} ${42 + UP} L${x - 15} ${33 + UP}`} {...limb} strokeWidth="7" />
      {/* 頭とヘルメットのつば */}
      <circle cx={x - 5} cy={23 + UP} r="10" fill="var(--fg)" />
      <path d={`M${x - 12} ${17 + UP} l-9 3.5 l9 2.5 Z`} fill="var(--fg)" />
      {/* 目印：胸のロゴ・ベルト・ひざ頭 */}
      <rect x={x - 3} y={LOGO_Y - 3} width="11" height="6" rx="1.5" fill="var(--card)" opacity="0.9" />
      <rect x={x - 8} y={BELT_Y - 2} width="28" height="4" fill="var(--card)" opacity="0.9" />
      <circle cx={x - 13} cy={KNEE_Y - 3} r="3.2" fill="var(--card)" opacity="0.9" />
    </g>
  );
}

export function ZonePicker({ spot, aim, onAim, last, disabled }: Props) {
  // 右打者は投手から見て右に立つ。マスはその反対側に寄せる
  const right = spot.hand === 'R';
  const gridX = right ? 8 : W - 8 - CW * GRID;
  const bodyX = right ? W - BODY_W / 2 - 2 : BODY_W / 2 + 2;
  const cx = (c: Cell) => gridX + c.x * CW + CW / 2;
  const cy = (c: Cell) => TOP + c.y * SIZE + SIZE / 2;
  const cells: Cell[] = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) cells.push({ x, y });
  // 内角は打者に近い側
  const inX = right ? gridX + CW * (GRID - 1) : gridX + CW;
  const outX = right ? gridX + CW : gridX + CW * (GRID - 1);

  return (
    <div className="zone-picker">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="ねらうコースと高さ（投手から見た図）">
        <BatterSilhouette x={bodyX} hand={spot.hand} />
        {/* ホームベース（投手から見た向き） */}
        <path d={`M${gridX + CW * ZONE_MIN} ${H - 4} h${CW * 3} v-9 l${-CW * 1.5} -6 l${-CW * 1.5} 6 Z`} fill="var(--card)" stroke="var(--fg)" strokeWidth="2" strokeLinejoin="round" />
        {/* ゾーンの上下の線を、打者の体までのばす */}
        {[ZONE_TOP, ZONE_BOTTOM].map((y) => (
          <line key={y} x1={right ? gridX + CW * ZONE_MIN : bodyX - 24} x2={right ? bodyX + 24 : gridX + CW * (ZONE_MAX + 1)} y1={y} y2={y} stroke="var(--fg)" strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
        ))}
        {cells.map((c) => {
          const kind = zoneKind(spot, c);
          const on = sameCell(aim, c);
          const name = ZONE.cellName(c, spot.hand);
          return (
            <rect
              key={`${c.x}-${c.y}`}
              x={gridX + c.x * CW + 1}
              y={TOP + c.y * SIZE + 1}
              width={CW - 2}
              height={SIZE - 2}
              rx="3"
              className={`zone-cell ${kind}${kind === 'ball' && isFarBall(c) ? ' far' : ''}${on ? ' on' : ''}${disabled ? ' disabled' : ''}`}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-label={`${name}${kind === 'hot' ? '（得意）' : kind === 'cold' ? '（苦手）' : ''}`}
              aria-pressed={on}
              onClick={() => !disabled && onAim?.(c)}
              onKeyDown={(e) => {
                if (!disabled && (e.key === 'Enter' || e.key === ' ')) onAim?.(c);
              }}
            />
          );
        })}
        {/* ストライクゾーンの枠 */}
        <rect x={gridX + CW * ZONE_MIN} y={ZONE_TOP} width={CW * 3} height={SIZE * 3} fill="none" stroke="var(--fg)" strokeWidth="2.5" pointerEvents="none" />
        {last && <circle cx={cx(last)} cy={cy(last)} r="5.5" fill="#fff" stroke="#b91c1c" strokeWidth="2" pointerEvents="none" opacity={isStrike(last) ? 1 : 0.85} />}
        {aim && (
          <g pointerEvents="none">
            <circle cx={cx(aim)} cy={cy(aim)} r="8.5" fill="none" stroke="var(--fg)" strokeWidth="2.5" />
            <path d={`M${cx(aim) - 11} ${cy(aim)} h22 M${cx(aim)} ${cy(aim) - 11} v22`} stroke="var(--fg)" strokeWidth="1.5" />
          </g>
        )}
        <text x={inX} y={TOP + SIZE * GRID + 11} textAnchor="middle" className="zone-label">
          内角
        </text>
        <text x={outX} y={TOP + SIZE * GRID + 11} textAnchor="middle" className="zone-label">
          外角
        </text>
        <text x={gridX + CW * GRID * 0.5} y={TOP - 5} textAnchor="middle" className="zone-label">
          高め
        </text>
      </svg>
    </div>
  );
}

/** 色の説明 */
export function ZoneLegend() {
  return (
    <div className="legend zone-legend">
      <span>
        <i className="dot hot" />
        <R>{ZONE.hot}</R>
      </span>
      <span>
        <i className="dot cold" />
        <R>{ZONE.cold}</R>
      </span>
      <span>
        <i className="dot ballzone" />
        <R>{ZONE.ball}</R>
      </span>
    </div>
  );
}
