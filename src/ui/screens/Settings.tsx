import { previewCue, setVolume, unlockAudio, type CueName } from '../../audio/cues';
import { buildLabel } from '../../buildInfo';
import { RULE_NOTE } from '../../game/messages';
import { DEFAULT_SETTINGS } from '../../storage/profile';
import type { Settings } from '../../types';
import { R } from '../components/Ruby';
import { useApp } from '../state';

const SOUNDS: { id: Settings['cueSound']; name: string }[] = [
  { id: 'beep', name: 'ピッ・ポン・パン' },
  { id: 'wood', name: 'カッ・コッ・カン（{木|き}の{音|おと}）' },
  { id: 'drum', name: 'ドン・ドン・パン（たいこ）' },
];

export function SettingsScreen() {
  const { state, dispatch } = useApp();
  const p = state.profile!;
  const s = p.settings;
  const set = (patch: Partial<Settings>) => dispatch({ type: 'profile', profile: { ...p, settings: { ...s, ...patch } } });

  const listen = (sound: Settings['cueSound']) => {
    unlockAudio();
    (['lift', 'forward', 'release'] as CueName[]).forEach((n, i) => setTimeout(() => previewCue(n, sound), i * 450));
  };

  return (
    <div className="screen-scroll">
      <div className="row">
        <button className="ghost small" onClick={() => dispatch({ type: 'go', screen: 'home' })}>
          ← ホーム
        </button>
        <h1>
          <R>{'{設定|せってい}'}</R>
        </h1>
      </div>

      <div className="card">
        <h2>
          <R>{'{音|おと}'}</R>
        </h2>
        <label className="slider">
          <span>
            <R>{'{音量|おんりょう}'}</R> <b>{Math.round(s.volume * 100)}</b>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.volume}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              set({ volume: Number(e.target.value) });
            }}
          />
        </label>
        <p className="small-text muted">
          <R>{'{合図|あいず}の{音|おと}（モード2）'}</R>
        </p>
        {SOUNDS.map((x) => (
          <div key={x.id} className="row">
            <button className={`grow${s.cueSound === x.id ? ' primary' : ''}`} onClick={() => set({ cueSound: x.id })}>
              <R>{x.name}</R>
            </button>
            <button className="small" onClick={() => listen(x.id)}>
              <R>{'🔊 {聞|き}く'}</R>
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>
          <R>{'{練習|れんしゅう}（モード2）'}</R>
        </h2>
        <label className="slider">
          <span>
            <R>{'1{回|かい}の{練習|れんしゅう}の{上限|じょうげん}'}</R> <b>{s.practiceLimit}</b>
            <R>{'{回|かい}'}</R>
          </span>
          <input type="range" min={10} max={60} step={5} value={s.practiceLimit} onChange={(e) => set({ practiceLimit: Number(e.target.value) })} />
        </label>
        <p className="small-text muted">
          <R>{'10{回|かい}ごとに{休|きゅう}けいの{合図|あいず}が{入|はい}る。'}</R>
        </p>
      </div>

      <div className="card">
        <h2>
          <R>{'ルールの{注意|ちゅうい}'}</R>
        </h2>
        <label className="row">
          <input type="checkbox" checked={s.balkCheck} onChange={(e) => set({ balkCheck: e.target.checked })} />
          <span>
            <R>{'ランナーがいるとき、{止|と}まる{時間|じかん}が{短|みじか}いとボークにする'}</R>
          </span>
        </label>
        <label className="slider">
          <span>
            <R>{'セットで{止|と}まる{最短|さいたん}の{時間|じかん}'}</R> <b>{s.minSetStop.toFixed(1)}</b>
            <R>{'{秒|びょう}'}</R>
          </span>
          <input type="range" min={0.3} max={1} step={0.1} value={s.minSetStop} onChange={(e) => set({ minSetStop: Number(e.target.value) })} />
        </label>
        <label className="row">
          <input type="checkbox" checked={s.topHoldWarning} onChange={(e) => set({ topHoldWarning: e.target.checked })} />
          <span>
            <R>{'{足|あし}を{上|あ}げて{止|と}める{時間|じかん}が{長|なが}いとき「ルール{注意|ちゅうい}」を{出|だ}す'}</R>
          </span>
        </label>
        <label className="slider">
          <span>
            <R>{'「ルール{注意|ちゅうい}」を{出|だ}す{長|なが}さ'}</R> <b>{s.maxTopHold.toFixed(2)}</b>
            <R>{'{秒|びょう}'}</R>
          </span>
          <input type="range" min={0.1} max={1} step={0.05} value={s.maxTopHold} onChange={(e) => set({ maxTopHold: Number(e.target.value) })} />
        </label>
        <p className="warn">
          <R>{RULE_NOTE}</R>
        </p>
      </div>

      <details className="card">
        <summary>
          <R>{'くわしい{設定|せってい}（コーチ{向|む}け）'}</R>
        </summary>
        <label className="slider">
          <span>
            <R>{'ストライクが{入|はい}る{割合|わりあい}（モード1）'}</R> <b>{Math.round(s.strikeRate * 100)}</b>%
          </span>
          <input type="range" min={0.4} max={0.9} step={0.05} value={s.strikeRate} onChange={(e) => set({ strikeRate: Number(e.target.value) })} />
        </label>
        <p className="small-text muted">
          <R>{'{打者|だしゃ}・{走者|そうしゃ}の{強|つよ}さなど、ほかの{数値|すうち}は src/sim/constants.ts、ステージと「リベンジ」の{場面|ばめん}は src/game/stages.ts、{文言|もんごん}は src/game/messages.ts にある。'}</R>
        </p>
        <button onClick={() => set({ ...DEFAULT_SETTINGS })}>
          <R>{'{設定|せってい}を{最初|さいしょ}に{戻|もど}す'}</R>
        </button>
      </details>
      <p className="center muted small-text">{buildLabel()}</p>
    </div>
  );
}
