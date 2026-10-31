// 右上の設定のメニュー（■ を 2 × 2 に並べたボタン）。サイト全体の設定をここに置く。いまはテーマの切り替えだけ
import { useEffect, useRef, useState } from 'react';
import { THEME_LABEL, useTheme, type Theme } from '../theme.ts';

const THEMES: readonly Theme[] = ['light', 'dark', 'system'];

function GridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="currentColor">
      <rect x="1" y="1" width="7" height="7" rx="1" />
      <rect x="10" y="1" width="7" height="7" rx="1" />
      <rect x="1" y="10" width="7" height="7" rx="1" />
      <rect x="10" y="10" width="7" height="7" rx="1" />
    </svg>
  );
}

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);

  // 外側のクリックと Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="settings-menu" ref={rootRef}>
      <button
        type="button"
        className="settings-menu-button"
        aria-label="設定"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <GridIcon />
      </button>
      {open && (
        <div className="settings-menu-panel" role="dialog" aria-label="設定">
          <fieldset className="settings-menu-group">
            <legend>テーマ</legend>
            {THEMES.map((t) => (
              <label key={t} className="settings-menu-option">
                <input type="radio" name="theme" value={t} checked={theme === t} onChange={() => setTheme(t)} />
                <span>{THEME_LABEL[t]}</span>
              </label>
            ))}
          </fieldset>
        </div>
      )}
    </div>
  );
}
