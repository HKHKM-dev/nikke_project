// 右上の設定のメニュー（■ を 2 × 2 に並べたボタン）。サイト全体の設定をここに置く。いまはテーマの切り替えだけ
import { THEME_LABEL, useTheme, type Theme } from '../theme.ts';
import { Popover } from './Popover.tsx';

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
  const [theme, setTheme] = useTheme();
  return (
    <Popover button={<GridIcon />} buttonClassName="settings-menu-button" label="設定" align="right">
      <fieldset className="popover-group">
        <legend>テーマ</legend>
        {THEMES.map((t) => (
          <label key={t} className="popover-option">
            <input type="radio" name="theme" value={t} checked={theme === t} onChange={() => setTheme(t)} />
            <span>{THEME_LABEL[t]}</span>
          </label>
        ))}
      </fieldset>
    </Popover>
  );
}
