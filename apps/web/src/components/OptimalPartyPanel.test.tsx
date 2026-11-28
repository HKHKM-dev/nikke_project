// @vitest-environment happy-dom
// 最適編成計算のポップアップ（OptimalPartyPanel.tsx の OptimalPartyPopover。クラシックの ClassicView が置く）:
// フルバーストでの候補の絞り込みと、ポップアップを閉じると計算の Worker を捨てること、「採用」で閉じないこと。
// キャラとスキル定義は packages/core/data から読み（fetch の代わり）、計算は偽の Worker が答える。
// ファイルごとに隔離しないので、ほかのテストが @nikke/core を差し替えて読んだ部品（useCharacterCache など）を使わないように、
// 前後でモジュールを読み直す
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadBuildMasters,
  loadCharacterIndex,
  loadEnemyPresets,
  type BuildMasters,
  type CharacterIndex,
  type EnemyPresetMaster,
} from '@nikke/core';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeWorker, installFakeWorker, liveWorkers } from '../__tests__/fakeWorker.ts';
import { withCharacters } from '../__tests__/team.ts';
import type { TeamState } from '../team.ts';
import type { OptimalPartyPopover as Popover } from './OptimalPartyPanel.tsx';

// ほかのテストの読み込みの覚え（useCharacterCache・useSkillDefinitions）と混ざらない置き場所
const BASE_URL = '/optimal-party-test/';
const dataFetch = (url: string | URL | Request) => {
  const path = String(url).replace(BASE_URL, '');
  try {
    const text = readFileSync(join(import.meta.dirname, '../../../../packages/core/data', path), 'utf8');
    return Promise.resolve(new Response(text, { status: 200 }));
  } catch {
    return Promise.resolve(new Response('', { status: 404 }));
  }
};

// 基本の段のまま変わらないニケ: ネオン（I）、デルタ（II）、ラピ（III）、D（III）
const [I, II, III, III2] = [11, 20, 10, 40];

let masters: BuildMasters;
let enemyMaster: EnemyPresetMaster;
let index: CharacterIndex['characters'];
let OptimalPartyPopover: typeof Popover;

beforeAll(async () => {
  vi.resetModules();
  ({ OptimalPartyPopover } = await import('./OptimalPartyPanel.tsx'));
  masters = await loadBuildMasters({ baseUrl: BASE_URL, fetchImpl: dataFetch as typeof fetch });
  enemyMaster = await loadEnemyPresets({ baseUrl: BASE_URL, fetchImpl: dataFetch as typeof fetch });
  const all = await loadCharacterIndex({ baseUrl: BASE_URL, fetchImpl: dataFetch as typeof fetch });
  index = all.characters.filter((c) => [I, II, III, III2].includes(c.resourceId));
});

afterAll(() => vi.resetModules());

beforeEach(() => {
  installFakeWorker();
  vi.stubGlobal('fetch', dataFetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPopover(team: TeamState, onAdopt = vi.fn()) {
  render(
    <OptimalPartyPopover
      team={team}
      roster={null}
      index={index}
      otherPartyIds={new Map()}
      masters={masters}
      enemyMaster={enemyMaster}
      baseUrl={BASE_URL}
      onAdopt={onAdopt}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '最適編成計算' }));
  return { dialog: screen.getByRole('dialog', { name: '最適編成計算' }), onAdopt };
}

/** スロットを選んで「計算」を押し、Worker に送られた件が count 件になるまで待つ */
async function run(dialog: HTMLElement, slot: number, count: number) {
  fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: String(slot) } });
  fireEvent.click(within(dialog).getByRole('button', { name: '計算' }));
  await waitFor(() => expect(FakeWorker.instances.flatMap((w) => w.posted)).toHaveLength(count), { timeout: 5000 });
}

/** 送られた件に、送った順で大きくなる総ダメージで答える */
function answerAll() {
  for (const w of liveWorkers()) {
    if (w.posted.length === 0) continue;
    w.reply({ ok: true, result: { totalDamage: w.last!.seq * 100, slots: [], enemyNotes: [] } });
  }
}

const rowNames = (dialog: HTMLElement) =>
  [...dialog.querySelectorAll('.optimal-party-name')].map((e) => e.textContent).sort();

describe('OptimalPartyPopover', () => {
  it('leaves out the candidates that stop the full burst, in a team with empty slots', async () => {
    const { dialog } = renderPopover(withCharacters([II, III]));
    // 空のスロット 3 に入れる。ネオン（I）なら I・II・III がそろい、D（III）ではそろわない
    await run(dialog, 2, 2);
    answerAll();
    await within(dialog).findByText(/入れるとフルバーストが起きなくなるため除いたニケ: 1 人/);
    expect(rowNames(dialog)).toEqual(['ネオン']);
  });

  it('keeps every candidate when no candidate makes a full burst', async () => {
    const { dialog } = renderPopover(withCharacters([III]));
    // 1 人だけの編成は、誰を入れても I・II・III がそろわない
    await run(dialog, 1, 4);
    answerAll();
    await within(dialog).findByText(/フルバーストが起きるかでは絞っていません/);
    expect(rowNames(dialog)).toEqual(['D', 'デルタ', 'ネオン']);
    expect(within(dialog).queryByText(/入れ替えられるニケがいません/)).toBeNull();
  });

  it('does not close on 採用', async () => {
    const { dialog, onAdopt } = renderPopover(withCharacters([II, III]));
    await run(dialog, 2, 2);
    answerAll();
    fireEvent.click(await within(dialog).findByRole('button', { name: '採用' }));
    expect(onAdopt).toHaveBeenCalledWith(2, I);
    expect(screen.getByRole('dialog', { name: '最適編成計算' })).toBe(dialog);
  });

  it('throws the workers away when closed, even while computing', async () => {
    const { dialog } = renderPopover(withCharacters([II, III]));
    await run(dialog, 2, 2);
    expect(liveWorkers().length).toBeGreaterThan(0);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '最適編成計算' })).toBeNull();
    expect(liveWorkers()).toHaveLength(0);
  });
});
