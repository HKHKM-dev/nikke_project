// ページの上（見出しの下）の、読めなかった編成の保存の知らせ（plan/design-unreadable-team-save.md 5.3 節）。両方の表示モードで出す
import { useState } from 'react';
import { unreadableMessage } from '../savedTeams.ts';
import type { UnreadableControls } from '../useUnreadableSaves.ts';

export function UnreadableSavesNotice({ saves, exportSave, remove }: UnreadableControls) {
  // 「消す」の確かめを待っている退避のキー。ブラウザの確認の窓は claude.ai のアーティファクトの枠の中では出ないので、欄の中で確かめる
  const [pending, setPending] = useState<string | null>(null);
  if (saves.length === 0) return null;
  return (
    <section className="unreadable-saves" aria-label="読めなかった編成の保存" role="alert">
      <ul className="notes">
        {saves.map((save) => (
          <li key={save.key ?? `unsaved-${save.kind}`} className="note">
            <p>{unreadableMessage(save)}</p>
            <p>理由: {save.error}</p>
            <p>
              {save.key === null
                ? '元の保存を退避できなかったので、この画面の変更は保存しません（元の保存は残っています）。'
                : '元の保存は残してあります。'}
            </p>
            <div className="unreadable-saves-actions">
              <button type="button" className="advanced-settings-button" onClick={() => exportSave(save)}>
                書き出す
              </button>
              {save.key !== null && pending !== save.key && (
                <button type="button" className="advanced-settings-button" onClick={() => setPending(save.key)}>
                  消す
                </button>
              )}
            </div>
            {save.key !== null && pending === save.key && (
              <div role="alertdialog" aria-label="確かめ">
                <p>退避した保存を消します。消すと元の保存は戻りません。</p>
                <div className="unreadable-saves-actions">
                  <button
                    type="button"
                    className="advanced-settings-button"
                    onClick={() => {
                      setPending(null);
                      remove(save.key!);
                    }}
                  >
                    消す
                  </button>
                  <button type="button" className="advanced-settings-button" onClick={() => setPending(null)}>
                    やめる
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
