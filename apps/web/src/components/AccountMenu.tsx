// 右上の「アカウント」のメニュー（設定のボタンの左。ボタンは、クラシックでは文字、モダン UI ではバッジ ui_account の絵）。アカウントの育成状況（JSON）の読み込み・書き出し・編集・消去を置く
import type { UiMode } from '../uiMode.ts';
import type { RosterControls } from '../useRoster.ts';
import { BadgeIcon } from './modern/BadgeIcon.tsx';
import { ACCOUNT_BADGE } from './modern/badges.ts';
import { Popover } from './Popover.tsx';
import { RosterSettings } from './RosterSettings.tsx';

type Props = {
  uiMode: UiMode;
  roster: RosterControls;
  /** 育成状況の編集画面を開く（components/RosterEditModal.tsx） */
  onEditRoster: () => void;
};

export function AccountMenu({ uiMode, roster, onEditRoster }: Props) {
  return (
    <Popover
      button={uiMode === 'modern' ? <BadgeIcon className="settings-menu-icon" name={ACCOUNT_BADGE} /> : 'アカウント'}
      buttonClassName={uiMode === 'modern' ? 'settings-menu-button' : 'header-menu-button'}
      label="アカウント"
      align="right"
    >
      {(close) => (
        <RosterSettings
          {...roster}
          onEdit={() => {
            close();
            // メニューで待っていた確かめ（消す・全部を戻す）は、編集画面へ持ち越さない
            roster.clear.cancel();
            onEditRoster();
          }}
        />
      )}
    </Popover>
  );
}
