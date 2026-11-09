// 読めなかった編成の保存の退避（savedTeams.ts。plan/design-unreadable-team-save.md 5 節）を、画面の上の知らせに出す状態
import type { CharacterIndexEntry } from '@nikke/core';
import { useCallback, useState } from 'react';
import { downloadText } from './download.ts';
import {
  listUnreadable,
  restoreSaves,
  unreadableFileName,
  type RestoredSaves,
  type UnreadableSave,
} from './savedTeams.ts';
import { BROWSER_STORE, type SaveStore } from './storage.ts';

export type UnreadableControls = {
  /** 退避した保存（古い順）と、退避を書けなかったもの */
  saves: UnreadableSave[];
  exportSave: (save: UnreadableSave) => void;
  /** 退避を消す（確かめは知らせの欄がする） */
  remove: (key: string) => void;
};

export function useUnreadableSaves(store: SaveStore = BROWSER_STORE): {
  controls: UnreadableControls;
  /** 起動時の復元（restoreSaves）。退避を読み直し、書けなかったものを覚える */
  restore: (index: readonly CharacterIndexEntry[]) => RestoredSaves;
} {
  const [stored, setStored] = useState(() => listUnreadable(store));
  const [unsaved, setUnsaved] = useState<UnreadableSave[]>([]);

  const restore = useCallback(
    (index: readonly CharacterIndexEntry[]) => {
      const result = restoreSaves(store, index, Date.now());
      setStored(listUnreadable(store));
      setUnsaved(result.unsaved);
      return result;
    },
    [store],
  );

  return {
    controls: {
      saves: [...stored, ...unsaved],
      exportSave: (save) => downloadText(unreadableFileName(save), save.raw),
      remove: (key) => {
        store.remove(key);
        setStored((saves) => saves.filter((s) => s.key !== key));
      },
    },
    restore,
  };
}
