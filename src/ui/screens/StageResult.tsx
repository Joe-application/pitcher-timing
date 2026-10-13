import { BATTER, BUTTONS, KIND, spotText, stageComment } from '../../game/messages';
import { BADGES, RANKS, splitAtBats } from '../../game/progression';
import { isStageOpen, stageById, STAGES } from '../../game/stages';
import { Manager, Stars } from '../components/Hud';
import { R } from '../components/Ruby';
import { Timeline } from '../components/Timeline';
import { useApp } from '../state';

export function StageResultScreen() {
  const { state, dispatch } = useApp();
  const p = state.profile!;
  const res = state.result!;
  const stage = stageById(res.stageId)!;
  const s = res.summary;
  const next = STAGES.find((x) => x.no === stage.no + 1);
  const atBats = splitAtBats(res.records);

  return (
    <div className="screen-scroll">
      <div className={`card result-head ${s.cleared ? 'good' : 'bad'}`}>
        <h1>
          <R>{s.cleared ? `${stage.name}　クリア！` : `${stage.name}　ざんねん…`}</R>
        </h1>
        <div className="big-stars">
          <Stars n={s.stars} />
        </div>
        {s.cleared && stage.title && (
          <p className="title-get">
            <R>{`{称号|しょうごう}「${stage.title}」`}</R>
          </p>
        )}
        <Manager>{stageComment(s.cleared, s.stars, s.kinds.length)}</Manager>
      </div>

      {(res.rankUp || res.newBadges.length > 0) && (
        <div className="card">
          {res.rankUp && (
            <p className="rankup">
              <R>{`🎉 ランクアップ！「${RANKS[p.rank].name}」になった`}</R>
            </p>
          )}
          {res.newBadges.map((id) => {
            const b = BADGES.find((x) => x.id === id)!;
            return (
              <p key={id}>
                {b.icon}{' '}
                <b>
                  <R>{`バッジ「${b.name}」`}</R>
                </b>{' '}
                <span className="muted">
                  <R>{b.desc}</R>
                </span>
              </p>
            );
          })}
        </div>
      )}

      <div className="card stat-grid">
        <div>
          <span className="muted">
            <R>{'{打|う}ち{取|と}り{率|りつ}'}</R>
          </span>
          <b>
            {Math.round(s.outRate * 100)}%（{s.batterOuts}/{s.atBats}）
          </b>
        </div>
        <div>
          <span className="muted">
            <R>{'{取|と}られた{点|てん}'}</R>
          </span>
          <b>{s.runs}</b>
        </div>
        <div>
          <span className="muted">
            <R>{'{球数|たまかず}'}</R>
          </span>
          <b>{s.pitches}</b>
        </div>
        <div>
          <span className="muted">ボーク</span>
          <b>{s.balks}</b>
        </div>
        <div className="wide">
          <span className="muted">
            <R>{`{使|つか}ったずらし（${s.kinds.length}{種類|しゅるい}）`}</R>
          </span>
          <span>
            {s.kinds.length === 0 && <R>{'なし（ぜんぶ「ふつう」）'}</R>}
            {s.kinds.map((k) => (
              <span key={k} className="pill">
                <R>{KIND[k]}</R>
              </span>
            ))}
          </span>
        </div>
      </div>

      <details className="card">
        <summary>
          <R>{'{全部|ぜんぶ}の{打席|だせき}を{振|ふ}り{返|かえ}る'}</R>
        </summary>
        {atBats.map((a, i) => (
          <div key={i} className="ab-block">
            <h3>
              <R>{`${spotText({ order: a[0].batterOrder, hand: a[0].batterHand })}　${BATTER[a[0].batterType].icon} ${BATTER[a[0].batterType].name}`}</R>
            </h3>
            <Timeline records={a} />
          </div>
        ))}
      </details>

      <div className="row center-row wrap">
        <button onClick={() => dispatch({ type: 'go', screen: 'stages' })}>
          <R>{'ステージ{選択|せんたく}'}</R>
        </button>
        <button className={s.cleared ? '' : 'primary big'} onClick={() => dispatch({ type: 'startStage', stageId: stage.id })}>
          <R>{BUTTONS.retry}</R>
        </button>
        {s.cleared && next && isStageOpen(next, p.stars) && (
          <button className="primary big" onClick={() => dispatch({ type: 'startStage', stageId: next.id })}>
            <R>{`{次|つぎ}のステージ：${next.name}`}</R>
          </button>
        )}
      </div>
    </div>
  );
}
