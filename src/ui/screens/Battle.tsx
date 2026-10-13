// モード1：勝負画面。1球ずつ「間」を決めて投げ、打席が終わったら振り返りを見る。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audioContext, sfx, unlockAudio } from '../../audio/cues';
import { BATTER, BUTTONS, CARD, describeDiff, managerComment, preHint, RESULT, RUNNER_EVENT, SEGMENT, STEAL_COMMENT, timingText, WARNING } from '../../game/messages';
import { addGameStats, earnedBadges, rankIndex, rankPoints, REALTIME_RANK, summarize } from '../../game/progression';
import { stageById, type StageDef } from '../../game/stages';
import { initGame, isBatterOut, isCleared, isOver, pickoffTarget, runnerOn, throwPitch, type GameConfig, type GameState, type PitchOutcome } from '../../sim/atBat';
import { CARD_LEVELS, RULES, type CardKey, type CardLevel } from '../../sim/constants';
import { randomSeed } from '../../sim/rng';
import { baselineOf, fromCards, NORMAL_CARDS, type Cards } from '../../sim/timing';
import { MAX_PATTERNS } from '../../storage/profile';
import type { PitchEvent, PitchRecord, TimingPattern } from '../../types';
import { BatterCard, Diamond, Dots, Manager } from '../components/Hud';
import { R } from '../components/Ruby';
import { Scene, type PitchClock } from '../components/Scene';
import { ExpectationChart, Timeline } from '../components/Timeline';
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

function playResultSound(r: PitchRecord) {
  if (r.result === 'swingMiss') sfx.whiff();
  else if (r.result === 'take' || r.result === 'ball') sfx.mitt();
  else if (r.result === 'hit' || r.result === 'extraBase' || r.result === 'homeRun') sfx.bat();
  else if (r.result === 'groundOut' || r.result === 'flyOut' || r.result === 'foul') sfx.weak();
  else if (r.result === 'balk') sfx.buzzer();
  else if (r.result === 'pickoffOut') sfx.good();
}

function CardPicker({ seg, value, onChange, disabled, max = 2 }: { seg: CardKey; value: CardLevel; onChange: (v: CardLevel) => void; disabled?: boolean; /** 選べるいちばん長い段階 */ max?: CardLevel }) {
  const levels = CARD_LEVELS[seg].filter((lv) => lv <= max);
  return (
    <div className={`card-row ${seg}`}>
      <span className="card-row-name">{SEGMENT[seg].name}</span>
      <div className="card-choices">
        {levels.map((lv) => (
          <button key={lv} className={`choice${value === lv ? ' on' : ''}`} disabled={disabled} onClick={() => onChange(lv)} aria-pressed={value === lv}>
            {CARD[seg][lv]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** もしもリプレイ：最後の1球を別のパターンで投げていたら */
function WhatIf({ cfg, entry, stage }: { cfg: GameConfig; entry: Entry; stage: StageDef }) {
  const [cards, setCards] = useState<Cards | null>(null);
  const alt = useMemo(() => (cards ? throwPitch(cfg, entry.before, fromCards(cfg.base, cards)).record : null), [cards, cfg, entry]);
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

  const realtimeOpen = stage.cards.realtime || profile.rank >= REALTIME_RANK;
  const [realtime, setRealtime] = useState(false);
  /** リアルタイム方式の進み具合 */
  const [rt, setRt] = useState<'idle' | 'set' | 'lifted'>('idle');
  const rtTimer = useRef(0);

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
  const canPickoff = stage.cards.events && pickoffTarget(game.bases) !== null;
  const over = isOver(cfg, game);

  // ---- 投げる ----

  /** 結果を計算して、アニメーションを始める */
  const launch = useCallback(
    (p: TimingPattern, c: PitchClock) => {
      const outcome = throwPitch(cfg, game, p);
      setPending({ before: game, outcome });
      setClock(c);
      setPhase('anim');
    },
    [cfg, game],
  );

  const throwCards = (event: PitchEvent | null = null) => {
    unlockAudio();
    const p = fromCards(base, cards, event);
    const setAt = performance.now() + LEAD_MS;
    const at = setAt + p.s1 * 1000;
    launch(p, event ? { setAt, liftAt: null, s2: p.s2, forwardAt: null, s4: p.s4, event, eventAt: at } : { setAt, liftAt: at, s2: p.s2, forwardAt: at + (p.s2 + p.s3) * 1000, s4: p.s4 });
  };

  const onAnimDone = useCallback(() => {
    if (!pending) return;
    const { before, outcome } = pending;
    setPending(null);
    setClock(null);
    setGame(outcome.state);
    setHistory((h) => [...h, { before, record: outcome.record }]);
    playResultSound(outcome.record);
    setRt('idle');
    setSaved(false);
    setPhase(outcome.record.atBatEnd || isOver(cfg, outcome.state) ? 'atBatEnd' : 'choose');
  }, [pending, cfg]);

  // ---- リアルタイム方式 ----

  const rtPattern = (s1: number, s3: number, event: PitchEvent | null = null): TimingPattern => ({
    id: `rt${Date.now()}`,
    name: '',
    s1: Math.round(s1 * 1000) / 1000,
    s2: base.s2,
    s3: Math.round(Math.max(0, s3) * 1000) / 1000,
    s4: base.s4,
    event,
    createdFrom: 'game',
  });

  const rtSet = () => {
    unlockAudio();
    const setAt = performance.now() + 600;
    setClock({ setAt, liftAt: null, s2: base.s2, forwardAt: null, s4: base.s4 });
    setRt('set');
    window.setTimeout(() => sfx.tap(), 600);
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
    // 足を上げたまま止めすぎたら、自動で前へ
    rtTimer.current = window.setTimeout(() => rtUpRef.current(performance.now()), (clock.s2 + MAX_HOLD) * 1000);
  };

  const rtUp = (t: number) => {
    if (rt !== 'lifted' || !clock || clock.liftAt == null) return;
    window.clearTimeout(rtTimer.current);
    // 足を上げる速さはいつも同じ。上がりきる前に指をはなしたら、上がりきってすぐ前へ（ため 0）
    const forwardAt = Math.max(t, clock.liftAt + clock.s2 * 1000);
    const s1 = (clock.liftAt - clock.setAt) / 1000;
    const s3 = (forwardAt - clock.liftAt) / 1000 - clock.s2;
    setRt('idle');
    launch(rtPattern(s1, s3), { ...clock, forwardAt });
  };
  const rtUpRef = useRef(rtUp);
  rtUpRef.current = rtUp;

  const rtEvent = (event: PitchEvent) => {
    if (rt !== 'set' || !clock) return;
    window.clearTimeout(rtTimer.current);
    const now = Math.max(performance.now(), clock.setAt);
    setRt('idle');
    launch(rtPattern((now - clock.setAt) / 1000, 0, event), { ...clock, event, eventAt: now });
  };

  useEffect(() => () => window.clearTimeout(rtTimer.current), []);

  // ---- 打席・ステージの終わり ----

  const nextBatter = () => {
    setCards(NORMAL_CARDS);
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
    launch({ ...p, event: null }, { setAt, liftAt: at, s2: p.s2, forwardAt: at + (p.s2 + p.s3) * 1000, s4: p.s4 });
  };

  // ---- 表示 ----

  const sit = stage.situation;
  const lead = sit.scoreDiff - game.runs;
  const leadText = lead > 0 ? `${lead}{点|てん}リード` : lead === 0 ? '{同点|どうてん}' : `${-lead}{点|てん}ビハインド`;
  // 点数が決まっている場面（リベンジ）は「4-4 同点」のように出す。取られた点は相手に足す
  const scoreText = sit.score ? `${sit.score[0]}-${sit.score[1] + game.runs} ${leadText}` : leadText;
  const batterNo = history.filter((e) => e.record.atBatEnd).length + (phase === 'atBatEnd' && last?.atBatEnd ? 0 : 1);
  // 打席が終わった直後は、次の打者ではなく、いま終わった打者を見せる
  const shownBatter = phase === 'atBatEnd' && last ? last.batterType : game.batter.type;
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
                    {BATTER[t].icon} <R>{BATTER[t].name}</R>
                  </span>
                ))}
              </div>
              <div className="row center-row">
                <button
                  className="primary big"
                  onClick={() => {
                    unlockAudio();
                    audioContext();
                    setPhase('choose');
                  }}
                >
                  プレイボール！
                </button>
              </div>
            </div>
          )}

          {(phase === 'choose' || phase === 'anim') && (
            <>
              <BatterCard type={shownBatter} no={batterNo} />
              <p className="hint">
                <R>{shown?.runnerEvent === 'steal' ? STEAL_COMMENT : preHint(game.batter.streak, game.batter.type)}</R>
              </p>

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
                  <CardPicker seg="s3" value={cards.s3} onChange={(v) => setCards({ ...cards, s3: v })} disabled={phase === 'anim'} max={stage.cards.s3Long ? 2 : 1} />
                  <p className="muted small-text center">
                    <R>{describeDiff(preview, base)}</R>
                  </p>
                  <div className="row center-row wrap">
                    {stage.cards.events && (
                      <>
                        <button disabled={phase === 'anim' || !canPickoff} onClick={() => throwCards('pickoff')}>
                          <R>{BUTTONS.pickoff}</R>
                        </button>
                        <button disabled={phase === 'anim'} onClick={() => throwCards('stepOff')}>
                          <R>{BUTTONS.stepOff}</R>
                        </button>
                      </>
                    )}
                    <button className="primary big" disabled={phase === 'anim'} onClick={() => throwCards()}>
                      <R>{BUTTONS.pitch}</R>
                    </button>
                  </div>
                  {stage.cards.events && (
                    <p className="muted small-text center">
                      <R>{'けんせい・{外|はず}すは、「とまる」で{選|えら}んだ{長|なが}さだけ{止|と}まってから{動|うご}く。'}</R>
                    </p>
                  )}
                  {profile.patterns.length > 0 && (
                    <div className="my-patterns">
                      <span className="muted small-text">
                        <R>{'マイパターン：'}</R>
                      </span>
                      {profile.patterns.slice(0, 6).map((p) => (
                        <button key={p.id} className="small" disabled={phase === 'anim'} onClick={() => throwSaved(p)}>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="controls">
                  {rt === 'idle' ? (
                    <button className="primary big rt-button" disabled={phase === 'anim'} onClick={rtSet}>
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
                    <div className="row center-row">
                      <button disabled={rt !== 'set' || !canPickoff} onClick={() => rtEvent('pickoff')}>
                        <R>{BUTTONS.pickoff}</R>
                      </button>
                      <button disabled={rt !== 'set'} onClick={() => rtEvent('stepOff')}>
                        <R>{BUTTONS.stepOff}</R>
                      </button>
                    </div>
                  )}
                  <p className="muted small-text center">
                    <R>{`「セット！」→ {好|す}きなだけ{止|と}まる → ボタンに{指|ゆび}を{置|お}くと{足|あし}が{上|あ}がる → {押|お}している{間|あいだ}は「ため」→ はなすと{投|な}げる。${anyRunner ? 'ランナーがいる。すぐ{動|うご}くとボーク！' : ''}`}</R>
                  </p>
                </div>
              )}
            </>
          )}

          {phase === 'atBatEnd' && last && (
            <div className="review">
              <BatterCard type={shownBatter} no={batterNo} />
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
