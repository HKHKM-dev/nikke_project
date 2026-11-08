// 設定のメニューの「育成状況」の欄: 読み込む・書き出す・消す（plan/design-combat-power-sort.md 5 節）
import { useRef } from 'react';
import { rosterLabel } from '../roster.ts';
import type { RosterControls } from '../useRoster.ts';

const BUTTON_ROW = { display: 'flex', gap: 6, flexWrap: 'wrap' } as const;
/** 知らせの文が長いとメニューが横に広がるので、幅を抑える */
const MESSAGES = { maxWidth: '22em' } as const;

export function RosterSettings({
  roster,
  stored,
  message,
  pending,
  importFile,
  exportFile,
  clear,
  confirmPending,
  cancelPending,
}: RosterControls) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <fieldset className="popover-group">
      <legend>育成状況</legend>
      <p className="hint">{roster === null ? '読み込んでいない' : rosterLabel(roster)}</p>
      <div style={BUTTON_ROW}>
        <button type="button" className="advanced-settings-button" onClick={() => fileRef.current?.click()}>
          読み込む
        </button>
        <button type="button" className="advanced-settings-button" disabled={roster === null} onClick={exportFile}>
          書き出す
        </button>
        <button type="button" className="advanced-settings-button" disabled={!stored} onClick={clear}>
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
      {pending !== null && (
        <div style={MESSAGES} role="alertdialog" aria-label="確かめ">
          <p className="note">{pending.prompt}</p>
          <div style={BUTTON_ROW}>
            <button type="button" className="advanced-settings-button" onClick={confirmPending}>
              {pending.kind === 'import' ? '読み込む' : '消す'}
            </button>
            <button type="button" className="advanced-settings-button" onClick={cancelPending}>
              やめる
            </button>
          </div>
        </div>
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
