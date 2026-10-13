import { BATTER } from '../../game/messages';
import { REALTIME_RANK, RANKS } from '../../game/progression';
import { isStageOpen, STAGES } from '../../game/stages';
import { Stars } from '../components/Hud';
import { R } from '../components/Ruby';
import { useApp } from '../state';

export function StagesScreen() {
  const { state, dispatch } = useApp();
  const p = state.profile!;
  return (
    <div className="screen-scroll">
      <div className="row">
        <button className="ghost small" onClick={() => dispatch({ type: 'go', screen: 'home' })}>
          ← ホーム
        </button>
        <h1>
          <R>{'モード1：{打者|だしゃ}と{勝負|しょうぶ}'}</R>
        </h1>
      </div>
      <div className="modes">
        {STAGES.map((s) => {
          const open = isStageOpen(s, p.stars);
          return (
            <button key={s.id} className={`mode ${s.id === 'revenge' ? 'mode-revenge' : ''}`} disabled={!open} onClick={() => dispatch({ type: 'startStage', stageId: s.id })}>
              <span className="mode-title">
                {open ? '' : '🔒 '}
                {s.no}. <R>{s.name}</R>
              </span>
              <span className="mode-stars">
                <Stars n={p.stars[s.id] ?? 0} />
              </span>
              <span className="mode-desc">
                <R>{`{相手|あいて}：${s.opponent}`}</R>
              </span>
              <span className="mode-desc">
                {s.lineup.map((t) => BATTER[t].icon).join(' ')}
                <R>{`　${s.situation.inning}・${s.situation.score ? `${s.situation.score[0]}-${s.situation.score[1]}・` : ''}${s.situation.outs}アウト${s.situation.bases.some(Boolean) ? '・ランナーあり' : ''}`}</R>
              </span>
              {!open && (
                <span className="mode-desc">
                  <R>{'{前|まえ}のステージをクリアすると{遊|あそ}べる'}</R>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="muted small-text">
        <R>{`★は、クリアで1つ、{打|う}ち{取|と}り{率|りつ}60%{以上|いじょう}で1つ、ずらしを3{種類|しゅるい}{以上|いじょう}{使|つか}ってボークなしで1つ。リアルタイム{方式|ほうしき}は、ステージ4か、ランク「${RANKS[REALTIME_RANK].name}」から{使|つか}える。`}</R>
      </p>
    </div>
  );
}
