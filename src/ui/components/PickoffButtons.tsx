// 牽制を選ぶボタン（投手は左投げ）。走者がいる塁にだけ投げられる。
// 一塁は「足を上げて」と「クイック」の2通り。三塁はたまに使う。

import { PICKOFF } from '../../game/messages';
import type { Bases, PickoffBase, PickoffMove } from '../../types';
import { R } from './Ruby';

interface Props {
  bases: Bases;
  disabled?: boolean;
  onPick: (base: PickoffBase, move: PickoffMove) => void;
}

export function PickoffButtons({ bases, disabled, onPick }: Props) {
  if (!bases.some(Boolean)) return null;
  const choices: { base: PickoffBase; move: PickoffMove }[] = [];
  if (bases[0]) choices.push({ base: 1, move: 'lift' }, { base: 1, move: 'quick' });
  if (bases[1]) choices.push({ base: 2, move: 'quick' });
  if (bases[2]) choices.push({ base: 3, move: 'quick' });
  return (
    <div className="pickoff-row">
      <span className="pickoff-label">
        <R>{PICKOFF.label}</R>
      </span>
      {choices.map((c) => (
        <button key={`${c.base}${c.move}`} className={`small pickoff b${c.base}`} disabled={disabled} onClick={() => onPick(c.base, c.move)}>
          <R>{PICKOFF.button(c.base, c.move)}</R>
        </button>
      ))}
    </div>
  );
}
