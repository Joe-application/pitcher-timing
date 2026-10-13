// モード2：練習メニュー。入るたびに「痛いところはない？」を聞く。

import { useState } from 'react';
import { unlockAudio } from '../../audio/cues';
import { describeDiff, PRACTICE, sec } from '../../game/messages';
import { PRESETS, presetPattern, SEQUENCES } from '../../practice/presets';
import { baselineOf, totalTime } from '../../sim/timing';
import type { TimingPattern } from '../../types';
import { R } from '../components/Ruby';
import { PatternBar, SegmentLegend } from '../components/Timeline';
import { useApp } from '../state';

function PainCheck() {
  const { dispatch } = useApp();
  const [stop, setStop] = useState(false);
  return (
    <div className="screen-scroll">
      <div className="card pain">
        {!stop ? (
          <>
            <h1>
              <R>{PRACTICE.painQuestion}</R>
            </h1>
            <div className="row center-row wrap">
              <button
                className="primary big"
                onClick={() => {
                  unlockAudio();
                  dispatch({ type: 'painOk' });
                }}
              >
                <R>{PRACTICE.painNo}</R>
              </button>
              <button className="danger big" onClick={() => setStop(true)}>
                <R>{PRACTICE.painYes}</R>
              </button>
            </div>
            <p className="muted">
              <R>{PRACTICE.shadowNote}</R>
            </p>
          </>
        ) : (
          <>
            <h1>🩹</h1>
            <p>
              <R>{PRACTICE.painStop}</R>
            </p>
            <div className="row center-row">
              <button className="primary" onClick={() => dispatch({ type: 'go', screen: 'home' })}>
                ホームへ
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function PracticeScreen() {
  const { state, dispatch } = useApp();
  const p = state.profile!;
  const base = baselineOf(p.baseline);
  const [seq, setSeq] = useState(0);

  if (!state.painOk) return <PainCheck />;

  const presets = PRESETS.map((d) => ({ pattern: presetPattern(d, base), hint: d.hint }));
  const all: { pattern: TimingPattern; hint?: string }[] = [...presets, ...p.patterns.map((pattern) => ({ pattern }))];
  const target = all.find((x) => x.pattern.id === state.practiceTarget?.id) ?? all[0];
  const limit = p.settings.practiceLimit;
  const reached = state.sessionReps >= limit;
  const choose = (pattern: TimingPattern) => dispatch({ type: 'practiceTarget', pattern });
  const scale = Math.max(3.2, totalTime(target.pattern) * 1.05);

  return (
    <div className="screen-scroll">
      <div className="row">
        <button className="ghost small" onClick={() => dispatch({ type: 'go', screen: 'home' })}>
          ← ホーム
        </button>
        <h1>
          <R>{'モード2：シャドー{練習|れんしゅう}'}</R>
        </h1>
      </div>
      <p className="small-text">
        <R>{`{今回|こんかい}の{練習|れんしゅう}：${state.sessionReps} / ${limit}{回|かい}`}</R>
        {reached && (
          <b>
            {'　'}
            <R>{PRACTICE.limit}</R>
          </b>
        )}
      </p>

      <div className="card">
        <h2>
          <R>{'① 「{自分|じぶん}のふつう」'}</R>
        </h2>
        {p.baseline ? (
          <p>
            <R>{`とまる ${sec(base.s1)}・あしあげ＋ため ${sec(base.s2 + base.s3, 2)}・ふみだし ${sec(base.s4, 2)}（${p.baseline.samples}{回|かい}の{平均|へいきん}）`}</R>
          </p>
        ) : (
          <p className="muted">
            <R>{'まだ{測|はか}っていない。いまは{目安|めやす}の{長|なが}さを{使|つか}っている。おうちの{人|ひと}やきょうだいに{計測係|けいそくがかり}をお{願|ねが}いして、{測|はか}ってみよう。'}</R>
          </p>
        )}
        <button disabled={reached} onClick={() => dispatch({ type: 'go', screen: 'measure' })}>
          <R>{p.baseline ? '⏱ {測|はか}りなおす' : '⏱ 「{自分|じぶん}のふつう」を{測|はか}る'}</R>
        </button>
      </div>

      <div className="card">
        <h2>
          <R>{'② {練習|れんしゅう}するパターンを{選|えら}ぶ'}</R>
        </h2>
        <div className="row wrap">
          {all.map((x) => (
            <button key={x.pattern.id} className={`small${x.pattern.id === target.pattern.id ? ' primary' : ''}`} onClick={() => choose(x.pattern)}>
              {x.pattern.createdFrom !== 'preset' ? '📒 ' : ''}
              {x.pattern.name}
            </button>
          ))}
        </div>
        <SegmentLegend />
        <PatternBar p={target.pattern} scale={scale} showSeconds />
        <p className="small-text">
          <b>{target.pattern.name}</b>：<R>{target.hint ?? describeDiff(target.pattern, base)}</R>
          <span className="muted">
            {'（'}
            <R>{describeDiff(target.pattern, base)}</R>
            {'）'}
          </span>
        </p>
        <div className="row wrap">
          <button
            className="primary"
            disabled={reached}
            onClick={() => {
              unlockAudio();
              dispatch({ type: 'practiceTarget', pattern: target.pattern });
              dispatch({ type: 'guide', kind: 'single' });
            }}
          >
            <R>{'🔔 ガイド{練習|れんしゅう}（{合図|あいず}に{合|あ}わせる）'}</R>
          </button>
          <button
            className="primary"
            disabled={reached}
            onClick={() => {
              unlockAudio();
              dispatch({ type: 'practiceTarget', pattern: target.pattern, screen: 'challenge' });
            }}
          >
            <R>{'🎯 {計測|けいそく}チャレンジ（{自分|じぶん}の{感覚|かんかく}で）'}</R>
          </button>
          <button onClick={() => dispatch({ type: 'practiceTarget', pattern: target.pattern, screen: 'video' })}>
            <R>{'🎥 {動画|どうが}で{測|はか}る（ひとりでも{測|はか}れる）'}</R>
          </button>
        </div>
      </div>

      <div className="card">
        <h2>
          <R>{'③ {試合|しあい}のつもりで'}</R>
        </h2>
        <div className="row wrap">
          <button
            disabled={reached}
            onClick={() => {
              unlockAudio();
              dispatch({ type: 'guide', kind: 'random' });
            }}
          >
            <R>{'🎲 ランダム{配球|はいきゅう}（{毎回|まいかい}パターンが{変|か}わる）'}</R>
          </button>
        </div>
        <div className="row wrap">
          <select value={seq} onChange={(e) => setSeq(Number(e.target.value))} aria-label="組み立て">
            {SEQUENCES.map((s, i) => (
              <option key={i} value={i}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            disabled={reached}
            onClick={() => {
              unlockAudio();
              dispatch({ type: 'guide', kind: 'sequence', sequence: seq });
            }}
          >
            <R>{'🧩 {組|く}み{立|た}て{練習|れんしゅう}（3{球|きゅう}1セット）'}</R>
          </button>
        </div>
      </div>
      <p className="muted small-text">
        <R>{PRACTICE.shadowNote}</R>
      </p>
    </div>
  );
}
