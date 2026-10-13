import { useState } from 'react';
import { TUTORIAL, type TutorialPage } from '../../game/messages';
import { DEFAULT_BASELINE } from '../../sim/constants';
import { fromCards } from '../../sim/timing';
import { R } from '../components/Ruby';
import { PatternBar, SegmentLegend } from '../components/Timeline';
import { useApp } from '../state';

const pat = (s1: -1 | 0 | 1, s2: -1 | 0 | 1, s3: -1 | 0 | 1) => fromCards(DEFAULT_BASELINE, { s1, s2, s3 });

function Rows({ rows }: { rows: { label: string; p: ReturnType<typeof pat>; note?: string }[] }) {
  return (
    <div className="tut-figure">
      <SegmentLegend />
      {rows.map((r, i) => (
        <div key={i} className="tut-row">
          <span className="tut-label">
            <R>{r.label}</R>
          </span>
          <PatternBar p={r.p} scale={4.2} />
          {r.note && (
            <span className="tut-note">
              <R>{r.note}</R>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Figure({ kind }: { kind: NonNullable<TutorialPage['figure']> }) {
  switch (kind) {
    case 'segments':
      return (
        <div className="tut-figure">
          <SegmentLegend />
          <PatternBar p={pat(0, 0, 0)} scale={2.4} showSeconds />
          <p className="small-text muted">
            <R>{'セット（{止|と}まる）→ {足|あし}を{上|あ}げる → いちばん{高|たか}いところ → {前|まえ}へ → リリース'}</R>
          </p>
        </div>
      );
    case 'same':
      return (
        <Rows
          rows={[
            { label: '1{球目|きゅうめ}', p: pat(0, 0, 0), note: '🙂' },
            { label: '2{球目|きゅうめ}', p: pat(0, 0, 0), note: '👀' },
            { label: '3{球目|きゅうめ}', p: pat(0, 0, 0), note: '💥 {打|う}たれる' },
          ]}
        />
      );
    case 'mix':
      return (
        <Rows
          rows={[
            { label: '1{球目|きゅうめ}', p: pat(0, 0, 0), note: 'ふつう' },
            { label: '2{球目|きゅうめ}', p: pat(1, 0, 0), note: '{長|なが}く{止|と}まる' },
            { label: '3{球目|きゅうめ}', p: pat(0, -1, -1), note: 'クイック！' },
          ]}
        />
      );
    case 'cost':
      return (
        <div className="tut-figure tut-icons">
          <span>
            ⏳ <R>{'ためすぎ → {長打|ちょうだ}'}</R>
          </span>
          <span>
            💨 <R>{'{急|いそ}ぎすぎ → ボール'}</R>
          </span>
        </div>
      );
    case 'rules':
      return (
        <div className="tut-figure tut-icons">
          <span>
            🧍 <R>{'ランナーがいたら、ピタッと{止|と}まる'}</R>
          </span>
          <span>
            🧑‍⚖️ <R>{'{監督|かんとく}・{審判|しんぱん}に{確認|かくにん}'}</R>
          </span>
        </div>
      );
    case 'safety':
      return (
        <div className="tut-figure tut-icons">
          <span>
            🧣 <R>{'{家|いえ}ではシャドー（タオル）'}</R>
          </span>
          <span>
            🩹 <R>{'{痛|いた}いときは{休|やす}む'}</R>
          </span>
        </div>
      );
  }
}

export function TutorialScreen() {
  const { state, dispatch } = useApp();
  const [i, setI] = useState(0);
  const page = TUTORIAL[i];
  const lastPage = i === TUTORIAL.length - 1;

  const done = () => {
    const p = state.profile!;
    dispatch({ type: 'profile', profile: { ...p, stats: { ...p.stats, tutorialDone: true } } });
    dispatch({ type: 'go', screen: 'home' });
  };

  return (
    <div className="screen-scroll tutorial">
      <div className="row">
        <button className="ghost small" onClick={() => dispatch({ type: 'go', screen: 'home' })}>
          ← ホーム
        </button>
        <span className="muted small-text">
          {i + 1} / {TUTORIAL.length}
        </span>
      </div>
      <div className="card tut-card">
        <h2>
          <R>{page.title}</R>
        </h2>
        {page.body.map((b, k) => (
          <p key={k}>
            <R>{b}</R>
          </p>
        ))}
        {page.figure && <Figure kind={page.figure} />}
      </div>
      <div className="row center-row">
        <button disabled={i === 0} onClick={() => setI(i - 1)}>
          ← <R>{'{前|まえ}へ'}</R>
        </button>
        {lastPage ? (
          <button className="primary big" onClick={done}>
            <R>{'わかった！'}</R>
          </button>
        ) : (
          <button className="primary big" onClick={() => setI(i + 1)}>
            <R>{'{次|つぎ}へ'}</R> →
          </button>
        )}
      </div>
    </div>
  );
}
