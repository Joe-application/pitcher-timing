// モード2：「自分のふつう」を測る（§5.1）

import { useState } from 'react';
import { sfx } from '../../audio/cues';
import { sec } from '../../game/messages';
import { baselineFrom, type Measured } from '../../practice/measure';
import { R } from '../components/Ruby';
import { TapPad } from '../components/TapPad';
import { useApp } from '../state';

const TARGET = 5;
const MIN = 3;

export function MeasureScreen() {
  const { state, dispatch } = useApp();
  const p = state.profile!;
  const [samples, setSamples] = useState<Measured[]>([]);
  const result = samples.length >= MIN ? baselineFrom(samples) : null;

  const save = () => {
    if (!result) return;
    sfx.good();
    dispatch({ type: 'profile', profile: { ...p, baseline: result } });
    dispatch({ type: 'go', screen: 'practice' });
  };

  return (
    <div className="screen-scroll">
      <div className="row">
        <button className="ghost small" onClick={() => dispatch({ type: 'go', screen: 'practice' })}>
          ← もどる
        </button>
        <h1>
          <R>{'「{自分|じぶん}のふつう」を{測|はか}る'}</R>
        </h1>
      </div>
      <p>
        <R>{`いつものリズムで、シャドーピッチングを${TARGET}{回|かい}。{計測係|けいそくがかり}の{人|ひと}は、{動|うご}きに{合|あ}わせて{下|した}のボタンを4{回|かい}タップする。`}</R>
      </p>
      <p className="center">
        <b>
          {Math.min(samples.length + 1, TARGET)} / {TARGET}
          <R>{'{回目|かいめ}'}</R>
        </b>
      </p>
      {samples.length < TARGET && <TapPad onDone={(m) => setSamples([...samples, m])} />}

      {samples.length > 0 && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th />
                <th>とまる</th>
                <th>あしあげ＋ため</th>
                <th>ふみだし</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {samples.map((m, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{m.s1.toFixed(2)}</td>
                  <td>{m.s2s3.toFixed(2)}</td>
                  <td>{m.s4.toFixed(2)}</td>
                  <td>
                    <button className="ghost small" aria-label={`${i + 1}回目を消す`} onClick={() => setSamples(samples.filter((_, k) => k !== i))}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {result ? (
            <>
              <p>
                <b>
                  <R>{`{平均|へいきん}：とまる ${sec(result.s1, 2)}・あしあげ＋ため ${sec(result.s2 + result.s3, 2)}・ふみだし ${sec(result.s4, 2)}`}</R>
                </b>
              </p>
              <p className="muted small-text">
                <R>{'ほかと{大|おお}きくちがう{回|かい}は、{平均|へいきん}から{外|はず}してある。'}</R>
              </p>
              <div className="row center-row">
                <button className="primary big" onClick={save}>
                  <R>{'これを「{自分|じぶん}のふつう」にする'}</R>
                </button>
              </div>
            </>
          ) : (
            <p className="muted">
              <R>{`あと${MIN - samples.length}{回|かい}{測|はか}ると、{平均|へいきん}が{出|で}る。`}</R>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
