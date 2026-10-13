import { AppProvider, useApp } from './ui/state';
import { BattleScreen } from './ui/screens/Battle';
import { ChallengeScreen } from './ui/screens/Challenge';
import { GuideScreen } from './ui/screens/Guide';
import { HomeScreen } from './ui/screens/Home';
import { MeasureScreen } from './ui/screens/Measure';
import { PatternsScreen } from './ui/screens/Patterns';
import { PracticeScreen } from './ui/screens/Practice';
import { RecordsScreen } from './ui/screens/Records';
import { SettingsScreen } from './ui/screens/Settings';
import { StageResultScreen } from './ui/screens/StageResult';
import { StagesScreen } from './ui/screens/Stages';
import { TutorialScreen } from './ui/screens/Tutorial';
import { VersusScreen } from './ui/screens/Versus';
import { VideoMeasureScreen } from './ui/screens/VideoMeasure';

function Screens() {
  const { state } = useApp();
  const { screen, profile, battle, result, painOk } = state;
  if (!profile) return <HomeScreen />;
  switch (screen) {
    case 'tutorial':
      return <TutorialScreen />;
    case 'stages':
      return <StagesScreen />;
    case 'battle':
      // やり直すたびに作り直す
      return battle ? <BattleScreen key={battle.key} /> : <StagesScreen />;
    case 'stageResult':
      return result ? <StageResultScreen /> : <StagesScreen />;
    case 'practice':
      return <PracticeScreen />;
    // モード2の練習は「痛いところはない？」に答えてから
    case 'measure':
      return painOk ? <MeasureScreen /> : <PracticeScreen />;
    case 'guide':
      return painOk ? <GuideScreen /> : <PracticeScreen />;
    case 'challenge':
      return painOk ? <ChallengeScreen /> : <PracticeScreen />;
    case 'video':
      return painOk ? <VideoMeasureScreen /> : <PracticeScreen />;
    case 'patterns':
      return <PatternsScreen />;
    case 'versus':
      return <VersusScreen />;
    case 'records':
      return <RecordsScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <HomeScreen />;
  }
}

export default function App() {
  return (
    <AppProvider>
      <main className="app">
        <Screens />
      </main>
    </AppProvider>
  );
}
