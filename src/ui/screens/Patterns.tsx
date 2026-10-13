// マイパターン帳：自分のずらしパターンを作って、名前をつける。

import { useState } from 'react';
import { describeDiff, RULE_NOTE, SEGMENT, WARNING } from '../../game/messages';
import { CARD_LIMITS, RULES } from '../../sim/constants';
import { baselineOf, checkRules, totalTime } from '../../sim/timing';
import { MAX_PATTERNS } from '../../storage/profile';
import type { TimingPattern } from '../../types';
import { R } from '../components/Ruby';
import { PatternBar, SegmentLegend } from '../components/Timeline';
import { useApp } from '../state';

/** スライダーの範囲（秒） */
const RANGE = {
  s1: [RULES.MIN_SET_STOP, CARD_LIMITS.s1[1]],
  s3: CARD_LIMITS.s3,
} as const;

export function PatternsScreen() {
  const { state, dispatch } = useApp();
  const p = state.profile!;
  const base = baselineOf(p.baseline);
  const [draft, setDraft] = useState({ name: '', s1: base.s1, s3: base.s3 });
  const draftPattern: TimingPattern = { id: 'draft', name: draft.name, s1: draft.s1, s2: base.s2, s3: draft.s3, s4: base.s4, event: null, createdFrom: 'custom' };
  const warnings = checkRules(draftPattern, { runnerOn: true, minSetStop: p.settings.minSetStop, maxTopHold: p.settings.maxTopHold, topHoldWarning: p.settings.topHoldWarning });
  const full = p.patterns.length >= MAX_PATTERNS;
  const scale = Math.max(3.6, ...p.patterns.map(totalTime), totalTime(draftPattern)) * 1.05;

  const save = (patterns: TimingPattern[]) => dispatch({ type: 'profile', profile: { ...p, patterns } });
  const add = () => {
    const name = draft.name.trim().slice(0, 12) || `パターン${p.patterns.length + 1}`;
    save([...p.patterns, { ...draftPattern, id: `m${Date.now().toString(36)}`, name }]);
    setDraft({ ...draft, name: '' });
  };

  return (
    <div className="screen-scroll">
      <div className="row">
        <button className="ghost small" onClick={() => dispatch({ type: 'go', screen: 'home' })}>
          ← ホーム
        </button>
        <h1>
          <R>{'マイパターン{帳|ちょう}'}</R>
        </h1>
      </div>

      <div className="card">
        <SegmentLegend />
        {p.patterns.length === 0 && (
          <p className="muted">
            <R>{'まだパターンがない。{下|した}で{作|つく}るか、モード1でうまく{打|う}ち{取|と}った{球|たま}を{保存|ほぞん}しよう。'}</R>
          </p>
        )}
        {p.patterns.map((x) => (
          <div key={x.id} className="pattern-item">
            <div className="row">
              <input
                value={x.name}
                maxLength={12}
                aria-label="パターンの名前"
                onChange={(e) => save(p.patterns.map((y) => (y.id === x.id ? { ...y, name: e.target.value } : y)))}
              />
              <button className="small" onClick={() => dispatch({ type: 'practiceTarget', pattern: x, screen: 'practice' })}>
                <R>{'🏠 {練習|れんしゅう}'}</R>
              </button>
              <button className="ghost small" aria-label={`${x.name} を消す`} onClick={() => confirm(`「${x.name}」を消しますか？`) && save(p.patterns.filter((y) => y.id !== x.id))}>
                🗑
              </button>
            </div>
            <PatternBar p={x} scale={scale} showSeconds />
            <p className="small-text muted">
              <R>{describeDiff(x, base)}</R>
            </p>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>
          <R>{'{新|あたら}しいパターンを{作|つく}る'}</R>
        </h2>
        {(['s1', 's3'] as const).map((k) => (
          <label key={k} className={`slider ${k}`}>
            <span>
              {SEGMENT[k].name} <b>{draft[k].toFixed(2)}</b>
              <R>{'{秒|びょう}'}</R>
            </span>
            <input type="range" min={RANGE[k][0]} max={RANGE[k][1]} step={0.05} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })} />
          </label>
        ))}
        <p className="muted small-text">
          <R>{'{足|あし}を{上|あ}げる{速|はや}さ（あしあげ）は、いつも{同|おな}じ。{変|か}えるのは「とまる」と「ため」。'}</R>
        </p>
        <PatternBar p={draftPattern} scale={scale} showSeconds />
        <p className="small-text">
          <R>{describeDiff(draftPattern, base)}</R>
        </p>
        {warnings
          .filter((w) => w !== 'balk')
          .map((w) => (
            <p key={w} className="warn">
              <R>{WARNING[w]}</R>
            </p>
          ))}
        <div className="row wrap">
          <input value={draft.name} maxLength={12} placeholder="名前（例：ためため、ながすぐ）" onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="新しいパターンの名前" />
          <button className="primary" disabled={full} onClick={add}>
            <R>{'{保存|ほぞん}する'}</R>
          </button>
        </div>
        {full && (
          <p className="muted">
            <R>{`{保存|ほぞん}できるのは${MAX_PATTERNS}{個|こ}まで`}</R>
          </p>
        )}
        <p className="muted small-text">
          <R>{RULE_NOTE}</R>
        </p>
      </div>
    </div>
  );
}
