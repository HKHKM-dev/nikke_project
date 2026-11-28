import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './styles.css';
import './modern.css';
import { applyTheme, readTheme } from './theme.ts';
import { installTouchLog } from './touchLog.ts';
import { applyUiMode, readUiMode } from './uiMode.ts';

// 保存してある表示（モダン・クラシック）とテーマは、最初の描画の前に当てる。React の useEffect は描画の後に動くので、
// そこで当てると、最初の一瞬はクラシックの見た目で描かれ、ボタンの枠の色の transition でちらつく
applyUiMode(readUiMode());
applyTheme(readTheme());

// ?touchlog を付けたときだけ、タッチの知らせを画面の下に書き出す（touchLog.ts）
installTouchLog();

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');
createRoot(container).render(
  <StrictMode>
    <ErrorBoundary
      fallback={(e) => (
        <main className="app">
          <p className="error">画面の表示中にエラーが起きました: {e.message}</p>
          <button type="button" onClick={() => location.reload()}>
            読み込み直す
          </button>
        </main>
      )}
    >
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
