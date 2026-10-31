import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './styles.css';

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
