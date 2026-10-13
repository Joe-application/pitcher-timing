// モード2：ガイド練習（§5.2）。音の合図に合わせて体を動かす。
// 端末を置いて 2〜3m はなれても分かるよう、画面全体の色と大きな文字で次の動きを見せる。

import { useEffect, useRef, useState } from 'react';
import { scheduleCues, schedulePitchSounds, sfx, speak, stopSpeaking, unlockAudio } from '../../audio/cues';
import { PRACTICE, SEGMENT } from '../../game/messages';
import { PITCH } from '../../sim/constants';
import { addPractice, REST_EVERY } from '../../practice/log';
import { presetById, presetPattern, PRESETS, SEQUENCES } from '../../practice/presets';
import { baselineOf, marks, totalTime, type Segments } from '../../sim/timing';
import type { Profile, TimingPattern } from '../../types';
import { R } from '../components/Ruby';
import { PatternBar } from '../components/Timeline';
import { useApp } from '../state';

/** 「セット」の音までの時間（秒） */
const LEAD_IN = 0.8;
/** リリースのあと、次の球までの間（ミリ秒） */
const AFTER_MS = 1300;
const PAUSE_MS = 2200;

interface Active {
  pattern: TimingPattern;
  /** セット完了の時刻（performance.now() の時計） */
  setAtMs: number;
}

type Status = 'idle' | 'announce' | 'cue' | 'pause' | 'rest' | 'limit';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** いまの動きを大きく見せる */
function CueView({ active }: { active: Active }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    let id = requestAnimationFrame(function tick(t) {
      setNow(t);
      id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const p: Segments = active.pattern;
  const m = marks(p);
  const t = (now - active.setAtMs) / 1000;
  // [開始, 終了, 表示, 色]
  const phases: [number, number, string, string][] = [
    [-LEAD_IN, 0, 'セット', 'ready'],
    [0, m.lift, SEGMENT.s1.name, 's1'],
    [m.lift, m.forward, `${SEGMENT.s2.name}・${SEGMENT.s3.name}`, 's2'],
    [m.forward, m.release, SEGMENT.s4.name, 's4'],
    [m.release, m.release + 9, 'ナイス！', 'done'],
  ];
  const cur = phases.find((ph) => t < ph[1]) ?? phases[phases.length - 1];
  const k = Math.min(1, Math.max(0, (t - cur[0]) / (cur[1] - cur[0])));
  const next = cur[3] === 's1' ? 'ピッ' : cur[3] === 's2' ? 'ポン' : cur[3] === 's4' ? 'パン' : '';
  const scale = Math.max(3.2, totalTime(p) * 1.05);

  return (
    <div className={`cue-view ${cur[3]}`}>
      <div className="cue-word">{cur[2]}</div>
      {cur[3] !== 'done' && cur[3] !== 'ready' && (
        <>
          <div className="cue-bar">
            <div style={{ width: `${(1 - k) * 100}%` }} />
          </div>
          <div className="cue-next">
            <R>{`{次|つぎ}の{合図|あいず}：${next}`}</R>
          </div>
        </>
      )}
      <div className="cue-pattern">
        <PatternBar p={p} scale={scale} />
        <div className="cue-cursor" style={{ left: `${Math.min(100, Math.max(0, (t / scale) * 100))}%` }} />
      </div>
    </div>
  );
}

export function GuideScreen() {
  const { state, dispatch } = useApp();
  const profile = state.profile!;
  const base = baselineOf(profile.baseline);
  const { kind, sequence } = state.guide;
  const [status, setStatus] = useState<Status>('idle');
  const [active, setActive] = useState<Active | null>(null);
  const [current, setCurrent] = useState<TimingPattern | null>(null);
  const [count, setCount] = useState(0);

  // ループの中から最新の値を読むための入れ物
  const token = useRef(0);
  const profileRef = useRef<Profile>(profile);
  profileRef.current = profile;
  const repsRef = useRef(state.sessionReps);
  repsRef.current = state.sessionReps;
  const cancelCues = useRef<() => void>(() => {});
  const index = useRef(0);
  const lastRandom = useRef('');

  const pool = [...PRESETS.map((d) => presetPattern(d, base)), ...profile.patterns];
  const single = pool.find((x) => x.id === state.practiceTarget?.id) ?? pool[0];
  const limit = profile.settings.practiceLimit;

  const pick = (i: number): TimingPattern => {
    if (kind === 'sequence') {
      const ids = SEQUENCES[sequence]?.ids ?? SEQUENCES[0].ids;
      return presetPattern(presetById(ids[i % ids.length]), base);
    }
    if (kind === 'random') {
      const others = pool.filter((x) => x.id !== lastRandom.current);
      const p = others[Math.floor(Math.random() * others.length)] ?? pool[0];
      lastRandom.current = p.id;
      return p;
    }
    return single;
  };

  const stop = () => {
    token.current++;
    cancelCues.current();
    stopSpeaking();
    setActive(null);
    setStatus('idle');
  };

  const run = async () => {
    unlockAudio();
    const my = ++token.current;
    const alive = () => my === token.current;
    while (alive()) {
      const i = index.current;
      const pattern = pick(i);
      setCurrent(pattern);
      setStatus('announce');
      // サインのように、投げる前にパターン名を読み上げる
      if (kind !== 'single' || i === 0) await speak(pattern.name);
      if (!alive()) return;
      await speak('セット');
      if (!alive()) return;

      const cues = scheduleCues(pattern, profile.settings.cueSound, LEAD_IN);
      // 音が使えない端末でも、画面の合図だけで練習できるようにする
      const setAtMs = cues?.setAtMs ?? performance.now() + LEAD_IN * 1000;
      // リリースの合図のあと、ボールがミットに届く音（投げきった手ごたえ）
      const cancelMitt = schedulePitchSounds({ plateAt: setAtMs + (marks(pattern).release + PITCH.BALL_FLIGHT) * 1000 }, 'mitt');
      cancelCues.current = () => {
        cues?.cancel();
        cancelMitt();
      };
      setActive({ pattern, setAtMs });
      setStatus('cue');
      await sleep(setAtMs - performance.now() + marks(pattern).release * 1000 + AFTER_MS);
      if (!alive()) return;
      setActive(null);

      const rec = { mode: 'guide' as const, target: pattern, at: new Date().toISOString() };
      dispatch({ type: 'rep', profile: addPractice(profileRef.current, rec) });
      setCount((c) => c + 1);
      index.current = i + 1;
      const done = repsRef.current + 1;
      if (done >= limit) {
        sfx.fanfare();
        setStatus('limit');
        return;
      }
      if (done % REST_EVERY === 0) {
        sfx.whistle();
        setStatus('rest');
        return;
      }
      setStatus('pause');
      // 3球1セットの区切りでは、少し長く休む
      await sleep(kind === 'sequence' && (i + 1) % 3 === 0 ? PAUSE_MS * 2 : PAUSE_MS);
    }
  };

  // 画面を出るときは音を止める
  useEffect(
    () => () => {
      token.current++;
      cancelCues.current();
      stopSpeaking();
    },
    [],
  );

  const title = kind === 'single' ? single.name : kind === 'random' ? 'ランダム{配球|はいきゅう}' : `{組|く}み{立|た}て：${SEQUENCES[sequence]?.name ?? ''}`;
  // まだ始めていないときに見せるパターン（ランダムは始まるまで「？」）
  const shown = current ?? (kind === 'random' ? single : pick(0));

  return (
    <div className="guide">
      <div className="row guide-head">
        <button
          className="ghost small"
          onClick={() => {
            stop();
            dispatch({ type: 'go', screen: 'practice' });
          }}
        >
          ← もどる
        </button>
        <b>
          <R>{title}</R>
        </b>
        <span className="muted small-text">
          <R>{`${state.sessionReps} / ${limit}{回|かい}`}</R>
        </span>
      </div>

      {active ? (
        <CueView key={active.setAtMs} active={active} />
      ) : (
        <div className={`cue-view ${status}`}>
          {status === 'rest' && (
            <div className="cue-msg">
              <R>{`${REST_EVERY}{回|かい}やった！${PRACTICE.rest}`}</R>
            </div>
          )}
          {status === 'limit' && (
            <div className="cue-msg">
              <R>{PRACTICE.limit}</R>
            </div>
          )}
          {(status === 'idle' || status === 'announce' || status === 'pause') && (
            <>
              <div className="cue-name">{kind === 'random' && status === 'idle' ? '？' : shown.name}</div>
              {status === 'pause' && (
                <div className="cue-next">
                  <R>{'{次|つぎ}の{球|たま}の{準備|じゅんび}…'}</R>
                </div>
              )}
              {status === 'idle' && (
                <div className="cue-legend">
                  <span className="s2">
                    <R>{PRACTICE.cueNames.lift}</R>
                  </span>
                  <span className="s3">
                    <R>{PRACTICE.cueNames.forward}</R>
                  </span>
                  <span className="s4">
                    <R>{PRACTICE.cueNames.release}</R>
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="row center-row guide-foot">
        {status === 'idle' || status === 'rest' ? (
          <button className="primary big" onClick={() => void run()}>
            <R>{status === 'rest' ? '▶ {続|つづ}ける' : count > 0 ? '▶ {続|つづ}ける' : '▶ スタート'}</R>
          </button>
        ) : status === 'limit' ? (
          <button className="primary big" onClick={() => dispatch({ type: 'go', screen: 'home' })}>
            ホームへ
          </button>
        ) : (
          <button className="danger big" onClick={stop}>
            ■ ストップ
          </button>
        )}
      </div>
    </div>
  );
}
