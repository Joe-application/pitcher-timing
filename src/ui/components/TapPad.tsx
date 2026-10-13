// 計測係が使う大きなボタン。セット → ①足上げ → ②前へ → ③リリース の順にタップする。

import { useRef, useState } from 'react';
import { sfx, unlockAudio } from '../../audio/cues';
import { PRACTICE } from '../../game/messages';
import { fromTaps, type Measured } from '../../practice/measure';
import { R } from './Ruby';

const LABELS = [PRACTICE.tapSet, ...PRACTICE.taps];

export function TapPad({ onDone }: { onDone: (m: Measured) => void }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState(false);
  const times = useRef<number[]>([]);

  const tap = () => {
    // タップした瞬間の時刻を、まず最初に取る
    const t = performance.now();
    unlockAudio();
    sfx.tap();
    times.current[step] = t;
    setError(false);
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    const [a, b, c, d] = times.current;
    const m = fromTaps(a, b, c, d);
    times.current = [];
    setStep(0);
    if (m) onDone(m);
    else setError(true);
  };

  return (
    <div className="tap-pad">
      <div className="tap-steps">
        {LABELS.map((l, i) => (
          <span key={i} className={i === step ? 'on' : i < step ? 'done' : ''}>
            <R>{l}</R>
          </span>
        ))}
      </div>
      <button className={`tap-button step${step}`} onPointerDown={tap} onContextMenu={(e) => e.preventDefault()}>
        <R>{LABELS[step]}</R>
      </button>
      <div className="row center-row">
        <button
          className="small"
          disabled={step === 0}
          onClick={() => {
            times.current = [];
            setStep(0);
          }}
        >
          <R>{'{最初|さいしょ}からやり{直|なお}す'}</R>
        </button>
      </div>
      {error && (
        <p className="warn">
          <R>{'うまく{測|はか}れなかった。もう1{回|かい}やってみよう。'}</R>
        </p>
      )}
    </div>
  );
}
