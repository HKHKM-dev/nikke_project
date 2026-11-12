// @vitest-environment happy-dom
// 育成状況の編集画面（RosterEditModal.tsx。plan/design-roster-edit.md 6 節）。育成の値は作った値、キャラとマスタは置いてあるデータ
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BUILD_SNAPSHOT_FORMAT_VERSION,
  MASTER_FILES,
  characterIndexPath,
  emptyBuild,
  masterDataPath,
  type BuildMasters,
  type BuildSnapshot,
  type CharacterData,
  type CharacterIndex,
  type SnapshotCharacter,
} from '@nikke/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { characterEditOf } from '../rosterEdits.ts';
import type { ConfirmedAction, RosterEditor } from '../useRoster.ts';
import { RosterEditModal } from './RosterEditModal.tsx';

const text = (path: string): string =>
  readFileSync(join(import.meta.dirname, '../../../../packages/core/data', path), 'utf8');
const masters = Object.fromEntries(
  Object.keys(MASTER_FILES).map((k) => [k, JSON.parse(text(masterDataPath(k as keyof BuildMasters)))]),
) as BuildMasters;
const all = (JSON.parse(text(characterIndexPath())) as CharacterIndex).characters;
const byId = (id: number) => all.find((c) => c.resourceId === id)!;
/** 宝物のある水冷の SSR・宝物の無い水冷の SSR・電撃の SSR・育成状況にいない SR（並びは「ニケ一覧の並び」のつもり） */
const WITH_TREASURE = byId(30);
const PLAIN = byId(14);
const OTHER = byId(15);
const ABSENT = byId(10);
const INDEX = [PLAIN, ABSENT, WITH_TREASURE, OTHER];

// キャラのデータは、置いてあるファイルから読んだものを返す（画面は fetch で読む）
vi.mock('../useCharacterCache.ts', () => ({
  useCharacterCache: (ids: readonly (number | null)[]) => ({
    characters: new Map(
      ids
        .filter((id): id is number => id !== null)
        .map((id) => [id, JSON.parse(text(`characters/${id}.json`)) as CharacterData]),
    ),
    errors: new Map(),
  }),
}));

const entry = (over: Partial<SnapshotCharacter> = {}): SnapshotCharacter => ({
  ...emptyBuild(),
  growth: { level: 300, grade: 2, core: 0 },
  affectionRank: 10,
  skillLevels: { skill1: 4, skill2: 5, burst: 6 },
  treasure: null,
  ...over,
});
const ROSTER: BuildSnapshot = {
  formatVersion: BUILD_SNAPSHOT_FORMAT_VERSION,
  fetchedAt: '2026-10-29T00:00:00Z',
  synchroLevel: 300,
  recycleRoom: { '1001': 30, '1101': 20 },
  characters: {
    [PLAIN.resourceId]: entry(),
    [WITH_TREASURE.resourceId]: entry({ treasure: { tid: 200301, level: 0, phase: null } }),
    [OTHER.resourceId]: entry(),
  },
  unmapped: [],
};

afterEach(cleanup);

function open(over: Partial<RosterEditor> = {}, revertAll: Partial<ConfirmedAction> = {}, hasEdits = false) {
  const editor: RosterEditor = {
    roster: ROSTER,
    editedIds: new Set(),
    accountEdited: false,
    problem: null,
    editCharacter: vi.fn(),
    revertCharacter: vi.fn(),
    editAccount: vi.fn(),
    revertAccount: vi.fn(),
    ...over,
  };
  const confirmed: ConfirmedAction = {
    prompt: null,
    request: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
    ...revertAll,
  };
  const onClose = vi.fn();
  render(
    <RosterEditModal
      editor={editor}
      hasEdits={hasEdits}
      revertAll={confirmed}
      index={INDEX}
      masters={masters}
      mastersError={null}
      baseUrl="/"
      onClose={onClose}
    />,
  );
  return { editor, revertAll: confirmed, onClose };
}

/** 一覧の行（アカウント全体を含む）の名前 */
const rowNames = () =>
  [...document.querySelectorAll('.roster-edit-row .roster-edit-row-name')].map((e) => e.textContent);
/** 一覧の行（名前で引く。行の読み上げの名前には、絵のバッジと育成の印の名前も入る） */
const row = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('.roster-edit-row')].find(
    (r) => r.querySelector('.roster-edit-row-name')?.textContent === name,
  )!;
const inert = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-disabled') === 'true';

describe('RosterEditModal: 一覧', () => {
  it('アカウント全体を選んだ状態で開き、育成状況にいるニケだけを渡した並びで出す', () => {
    open();
    expect(rowNames()).toEqual(['アカウント全体', PLAIN.name.ja, WITH_TREASURE.name.ja, OTHER.name.ja]);
    expect(row('アカウント全体').getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('heading', { name: 'アカウント全体' })).toBeTruthy();
  });

  it('編集したニケとアカウント全体に印を付け、「編集済みのみ」で絞る（アカウント全体は残る）', () => {
    open({ editedIds: new Set([OTHER.resourceId]), accountEdited: true });
    expect(within(row(OTHER.name.ja)).getByLabelText('編集済み')).toBeTruthy();
    expect(within(row('アカウント全体')).getByLabelText('編集済み')).toBeTruthy();
    expect(within(row(PLAIN.name.ja)).queryByLabelText('編集済み')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '編集済みのみ' }));
    expect(rowNames()).toEqual(['アカウント全体', OTHER.name.ja]);
  });

  it('バッジで絞る（同じ種類は OR）', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: '電撃' }));
    expect(rowNames()).toEqual(['アカウント全体', OTHER.name.ja]);
    fireEvent.click(screen.getByRole('button', { name: '水冷' }));
    expect(rowNames()).toEqual(['アカウント全体', PLAIN.name.ja, WITH_TREASURE.name.ja, OTHER.name.ja]);
  });
});

describe('RosterEditModal: ニケの欄', () => {
  it('行を選ぶとそのニケの欄を出し、欄を変えると 1 体分の編集を渡す', () => {
    const { editor } = open();
    fireEvent.click(row(PLAIN.name.ja));
    expect(screen.getByRole('heading', { name: PLAIN.name.ja })).toBeTruthy();
    const skill1 = screen.getByLabelText<HTMLInputElement>('スキル1LV');
    expect(skill1.value).toBe('4');
    fireEvent.change(skill1, { target: { value: '7' } });
    const base = characterEditOf(ROSTER.characters[PLAIN.resourceId]!);
    expect(editor.editCharacter).toHaveBeenCalledWith(PLAIN.resourceId, {
      ...base,
      skillLevels: { skill1: 7, skill2: 5, burst: 6 },
    });
    fireEvent.change(screen.getByLabelText('限界突破'), { target: { value: '3' } });
    expect(editor.editCharacter).toHaveBeenLastCalledWith(PLAIN.resourceId, {
      ...base,
      growth: { grade: 3, core: 0 },
    });
  });

  it('段階が未確定の宝物はそのまま出し、段階を選ぶとその段階の Lv で渡す', () => {
    const { editor } = open();
    fireEvent.click(row(WITH_TREASURE.name.ja));
    const unknown = screen.getByRole<HTMLOptionElement>('option', { name: '宝物（段階は未確定）' });
    expect(unknown.selected).toBe(true);
    const select = unknown.closest('select')!;
    const first = [...select.options].find((o) => o.value === 'treasure-1')!;
    fireEvent.change(select, { target: { value: first.value } });
    expect(editor.editCharacter).toHaveBeenCalledWith(
      WITH_TREASURE.resourceId,
      expect.objectContaining({ treasure: { tid: 200301, level: 0, phase: 1 }, collection: null }),
    );
    // 宝物の無いニケには、宝物の選択肢が無い
    fireEvent.click(row(PLAIN.name.ja));
    expect(screen.queryByRole('option', { name: /^宝物/ })).toBeNull();
  });

  it('「読み込んだ値に戻す」は編集したニケでだけ押せる', () => {
    const { editor } = open({ editedIds: new Set([OTHER.resourceId]) });
    fireEvent.click(row(PLAIN.name.ja));
    expect(inert('読み込んだ値に戻す')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '読み込んだ値に戻す' }));
    expect(editor.revertCharacter).not.toHaveBeenCalled();
    fireEvent.click(row(OTHER.name.ja));
    expect(inert('読み込んだ値に戻す')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '読み込んだ値に戻す' }));
    expect(editor.revertCharacter).toHaveBeenCalledWith(OTHER.resourceId);
  });

  it('前後のボタンは、絞り込んだ後の一覧の順でニケの間だけを動く', () => {
    open({ editedIds: new Set([OTHER.resourceId]) });
    fireEvent.click(row(PLAIN.name.ja));
    expect(inert('前のニケ')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '次のニケ' }));
    expect(screen.getByRole('heading', { name: WITH_TREASURE.name.ja })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '次のニケ' }));
    expect(screen.getByRole('heading', { name: OTHER.name.ja })).toBeTruthy();
    expect(inert('次のニケ')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '前のニケ' }));
    expect(screen.getByRole('heading', { name: WITH_TREASURE.name.ja })).toBeTruthy();
    // 選んでいるニケが絞り込みで一覧から外れたら、欄はそのままで、前後へは動けない
    fireEvent.click(screen.getByRole('button', { name: '編集済みのみ' }));
    expect(screen.getByRole('heading', { name: WITH_TREASURE.name.ja })).toBeTruthy();
    expect(inert('前のニケ') && inert('次のニケ')).toBe(true);
  });
});

describe('RosterEditModal: アカウント全体の欄', () => {
  it('シンクロ LV とリサイクルルームを変えると、アカウント全体の値を渡す', () => {
    const { editor } = open();
    fireEvent.change(screen.getByLabelText('シンクロ LV'), { target: { value: '310' } });
    expect(editor.editAccount).toHaveBeenCalledWith({ synchroLevel: 310, recycleRoom: ROSTER.recycleRoom });
    fireEvent.change(screen.getByLabelText('火力型', { selector: 'input' }), { target: { value: '21' } });
    expect(editor.editAccount).toHaveBeenLastCalledWith({
      synchroLevel: 300,
      recycleRoom: expect.objectContaining({ '1001': 30, '1101': 21, '1102': 0, '1201': 0 }),
    });
  });

  it('「読み込んだ値に戻す」は、アカウント全体を編集しているときだけ押せる', () => {
    const { editor } = open({ accountEdited: true });
    fireEvent.click(screen.getByRole('button', { name: '読み込んだ値に戻す' }));
    expect(editor.revertAccount).toHaveBeenCalled();
    cleanup();
    open();
    expect(inert('読み込んだ値に戻す')).toBe(true);
  });
});

describe('RosterEditModal: 下部と閉じ方', () => {
  it('「全部を読み込んだ値に戻す」は編集があるときだけ押せ、押すとその場で確かめる', () => {
    const none = open();
    expect(inert('全部を読み込んだ値に戻す')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '全部を読み込んだ値に戻す' }));
    expect(none.revertAll.request).not.toHaveBeenCalled();
    cleanup();

    const some = open({}, {}, true);
    fireEvent.click(screen.getByRole('button', { name: '全部を読み込んだ値に戻す' }));
    expect(some.revertAll.request).toHaveBeenCalled();
    cleanup();

    const asking = open({}, { prompt: '戻します。' }, true);
    expect(screen.getByRole('alertdialog').textContent).toContain('戻します。');
    fireEvent.click(screen.getByRole('button', { name: '戻す' }));
    expect(asking.revertAll.confirm).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    expect(asking.revertAll.cancel).toHaveBeenCalled();
  });

  it('編集の問題（保存できなかった等）を欄に出す', () => {
    open({ problem: ['編集をブラウザに保存できなかった'] });
    expect(screen.getByText('編集をブラウザに保存できなかった')).toBeTruthy();
  });

  it('閉じるときは、待っている「全部を読み込んだ値に戻す」の確かめもやめる', () => {
    const { onClose, revertAll } = open({}, { prompt: '戻します。' }, true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(revertAll.cancel).toHaveBeenCalled();
    expect(revertAll.confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('✕・「閉じる」・幕・Esc で閉じる（確かめない）', () => {
    const { onClose } = open();
    screen.getAllByRole('button', { name: '閉じる' }).forEach((b) => fireEvent.click(b));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(document.querySelector('.modal-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(3);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(4);
    // モーダルの中を押しても閉じない
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(4);
  });
});
