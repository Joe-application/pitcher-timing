// カウント・塁・打者の表示

import { BATTER, RATING, RATING_TEXT, spotText } from '../../game/messages';
import type { Bases, BatterSpot } from '../../types';
import { R } from './Ruby';

export function Dots({ label, n, max, kind }: { label: string; n: number; max: number; kind: 'b' | 's' | 'o' }) {
  return (
    <span className="dots" aria-label={`${label} ${n}`}>
      <b>{label}</b>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < n ? `on ${kind}` : ''} />
      ))}
    </span>
  );
}

/** 塁の図。走者がいる塁を塗る */
export function Diamond({ bases }: { bases: Bases }) {
  const base = (x: number, y: number, on: boolean, key: string) => (
    <rect key={key} x={x - 6} y={y - 6} width="12" height="12" transform={`rotate(45 ${x} ${y})`} className={on ? 'base on' : 'base'} />
  );
  return (
    <svg className="diamond" viewBox="0 0 48 40" role="img" aria-label={`ランナー：${['一塁', '二塁', '三塁'].filter((_, i) => bases[i]).join('・') || 'なし'}`}>
      {base(38, 24, bases[0], '1')}
      {base(24, 10, bases[1], '2')}
      {base(10, 24, bases[2], '3')}
    </svg>
  );
}

export function BatterCard({ spot }: { spot: Pick<BatterSpot, 'type' | 'hand' | 'order' | 'height'> }) {
  const b = BATTER[spot.type];
  const rating = RATING[spot.type];
  return (
    <div className={`batter-card ${spot.type}`}>
      <span className="batter-icon">{b.icon}</span>
      <div>
        <b>
          <span className="batter-order">
            <R>{spotText(spot)}</R>
            {spot.height ? `・${spot.height}cm` : ''}
          </span>{' '}
          <R>{b.name}</R>
        </b>
        <span className="batter-rating" aria-label={`打ちそう度 ${rating}`}>
          <span className="rating-on">{'●'.repeat(rating)}</span>
          <span className="rating-off">{'●'.repeat(5 - rating)}</span> <R>{RATING_TEXT[rating]}</R>
        </span>
        <div className="small-text muted">
          <R>{b.desc}</R>
        </div>
      </div>
    </div>
  );
}

export function Stars({ n, max = 3 }: { n: number; max?: number }) {
  return (
    <span className="stars" aria-label={`星 ${n}`}>
      {'★'.repeat(n)}
      <span className="stars-off">{'★'.repeat(Math.max(0, max - n))}</span>
    </span>
  );
}

export function Manager({ children }: { children: string }) {
  return (
    <div className="manager">
      <span className="manager-face" aria-hidden>
        🧢
      </span>
      <p>
        <R>{children}</R>
      </p>
    </div>
  );
}
