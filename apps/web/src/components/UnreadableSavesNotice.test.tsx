// @vitest-environment happy-dom
// 読めなかった編成の保存の知らせ（UnreadableSavesNotice.tsx・useUnreadableSaves.ts。plan/design-unreadable-team-save.md 5.3 節）。
// ブラウザの保存（localStorage）に作った保存を置いて、起動時の復元から知らせ・書き出し・消すまでを通す
import type { CharacterIndexEntry } from '@nikke/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UNREADABLE_KEY_PREFIX } from '../savedTeams.ts';
import { BROWSER_STORE, type SaveStore } from '../storage.ts';
import { STORAGE_KEY, initialTeamState, serializeTeamState } from '../team.ts';
import { useUnreadableSaves } from '../useUnreadableSaves.ts';
import { UnreadableSavesNotice } from './UnreadableSavesNotice.tsx';

const index = [{ resourceId: 10 }] as unknown as CharacterIndexEntry[];
/** 版の無い旧形式（Stage 3〜13） */
const LEGACY = JSON.stringify({ slots: [], enemy: { defence: 100 } });

/** 画面（App.tsx）と同じく、描いた後に起動時の復元を回す */
function Harness({ store = BROWSER_STORE }: { store?: SaveStore }) {
  const { controls, restore } = useUnreadableSaves(store);
  useEffect(() => void restore(index), [restore]);
  return <UnreadableSavesNotice {...controls} />;
}

function unreadableKeys(): string[] {
  return Object.keys(localStorage).filter((k) => k.startsWith(UNREADABLE_KEY_PREFIX));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('UnreadableSavesNotice', () => {
  it('shows nothing while every save is readable', () => {
    localStorage.setItem(STORAGE_KEY, serializeTeamState(initialTeamState()));
    render(<Harness />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(unreadableKeys()).toEqual([]);
  });

  it('backs up an old-format team, tells why, and keeps telling on the next start', () => {
    localStorage.setItem(STORAGE_KEY, LEGACY);
    render(<Harness />);
    // 画面は復元の直後に初期値で保存する（App.tsx）
    localStorage.setItem(STORAGE_KEY, serializeTeamState(initialTeamState()));
    const [key] = unreadableKeys();
    expect(JSON.parse(localStorage.getItem(key!)!).raw).toBe(LEGACY);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('ブラウザに保存した編成を読めなかったので');
    expect(alert.textContent).toContain('理由: この版の編成は読めません（formatVersion undefined）');
    expect(alert.textContent).toContain('元の保存は残してあります。');

    // 次の起動: 保存は読めるが、退避がある間は知らせる
    cleanup();
    render(<Harness />);
    expect(screen.getByRole('alert').textContent).toContain('ブラウザに保存した編成を読めなかったので');
    expect(unreadableKeys()).toHaveLength(1);
  });

  it('exports the original text as it was', async () => {
    localStorage.setItem(STORAGE_KEY, LEGACY);
    const anchors: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      anchors.push(this);
    });
    const blobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return 'blob:unreadable';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '書き出す' }));
    expect(anchors).toHaveLength(1);
    expect(anchors[0]!.download).toMatch(/^nikke-calc-unreadable-team-\d{8}-\d{4}\.json$/);
    expect(await blobs[0]!.text()).toBe(LEGACY);
  });

  it('asks before removing a backup, and does nothing when cancelled', () => {
    localStorage.setItem(STORAGE_KEY, LEGACY);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '消す' }));
    expect(screen.getByRole('alertdialog').textContent).toContain('消すと元の保存は戻りません');
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    expect(unreadableKeys()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '消す' }));
    const confirm = screen.getAllByRole('button', { name: '消す' }).at(-1)!;
    fireEvent.click(confirm);
    expect(unreadableKeys()).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says the screen will not save when the backup cannot be written', () => {
    localStorage.setItem(STORAGE_KEY, LEGACY);
    const readOnly: SaveStore = { ...BROWSER_STORE, write: () => false };
    render(<Harness store={readOnly} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('この画面の変更は保存しません');
    expect(screen.queryByRole('button', { name: '消す' })).toBeNull();
    expect(screen.getByRole('button', { name: '書き出す' })).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(LEGACY);
  });
});
