// 欄の中の確かめ（育成状況・読めなかった編成の保存の「消す」）。ブラウザの確認の窓（window.confirm）は、claude.ai のアーティファクトの
// 枠の中では出ず、すぐ false を返して何も起きないので使わない
import type { CSSProperties } from 'react';

type Props = {
  prompt: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  style?: CSSProperties;
};

export function InlineConfirm({ prompt, confirmLabel, onConfirm, onCancel, style }: Props) {
  return (
    <div style={style} role="alertdialog" aria-label="確かめ">
      <p className="note">{prompt}</p>
      <div className="button-row">
        <button type="button" className="advanced-settings-button" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="advanced-settings-button" onClick={onCancel}>
          やめる
        </button>
      </div>
    </div>
  );
}
