// モード1：勝負画面。1球ずつ「間」を決めて投げ、打席が終わったら振り返りを見る。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audioContext, schedulePitchSounds, sfx, unlockAudio, type PlateSound } from '../../audio/cues';
import { BATTER, BUTTONS, describeDiff, managerComment, PICKOFF, preHint, RESULT, RUNNER_EVENT, STEAL_COMMENT, timingText, WARNING, ZONE } from '../../game/messages';
import { addGameStats, earnedBadges, rankIndex, rankPoints, REALTIME_RANK, summarize } from '../../game/progression';
import { stageById, type StageDef } from '../../game/stages';
import { initGame, isBatterOut, isCleared, isOver, runnerOn, throwPitch, type GameConfig, type GameState, type PitchOutcome } from '../../sim/atBat';
import { RULES, type CardLevel } from '../../sim/constants';
import { randomSeed } from '../../sim/rng';
import { baselineOf, flightOf, fromCards, NORMAL_CARDS, type Cards } from '../../sim/timing';
import { MAX_PATTERNS } from '../../storage/profile';
import type { BatterSpot, Cell, PickoffBase, PickoffMove, PitchEvent, PitchRecord, PitchType, TimingPattern } from '../../types';
import { Board } from '../components/Board';
import { CardPicker, PitchTypePicker } from '../components/CardPicker';
import { PickoffButtons } from '../components/PickoffButtons';
import { BatterCard, Diamond, Dots, Manager } from '../components/Hud';
import { R } from '../components/Ruby';
import { Scene, type PitchClock } from '../components/Scene';
import { ExpectationChart, Timeline } from '../components/Timeline';
import { ZoneLegend, ZonePicker } from '../components/ZonePicker';
import { useApp, withRank } from '../state';

interface Entry {
  /** この球を投げる前の状態（もしもリプレイ用） */
  before: GameState;
  record: PitchRecord;
}

type Phase = 'intro' | 'choose' | 'anim' | 'atBatEnd';
/** カード方式で、ボタンを押してからセット完了までの時間 */
const LEAD_MS = 450;
/** リアルタイム方式で、足を上げたまま止めていられる上限（秒） */
const MAX_HOLD = 1.5;

/** ボールがホームベースに届いた瞬間の音 */
function plateSound(r: PitchRecord): PlateSound {
  if (!r.swung || r.result === 'swingMiss') return 'mitt';
  if (r.result === 'homeRun') return 'homeRun';
  if (r.result === 'extraBase') return 'pingBig';
  if (r.result === 'hit') return 'ping';
  // アウト・ファウルでも、タイミングが合っていればいい音がする
  return r.timing === 'just' ? 'ping' : 'dull';
}

/** 動きが終わったあとの音（観客の反応など）。combo = 続けて打ち取った人数 */
function playAfterSound(r: PitchRecord, combo: number) {
  if (r.result === 'balk') sfx.buzzer();
  else if (r.runsScored > 0) sfx.run();
  else if (r.result === 'pickoffOut' || r.runnerEvent === 'caughtStealing') sfx.out(2);
  else if (isBatterOut(r)) {
    if (r.result === 'swingMiss' || r.result === 'take') sfx.strikeout();
    else sfx.out(combo);
  } else if (r.runnerEvent === 'steal') sfx.steal();
}

/** もしもリプレイ：最後の1球を別のパターンで投げていたら */
function WhatIf({ cfg, entry, stage }: { cfg: GameConfig; entry: Entry; stage: StageDef }) {
  const [cards, setCards] = useState<Cards | null>(null);
  // コースは、実際に投げたときと同じところをねらう
  const alt = useMemo(() => (cards ? throwPitch(cfg, entry.before, fromCards(cfg.base, cards), entry.record.aim).record : null), [cards, cfg, entry]);
  const current = cards ?? NORMAL_CARDS;
  const set = (k: keyof Cards) => (v: CardLevel) => setCards({ ...current, [k]: v });
  return (
    <details className="card whatif">
      <summary>
        <R>{'🔁 もしもリプレイ：{最後|さいご}の1{球|きゅう}を{別|べつ}の{間|ま}で{投|な}げていたら？'}</R>
      </summary>
      <p className="muted small-text">
        <R>{'{同|おな}じ{運|うん}（{乱数|らんすう}）のまま、{間|ま}だけを{変|か}えて{計算|けいさん}しなおす。'}</R>
      </p>
      <CardPicker seg="s1" value={current.s1} onChange={set('s1')} />
      <CardPicker seg="s2" value={current.s2} onChange={set('s2')} />
      <CardPicker seg="s3" value={current.s3} onChange={set('s3')} max={stage.cards.s3Long ? 2 : 1} />
      {alt && (
        <div className={`banner ${RESULT[alt.result].tone}`}>
          <b>
            <R>{RESULT[alt.result].text}</R>
          </b>
          <span>
            <R>{alt.swung ? timingText(alt) : ''}</R>
          </span>
        </div>
      )}
    </details>
  );
}

export function BattleScreen() {
  const { state, dispatch } = useApp();
  const profile = state.profile!;
  const stage = stageById(state.battle?.stageId ?? '') ?? stageById('practice')!;
  const base = useMemo(() => baselineOf(profile.baseline), [profile.baseline]);
  const set = profile.settings;

  // ステージの途中で設定が変わることはないので、最初の値で固定する
  const [cfg] = useState<GameConfig>(() => ({
    stageId: stage.id,
    lineup: stage.lineup,
    base,
    seed: randomSeed(),
    stealing: stage.stealing,
    outsToClear: stage.outsToClear,
    maxRuns: stage.maxRuns,
    strikeRate: set.strikeRate,
    balkCheck: set.balkCheck,
    minSetStop: set.minSetStop,
    topHoldWarning: set.topHoldWarning,
    maxTopHold: set.maxTopHold,
  }));

  const [game, setGame] = useState(() => initGame(cfg, stage.situation));
  const [history, setHistory] = useState<Entry[]>([]);
  const [phase, setPhase] = useState<Phase>('intro');
  const [cards, setCards] = useState<Cards>(NORMAL_CARDS);
  const [clock, setClock] = useState<PitchClock | null>(null);
  const [pending, setPending] = useState<{ before: GameState; outcome: PitchOutcome } | null>(null);
  const [saved, setSaved] = useState(false);
  /** ねらうマス。打席ごとに自分で選ぶ */
  const [aim, setAim] = useState<Cell | null>(null);
  const [pitchType, setPitchType] = useState<PitchType>('straight');

  const realtimeOpen = stage.cards.realtime || profile.rank >= REALTIME_RANK;
  const [realtime, setRealtime] = useState(false);
  /** リアルタイム方式の進み具合 */
  const [rt, setRt] = useState<'idle' | 'set' | 'lifted'>('idle');
  const rtTimer = useRef(0);
  /** 予約した音の取り消し */
  const soundCancel = useRef<() => void>(() => {});

  const last = history[history.length - 1]?.record ?? null;
  const shown = phase === 'anim' ? null : last;
  /** いまの打席の球 */
  const atBat = useMemo(() => {
    let start = 0;
    history.forEach((e, i) => {
      if (e.record.atBatEnd && i < history.length - 1) start = i + 1;
    });
    // 打席が終わった直後は、その打席を見せる
    return history.slice(start).map((e) => e.record);
  }, [history]);

  const anyRunner = runnerOn(game.bases);
  const canPickoff = stage.cards.events && anyRunner;
  const over = isOver(cfg, game);

  // ---- 投げる ----

  /** 結果を計算して、アニメーションを始める */
  const launch = useCallback(
    (p: TimingPattern, c: PitchClock, fromSet = true) => {
      const outcome = throwPitch(cfg, game, p, p.event ? undefined : (aim ?? undefined));
      // 動きに合わせて音を予約する。fromSet = false は、足上げまでの音をもう鳴らしてある（リアルタイム方式）
      const r = outcome.record;
      const early = fromSet ? { setAt: c.setAt, liftAt: c.liftAt ?? undefined } : {};
      const thrown = !c.event && r.result !== 'balk' && !r.warnings.includes('delay');
      soundCancel.current();
      if (c.event === 'pickoff' && c.eventAt != null) {
        const throwAt = c.eventAt + (c.eventLift ?? 0) * 1000;
        const lift = c.eventLift ? { liftAt: c.eventAt } : {};
        soundCancel.current = schedulePitchSounds({ ...early, ...lift, forwardAt: throwAt, releaseAt: throwAt + 150, plateAt: throwAt + 600 }, 'mitt');
      } else if (thrown && c.liftAt != null && c.forwardAt != null) {
        const releaseAt = c.forwardAt + c.s4 * 1000;
        const plateAt = releaseAt + flightOf(p) * 1000;
        const hold = fromSet ? { topAt: c.liftAt + c.s2 * 1000, holdUntil: c.forwardAt } : {};
        const swingAt = r.swung ? plateAt - r.timingErrorMs : undefined;
        soundCancel.current = schedulePitchSounds({ ...early, ...hold, forwardAt: c.forwardAt, releaseAt, plateAt, swingAt }, plateSound(r));
      } else {
        soundCancel.current = schedulePitchSounds(early);
      }
      setPending({ before: game, outcome });
      setClock(c);
      setPhase('anim');
    },
    [cfg, game, aim],
  );

  /** 牽制の動き（足を上げる牽制なら、足を上げてから投げる） */
  const pickoffClock = (pb?: PickoffBase, move?: PickoffMove) => ({
    eventLift: pb === 1 && move === 'lift' ? fromCards(base, cards).s2 : 0,
    eventLabel: pb ? PICKOFF.scene[pb] : undefined,
  });

  const throwCards = (event: PitchEvent | null = null, pb?: PickoffBase, move?: PickoffMove) => {
    unlockAudio();
    const p: TimingPattern = { ...fromCards(base, cards, event), pickoffBase: pb, pickoffMove: move, pitchType: event ? undefined : pitchType };
    const setAt = performance.now() + LEAD_MS;
    const at = setAt + p.s1 * 1000;
    launch(
      p,
      event
        ? { setAt, liftAt: null, s2: p.s2, forwardAt: null, s4: p.s4, event, eventAt: at, ...pickoffClock(pb, move) }
        : { setAt, liftAt: at, s2: p.s2, forwardAt: at + (p.s2 + p.s3) * 1000, s4: p.s4, flight: flightOf(p) },
    );
  };

  const onAnimDone = useCallback(() => {
    if (!pending) return;
    const { before, outcome } = pending;
    setPending(null);
    setClock(null);
    setGame(outcome.state);
    setHistory((h) => [...h, { before, record: outcome.record }]);
    // 続けて打ち取った人数（この球を含む）
    let combo = isBatterOut(outcome.record) ? 1 : 0;
    for (let i = history.length - 1; combo > 0 && i >= 0; i--) {
      const r = history[i].record;
      if (!r.atBatEnd) continue;
      if (!isBatterOut(r)) break;
      combo++;
    }
    playAfterSound(outcome.record, combo);
    const ended = outcome.record.atBatEnd || isOver(cfg, outcome.state);
    // 同じリズムが続いていたら、次の球の前に知らせる
    if (!ended && outcome.state.batter.streak >= 2) window.setTimeout(() => sfx.warn(), 700);
    setRt('idle');
    setSaved(false);
    setPhase(ended ? 'atBatEnd' : 'choose');
  }, [pending, cfg, history]);

  // ---- リアルタイム方式 ----

  const rtPattern = (s1: number, s3: number, event: PitchEvent | null = null): TimingPattern => ({
    id: `rt${Date.now()}`,
    name: '',
    s1: Math.round(s1 * 1000) / 1000,
    s2: fromCards(base, cards).s2,
    s3: Math.round(Math.max(0, s3) * 1000) / 1000,
    s4: base.s4,
    event,
    pitchType: event ? undefined : pitchType,
    createdFrom: 'game',
  });

  const rtSet = () => {
    unlockAudio();
    const setAt = performance.now() + 600;
    setClock({ setAt, liftAt: null, s2: fromCards(base, cards).s2, forwardAt: null, s4: base.s4 });
    setRt('set');
    soundCancel.current = schedulePitchSounds({ setAt });
    // 長く止まりすぎたら、審判に止められる（遅延）
    window.clearTimeout(rtTimer.current);
    rtTimer.current = window.setTimeout(() => {
      setRt('idle');
      launch(rtPattern(RULES.MAX_SET_STOP + 0.2, 0), { setAt, liftAt: null, s2: 0.4, forwardAt: null, s4: base.s4 });
    }, 600 + (RULES.MAX_SET_STOP + 0.2) * 1000);
  };

  const rtDown = (t: number) => {
    if (rt !== 'set' || !clock) return;
    // セットの合図より前に動いたら、止まれていない（S1 がほぼ 0 ＝ ランナーがいればボーク）
    const liftAt = Math.max(t, clock.setAt + 10);
    window.clearTimeout(rtTimer.current);
    setClock({ ...clock, liftAt });
    setRt('lifted');
    // 足が動く音と、ためている間の心臓の音（はなした時点で取り消す）
    const topAt = liftAt + clock.s2 * 1000;
    soundCancel.current = schedulePitchSounds({ liftAt, topAt, holdUntil: topAt + MAX_HOLD * 1000 });
    // 足を上げたまま止めすぎたら、自動で前へ
    rtTimer.current = window.setTimeout(() => rtUpRef.current(performance.now()), (clock.s2 + MAX_HOLD) * 1000);
  };

  const rtUp = (t: number) => {
    if (rt !== 'lifted' || !clock || clock.liftAt == null) return;
    window.clearTimeout(rtTimer.current);
    // 足を上げる速さは先に選んだカードで決まる。上がりきる前に指をはなしたら、上がりきってすぐ前へ（ため 0）
    const forwardAt = Math.max(t, clock.liftAt + clock.s2 * 1000);
    const s1 = (clock.liftAt - clock.setAt) / 1000;
    const s3 = (forwardAt - clock.liftAt) / 1000 - clock.s2;
    setRt('idle');
    launch(rtPattern(s1, s3), { ...clock, forwardAt, flight: flightOf({ pitchType }) }, false);
  };
  const rtUpRef = useRef(rtUp);
  rtUpRef.current = rtUp;

  const rtEvent = (event: PitchEvent, pb?: PickoffBase, move?: PickoffMove) => {
    if (rt !== 'set' || !clock) return;
    window.clearTimeout(rtTimer.current);
    const now = Math.max(performance.now(), clock.setAt);
    setRt('idle');
    const p = { ...rtPattern((now - clock.setAt) / 1000, 0, event), pickoffBase: pb, pickoffMove: move };
    launch(p, { ...clock, event, eventAt: now, ...pickoffClock(pb, move) }, false);
  };

  useEffect(
    () => () => {
      window.clearTimeout(rtTimer.current);
      soundCancel.current();
    },
    [],
  );

  // ---- 打席・ステージの終わり ----

  const nextBatter = () => {
    if (game.batter.type === 'boss') sfx.boss();
    setCards(NORMAL_CARDS);
    // 打席が変わったら、ねらうところを選びなおす
    if (last?.atBatEnd) setAim(null);
    setPhase('choose');
  };

  const finish = () => {
    const records = history.map((e) => e.record);
    const cleared = isCleared(cfg, game);
    const summary = summarize(records, cleared);
    const before = profile.stars[stage.id] ?? 0;
    const stars = { ...profile.stars, [stage.id]: Math.max(before, summary.stars) };
    let next = { ...profile, stars, stats: addGameStats(profile.stats, records, summary) };
    const badges = earnedBadges(next, { stageId: stage.id, records, summary });
    const newBadges = badges.filter((b) => !profile.badges.includes(b));
    next = withRank({ ...next, badges });
    if (cleared) sfx.fanfare();
    else sfx.bad();
    if (newBadges.length > 0 || next.rank > profile.rank) window.setTimeout(() => sfx.sparkle(), 1400);
    dispatch({
      type: 'finishStage',
      profile: next,
      result: {
        stageId: stage.id,
        records,
        summary,
        starsGained: Math.max(0, summary.stars - before),
        newBadges,
        rankUp: next.rank > rankIndex(rankPoints(profile)),
      },
    });
  };

  const savePattern = () => {
    if (!last || last.pattern.event || profile.patterns.length >= MAX_PATTERNS) return;
    const n = profile.patterns.length + 1;
    const p: TimingPattern = { ...last.pattern, id: `g${Date.now().toString(36)}`, name: `きめ球${n}`, event: null, createdFrom: 'game' };
    dispatch({ type: 'profile', profile: { ...profile, patterns: [...profile.patterns, p] } });
    setSaved(true);
  };

  const throwSaved = (p: TimingPattern) => {
    unlockAudio();
    const setAt = performance.now() + LEAD_MS;
    const at = setAt + p.s1 * 1000;
    launch({ ...p, event: null, pitchType }, { setAt, liftAt: at, s2: p.s2, forwardAt: at + (p.s2 + p.s3) * 1000, s4: p.s4, flight: flightOf({ pitchType }) });
  };

  // ---- 表示 ----

  const sit = stage.situation;
  const lead = sit.scoreDiff - game.runs;
  const leadText = lead > 0 ? `${lead}{点|てん}リード` : lead === 0 ? '{同点|どうてん}' : `${-lead}{点|てん}ビハインド`;
  // 点数が決まっている場面（リベンジ）は「4-4 同点」のように出す。取られた点は相手に足す
  const scoreText = sit.score ? `${sit.score[0]}-${sit.score[1] + game.runs} ${leadText}` : leadText;
  // 打席が終わった直後は、次の打者ではなく、いま終わった打者を見せる
  const shownSpot: BatterSpot =
    phase === 'atBatEnd' && last
      ? (cfg.lineup.find((x) => x.order === last.batterOrder) ?? { type: last.batterType, hand: last.batterHand, order: last.batterOrder })
      : cfg.lineup[game.batterIndex];
  const shownCount = phase === 'atBatEnd' && last ? last.after : { balls: game.balls, strikes: game.strikes };
  const preview = fromCards(base, cards);

  return (
    <div className="battle">
      <header className="hud">
        <button className="ghost small" onClick={() => (history.length === 0 || confirm('ステージをやめますか？')) && dispatch({ type: 'go', screen: 'stages' })}>
          ✕
        </button>
        <span className="hud-stage">
          <b>
            <R>{stage.name}</R>
          </b>
          <span className="muted">
            {' '}
            <R>{`${sit.inning}・${scoreText}`}</R>
          </span>
        </span>
        <span className="hud-count">
          <Dots label="B" n={Math.min(3, shownCount.balls)} max={3} kind="b" />
          <Dots label="S" n={Math.min(2, shownCount.strikes)} max={2} kind="s" />
          <Dots label="O" n={Math.min(2, phase === 'atBatEnd' && last ? last.after.outs : game.outs)} max={2} kind="o" />
        </span>
        <Diamond bases={game.bases} />
      </header>

      <div className="battle-main">
        <div className="battle-scene">
          <Scene clock={clock} record={phase === 'anim' ? (pending?.outcome.record ?? null) : null} onDone={onAnimDone} />
          {shown && phase !== 'intro' && (
            <div className={`banner ${shown.runnerEvent === 'steal' ? 'bad' : RESULT[shown.result].tone}`}>
              <b>
                <R>{RESULT[shown.result].text}</R>
              </b>
              {shown.pattern.event === 'pickoff' && shown.pattern.pickoffBase && (
                <span>
                  <R>{PICKOFF.name(shown.pattern.pickoffBase, shown.pattern.pickoffMove ?? 'quick')}</R>
                </span>
              )}
              {shown.location && (
                <span>
                  <R>{`${ZONE.name(shown.location, shown.batterHand)}${shown.zone === 'hot' ? '（{得意|とくい}）' : shown.zone === 'cold' ? '（{苦手|にがて}）' : ''}`}</R>
                </span>
              )}
              {shown.swung && (
                <span>
                  <R>{timingText(shown)}</R>
                </span>
              )}
              {shown.runnerEvent && (
                <span>
                  <R>{RUNNER_EVENT[shown.runnerEvent]}</R>
                </span>
              )}
              {shown.runsScored > 0 && (
                <span>
                  <R>{`${shown.runsScored}{点|てん}{取|と}られた`}</R>
                </span>
              )}
            </div>
          )}
          {shown?.warnings.map((w) => (
            <p key={w} className="warn">
              <R>{WARNING[w]}</R>
            </p>
          ))}
          {phase !== 'intro' && (
            <Board
              inning={sit.inning}
              score={scoreText}
              balls={shownCount.balls}
              strikes={shownCount.strikes}
              outs={phase === 'atBatEnd' && last ? last.after.outs : game.outs}
              bases={game.bases}
              spot={shownSpot}
            />
          )}
        </div>

        <div className="battle-side">
          {phase === 'intro' && (
            <div className="card">
              <h2>
                <R>{`ステージ${stage.no}　${stage.name}`}</R>
              </h2>
              <Manager>{stage.intro}</Manager>
              <p className="small-text">
                <R>{`クリア：${stage.outsToClear}アウトを{取|と}る（いま${sit.outs}アウト）／ {失敗|しっぱい}：${stage.maxRuns + 1}{点|てん}{取|と}られる`}</R>
              </p>
              <div className="lineup">
                {stage.lineup.map((t, i) => (
                  <span key={i} className="pill">
                    <R>{`${t.order}{番|ばん}`}</R> {BATTER[t.type].icon} <R>{BATTER[t.type].name}</R>
                  </span>
                ))}
              </div>
              <div className="row center-row">
                <button
                  className="primary big"
                  onClick={() => {
                    unlockAudio();
                    audioContext();
                    if (game.batter.type === 'boss') sfx.boss();
                    setPhase('choose');
                  }}
                >
                  プレイボール！
                </button>
              </div>
            </div>
          )}

          {(phase === 'choose' || phase === 'anim') && (
            <div className="controls-phase">
              <BatterCard spot={shownSpot} />
              <div className="at-bat-row">
                <ZonePicker spot={cfg.lineup[game.batterIndex]} aim={aim} onAim={(c) => (sfx.select(), setAim(c))} last={game.lastCell} disabled={phase === 'anim' || rt !== 'idle'} />
                <div>
                  <p className="hint">
                    <R>{shown?.runnerEvent === 'steal' ? STEAL_COMMENT : preHint(game.batter.streak, game.batter.type, game.balls, game.strikes, game.batter.unsettled)}</R>
                  </p>
                  <p className={`aim-text${aim ? '' : ' need'}`}>
                    <R>{aim ? `🎯 ${ZONE.name(aim, cfg.lineup[game.batterIndex].hand)}` : `👆 ${ZONE.pick}`}</R>
                  </p>
                  <ZoneLegend />
                </div>
              </div>

              {realtimeOpen && (
                <div className="seg-toggle">
                  <button className={!realtime ? 'on' : ''} disabled={phase === 'anim' || rt !== 'idle'} onClick={() => setRealtime(false)}>
                    カード
                  </button>
                  <button className={realtime ? 'on' : ''} disabled={phase === 'anim' || rt !== 'idle'} onClick={() => setRealtime(true)}>
                    リアルタイム
                  </button>
                </div>
              )}

              {!realtime ? (
                <div className="controls">
                  <CardPicker seg="s1" value={cards.s1} onChange={(v) => setCards({ ...cards, s1: v })} disabled={phase === 'anim'} />
                  <CardPicker seg="s2" value={cards.s2} onChange={(v) => setCards({ ...cards, s2: v })} disabled={phase === 'anim'} />
                  <CardPicker seg="s3" value={cards.s3} onChange={(v) => setCards({ ...cards, s3: v })} disabled={phase === 'anim'} max={stage.cards.s3Long ? 2 : 1} />
                  <PitchTypePicker value={pitchType} onChange={setPitchType} disabled={phase === 'anim'} />
                  <p className="muted small-text center">
                    <R>{describeDiff(preview, base)}</R>
                  </p>
                  {canPickoff && <PickoffButtons bases={game.bases} disabled={phase === 'anim'} onPick={(pb, move) => throwCards('pickoff', pb, move)} />}
                  <div className="row center-row wrap pitch-actions">
                    {stage.cards.events && (
                      <button className="small" disabled={phase === 'anim'} onClick={() => throwCards('stepOff')}>
                        <R>{BUTTONS.stepOff}</R>
                      </button>
                    )}
                    <button className="primary big" disabled={phase === 'anim' || !aim} onClick={() => throwCards()}>
                      <R>{BUTTONS.pitch}</R>
                    </button>
                  </div>
                  {stage.cards.events && (
                    <p className="muted small-text center">
                      <R>{'けんせい・{外|はず}すは、「とまる」で{選|えら}んだ{長|なが}さだけ{止|と}まってから{動|うご}く。{一塁|いちるい}の「{足|あし}を{上|あ}げて」は、「あしあげ」の{速|はや}さで{足|あし}を{上|あ}げてから{投|な}げる。'}</R>
                    </p>
                  )}
                  {profile.patterns.length > 0 && (
                    <div className="my-patterns">
                      <span className="muted small-text">
                        <R>{'マイパターン：'}</R>
                      </span>
                      {profile.patterns.slice(0, 6).map((p) => (
                        <button key={p.id} className="small" disabled={phase === 'anim' || !aim} onClick={() => throwSaved(p)}>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="controls">
                  <CardPicker seg="s2" value={cards.s2} onChange={(v) => setCards({ ...cards, s2: v })} disabled={phase === 'anim' || rt !== 'idle'} />
                  <PitchTypePicker value={pitchType} onChange={setPitchType} disabled={phase === 'anim' || rt !== 'idle'} />
                  {rt === 'idle' ? (
                    <button className="primary big rt-button" disabled={phase === 'anim' || !aim} onClick={rtSet}>
                      <R>{BUTTONS.set}</R>
                    </button>
                  ) : (
                    <button
                      className={`rt-button hold ${rt}`}
                      onPointerDown={(e) => {
                        try {
                          // 指がボタンの外にずれても、はなした瞬間を取れるようにする
                          e.currentTarget.setPointerCapture(e.pointerId);
                        } catch {
                          // 対応していない端末
                        }
                        rtDown(performance.now());
                      }}
                      onPointerUp={() => rtUp(performance.now())}
                      onPointerCancel={() => rtUp(performance.now())}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <R>{rt === 'set' ? BUTTONS.hold : BUTTONS.release}</R>
                    </button>
                  )}
                  {stage.cards.events && (
                    <div className="row center-row wrap">
                      {canPickoff && <PickoffButtons bases={game.bases} disabled={rt !== 'set'} onPick={(pb, move) => rtEvent('pickoff', pb, move)} />}
                      <button disabled={rt !== 'set'} onClick={() => rtEvent('stepOff')}>
                        <R>{BUTTONS.stepOff}</R>
                      </button>
                    </div>
                  )}
                  <p className="muted small-text center">
                    <R>{`「セット！」→ {好|す}きなだけ{止|と}まる → ボタンに{指|ゆび}を{置|お}くと{足|あし}が{上|あ}がる（{速|はや}さは{上|うえ}で{選|えら}ぶ）→ {押|お}している{間|あいだ}は「ため」→ はなすと{投|な}げる。${anyRunner ? 'ランナーがいる。すぐ{動|うご}くとボーク！' : ''}`}</R>
                  </p>
                </div>
              )}
            </div>
          )}

          {phase === 'atBatEnd' && last && (
            <div className="review">
              <BatterCard spot={shownSpot} />
              <Manager>{last.runnerEvent === 'steal' && !last.atBatEnd ? STEAL_COMMENT : managerComment(atBat)}</Manager>
              <div className="card">
                <h3>
                  <R>{'この{打席|だせき}の{振|ふ}り{返|かえ}り'}</R>
                </h3>
                <Timeline records={atBat} />
              </div>
              <div className="card">
                <h3>
                  <R>{'{打者|だしゃ}の{予想|よそう}と{実際|じっさい}'}</R>
                </h3>
                <ExpectationChart records={atBat} />
              </div>
              {!last.pattern.event && <WhatIf cfg={cfg} entry={history[history.length - 1]} stage={stage} />}
              <div className="row center-row wrap">
                {isBatterOut(last) && !last.pattern.event && (
                  <button disabled={saved || profile.patterns.length >= MAX_PATTERNS} onClick={savePattern}>
                    <R>{saved ? '✓ パターン{帳|ちょう}に{保存|ほぞん}した' : '📒 {最後|さいご}の{球|たま}をパターン{帳|ちょう}に{保存|ほぞん}'}</R>
                  </button>
                )}
                {saved && (
                  <button onClick={() => dispatch({ type: 'practiceTarget', pattern: profile.patterns[profile.patterns.length - 1] ?? null, screen: 'practice' })}>
                    <R>{'🏠 モード2で{練習|れんしゅう}する'}</R>
                  </button>
                )}
                {over ? (
                  <button className="primary big" onClick={finish}>
                    <R>{BUTTONS.seeResult}</R>
                  </button>
                ) : (
                  <button className="primary big" onClick={nextBatter}>
                    <R>{last.atBatEnd ? BUTTONS.nextBatter : BUTTONS.next}</R>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
