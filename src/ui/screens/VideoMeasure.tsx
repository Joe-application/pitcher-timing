// モード2：動画で測る（§5.4）。計測係がいなくても、撮った動画をコマ送りして4点に印をつければ区間が出る。
// 動画は端末の中で再生するだけで、どこにも送らない。

import { useEffect, useRef, useState } from 'react';
import { sfx } from '../../audio/cues';
import { describeDiff, PRACTICE, sec } from '../../game/messages';
import { addPractice } from '../../practice/log';
import { baselineFrom, fromTaps, type Measured } from '../../practice/measure';
import { presetPattern, PRESETS } from '../../practice/presets';
import { scoreChallenge } from '../../practice/score';
import { baselineOf } from '../../sim/timing';
import { R } from '../components/Ruby';
import { useApp } from '../state';

const MARKS = ['セット（{止|と}まった）', '{足|あし}を{上|あ}げはじめた', '{前|まえ}へ{動|うご}き{出|だ}した', 'ボールをはなした'];
/** 1コマの長さ（秒）。ふつうの動画は1秒30コマ */
const FRAME = 1 / 30;
/** 「ふつう」にするのに必要な本数 */
const MIN_SAMPLES = 3;

export function VideoMeasureScreen() {
  const { state, dispatch } = useApp();
  const p = state.profile!;
  const base = baselineOf(p.baseline);
  const pool = [...PRESETS.map((d) => presetPattern(d, base)), ...p.patterns];
  const target = pool.find((x) => x.id === state.practiceTarget?.id) ?? pool[0];

  const video = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState('');
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [times, setTimes] = useState<(number | null)[]>([null, null, null, null]);
  const [samples, setSamples] = useState<Measured[]>([]);
  const [recorded, setRecorded] = useState(false);

  // 動画を入れかえたとき・画面を出るときに、前の動画を手放す
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const load = (f: File | undefined) => {
    if (!f) return;
    setUrl(URL.createObjectURL(f));
    setTimes([null, null, null, null]);
    setRecorded(false);
    setTime(0);
  };

  const seek = (t: number) => {
    const v = video.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.min(duration || v.duration || 0, Math.max(0, t));
  };
  const step = (d: number) => seek((video.current?.currentTime ?? 0) + d);
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  const next = times.findIndex((t) => t === null);
  const mark = (i: number) => {
    sfx.tap();
    setTimes(times.map((t, k) => (k === i ? (video.current?.currentTime ?? 0) : t)));
    setRecorded(false);
  };

  const all = times.every((t): t is number => t !== null);
  const measured = all ? fromTaps(times[0]! * 1000, times[1]! * 1000, times[2]! * 1000, times[3]! * 1000) : null;
  const score = measured ? scoreChallenge(target, measured, base) : null;
  const baseline = samples.length >= MIN_SAMPLES ? baselineFrom(samples) : null;

  const record = () => {
    if (!measured || !score) return;
    dispatch({ type: 'rep', profile: addPractice(p, { mode: 'video', target, measured, score: score.score, at: new Date().toISOString() }) });
    setRecorded(true);
  };

  return (
    <div className="screen-scroll">
      <div className="row">
        <button className="ghost small" onClick={() => dispatch({ type: 'go', screen: 'practice' })}>
          ← もどる
        </button>
        <h1>
          <R>{'{動画|どうが}で{測|はか}る'}</R>
        </h1>
      </div>
      <p className="small-text">
        <R>{'スマホを{置|お}いて、{横|よこ}からシャドーピッチングを{撮|と}ろう。{撮|と}った{動画|どうが}をコマ{送|おく}りして、4つの{瞬間|しゅんかん}に{印|しるし}をつける。{動画|どうが}はこの{端末|たんまつ}の{中|なか}だけで{使|つか}い、どこにも{送|おく}らない。'}</R>
      </p>
      <div className="row wrap">
        <label className="file-button primary">
          <R>{'🎥 {撮|と}る'}</R>
          <input type="file" accept="video/*" capture="environment" hidden onChange={(e) => load(e.target.files?.[0])} />
        </label>
        <label className="file-button">
          <R>{'📁 {動画|どうが}を{選|えら}ぶ'}</R>
          <input type="file" accept="video/*" hidden onChange={(e) => load(e.target.files?.[0])} />
        </label>
        <span className="muted small-text">
          <R>{`{目標|もくひょう}：${target.name}（${describeDiff(target, base)}）`}</R>
        </span>
      </div>

      {url && (
        <div className="video-grid">
          <div>
            <video
              ref={video}
              className="video"
              src={url}
              playsInline
              muted
              preload="auto"
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              onSeeked={(e) => setTime(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
            <input className="video-slider" type="range" min={0} max={duration || 0} step={0.01} value={time} onChange={(e) => seek(Number(e.target.value))} aria-label="再生位置" />
            <div className="row center-row wrap">
              <button className="small" onClick={() => step(-0.2)}>
                ⏪ 0.2
              </button>
              <button className="small" onClick={() => step(-FRAME)}>
                ◀ <R>{'1コマ'}</R>
              </button>
              <button onClick={toggle}>{playing ? '⏸' : '▶'}</button>
              <button className="small" onClick={() => step(FRAME)}>
                <R>{'1コマ'}</R> ▶
              </button>
              <button className="small" onClick={() => step(0.2)}>
                0.2 ⏩
              </button>
              <b>{time.toFixed(2)}</b>
            </div>
          </div>

          <div>
            <div className="mark-list">
              {MARKS.map((label, i) => (
                <button key={i} className={`mark-button m${i}${i === next ? ' next' : ''}`} onClick={() => mark(i)}>
                  <span>
                    {i + 1}. <R>{label}</R>
                  </span>
                  <b>{times[i] === null ? '—' : times[i]!.toFixed(2)}</b>
                </button>
              ))}
            </div>
            <p className="muted small-text">
              <R>{'その{瞬間|しゅんかん}で{動画|どうが}を{止|と}めて、ボタンを{押|お}す。{押|お}しなおすと{印|しるし}がつけなおせる。'}</R>
            </p>
            {all && !measured && (
              <p className="warn">
                <R>{'{印|しるし}の{順番|じゅんばん}がおかしい。1→4の{順|じゅん}に{時間|じかん}が{進|すす}むようにつけなおそう。'}</R>
              </p>
            )}
            {measured && score && (
              <div className="card">
                <h2>
                  <R>{`とまる ${sec(measured.s1, 2)}・あしあげ＋ため ${sec(measured.s2s3, 2)}・ふみだし ${sec(measured.s4, 2)}`}</R>
                </h2>
                <table className="table">
                  <tbody>
                    {score.parts.map((part) => (
                      <tr key={part.key}>
                        <td className={`mark ${part.mark}`}>{PRACTICE.mark[part.mark]}</td>
                        <td>{PRACTICE.part[part.key]}</td>
                        <td>
                          <R>{`{目標|もくひょう} ${part.target.toFixed(2)} → ${part.measured.toFixed(2)}{秒|びょう}`}</R>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className={score.clear ? '' : 'warn'}>
                  <R>{`${score.score}{点|てん}。${score.clear ? PRACTICE.clear : PRACTICE.notClear}`}</R>
                </p>
                <div className="row wrap">
                  <button className="primary" disabled={recorded} onClick={record}>
                    <R>{recorded ? '✓ {記録|きろく}した' : '{記録|きろく}する'}</R>
                  </button>
                  <button
                    onClick={() => {
                      setSamples([...samples, measured]);
                      setTimes([null, null, null, null]);
                    }}
                  >
                    <R>{`「{自分|じぶん}のふつう」の{計測|けいそく}に{足|た}す（いま${samples.length}{本|ほん}）`}</R>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {samples.length > 0 && (
        <div className="card">
          <p>
            <R>{`「{自分|じぶん}のふつう」{用|よう}の{計測|けいそく}：${samples.length}{本|ほん}`}</R>
            {baseline && (
              <b>
                <R>{`　{平均|へいきん}：とまる ${sec(baseline.s1, 2)}・あしあげ＋ため ${sec(baseline.s2 + baseline.s3, 2)}・ふみだし ${sec(baseline.s4, 2)}`}</R>
              </b>
            )}
          </p>
          {baseline ? (
            <button
              className="primary"
              onClick={() => {
                sfx.good();
                dispatch({ type: 'profile', profile: { ...p, baseline } });
                setSamples([]);
              }}
            >
              <R>{'これを「{自分|じぶん}のふつう」にする'}</R>
            </button>
          ) : (
            <p className="muted small-text">
              <R>{`いつものリズムの{動画|どうが}を、あと${MIN_SAMPLES - samples.length}{本|ほん}{測|はか}ると{平均|へいきん}が{出|で}る。`}</R>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
