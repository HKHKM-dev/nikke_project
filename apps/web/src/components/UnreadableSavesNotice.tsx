// ページの上（見出しの下）の、読めなかった編成の保存の知らせ（plan/design-unreadable-team-save.md 5.3 節）。両方の表示モードで出す
import { useState } from 'react';
import { unreadableMessage } from '../savedTeams.ts';
import type { UnreadableControls } from '../useUnreadableSaves.ts';
import { InlineConfirm } from './InlineConfirm.tsx';

export function UnreadableSavesNotice({ saves, exportSave, remove }: UnreadableControls) {
  // 「消す」の確かめを待っている退避のキー
  const [pending, setPending] = useState<string | null>(null);
  if (saves.length === 0) return null;
  return (
    <section className="unreadable-saves" aria-label="読めなかった編成の保存" role="alert">
      <ul className="notes">
        {saves.map((save) => {
          const { key } = save;
          const confirming = key !== null && pending === key;
          return (
            <li key={key ?? `unsaved-${save.kind}`} className="note">
              <p>{unreadableMessage(save)}</p>
              <p>理由: {save.error}</p>
              <p>
                {key === null
                  ? '元の保存を退避できなかったので、この画面の変更は保存しません（元の保存は残っています）。'
                  : '元の保存は残してあります。'}
              </p>
              <div className="button-row">
                <button type="button" className="advanced-settings-button" onClick={() => exportSave(save)}>
                  書き出す
                </button>
                {key !== null && !confirming && (
                  <button type="button" className="advanced-settings-button" onClick={() => setPending(key)}>
                    消す
                  </button>
                )}
              </div>
              {confirming && (
                <InlineConfirm
                  prompt="退避した保存を消します。消すと元の保存は戻りません。"
                  confirmLabel="消す"
                  onConfirm={() => {
                    setPending(null);
                    remove(key);
                  }}
                  onCancel={() => setPending(null)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
