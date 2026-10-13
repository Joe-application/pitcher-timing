// 対戦モード：1台の端末を2人で使う。投手は「とまる・あしあげ・ため」とコースを打者に見えないように選び、
// 打者は投球を見て「振る！」をタイミングよく押す。投手をコンピューターにすれば、1人でバッティング練習もできる。

import { useEffect, useMemo, useRef, useState } from 'react';
import { schedulePitchSounds, sfx, unlockAudio, type PlateSound } from '../../audio/cues';
import { describeDiff, HAND, RESULT, TIMING, VERSUS, ZONE } from '../../game/messages';
import { initGame, isBatterOut, throwPitch, type GameConfig, type GameState } from '../../sim/atBat';
import { CARD_LEVELS, PITCH, TIMING_BANDS } from '../../sim/constants';
import { randomSeed } from '../../sim/rng';
import { baselineOf, fromCards, NORMAL_CARDS, totalTime, type Cards } from '../../sim/timing';
import type { BatterSpot, Cell, Hand, PitchRecord } from '../../types';
import { CardPicker } from '../components/CardPicker';
import { Diamond, Dots } from '../components/Hud';
import { R } from '../components/Ruby';
import { Scene, type PitchClock } from '../components/Scene';
import { PatternBar, SegmentLegend } from '../components/Timeline';
import { ZonePicker } from '../components/ZonePicker';
import { useApp } from '../state';

type PitcherKind = 'human' | 'cpuEasy' | 'cpuHard';
type Phase = 'setup' | 'pick' | 'ready' | 'live' | 'shown' | 'change' | 'final';

interface Setup {
  names: [string, string];
  hands: [Hand, Hand];
  innings: number;
  pitcher: PitcherKind;
}

/** 「かまえた！」を押してから、セット完了までの時間 */
const LEAD_MS = 900;
/** ボールが届いたあと、ここまでに押せば「振った」ことにする（これを過ぎたら見送り） */
const LATE_WINDOW_MS = 300;
const FLIGHT_MS = PITCH.BALL_FLIGHT * 1000;
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

/** コンピューターの投手。やさしい＝同じリズムが多い、むずかしい＝毎球ばらばら */
function cpuChoice(kind: PitcherKind, prev: Cards | null): { cards: Cards; aim: Cell } {
  const same = kind === 'cpuEasy' && prev && Math.random() < 0.6;
  const cards: Cards = same ? prev : { s1: pick(CARD_LEVELS.s1), s2: pick(CARD_LEVELS.s2), s3: pick(CARD_LEVELS.s3) };
  // ほとんどはストライクゾーン、ときどきボールゾーン
  const ball = Math.random() < (kind === 'cpuEasy' ? 0.15 : 0.3);
  const aim = ball ? { x: pick([0, 4]), y: pick([0, 1, 2, 3, 4]) } : { x: pick([1, 2, 3]), y: pick([1, 2, 3]) };
  return { cards, aim };
}

function plateSound(r: PitchRecord): PlateSound {
  if (!r.swung || r.result === 'swingMiss') return 'mitt';
  if (r.result === 'homeRun') return 'homeRun';
  if (r.result === 'extraBase') return 'pingBig';
  if (r.result === 'hit') return 'ping';
  return r.timing === 'just' ? 'ping' : 'dull';
}

/** 打者に見せるタイミングの言葉 */
function swingText(r: PitchRecord): string {
  if (!r.swung) return '';
  const ms = Math.abs(r.timingErrorMs);
  if (ms <= TIMING_BANDS.just * 1000) return `ジャスト！（${ms}ms）`;
  return r.timingErrorMs > 0 ? `${ms}ms {早|はや}い` : `${ms}ms {遅|おそ}い`;
}

export function VersusScreen() {
  const { state, dispatch } = useApp();
  const base = useMemo(() => baselineOf(state.profile?.baseline), [state.profile?.baseline]);
  const [setup, setSetup] = useState<Setup>({ names: [state.profile?.nickname ?? '1P', '2P'], hands: ['R', 'R'], innings: 1, pitcher: 'human' });
  const [phase, setPhase] = useState<Phase>('setup');
  /** いま何回目の攻撃か（0 から。偶数は names[1] が打つ） */
  const [half, setHalf] = useState(0);
  const [runs, setRuns] = useState<[number, number]>([0, 0]);
  const [cfg, setCfg] = useState<GameConfig | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [cards, setCards] = useState<Cards>(NORMAL_CARDS);
  const [aim, setAim] = useState<Cell | null>(null);
  const [clock, setClock] = useState<PitchClock | null>(null);
  const [record, setRecord] = useState<PitchRecord | null>(null);
  /** リリースのあと、打者に見せるボールの行き先 */
  const [incoming, setIncoming] = useState<Cell | null>(null);
  /** 打者ごとの記録（振った球のタイミング） */
  const [swings, setSwings] = useState<[number[], number[]]>([[], []]);

  // 投球中の値（タイマーやタップから読む）
  const live = useRef<{
    plateAt: number;
    done: boolean;
    next: GameState | null;
    timers: number[];
    cancel: () => void;
    finish: (human: { swung: boolean; errorMs: number }) => void;
  } | null>(null);
  const prevCpu = useRef<Cards | null>(null);

  const cpu = setup.pitcher !== 'human';
  /** 打者：表（偶数）は 2人目、裏は 1人目。コンピューターが投手のときは、いつも 1人目が打つ */
  const batterIdx = cpu ? 0 : half % 2 === 0 ? 1 : 0;
  const pitcherIdx = 1 - batterIdx;
  const batterName = setup.names[batterIdx];
  const pitcherName = cpu ? VERSUS.cpuName : setup.names[pitcherIdx];
  const totalHalves = cpu ? setup.innings : setup.innings * 2;
  const spot: BatterSpot = { type: 'straight', hand: setup.hands[batterIdx], order: 1, hot: [], cold: [] };

  const clearLive = () => {
    live.current?.timers.forEach((t) => window.clearTimeout(t));
    live.current?.cancel();
    live.current = null;
  };
  useEffect(() => clearLive, []);

  const startHalf = (h: number) => {
    const bi = cpu ? 0 : h % 2 === 0 ? 1 : 0;
    const c: GameConfig = {
      stageId: 'versus',
      lineup: [{ type: 'straight', hand: setup.hands[bi], order: 1, hot: [], cold: [] }],
      base,
      seed: randomSeed(),
      stealing: false,
      outsToClear: 3,
      maxRuns: 99,
      strikeRate: state.profile?.settings.strikeRate,
      balkCheck: false,
    };
    setCfg(c);
    setGame(initGame(c));
    setHalf(h);
    setCards(NORMAL_CARDS);
    setAim(null);
    setRecord(null);
    prevCpu.current = null;
    setPhase(cpu ? 'ready' : 'pick');
  };

  // ---- 1球 ----

  const startPitch = () => {
    if (!cfg || !game) return;
    unlockAudio();
    let c = cards;
    let a = aim;
    if (cpu) {
      const choice = cpuChoice(setup.pitcher, prevCpu.current);
      c = choice.cards;
      a = choice.aim;
      prevCpu.current = c;
      setCards(c);
      setAim(a);
    }
    if (!a) return;
    const p = fromCards(base, c);
    const setAt = performance.now() + LEAD_MS;
    const liftAt = setAt + p.s1 * 1000;
    const forwardAt = liftAt + (p.s2 + p.s3) * 1000;
    const releaseAt = forwardAt + p.s4 * 1000;
    const plateAt = releaseAt + FLIGHT_MS;
    // ボールの行き先は、振る・振らないに関係なく同じなので、先に計算しておく
    const preview = throwPitch(cfg, game, p, a, { swung: false, errorMs: 0 }).record.location ?? a;
    const cancel = schedulePitchSounds({ setAt, liftAt, topAt: liftAt + p.s2 * 1000, holdUntil: forwardAt, forwardAt, releaseAt });

    const finish = (human: { swung: boolean; errorMs: number }) => {
      const L = live.current;
      if (!L || L.done) return;
      L.done = true;
      const o = throwPitch(cfg, game, p, a, human);
      L.next = o.state;
      setRecord(o.record);
      const now = performance.now();
      const sound = schedulePitchSounds({ plateAt: Math.max(now, plateAt), swingAt: human.swung ? now : undefined }, plateSound(o.record));
      const old = L.cancel;
      L.cancel = () => {
        old();
        sound();
      };
    };

    clearLive();
    live.current = {
      plateAt,
      done: false,
      next: null,
      cancel,
      finish,
      timers: [
        // リリースの瞬間に、ボールの行き先を見せる（見きわめの練習）
        window.setTimeout(() => setIncoming(preview), releaseAt - performance.now()),
        // 振らなかったら見送り
        window.setTimeout(() => finish({ swung: false, errorMs: 0 }), plateAt + LATE_WINDOW_MS - performance.now()),
      ],
    };
    setRecord(null);
    setIncoming(null);
    setClock({ setAt, liftAt, s2: p.s2, forwardAt, s4: p.s4 });
    setPhase('live');
  };

  /** 打者が「振る！」を押した */
  const swing = (t: number) => {
    const L = live.current;
    if (!L || L.done || phase !== 'live') return;
    // 正なら早すぎ、負なら振りおくれ
    L.finish({ swung: true, errorMs: Math.round(L.plateAt - t) });
  };

  const onAnimDone = () => {
    const L = live.current;
    if (!L || !L.next || !record) return;
    const next = L.next;
    live.current = null;
    setClock(null);
    setGame(next);
    if (record.swung) setSwings((s) => (batterIdx === 0 ? [[...s[0], record.timingErrorMs], s[1]] : [s[0], [...s[1], record.timingErrorMs]]));
    if (record.runsScored > 0) {
      setRuns((r) => (batterIdx === 0 ? [r[0] + record.runsScored, r[1]] : [r[0], r[1] + record.runsScored]));
      sfx.run();
    } else if (isBatterOut(record)) {
      if (record.result === 'swingMiss' || record.result === 'take') sfx.strikeout();
      else sfx.out();
    }
    setPhase('shown');
  };

  const afterShown = () => {
    if (!game) return;
    setIncoming(null);
    if (game.outs >= 3) {
      setPhase(half + 1 >= totalHalves ? 'final' : 'change');
      if (half + 1 >= totalHalves) sfx.fanfare();
      return;
    }
    if (record?.atBatEnd) setAim(null);
    setPhase(cpu ? 'ready' : 'pick');
  };

  const back = () => {
    clearLive();
    dispatch({ type: 'go', screen: 'home' });
  };

  // ---- 表示 ----

  if (phase === 'setup') {
    const set = (patch: Partial<Setup>) => setSetup({ ...setup, ...patch });
    return (
      <div className="screen-scroll">
        <div className="row">
          <button className="ghost small" onClick={back}>
            ← ホーム
          </button>
          <h1>
            <R>{VERSUS.title}</R>
          </h1>
        </div>
        <div className="card">
          <p>
            <R>{VERSUS.intro}</R>
          </p>
          <h2>
            <R>{VERSUS.pitcherKind}</R>
          </h2>
          <div className="row wrap">
            {(['human', 'cpuEasy', 'cpuHard'] as const).map((k) => (
              <button key={k} className={setup.pitcher === k ? 'primary' : ''} onClick={() => set({ pitcher: k })}>
                <R>{VERSUS.kinds[k]}</R>
              </button>
            ))}
          </div>
          {[0, 1].map((i) =>
            cpu && i === 1 ? null : (
              <div key={i} className="row wrap">
                <input
                  value={setup.names[i]}
                  maxLength={8}
                  aria-label={`${i + 1}人目の名前`}
                  onChange={(e) => set({ names: i === 0 ? [e.target.value, setup.names[1]] : [setup.names[0], e.target.value] })}
                />
                {(['R', 'L'] as const).map((h) => (
                  <button
                    key={h}
                    className={`small${setup.hands[i] === h ? ' primary' : ''}`}
                    onClick={() => set({ hands: i === 0 ? [h, setup.hands[1]] : [setup.hands[0], h] })}
                  >
                    <R>{HAND[h]}</R>
                  </button>
                ))}
              </div>
            ),
          )}
          <div className="row wrap">
            <span>
              <R>{cpu ? VERSUS.rounds : VERSUS.innings}</R>
            </span>
            {[1, 2, 3].map((n) => (
              <button key={n} className={`small${setup.innings === n ? ' primary' : ''}`} onClick={() => set({ innings: n })}>
                {n}
              </button>
            ))}
          </div>
          <div className="row center-row">
            <button
              className="primary big"
              onClick={() => {
                unlockAudio();
                setRuns([0, 0]);
                setSwings([[], []]);
                startHalf(0);
              }}
            >
              プレイボール！
            </button>
          </div>
        </div>
        <p className="muted small-text">
          <R>{VERSUS.howTo}</R>
        </p>
      </div>
    );
  }

  if (!cfg || !game) return null;
  const inningNo = cpu ? half + 1 : Math.floor(half / 2) + 1;
  const scoreLine = cpu ? `${batterName} ${runs[0]}{点|てん}` : `${setup.names[0]} ${runs[0]} − ${runs[1]} ${setup.names[1]}`;
  const pattern = fromCards(base, cards);
  const stat = (xs: number[]) => {
    if (xs.length === 0) return '—';
    const just = xs.filter((x) => Math.abs(x) <= TIMING_BANDS.just * 1000).length;
    const avg = Math.round(xs.reduce((a, x) => a + Math.abs(x), 0) / xs.length);
    return `${xs.length}{回|かい}{振|ふ}って ジャスト${just}{回|かい}・ずれの{平均|へいきん} ${avg}ms`;
  };

  return (
    <div className="battle versus">
      <header className="hud">
        <button className="ghost small" onClick={() => confirm('対戦をやめますか？') && back()}>
          ✕
        </button>
        <span className="hud-stage">
          <b>
            <R>{cpu ? `${inningNo}{回目|かいめ}` : `${inningNo}{回|かい}${half % 2 === 0 ? 'オモテ' : 'ウラ'}`}</R>
          </b>{' '}
          <R>{scoreLine}</R>
        </span>
        <span className="hud-count">
          <Dots label="B" n={Math.min(3, game.balls)} max={3} kind="b" />
          <Dots label="S" n={Math.min(2, game.strikes)} max={2} kind="s" />
          <Dots label="O" n={Math.min(2, game.outs)} max={2} kind="o" />
        </span>
        <Diamond bases={game.bases} />
      </header>

      <div className="battle-main versus-main">
        {/* 投手が選ぶ画面：打者には見せない */}
        {phase === 'pick' && (
          <div className="card versus-pick">
            <h2>
              <R>{`🤫 ${pitcherName} の{番|ばん}（ピッチャー）`}</R>
            </h2>
            <p className="warn">
              <R>{`${batterName} は{画面|がめん}を{見|み}ないで！`}</R>
            </p>
            <div className="at-bat-row">
              <ZonePicker spot={spot} aim={aim} onAim={(c) => (sfx.select(), setAim(c))} />
              <p className={`aim-text${aim ? '' : ' need'}`}>
                <R>{aim ? `🎯 ${ZONE.name(aim, spot.hand)}` : `👆 ${ZONE.pick}`}</R>
              </p>
            </div>
            <CardPicker seg="s1" value={cards.s1} onChange={(v) => setCards({ ...cards, s1: v })} />
            <CardPicker seg="s2" value={cards.s2} onChange={(v) => setCards({ ...cards, s2: v })} />
            <CardPicker seg="s3" value={cards.s3} onChange={(v) => setCards({ ...cards, s3: v })} />
            <div className="row center-row">
              <button className="primary big" disabled={!aim} onClick={() => setPhase('ready')}>
                <R>{VERSUS.decided}</R>
              </button>
            </div>
          </div>
        )}

        {/* 打者の画面 */}
        {(phase === 'ready' || phase === 'live' || phase === 'shown') && (
          <>
            <div className="battle-scene">
              <Scene clock={clock} record={phase === 'live' ? record : null} onDone={onAnimDone} />
              {phase === 'shown' && record && (
                <div className={`banner ${RESULT[record.result].tone === 'good' ? 'bad' : RESULT[record.result].tone === 'bad' ? 'good' : ''}`}>
                  <b>
                    <R>{VERSUS.result[record.result] ?? RESULT[record.result].text}</R>
                  </b>
                  {record.swung && (
                    <span>
                      <R>{swingText(record)}</R>
                    </span>
                  )}
                  {record.location && (
                    <span>
                      <R>{ZONE.name(record.location, spot.hand)}</R>
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="battle-side">
              {phase === 'ready' && (
                <div className="card center">
                  <h2>
                    <R>{`⚾ ${batterName} の{番|ばん}（バッター）`}</R>
                  </h2>
                  <p>
                    <R>{VERSUS.batterHow}</R>
                  </p>
                  <button className="primary big" onClick={startPitch}>
                    <R>{VERSUS.ready}</R>
                  </button>
                </div>
              )}
              {phase === 'live' && (
                <>
                  <div className="versus-incoming">
                    <ZonePicker spot={spot} aim={null} last={incoming} disabled />
                  </div>
                  <button
                    className="swing-button"
                    onPointerDown={() => swing(performance.now())}
                    onContextMenu={(e) => e.preventDefault()}
                    disabled={record !== null}
                  >
                    <R>{VERSUS.swing}</R>
                  </button>
                </>
              )}
              {phase === 'shown' && record && (
                <div className="card">
                  <h3>
                    <R>{`${pitcherName} が{選|えら}んだ{間|ま}`}</R>
                  </h3>
                  <SegmentLegend />
                  <PatternBar p={record.pattern} scale={Math.max(3.4, totalTime(record.pattern) * 1.05)} showSeconds />
                  <p className="small-text">
                    <R>{describeDiff(pattern, base)}</R>
                    {record.aim && (
                      <span className="muted">
                        {' ／ '}
                        <R>{`ねらい：${ZONE.name(record.aim, spot.hand)}`}</R>
                      </span>
                    )}
                  </p>
                  {record.swung && record.timing && (
                    <p>
                      <b>
                        <R>{`${batterName} のタイミング：${swingText(record)}`}</R>
                      </b>{' '}
                      <span className="muted">
                        <R>{`（${TIMING[record.timing].replace('（{合|あ}わされた）', '')}）`}</R>
                      </span>
                    </p>
                  )}
                  <div className="row center-row">
                    <button className="primary big" onClick={afterShown}>
                      <R>{game.outs >= 3 ? VERSUS.changeSides : VERSUS.nextPitch}</R>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {phase === 'change' && (
          <div className="card center">
            <h1>
              <R>{cpu ? VERSUS.roundEnd : VERSUS.change}</R>
            </h1>
            <p className="big-score">
              <R>{scoreLine}</R>
            </p>
            <button className="primary big" onClick={() => startHalf(half + 1)}>
              <R>{cpu ? VERSUS.nextRound : VERSUS.nextHalf}</R>
            </button>
          </div>
        )}

        {phase === 'final' && (
          <div className="card center">
            <h1>
              <R>{cpu ? VERSUS.finish : runs[0] === runs[1] ? VERSUS.draw : `${runs[0] > runs[1] ? setup.names[0] : setup.names[1]} の{勝|か}ち！`}</R>
            </h1>
            <p className="big-score">
              <R>{scoreLine}</R>
            </p>
            <div className="versus-stats">
              {[0, 1].map((i) =>
                cpu && i === 1 ? null : (
                  <p key={i}>
                    <b>{setup.names[i]}</b>
                    <R>{`（バッター）：${stat(swings[i])}`}</R>
                  </p>
                ),
              )}
            </div>
            <div className="row center-row wrap">
              <button onClick={back}>ホームへ</button>
              <button className="primary big" onClick={() => setPhase('setup')}>
                <R>{'もう1{回|かい}'}</R>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
