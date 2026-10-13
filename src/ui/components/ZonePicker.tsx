// ねらうコースと高さを選ぶ図。投手から見た向きで、打者の体に合わせてストライクゾーンを描く。
// ストライクゾーン（9マス）の下の線は打者のひざ頭の下、上の線はベルトと胸のロゴの中間。
// 打者はバットを構えたシルエットで、ゾーンの横（右打者は右、左打者は左）に、ゾーンの方を向いて立つ。
// そのまわりの16マスがボールゾーン。

import { ZONE } from '../../game/messages';
import { GRID, isStrike, sameCell, zoneKind } from '../../sim/location';
import type { BatterSpot, Cell } from '../../types';
import { R } from './Ruby';

const SIZE = 28;
const TOP = 34;
/** ストライクゾーンの上下の線 */
const ZONE_TOP = TOP + SIZE;
const ZONE_BOTTOM = TOP + SIZE * 4;
/** 打者の体：胸のロゴ・ベルト・ひざ頭の高さ。ゾーンの上の線がロゴとベルトの中間、下の線がひざ頭のすぐ下になるように決める */
const LOGO_Y = ZONE_TOP - 16;
const BELT_Y = ZONE_TOP + 16;
const KNEE_Y = ZONE_BOTTOM - 5;
const BODY_W = 66;
const W = 8 + SIZE * 5 + 6 + BODY_W;
const H = 212;

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
      <line x1={x - 15} y1="34" x2={x + 12} y2="2" stroke="var(--fg)" strokeWidth="5" strokeLinecap="round" />
      {/* 後ろ足・前足（足を開いて、ひざを曲げる） */}
      <path d={`M${x + 10} ${hip} Q${x + 17} ${hip + 22} ${x + 12} ${KNEE_Y - 3} L${x + 19} 181`} {...limb} strokeWidth="13" />
      <path d={`M${x - 1} ${hip} Q${x - 8} ${hip + 20} ${x - 13} ${KNEE_Y - 3} L${x - 11} 181`} {...limb} strokeWidth="13" />
      <path d={`M${x + 14} 185 h11 M${x - 21} 185 h13`} {...limb} strokeWidth="7" />
      {/* 腰と上半身（おしりを引いて、前かがみ） */}
      <ellipse cx={x + 8} cy={hip + 3} rx="15" ry="12" fill="var(--fg)" />
      <path d={`M${x - 14} 40 Q${x - 4} 30 ${x + 10} 36 Q${x + 20} 52 ${x + 20} ${BELT_Y + 4} L${x - 7} ${BELT_Y + 4} Q${x - 14} 58 ${x - 14} 40 Z`} fill="var(--fg)" />
      {/* 腕（グリップは顔の前、ひじを上げる） */}
      <path d={`M${x + 4} 40 L${x - 12} 50 L${x - 15} 34`} {...limb} strokeWidth="9" />
      <path d={`M${x - 8} 38 L${x - 20} 42 L${x - 15} 33`} {...limb} strokeWidth="7" />
      {/* 頭とヘルメットのつば */}
      <circle cx={x - 5} cy="23" r="10" fill="var(--fg)" />
      <path d={`M${x - 12} 17 l-9 3.5 l9 2.5 Z`} fill="var(--fg)" />
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
  const gridX = right ? 8 : W - 8 - SIZE * GRID;
  const bodyX = right ? W - BODY_W / 2 - 2 : BODY_W / 2 + 2;
  const cx = (c: Cell) => gridX + c.x * SIZE + SIZE / 2;
  const cy = (c: Cell) => TOP + c.y * SIZE + SIZE / 2;
  const cells: Cell[] = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) cells.push({ x, y });
  // 内角は打者に近い側
  const inX = right ? gridX + SIZE * 4.5 : gridX + SIZE * 0.5;
  const outX = right ? gridX + SIZE * 0.5 : gridX + SIZE * 4.5;

  return (
    <div className="zone-picker">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="ねらうコースと高さ（投手から見た図）">
        <BatterSilhouette x={bodyX} hand={spot.hand} />
        {/* ホームベース（投手から見た向き） */}
        <path d={`M${gridX + SIZE} ${H - 4} h${SIZE * 3} v-9 l${-SIZE * 1.5} -6 l${-SIZE * 1.5} 6 Z`} fill="var(--card)" stroke="var(--fg)" strokeWidth="2" strokeLinejoin="round" />
        {/* ゾーンの上下の線を、打者の体までのばす */}
        {[ZONE_TOP, ZONE_BOTTOM].map((y) => (
          <line key={y} x1={right ? gridX + SIZE : bodyX - 24} x2={right ? bodyX + 24 : gridX + SIZE * 4} y1={y} y2={y} stroke="var(--fg)" strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
        ))}
        {cells.map((c) => {
          const kind = zoneKind(spot, c);
          const on = sameCell(aim, c);
          const name = ZONE.cellName(c, spot.hand);
          return (
            <rect
              key={`${c.x}-${c.y}`}
              x={gridX + c.x * SIZE + 1}
              y={TOP + c.y * SIZE + 1}
              width={SIZE - 2}
              height={SIZE - 2}
              rx="3"
              className={`zone-cell ${kind}${on ? ' on' : ''}${disabled ? ' disabled' : ''}`}
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
        <rect x={gridX + SIZE} y={ZONE_TOP} width={SIZE * 3} height={SIZE * 3} fill="none" stroke="var(--fg)" strokeWidth="2.5" pointerEvents="none" />
        {last && <circle cx={cx(last)} cy={cy(last)} r="6" fill="#fff" stroke="#b91c1c" strokeWidth="2" pointerEvents="none" opacity={isStrike(last) ? 1 : 0.85} />}
        {aim && (
          <g pointerEvents="none">
            <circle cx={cx(aim)} cy={cy(aim)} r="10" fill="none" stroke="var(--fg)" strokeWidth="2.5" />
            <path d={`M${cx(aim) - 13} ${cy(aim)} h26 M${cx(aim)} ${cy(aim) - 13} v26`} stroke="var(--fg)" strokeWidth="1.5" />
          </g>
        )}
        <text x={inX} y={TOP + SIZE * 5 + 12} textAnchor="middle" className="zone-label">
          内角
        </text>
        <text x={outX} y={TOP + SIZE * 5 + 12} textAnchor="middle" className="zone-label">
          外角
        </text>
        <text x={gridX + SIZE * 2.5} y={TOP - 6} textAnchor="middle" className="zone-label">
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
