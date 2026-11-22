// 最適編成計算（クラシック）。入れ替えるスロットを 1 つ選んで「計算」を押すと、そのスロットを、いまの編成にもほかの編成にもいない
// ニケに 1 人ずつ入れ替えて編成のダメージを計算し、いちばん大きい上位 10 人を出す（optimalParty.ts）。
// 候補のキャラとスキル定義は、計算を始めたときに読む（200 人ぶん）。計算は専用の Worker（useBatchComputation）で回し、画面の計算とは別
import type { BuildMasters, BuildSnapshot, CharacterIndexEntry, EnemyPresetMaster } from '@nikke/core';
import { useMemo, useState } from 'react';
import { InertButton } from './InertButton.tsx';
import { buildCalcView, type CalcDeps } from '../calcView.ts';
import { ComputeCache } from '../compute.ts';
import { formatCompact, formatDamage } from '../format.ts';
import { OPTIMAL_TOP_COUNT, candidateEntries, swappedTeam, topRows } from '../optimalParty.ts';
import type { TeamState } from '../team.ts';
import { batchWorkerCount, useBatchComputation } from '../useBatchComputation.ts';
import { useCharacterCache } from '../useCharacterCache.ts';
import { slotSkillsStatus, useSkillDefinitions } from '../useSkillDefinitions.ts';

type Props = {
  team: TeamState;
  roster: BuildSnapshot | null;
  index: readonly CharacterIndexEntry[];
  /** ほかの編成で選んでいるニケ（入れ替え先に入れない） */
  otherPartyIds: ReadonlyMap<number, unknown>;
  masters: BuildMasters | null;
  enemyMaster: EnemyPresetMaster | null;
  baseUrl: string;
  /** 選んだスロットを、このニケに入れ替える（採用） */
  onAdopt: (slotIndex: number, resourceId: number) => void;
};

/** 現在との差（％。「+12.3%」「-4.5%」） */
function percentDiff(value: number, base: number): string {
  if (base === 0) return '—';
  const p = ((value - base) / base) * 100;
  return `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;
}

export function OptimalPartyPanel({
  team,
  roster,
  index,
  otherPartyIds,
  masters,
  enemyMaster,
  baseUrl,
  onAdopt,
}: Props) {
  // 入れ替えるスロット（選んだだけでは計算しない）と、計算を始めたスロット（null: まだ始めていない）
  const [chosen, setChosen] = useState(0);
  const [target, setTarget] = useState<number | null>(null);
  // この画面だけの、計算の結果の覚え（画面の計算の覚えは 16 件なので、数百件を入れて追い出さない）
  const [computeCache] = useState(() => new ComputeCache(512));
  // 候補は数百通りなので、Worker を複数にして並列で回す
  const [workerCount] = useState(batchWorkerCount);

  const nameOf = (id: number | null) => index.find((c) => c.resourceId === id)?.name.ja ?? '';
  // 空のスロットにも、ニケを入れて計算できる（そのときの「現在」は、空のまま）
  const active = target !== null && target < team.slots.length ? target : null;
  const slotLabel = (i: number) => `スロット ${i + 1}（${nameOf(team.slots[i]!.resourceId) || '空'}）`;

  const candidates = useMemo(
    () => (active === null ? [] : candidateEntries(index, team, otherPartyIds, active)),
    [active, index, team, otherPartyIds],
  );
  const teamIds = useMemo(() => team.slots.map((s) => s.resourceId), [team.slots]);
  const wantedIds = useMemo(
    () => (active === null ? [] : [...teamIds, ...candidates.map((c) => c.resourceId)]),
    [active, teamIds, candidates],
  );
  // useCharacterCache の返す箱は描くたびに作り直される。表の Map（中身が変わるまで同じ）だけを以降の依存にする
  // （箱を依存にすると、描くたびに候補の入力（約 200 件）を作り直して、鍵（JSON）を作り直す）
  const { characters: loadedCharacters, errors: characterErrors } = useCharacterCache(wantedIds, baseUrl);
  const skills = useSkillDefinitions(wantedIds, baseUrl);

  // 読み込みの状況。キャラかスキル定義が読み込み中のものがあるうちは計算しない（スキル定義が無い・読めないニケは候補から除く）
  const status = useMemo(() => {
    const ready: CharacterIndexEntry[] = [];
    let loading = 0;
    let excluded = 0;
    for (const c of candidates) {
      const id = c.resourceId;
      const skill = slotSkillsStatus(skills, id);
      if (characterErrors.has(id) || skill.kind === 'undefined' || skill.kind === 'error') excluded++;
      else if (!loadedCharacters.has(id) || skill.kind === 'loading') loading++;
      else ready.push(c);
    }
    const teamLoading = teamIds.some(
      (id) => id !== null && (!loadedCharacters.has(id) || slotSkillsStatus(skills, id).kind === 'loading'),
    );
    return { ready, loading, excluded, teamLoading };
  }, [candidates, skills, loadedCharacters, characterErrors, teamIds]);

  const settled = active !== null && status.loading === 0 && !status.teamLoading && masters !== null;

  // 計算の入力: 先頭が「いまの編成」、続いて 1 人ずつ入れ替えた編成
  const inputs = useMemo(() => {
    if (!settled || active === null) return [];
    const deps = (t: TeamState): CalcDeps => ({
      characters: loadedCharacters,
      skillsStatuses: t.slots.map((s) => (s.resourceId === null ? null : slotSkillsStatus(skills, s.resourceId))),
      masters,
      enemyMaster,
    });
    return [team, ...status.ready.map((c) => swappedTeam(team, roster, active, c.resourceId))].map(
      (t) => buildCalcView(t, deps(t)).input,
    );
  }, [settled, active, team, roster, status.ready, loadedCharacters, skills, masters, enemyMaster]);

  const batch = useBatchComputation(inputs, computeCache, workerCount);
  const done = settled && inputs.length > 0 && !batch.computing && batch.results !== null;

  const view = useMemo(() => {
    if (!done || batch.results === null) return null;
    const first = batch.results[0];
    const base = first?.ok ? first.result.totalDamage : null;
    const rows = status.ready.flatMap((c, i) => {
      const r = batch.results![i + 1];
      return r?.ok ? [{ resourceId: c.resourceId, total: r.result.totalDamage }] : [];
    });
    return { base, rows: topRows(rows), failed: status.ready.length - rows.length };
  }, [done, batch.results, status.ready]);

  return (
    <fieldset className="panel optimal-party">
      <legend>最適編成計算</legend>
      <div className="optimal-party-controls">
        <label className="field">
          入れ替えるスロット
          <select
            value={chosen}
            onChange={(e) => {
              setChosen(Number(e.target.value));
              setTarget(null);
            }}
          >
            {team.slots.map((_, i) => (
              <option key={i} value={i}>
                {slotLabel(i)}
              </option>
            ))}
          </select>
        </label>
        <InertButton className="party-optimize-run" enabled onPress={() => setTarget(chosen)}>
          計算
        </InertButton>
      </div>
      {active !== null && !done && (
        <p className="optimal-party-status" role="status">
          {masters === null
            ? '育成のデータを読み込み中…'
            : !settled
              ? `ニケのデータを読み込み中…（あと ${status.loading} 人）`
              : `計算中…（${status.ready.length} 人）`}
        </p>
      )}
      {view !== null && (
        <>
          <p className="optimal-party-base">
            現在の{slotLabel(active!)}: 編成のダメージ <strong>{formatDamage(view.base)}</strong>
          </p>
          <ol className="optimal-party-list">
            {view.rows.map((r) => (
              <li key={r.resourceId} className="optimal-party-row">
                <span className="optimal-party-name">{nameOf(r.resourceId)}</span>
                <span className="optimal-party-total">{formatCompact(r.total)}</span>
                <span className="optimal-party-diff">{view.base === null ? '—' : percentDiff(r.total, view.base)}</span>
                <button type="button" className="optimal-party-adopt" onClick={() => onAdopt(active!, r.resourceId)}>
                  採用
                </button>
              </li>
            ))}
          </ol>
          {view.rows.length === 0 && <p>入れ替えられるニケがいません。</p>}
          {(status.excluded > 0 || view.failed > 0) && (
            <p className="optimal-party-note">
              スキル定義が無い・読めない・計算できないため除いたニケ: {status.excluded + view.failed} 人
            </p>
          )}
          <p className="optimal-party-note">
            上位 {OPTIMAL_TOP_COUNT}{' '}
            人。いまの編成とほかの編成にいるニケと、入れるとフルバーストが起きなくなるニケは入れません。
          </p>
        </>
      )}
    </fieldset>
  );
}
