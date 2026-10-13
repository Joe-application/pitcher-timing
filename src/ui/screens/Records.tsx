// 記録：打ち取り率、使ったずらし、モード2の再現精度の推移、バッジ、データの書き出し／読み込み

import { useRef, useState } from 'react';
import { KIND } from '../../game/messages';
import { BADGES, practiceStreak, dayKey, RANKS, totalStars } from '../../game/progression';
import { STAGES } from '../../game/stages';
import { emptyStats, exportProfile, importProfile } from '../../storage/profile';
import type { ShiftKind } from '../../types';
import { Stars } from '../components/Hud';
import { R } from '../components/Ruby';
import { useApp } from '../state';

/** 計測チャレンジの点数の推移 */
function ScoreChart({ scores }: { scores: number[] }) {
  const W = 320;
  const H = 120;
  const x = (i: number) => (scores.length === 1 ? W / 2 : 28 + ((W - 40) * i) / (scores.length - 1));
  const y = (v: number) => 10 + (H - 30) * (1 - v / 100);
  return (
    <svg className="score-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="計測チャレンジの点数の推移">
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1="28" x2={W - 12} y1={y(v)} y2={y(v)} stroke="var(--border)" />
          <text x="24" y={y(v) + 4} textAnchor="end" className="chart-tick">
            {v}
          </text>
        </g>
      ))}
      <path d={scores.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')} fill="none" stroke="var(--ok)" strokeWidth="2.5" />
      {scores.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill="var(--ok)" />
      ))}
    </svg>
  );
}

export function RecordsScreen() {
  const { state, dispatch } = useApp();
  const p = state.profile!;
  const file = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const st = p.stats;
  const kinds = (Object.entries(st.kinds) as [ShiftKind, number][]).sort((a, b) => b[1] - a[1]);
  const maxKind = Math.max(1, ...kinds.map((k) => k[1]));
  const scores = p.practice.filter((r) => r.mode === 'challenge' && typeof r.score === 'number').map((r) => r.score!);
  const recent = scores.slice(-30);
  const streak = practiceStreak(st.practiceDays, dayKey(new Date()));

  const download = () => {
    const url = URL.createObjectURL(new Blob([exportProfile(p)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `pitcher-timing-${p.nickname}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (f: File | undefined) => {
    if (!f) return;
    const imported = importProfile(await f.text());
    if (!imported) {
      setMessage('この{ファイル|ふぁいる}は{読|よ}めなかった');
      return;
    }
    if (!confirm(`「${imported.nickname}」の記録を読み込んで、いまの「${p.nickname}」の記録と入れかえますか？`)) return;
    // いま使っているニックネームのまま、中身だけ入れかえる
    dispatch({ type: 'profile', profile: { ...imported, nickname: p.nickname } });
    setMessage('{読|よ}み{込|こ}んだ');
  };

  return (
    <div className="screen-scroll">
      <div className="row">
        <button className="ghost small" onClick={() => dispatch({ type: 'go', screen: 'home' })}>
          ← ホーム
        </button>
        <h1>
          <R>{`${p.nickname} の{記録|きろく}`}</R>
        </h1>
      </div>

      <div className="card stat-grid">
        <div>
          <span className="muted">ランク</span>
          <b>
            <R>{RANKS[p.rank].name}</R>
          </b>
        </div>
        <div>
          <span className="muted">★</span>
          <b>{totalStars(p.stars)}</b>
        </div>
        <div>
          <span className="muted">
            <R>{'{打|う}ち{取|と}り{率|りつ}'}</R>
          </span>
          <b>{st.atBats ? `${Math.round((st.outs / st.atBats) * 100)}%（${st.outs}/${st.atBats}）` : '—'}</b>
        </div>
        <div>
          <span className="muted">
            <R>{'{投|な}げた{球|たま}'}</R>
          </span>
          <b>{st.pitches}</b>
        </div>
        <div>
          <span className="muted">
            <R>{'{連続|れんぞく}で{打|う}ち{取|と}った{最高|さいこう}'}</R>
          </span>
          <b>{st.bestCombo}</b>
        </div>
        <div>
          <span className="muted">
            <R>{'シャドー{練習|れんしゅう}'}</R>
          </span>
          <b>
            <R>{`${st.practiceReps}{回|かい}・${streak}{日|にち}{連続|れんぞく}`}</R>
          </b>
        </div>
      </div>

      <div className="card">
        <h2>ステージ</h2>
        {STAGES.map((s) => (
          <div key={s.id} className="row">
            <span className="grow">
              {s.no}. <R>{s.name}</R>
            </span>
            <Stars n={p.stars[s.id] ?? 0} />
          </div>
        ))}
      </div>

      <div className="card">
        <h2>
          <R>{'{使|つか}ったずらし'}</R>
        </h2>
        {kinds.length === 0 && (
          <p className="muted">
            <R>{'まだ{記録|きろく}がない。モード1で{遊|あそ}ぶと、ここに{出|で}る。'}</R>
          </p>
        )}
        {kinds.map(([k, n]) => (
          <div key={k} className="kind-row">
            <span>
              <R>{KIND[k]}</R>
            </span>
            <div className="kind-bar">
              <div style={{ width: `${(n / maxKind) * 100}%` }} />
            </div>
            <b>{n}</b>
          </div>
        ))}
        {kinds.length > 0 && kinds.length < 4 && (
          <p className="muted small-text">
            <R>{'{使|つか}うずらしがかたよっている。ほかのずらしも{試|ため}してみよう。'}</R>
          </p>
        )}
      </div>

      <div className="card">
        <h2>
          <R>{'{計測|けいそく}チャレンジの{点数|てんすう}'}</R>
        </h2>
        {recent.length === 0 ? (
          <p className="muted">
            <R>{'まだ{記録|きろく}がない。モード2の{計測|けいそく}チャレンジをやると、ここに{出|で}る。'}</R>
          </p>
        ) : (
          <>
            <ScoreChart scores={recent} />
            <p className="small-text muted">
              <R>{`{最近|さいきん}${recent.length}{回|かい}の{平均|へいきん} ${Math.round(recent.reduce((a, b) => a + b, 0) / recent.length)}{点|てん}（{右|みぎ}が{新|あたら}しい）`}</R>
            </p>
          </>
        )}
      </div>

      <div className="card">
        <h2>バッジ</h2>
        <div className="badges">
          {BADGES.map((b) => {
            const got = p.badges.includes(b.id);
            return (
              <div key={b.id} className={`badge${got ? ' got' : ''}`}>
                <span className="badge-icon">{got ? b.icon : '🔒'}</span>
                <b>
                  <R>{b.name}</R>
                </b>
                <span className="small-text muted">
                  <R>{b.desc}</R>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <details className="card">
        <summary>
          <R>{'データの{書|か}き{出|だ}し・{読|よ}み{込|こ}み（{端末|たんまつ}を{変|か}えるとき）'}</R>
        </summary>
        <div className="row wrap">
          <button onClick={download}>
            <R>{'⬇ ファイルに{書|か}き{出|だ}す'}</R>
          </button>
          <button onClick={() => file.current?.click()}>
            <R>{'⬆ ファイルから{読|よ}み{込|こ}む'}</R>
          </button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => void upload(e.target.files?.[0])} />
          <button
            className="danger"
            onClick={() => {
              if (!confirm('ステージの★・バッジ・記録を全部消しますか？（「自分のふつう」とパターン帳は残ります）')) return;
              dispatch({ type: 'profile', profile: { ...p, stars: {}, badges: [], practice: [], stats: { ...emptyStats(), tutorialDone: st.tutorialDone } } });
              setMessage('{記録|きろく}を{消|け}した');
            }}
          >
            <R>{'{記録|きろく}を{消|け}す'}</R>
          </button>
        </div>
        {message && (
          <p>
            <R>{message}</R>
          </p>
        )}
      </details>
    </div>
  );
}
