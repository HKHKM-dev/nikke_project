// 右上の設定のメニュー（ボタンは、クラシックでは文字「設定」、モダン UI ではバッジ ui_window の絵。モダン UI では表示モードと
// テーマの選択肢の前にもバッジ ui_classic・ui_modern と ui_light・ui_dark・ui_system を出す）。サイト全体の設定をここに置く: テーマ・表示モードの切り替え。
// 一覧の並びは、クラシックはスロットの上の「並べ替え」（ClassicView）、モダン UI はニケ一覧の「並べ替え」で選ぶ。
// 育成状況は左隣の「アカウント」のメニュー（AccountMenu.tsx）
import { THEME_LABEL, useTheme, type Theme } from '../theme.ts';
import { UI_MODE_LABEL, type UiMode } from '../uiMode.ts';
import { BadgeIcon } from './modern/BadgeIcon.tsx';
import { SETTING_BADGE, THEME_BADGES, UI_MODE_BADGES } from './modern/badges.ts';
import { Popover } from './Popover.tsx';

const THEMES: readonly Theme[] = ['light', 'dark', 'system'];
const UI_MODES: readonly UiMode[] = ['classic', 'modern'];

type Props = {
  uiMode: UiMode;
  onSelectUiMode: (mode: UiMode) => void;
};

export function SettingsMenu({ uiMode, onSelectUiMode }: Props) {
  const [theme, setTheme] = useTheme();
  return (
    <Popover
      button={uiMode === 'modern' ? <BadgeIcon className="settings-menu-icon" name={SETTING_BADGE} /> : '設定'}
      buttonClassName={uiMode === 'modern' ? 'settings-menu-button' : 'header-menu-button'}
      label="設定"
      align="right"
    >
      <fieldset className="popover-group">
        <legend>表示モード</legend>
        {UI_MODES.map((m) => (
          <label key={m} className="popover-option">
            <input type="radio" name="uiMode" value={m} checked={uiMode === m} onChange={() => onSelectUiMode(m)} />
            {uiMode === 'modern' && <BadgeIcon className="settings-option-icon" name={UI_MODE_BADGES[m]} />}
            <span>{UI_MODE_LABEL[m]}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="popover-group">
        <legend>テーマ</legend>
        {THEMES.map((t) => (
          <label key={t} className="popover-option">
            <input type="radio" name="theme" value={t} checked={theme === t} onChange={() => setTheme(t)} />
            {uiMode === 'modern' && <BadgeIcon className="settings-option-icon" name={THEME_BADGES[t]} />}
            <span>{THEME_LABEL[t]}</span>
          </label>
        ))}
      </fieldset>
    </Popover>
  );
}
