import { useState } from 'react';
import { buildLabel } from '../../buildInfo';
import { APP_TITLE } from '../../game/messages';
import { dayKey, nextRank, rankPoints, RANKS, totalStars } from '../../game/progression';
import { createProfile, deleteProfile, loadNicknames, loadProfile, MAX_PROFILES } from '../../storage/profile';
import { R } from '../components/Ruby';
import { useApp, type Screen } from '../state';

function ProfilePicker({ onDone }: { onDone?: () => void }) {
  const { state, dispatch } = useApp();
  const [list, setList] = useState(loadNicknames);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const full = list.length >= MAX_PROFILES;

  const create = () => {
    const p = createProfile(name);
    if (!p) {
      setError('その{名前|なまえ}はもう{使|つか}われているよ');
      return;
    }
    setName('');
    setError('');
    setList(loadNicknames());
    dispatch({ type: 'profile', profile: p });
    onDone?.();
  };

  return (
    <div className="card profile-picker">
      <h2>
        <R>{'ニックネームを{選|えら}んでね'}</R>
      </h2>
      {list.length > 0 && (
        <div className="row wrap">
          {list.map((n) => (
            <span key={n} className="chip-group">
              <button
                className={state.profile?.nickname === n ? 'primary' : ''}
                onClick={() => {
                  dispatch({ type: 'profile', profile: loadProfile(n) });
                  onDone?.();
                }}
              >
                {n}
              </button>
              <button
                className="ghost small"
                aria-label={`${n} を消す`}
                onClick={() => {
                  if (!confirm(`「${n}」の記録を消しますか？`)) return;
                  deleteProfile(n);
                  setList(loadNicknames());
                  if (state.profile?.nickname === n) dispatch({ type: 'profile', profile: null });
                }}
              >
                🗑
              </button>
            </span>
          ))}
        </div>
      )}
      {!full ? (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input value={name} maxLength={12} placeholder="ニックネーム（本名はダメ）" onChange={(e) => setName(e.target.value)} aria-label="ニックネーム" />
          <button className="primary" type="submit" disabled={!name.trim()}>
            <R>{'{作|つく}る'}</R>
          </button>
        </form>
      ) : (
        <p className="muted">
          <R>{`{登録|とうろく}できるのは${MAX_PROFILES}{人|にん}までです`}</R>
        </p>
      )}
      {error && (
        <p className="warn">
          <R>{error}</R>
        </p>
      )}
    </div>
  );
}

const MENU: { screen: Screen; icon: string; title: string; desc: string; cls?: string }[] = [
  { screen: 'tutorial', icon: '📖', title: '{入門|にゅうもん}', desc: 'なぜ「{間|ま}」を{変|か}えると{打|う}ち{取|と}れるのか' },
  { screen: 'stages', icon: '⚾', title: 'モード1：{打者|だしゃ}と{勝負|しょうぶ}', desc: '{間|ま}をあやつって{打者|だしゃ}を{打|う}ち{取|と}るゲーム', cls: 'mode-main' },
  { screen: 'practice', icon: '🏠', title: 'モード2：シャドー{練習|れんしゅう}', desc: '{音|おと}の{合図|あいず}に{合|あ}わせて、{体|からだ}で{間|ま}を{覚|おぼ}える', cls: 'mode-main' },
  { screen: 'versus', icon: '🆚', title: '{対戦|たいせん}・バッティング', desc: '2{人|ふたり}で{投手|とうしゅ}と{打者|だしゃ}に{分|わ}かれて{勝負|しょうぶ}。{打|う}つ{方|ほう}はタイミングを{合|あ}わせる{練習|れんしゅう}', cls: 'mode-main' },
  { screen: 'patterns', icon: '📒', title: 'マイパターン{帳|ちょう}', desc: '{自分|じぶん}だけのずらし{方|かた}を{作|つく}って{名前|なまえ}をつける' },
  { screen: 'records', icon: '📊', title: '{記録|きろく}', desc: '{打|う}ち{取|と}り{率|りつ}・バッジ・{練習|れんしゅう}の{伸|の}び' },
  { screen: 'settings', icon: '⚙️', title: '{設定|せってい}', desc: '{音|おと}・ルールの{注意|ちゅうい}・{練習|れんしゅう}の{回数|かいすう}' },
];

export function HomeScreen() {
  const { state, dispatch } = useApp();
  const [picking, setPicking] = useState(false);
  const p = state.profile;

  if (!p || picking) {
    return (
      <div className="screen-scroll">
        <h1 className="title">
          ⚾ <R>{APP_TITLE}</R>
        </h1>
        <p className="center muted">
          <R>{'{投|な}げるまでの「{間|ま}」を{変|か}えて、バッターのタイミングをずらそう。'}</R>
        </p>
        <ProfilePicker onDone={() => setPicking(false)} />
        {p && (
          <div className="row center-row">
            <button onClick={() => setPicking(false)}>← もどる</button>
          </div>
        )}
      </div>
    );
  }

  const points = rankPoints(p);
  const next = nextRank(points);
  const cur = RANKS[p.rank];
  const today = dayKey(new Date());
  const todayReps = p.practice.filter((r) => dayKey(new Date(r.at)) === today).length;

  return (
    <div className="screen-scroll">
      <h1 className="title">
        ⚾ <R>{APP_TITLE}</R>
      </h1>
      <div className="card home-head">
        <div className="me">
          <div className="rank">
            <span className="rank-name">
              {p.nickname}：<R>{cur.name}</R>
            </span>
            <span className="stars">★ {totalStars(p.stars)}</span>
          </div>
          {next && (
            <>
              <div className="progress">
                <div style={{ width: `${Math.min(100, ((points - cur.points) / (next.points - cur.points)) * 100)}%` }} />
              </div>
              <span className="small-text muted">
                <R>{`{次|つぎ}のランク「${next.name}」まで あと${next.points - points}ポイント（★1つ＝1、{練習|れんしゅう}10{回|かい}＝1）`}</R>
              </span>
            </>
          )}
          <span className="small-text">
            <R>{`{今日|きょう}の{練習|れんしゅう}：${todayReps}{回|かい}`}</R>
            {!p.baseline && (
              <span className="muted">
                <R>{'　「{自分|じぶん}のふつう」はまだ{測|はか}っていない（モード2で{測|はか}れる）'}</R>
              </span>
            )}
          </span>
        </div>
        <button className="small" onClick={() => setPicking(true)}>
          <R>{'{人|ひと}を{変|か}える'}</R>
        </button>
      </div>

      <div className="modes">
        {MENU.map((m) => (
          <button key={m.screen} className={`mode ${m.cls ?? ''}`} onClick={() => dispatch({ type: 'go', screen: m.screen })}>
            <span className="mode-title">
              {m.icon} <R>{m.title}</R>
              {m.screen === 'tutorial' && !p.stats.tutorialDone && <span className="new">まずここから</span>}
            </span>
            <span className="mode-desc">
              <R>{m.desc}</R>
            </span>
          </button>
        ))}
      </div>
      <p className="center muted small-text">{buildLabel()}</p>
    </div>
  );
}
