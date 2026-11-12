// アカウントのメニューの「育成状況」の欄: 読み込む・書き出す・編集・消すと、全部を読み込んだ値に戻す
// （plan/design-combat-power-sort.md 5 節・plan/design-roster-edit.md 6.1 節）
import { useRef } from 'react';
import type { RosterControls } from '../useRoster.ts';
import { InlineConfirm } from './InlineConfirm.tsx';

/** 知らせの文が長いとメニューが横に広がるので、幅を抑える */
const MESSAGES = { maxWidth: '22em' } as const;

/** 「全部を読み込んだ値に戻す」のボタンの名前（メニューと編集画面で同じ） */
export const REVERT_ALL_LABEL = '全部を読み込んだ値に戻す';

type Props = RosterControls & {
  /** 「編集」を押した（メニューを閉じて編集画面を開く） */
  onEdit: () => void;
};

export function RosterSettings({
  roster,
  stored,
  message,
  importFile,
  exportFile,
  clear,
  editor,
  hasEdits,
  revertAll,
  onEdit,
}: Props) {
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
        {/* 育成状況が無い・読めない・編集の保存が読めないときは押せない */}
        <button
          type="button"
          className="advanced-settings-button"
          aria-disabled={editor === null}
          onClick={() => editor !== null && onEdit()}
        >
          編集
        </button>
        <button
          type="button"
          className="advanced-settings-button"
          aria-disabled={!stored}
          onClick={() => stored && clear.request()}
        >
          消す
        </button>
      </div>
      <div className="button-row roster-revert-all-row">
        <button
          type="button"
          className="advanced-settings-button"
          aria-disabled={!hasEdits}
          onClick={() => hasEdits && revertAll.request()}
        >
          {REVERT_ALL_LABEL}
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
      {clear.prompt !== null && (
        <InlineConfirm
          style={MESSAGES}
          prompt={clear.prompt}
          confirmLabel="消す"
          onConfirm={clear.confirm}
          onCancel={clear.cancel}
        />
      )}
      {revertAll.prompt !== null && (
        <InlineConfirm
          style={MESSAGES}
          prompt={revertAll.prompt}
          confirmLabel="戻す"
          onConfirm={revertAll.confirm}
          onCancel={revertAll.cancel}
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
