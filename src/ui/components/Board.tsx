// 広い画面で、投球シーンの下に出す「状況ボード」。
// 回・スコア・カウント・ランナーと、いまの打者の特徴を大きく見せる。

import { BATTER, RATING, RATING_TEXT, spotText, ZONE } from '../../game/messages';
import { ZONE_PROFILE } from '../../sim/location';
import type { Bases, BatterSpot } from '../../types';
import { Diamond } from './Hud';
import { R } from './Ruby';

interface Props {
  inning: string;
  /** 例：「4-4 同点」 */
  score: string;
  balls: number;
  strikes: number;
  outs: number;
  bases: Bases;
  spot: BatterSpot;
}

function Lamps({ label, n, max, kind }: { label: string; n: number; max: number; kind: 'b' | 's' | 'o' }) {
  return (
    <div className="lamps" aria-label={`${label} ${n}`}>
      <b>{label}</b>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < n ? `on ${kind}` : ''} />
      ))}
    </div>
  );
}

export function Board({ inning, score, balls, strikes, outs, bases, spot }: Props) {
  const b = BATTER[spot.type];
  const rating = RATING[spot.type];
  const prof = ZONE_PROFILE[spot.type];
  const hot = spot.hot ?? prof.hot;
  const cold = spot.cold ?? prof.cold;
  const runners = ['{一塁|いちるい}', '{二塁|にるい}', '{三塁|さんるい}'].filter((_, i) => bases[i]);
  return (
    <div className="board">
      <div className="board-game">
        <div className="board-score">
          <span className="board-inning">
            <R>{inning}</R>
          </span>
          <b>
            <R>{score}</R>
          </b>
        </div>
        <div className="board-count">
          <Lamps label="B" n={Math.min(3, balls)} max={3} kind="b" />
          <Lamps label="S" n={Math.min(2, strikes)} max={2} kind="s" />
          <Lamps label="O" n={Math.min(2, outs)} max={2} kind="o" />
        </div>
        <div className="board-bases">
          <Diamond bases={bases} />
          <span>
            <R>{runners.length ? `ランナー ${runners.join('・')}` : 'ランナーなし'}</R>
          </span>
        </div>
      </div>

      <div className={`board-batter ${spot.type}`}>
        <div className="board-batter-head">
          <span className="batter-icon">{b.icon}</span>
          <div>
            <span className="batter-order">
              <R>{spotText(spot)}</R>
              {spot.height ? `・${spot.height}cm` : ''}
            </span>
            <div className="board-name">
              <R>{b.name}</R>
            </div>
          </div>
          <div className="board-rating" aria-label={`打ちそう度 ${rating}`}>
            <span className="rating-on">{'●'.repeat(rating)}</span>
            <span className="rating-off">{'●'.repeat(5 - rating)}</span>
            <div>
              <R>{RATING_TEXT[rating]}</R>
            </div>
          </div>
        </div>
        <p>
          <R>{b.desc}</R>
        </p>
        <p className="board-tip">
          <R>{`💡 ${b.tip}`}</R>
        </p>
        <div className="board-zones">
          <span className="hot">
            <R>{`${ZONE.hot}：${hot.map(ZONE.spotName).join('、')}`}</R>
          </span>
          <span className="cold">
            <R>{`${ZONE.cold}：${cold.map(ZONE.spotName).join('、')}`}</R>
          </span>
        </div>
      </div>
    </div>
  );
}
