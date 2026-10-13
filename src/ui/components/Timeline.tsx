// 振り返り用の図。区間の長さを色つきのバーで並べて、どこを変えたかが一目でわかるようにする。

import { RESULT, RESULT_SHORT, SEGMENT, ZONE } from '../../game/messages';
import { isBatterOut } from '../../sim/atBat';
import { changedSegments, liftToRelease, totalTime, type Segments } from '../../sim/timing';
import type { PitchRecord, SegmentKey } from '../../types';
import { R } from './Ruby';

const KEYS: SegmentKey[] = ['s1', 's2', 's3', 's4'];

/** 色の説明 */
export function SegmentLegend() {
  return (
    <div className="legend">
      {KEYS.map((k) => (
        <span key={k}>
          <i className={`dot ${k}`} />
          {SEGMENT[k].name}
        </span>
      ))}
    </div>
  );
}

interface BarProps {
  p: Segments;
  /** バーの右端が何秒か */
  scale: number;
  /** 前の球から変えた区間（矢印をつける） */
  changed?: Partial<Record<SegmentKey, 'longer' | 'shorter'>>;
  /** ▼ 打者が予想していたリリースの時刻（セットからの秒） */
  expectedRelease?: number;
  /** 牽制・外すのときは S1 だけ描く */
  eventOnly?: boolean;
  /** 区間の中に秒数を書く */
  showSeconds?: boolean;
}

/** 1球ぶんの区間バー */
export function PatternBar({ p, scale, changed, expectedRelease, eventOnly, showSeconds }: BarProps) {
  const keys = eventOnly ? (['s1'] as SegmentKey[]) : KEYS;
  return (
    <div className="bar-track">
      <div className="bar-row">
        {keys.map((k) => {
          const w = (p[k] / scale) * 100;
          const c = changed?.[k];
          return (
            <div key={k} className={`seg ${k}${c ? ' changed' : ''}`} style={{ width: `${w}%` }} title={`${SEGMENT[k].name} ${p[k].toFixed(2)}秒`}>
              {c && <span className="seg-arrow">{c === 'longer' ? '▶' : '◀'}</span>}
              {showSeconds && w > 9 && <span className="seg-sec">{p[k].toFixed(2)}</span>}
            </div>
          );
        })}
        {eventOnly && <span className="bar-event">👉</span>}
      </div>
      {expectedRelease !== undefined && (
        <div className="bar-expect" style={{ left: `${Math.min(100, (expectedRelease / scale) * 100)}%` }} title="打者が予想していたリリース">
          ▼
        </div>
      )}
    </div>
  );
}

function changes(prev: Segments | null, cur: Segments): BarProps['changed'] {
  if (!prev) return undefined;
  const out: BarProps['changed'] = {};
  for (const k of changedSegments(prev, cur)) out[k] = cur[k] > prev[k] ? 'longer' : 'shorter';
  return out;
}

const toneOf = (r: PitchRecord) => (r.runnerEvent === 'steal' ? 'bad' : r.runnerEvent === 'caughtStealing' ? 'good' : RESULT[r.result].tone);

/** 1打席の各球を並べたタイムライン */
export function Timeline({ records }: { records: PitchRecord[] }) {
  const scale = Math.max(3, ...records.map((r) => (r.pattern.event ? r.pattern.s1 : totalTime(r.pattern)))) * 1.05;
  const isThrown = (r: PitchRecord) => !r.pattern.event && r.result !== 'balk' && !r.warnings.includes('delay');
  /** その球の前に、実際に投げた球 */
  const prevOf = (i: number): Segments | null => records.slice(0, i).findLast(isThrown)?.pattern ?? null;
  return (
    <div className="timeline">
      <SegmentLegend />
      {records.map((r, i) => {
        const isEvent = !!r.pattern.event;
        const thrown = isThrown(r);
        const changed = thrown ? changes(prevOf(i), r.pattern) : undefined;
        const same = thrown && r.sameStreak >= 2;
        return (
          <div key={i} className={`tl-row ${toneOf(r)}`}>
            <div className="tl-no">{i + 1}</div>
            <div className="tl-bar">
              <PatternBar
                p={r.pattern}
                scale={scale}
                changed={changed}
                eventOnly={isEvent}
                expectedRelease={thrown ? r.pattern.s1 + r.batterExpectation.liftToRelease : undefined}
              />
              {same && (
                <div className="tl-same">
                  <R>{`{同|おな}じリズム ${r.sameStreak}{球目|きゅうめ}`}</R>
                </div>
              )}
            </div>
            <div className="tl-result">
              <b>
                <R>{RESULT_SHORT[r.result]}</R>
              </b>
              {r.timing && r.swung && (
                <span className="tl-ms">
                  {r.timing === 'just' ? '◎' : ''}
                  {r.timingErrorMs > 0 ? '+' : ''}
                  {r.timingErrorMs}ms
                </span>
              )}
              {r.location && (
                <span className={`tl-ms tl-zone ${r.zone ?? ''}`}>
                  <R>{ZONE.name(r.location, r.batterHand)}</R>
                </span>
              )}
              {r.runnerEvent && <span className="tl-ms">{r.runnerEvent === 'steal' ? '🏃盗塁' : '🏃アウト'}</span>}
            </div>
          </div>
        );
      })}
      <p className="muted small-text tl-note">
        <R>{'▼ ＝ {打者|だしゃ}が「ここでボールが{来|く}る」と{予想|よそう}していたところ。バーの{右端|みぎはし}（{実際|じっさい}のリリース）とはなれているほど、タイミングがずれた。'}</R>
      </p>
    </div>
  );
}

/** 打者の「予想」と「実際」のずれ。打者が合わせてくる様子が見える */
export function ExpectationChart({ records }: { records: PitchRecord[] }) {
  const pitches = records.filter((r) => !r.pattern.event && r.result !== 'balk' && !r.warnings.includes('delay'));
  if (pitches.length === 0) return null;
  const actual = pitches.map((r) => liftToRelease(r.pattern));
  const expected = pitches.map((r) => r.batterExpectation.liftToRelease);
  const lo = Math.min(...actual, ...expected) - 0.1;
  const hi = Math.max(...actual, ...expected) + 0.1;
  const W = 320;
  const H = 130;
  const padL = 34;
  const padR = 12;
  const x = (i: number) => (pitches.length === 1 ? (padL + W - padR) / 2 : padL + ((W - padL - padR) * i) / (pitches.length - 1));
  const y = (v: number) => 14 + (H - 38) * (1 - (v - lo) / (hi - lo));
  const path = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <div className="expect-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="打者の予想と実際の投球の長さ">
        {[lo + 0.1, (lo + hi) / 2, hi - 0.1].map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1" />
            <text x={padL - 5} y={y(v) + 3.5} textAnchor="end" className="chart-tick">
              {v.toFixed(1)}
            </text>
          </g>
        ))}
        {pitches.map((r, i) => (
          <g key={i}>
            <line x1={x(i)} x2={x(i)} y1={y(actual[i])} y2={y(expected[i])} stroke={isBatterOut(r) || r.result === 'swingMiss' ? 'var(--go)' : 'var(--muted)'} strokeWidth="3" opacity="0.5" />
            <text x={x(i)} y={H - 6} textAnchor="middle" className="chart-tick">
              {i + 1}
            </text>
          </g>
        ))}
        <path d={path(expected)} fill="none" stroke="var(--stop)" strokeWidth="2" strokeDasharray="5 4" />
        <path d={path(actual)} fill="none" stroke="var(--ok)" strokeWidth="2.5" />
        {pitches.map((_, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(expected[i])} r="4" fill="var(--card)" stroke="var(--stop)" strokeWidth="2" />
            <circle cx={x(i)} cy={y(actual[i])} r="4.5" fill="var(--ok)" />
          </g>
        ))}
      </svg>
      <div className="legend">
        <span>
          <i className="dot actual" />
          <R>{'{実際|じっさい}（{足|あし}あげ→リリースの{秒|びょう}）'}</R>
        </span>
        <span>
          <i className="dot expected" />
          <R>{'{打者|だしゃ}の{予想|よそう}'}</R>
        </span>
      </div>
      <p className="muted small-text">
        <R>{'{点|てん}と{点|てん}がはなれているほど、{打者|だしゃ}のタイミングがずれた。{同|おな}じリズムを{続|つづ}けると、{赤|あか}い{点線|てんせん}が{青|あお}い{線|せん}に{近|ちか}づいてくる。'}</R>
      </p>
    </div>
  );
}
