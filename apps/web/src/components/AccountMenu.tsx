// 右上の「アカウント」のメニュー（設定のボタンの左）。アカウントの育成状況（JSON）の読み込み・書き出し・編集・消去を置く
import type { RosterControls } from '../useRoster.ts';
import { Popover } from './Popover.tsx';
import { RosterSettings } from './RosterSettings.tsx';

type Props = {
  roster: RosterControls;
  /** 育成状況の編集画面を開く（components/RosterEditModal.tsx） */
  onEditRoster: () => void;
};

export function AccountMenu({ roster, onEditRoster }: Props) {
  return (
    <Popover button="アカウント" buttonClassName="account-menu-button" label="アカウント" align="right">
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
