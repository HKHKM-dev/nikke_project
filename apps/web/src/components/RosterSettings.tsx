// 設定のメニューの「育成状況」の欄: 読み込む・書き出す・消す（plan/design-combat-power-sort.md 5 節）
import { useRef } from 'react';
import type { RosterControls } from '../useRoster.ts';
import { InlineConfirm } from './InlineConfirm.tsx';

/** 知らせの文が長いとメニューが横に広がるので、幅を抑える */
const MESSAGES = { maxWidth: '22em' } as const;

export function RosterSettings({
  roster,
  stored,
  message,
  clearPrompt,
  importFile,
  exportFile,
  clear,
  confirmClear,
  cancelClear,
}: RosterControls) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <fieldset className="popover-group">
      <legend>育成状況</legend>
      <div className="button-row">
        <button type="button" className="advanced-settings-button" onClick={() => fileRef.current?.click()}>
          読み込む
        </button>
        <button
          type="button"
          className="advanced-settings-button"
          aria-disabled={roster === null}
          onClick={() => roster !== null && exportFile()}
        >
          書き出す
        </button>
        <button
          type="button"
          className="advanced-settings-button"
          aria-disabled={!stored}
          onClick={() => stored && clear()}
        >
          消す
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file !== undefined) void importFile(file);
        }}
      />
      {clearPrompt !== null && (
        <InlineConfirm
          style={MESSAGES}
          prompt={clearPrompt}
          confirmLabel="消す"
          onConfirm={confirmClear}
          onCancel={cancelClear}
        />
      )}
      {message !== null && (
        <ul className="notes" style={MESSAGES} aria-live="polite">
          {message.kind === 'error' && <li className="note">読み込めなかった:</li>}
          {message.lines.map((line) => (
            <li key={line} className="note">
              {line}
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
