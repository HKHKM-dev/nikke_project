// 右上の「アカウント」のメニュー（設定のボタンの左）。アカウントの育成状況（JSON）の読み込み・書き出し・消去を置く
import type { RosterControls } from '../useRoster.ts';
import { Popover } from './Popover.tsx';
import { RosterSettings } from './RosterSettings.tsx';

export function AccountMenu({ roster }: { roster: RosterControls }) {
  return (
    <Popover button="アカウント" buttonClassName="account-menu-button" label="アカウント" align="right">
      <RosterSettings {...roster} />
    </Popover>
  );
}
