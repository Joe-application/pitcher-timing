// モード2：計測チャレンジ（§5.3）。合図音なしで、自分の感覚で間を作る。

import { useState } from 'react';
import { sfx } from '../../audio/cues';
import { describeDiff, PRACTICE } from '../../game/messages';
import { addPractice, REST_EVERY } from '../../practice/log';
import type { Measured } from '../../practice/measure';
import { presetPattern, PRESETS } from '../../practice/presets';
import { scoreChallenge, type ChallengeScore } from '../../practice/score';
import { baselineOf, totalTime } from '../../sim/timing';
import { R } from '../components/Ruby';
import { TapPad } from '../components/TapPad';
import { PatternBar, SegmentLegend } from '../components/Timeline';
import { useApp } from '../state';

export function ChallengeScreen() {
  const { state, dispatch } = useApp();
  const p = state.profile!;
  const base = baselineOf(p.baseline);
  const pool = [...PRESETS.map((d) => presetPattern(d, base)), ...p.patterns];
  const target = pool.find((x) => x.id === state.practiceTarget?.id) ?? pool[0];
  const [result, setResult] = useState<{ measured: Measured; score: ChallengeScore } | null>(null);
  const limit = p.settings.practiceLimit;
  const reached = state.sessionReps >= limit;
  const rest = state.sessionReps > 0 && state.sessionReps % REST_EVERY === 0;
  const scale = Math.max(3.2, totalTime(target) * 1.05, result ? (result.measured.s1 + result.measured.s2s3 + result.measured.s4) * 1.05 : 0);

  const onDone = (measured: Measured) => {
    const score = scoreChallenge(target, measured, base);
    if (score.score >= 80) sfx.good();
    setResult({ measured, score });
    dispatch({ type: 'rep', profile: addPractice(p, { mode: 'challenge', target, measured, score: score.score, at: new Date().toISOString() }) });
  };

  return (
    <div className="screen-scroll">
      <div className="row">
        <button className="ghost small" onClick={() => dispatch({ type: 'go', screen: 'practice' })}>
          ← もどる
        </button>
        <h1>
          <R>{'{計測|けいそく}チャレンジ'}</R>
        </h1>
        <span className="muted small-text">
          <R>{`${state.sessionReps} / ${limit}{回|かい}`}</R>
        </span>
      </div>

      <div className="card challenge-target">
        <span className="muted small-text">
          <R>{'{目標|もくひょう}（{合図|あいず}の{音|おと}は{鳴|な}らない。{自分|じぶん}の{感覚|かんかく}で！）'}</R>
        </span>
        <div className="challenge-name">{target.name}</div>
        <p>
          <R>{describeDiff(target, base)}</R>
        </p>
        <SegmentLegend />
        <PatternBar p={target} scale={scale} showSeconds />
      </div>

      {!result ? (
        reached ? (
          <p className="center">
            <b>
              <R>{PRACTICE.limit}</R>
            </b>
          </p>
        ) : (
          <TapPad onDone={onDone} />
        )
      ) : (
        <div className="card">
          <h2>
            <R>{`{結果|けっか}：${result.score.score}{点|てん}`}</R>
          </h2>
          <p className="muted small-text">
            <R>{'{上|うえ}が{目標|もくひょう}、{下|した}が{今|いま}の1{球|きゅう}'}</R>
          </p>
          <PatternBar p={target} scale={scale} />
          <PatternBar p={{ s1: result.measured.s1, s2: result.measured.s2s3, s3: 0, s4: result.measured.s4 }} scale={scale} />
          <table className="table">
            <tbody>
              {result.score.parts.map((part) => (
                <tr key={part.key}>
                  <td className={`mark ${part.mark}`}>{PRACTICE.mark[part.mark]}</td>
                  <td>{PRACTICE.part[part.key]}</td>
                  <td>
                    <R>{`{目標|もくひょう} ${part.target.toFixed(2)} → ${part.measured.toFixed(2)}{秒|びょう}`}</R>
                  </td>
                  <td>
                    {part.diff >= 0 ? '+' : '−'}
                    {Math.abs(part.diff).toFixed(2)}
                    {part.intended && !part.clear ? ' ⚠' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={result.score.clear ? '' : 'warn'}>
            <R>{result.score.clear ? PRACTICE.clear : PRACTICE.notClear}</R>
          </p>
          {rest && !reached && (
            <p>
              <b>
                <R>{`${REST_EVERY}{回|かい}やった！${PRACTICE.rest}`}</R>
              </b>
            </p>
          )}
          <div className="row center-row wrap">
            <button onClick={() => dispatch({ type: 'go', screen: 'practice' })}>
              <R>{'パターンを{変|か}える'}</R>
            </button>
            <button className="primary big" disabled={reached} onClick={() => setResult(null)}>
              <R>{'もう1{回|かい}'}</R>
            </button>
          </div>
          {reached && (
            <p className="center">
              <b>
                <R>{PRACTICE.limit}</R>
              </b>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
