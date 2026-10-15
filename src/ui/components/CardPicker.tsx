// 「とまる」「あしあげ」「ため」のカードを選ぶ1行

import { sfx } from '../../audio/cues';
import { CARD, PITCH_TYPE, PITCH_TYPE_LABEL, SEGMENT } from '../../game/messages';
import type { PitchType } from '../../types';
import { R } from './Ruby';
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

/** 球種（ストレート・スローボール）を選ぶ1行 */
export function PitchTypePicker({ value, onChange, disabled }: { value: PitchType; onChange: (v: PitchType) => void; disabled?: boolean }) {
  return (
    <div className="card-row ptype">
      <span className="card-row-name">
        <R>{PITCH_TYPE_LABEL}</R>
      </span>
      <div className="card-choices">
        {(['straight', 'slow'] as const).map((t) => (
          <button
            key={t}
            className={`choice${value === t ? ' on' : ''}`}
            disabled={disabled}
            onClick={() => {
              sfx.select();
              onChange(t);
            }}
            aria-pressed={value === t}
          >
            {PITCH_TYPE[t]}
          </button>
        ))}
      </div>
    </div>
  );
}
