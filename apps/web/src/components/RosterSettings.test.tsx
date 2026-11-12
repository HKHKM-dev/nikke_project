// @vitest-environment happy-dom
// アカウントのメニューの育成状況の欄（RosterSettings.tsx）と、スロット・共通育成の「育成状況の値に戻す」
// （plan/design-roster-edit.md 6.1 節・7 節）。データは作った値
import { BUILD_SNAPSHOT_FORMAT_VERSION, type BuildSnapshot } from '@nikke/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commonGrowthOf } from '../roster.ts';
import { emptySlot, initialTeamState, type SlotGrowthFields } from '../team.ts';
import type { ConfirmedAction, RosterControls, RosterEditor } from '../useRoster.ts';
import { RosterRevertButton } from './RosterRevertButton.tsx';
import { RosterSettings } from './RosterSettings.tsx';
import { TeamSettingsForm } from './TeamSettingsForm.tsx';

afterEach(cleanup);

const ROSTER: BuildSnapshot = {
  formatVersion: BUILD_SNAPSHOT_FORMAT_VERSION,
  fetchedAt: '2026-10-29T00:00:00Z',
  synchroLevel: 300,
  recycleRoom: { '1001': 30 },
  characters: {},
  unmapped: [],
};
const confirmed = (prompt: string | null = null): ConfirmedAction => ({
  prompt,
  request: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
});
const inert = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-disabled') === 'true';

function settings(over: Partial<RosterControls> = {}) {
  const controls: RosterControls = {
    roster: null,
    stored: false,
    message: null,
    importFile: vi.fn(),
    exportFile: vi.fn(),
    clear: confirmed(),
    editor: null,
    hasEdits: false,
    revertAll: confirmed(),
    ...over,
  };
  const onEdit = vi.fn();
  render(<RosterSettings {...controls} onEdit={onEdit} />);
  return { controls, onEdit };
}

describe('RosterSettings', () => {
  it('育成状況が無いときは「編集」と「全部を読み込んだ値に戻す」を押せない', () => {
    const { controls, onEdit } = settings();
    expect(inert('編集') && inert('全部を読み込んだ値に戻す')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '編集' }));
    fireEvent.click(screen.getByRole('button', { name: '全部を読み込んだ値に戻す' }));
    expect(onEdit).not.toHaveBeenCalled();
    expect(controls.revertAll.request).not.toHaveBeenCalled();
  });

  it('編集できるときは「編集」が編集画面を開き、編集があれば「全部を読み込んだ値に戻す」が確かめを出す', () => {
    const editor = { roster: ROSTER } as RosterEditor;
    const { controls, onEdit } = settings({ roster: ROSTER, stored: true, editor, hasEdits: true });
    fireEvent.click(screen.getByRole('button', { name: '編集' }));
    expect(onEdit).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '全部を読み込んだ値に戻す' }));
    expect(controls.revertAll.request).toHaveBeenCalled();
  });

  it('編集の保存が読めないとき（editor が無い）は、編集は押せず、全部を戻すは押せる', () => {
    settings({ roster: ROSTER, stored: true, hasEdits: true });
    expect(inert('編集')).toBe(true);
    expect(inert('全部を読み込んだ値に戻す')).toBe(false);
  });

  it('確かめは欄の中に出す（消す・全部を戻す）', () => {
    const revertAll = confirmed('戻します。');
    settings({ roster: ROSTER, stored: true, hasEdits: true, revertAll });
    expect(screen.getByRole('alertdialog').textContent).toContain('戻します。');
    fireEvent.click(screen.getByRole('button', { name: '戻す' }));
    expect(revertAll.confirm).toHaveBeenCalled();
    cleanup();
    const clear = confirmed('消します。');
    settings({ roster: ROSTER, stored: true, clear });
    fireEvent.click(screen.getAllByRole('button', { name: '消す' }).at(-1)!);
    expect(clear.confirm).toHaveBeenCalled();
  });
});

describe('RosterRevertButton（スロットの「育成状況の値に戻す」）', () => {
  const slot = emptySlot();
  const rosterGrowth: SlotGrowthFields = { ...slot, skillLevels: { skill1: 4, skill2: 5, burst: 6 } };
  const show = (fields: SlotGrowthFields, roster: SlotGrowthFields | null, fixedSpec = false) => {
    const onRevert = vi.fn();
    render(<RosterRevertButton fields={fields} rosterGrowth={roster} fixedSpec={fixedSpec} onRevert={onRevert} />);
    return onRevert;
  };

  it('育成状況にいないニケでは出さない', () => {
    show(slot, null);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('スロットの値が育成状況と違うときに押せ、育成状況の値を渡す', () => {
    const onRevert = show(slot, rosterGrowth);
    fireEvent.click(screen.getByRole('button', { name: '育成状況の値に戻す' }));
    expect(onRevert).toHaveBeenCalledWith(rosterGrowth);
  });

  it('値が同じとき・スペック固定の間は押せない', () => {
    const same = show(rosterGrowth, rosterGrowth);
    expect(inert('育成状況の値に戻す')).toBe(true);
    fireEvent.click(screen.getByRole('button'));
    expect(same).not.toHaveBeenCalled();
    cleanup();
    const fixed = show(slot, rosterGrowth, true);
    fireEvent.click(screen.getByRole('button'));
    expect(fixed).not.toHaveBeenCalled();
  });
});

describe('TeamSettingsForm の「育成状況の値に戻す」（共通育成）', () => {
  const team = initialTeamState();
  const form = (synchroLevel: number, withRoster = true, fixedSpec = false) => {
    const dispatch = vi.fn();
    render(
      <TeamSettingsForm
        element={team.enemy.element}
        fixedSpec={fixedSpec}
        consoleInput={withRoster && synchroLevel === 300 ? commonGrowthOf(ROSTER).console : team.console}
        synchroLevel={synchroLevel}
        durationSeconds={team.durationSeconds}
        rangeJump={team.rangeJump}
        rosterCommon={withRoster ? commonGrowthOf(ROSTER) : null}
        dispatch={dispatch}
      />,
    );
    return dispatch;
  };

  it('育成状況が無ければ出さない', () => {
    form(200, false);
    expect(screen.queryByRole('button', { name: '育成状況の値に戻す' })).toBeNull();
  });

  it('共通育成が育成状況と違うときに押せ、シンクロ LV とリサイクルルームを育成状況の値にする', () => {
    const dispatch = form(200);
    fireEvent.click(screen.getByRole('button', { name: '育成状況の値に戻す' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'setSynchroLevel', synchroLevel: 300 });
    expect(dispatch).toHaveBeenCalledWith({ type: 'setConsole', console: commonGrowthOf(ROSTER).console });
  });

  it('値が同じとき・スペック固定の間は押せない', () => {
    const same = form(300);
    expect(inert('育成状況の値に戻す')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '育成状況の値に戻す' }));
    expect(same).not.toHaveBeenCalled();
    cleanup();
    const fixed = form(200, true, true);
    fireEvent.click(screen.getByRole('button', { name: '育成状況の値に戻す' }));
    expect(fixed).not.toHaveBeenCalled();
  });
});
