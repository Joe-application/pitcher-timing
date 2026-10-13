// 「とまる」「あしあげ」「ため」のカードを選ぶ1行

import { sfx } from '../../audio/cues';
import { CARD, SEGMENT } from '../../game/messages';
import { CARD_LEVELS, type CardKey, type CardLevel } from '../../sim/constants';

export function CardPicker({ seg, value, onChange, disabled, max = 2 }: { seg: CardKey; value: CardLevel; onChange: (v: CardLevel) => void; disabled?: boolean; /** 選べるいちばん長い段階 */ max?: CardLevel }) {
  const levels = CARD_LEVELS[seg].filter((lv) => lv <= max);
  return (
    <div className={`card-row ${seg}`}>
      <span className="card-row-name">{SEGMENT[seg].name}</span>
      <div className="card-choices">
        {levels.map((lv) => (
          <button
            key={lv}
            className={`choice${value === lv ? ' on' : ''}`}
            disabled={disabled}
            onClick={() => {
              sfx.select();
              onChange(lv);
            }}
            aria-pressed={value === lv}
          >
            {CARD[seg][lv]}
          </button>
        ))}
      </div>
    </div>
  );
}
