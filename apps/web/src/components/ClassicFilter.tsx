// クラシックのキャラの選択肢の絞り込み。スロットの上に、「絞り込み」のボタンで開くポップアップ（クラス・属性・武器種・企業と、
// 宝物のあるニケのボタン。バッジの絵は使わず文字で出す）と、それとは別に並べるバースト段階の Ⅰ・Ⅱ・Ⅲ のボタン。押しているボタンは編成のタブと同じ色で塗る。
// 同じ種類は OR、種類どうしと宝物は AND（matchesBadgeFilters。全段階のニケは、どの段階で絞っても出す）
import type { CharacterIndexEntry } from '@nikke/core';
import { useMemo } from 'react';
import { InertButton } from './InertButton.tsx';
import { useCharacterFilter } from './useCharacterFilter.ts';
import { BURST_STEP_LABEL } from '../skillLabels.ts';
import { BURST_STEP_BADGE_KIND, CLASSIC_FILTER_KINDS, filterButtonValues, toggleBadgeFilter } from './modern/badges.ts';
import { Popover } from './Popover.tsx';

/** 絞り込みの状態と、合うニケ（絞り込んでいなければ null） */
export function useClassicFilter(index: readonly CharacterIndexEntry[]) {
  const { filtering, filtered, ...filter } = useCharacterFilter(index);
  const visibleIds = useMemo(
    () => (filtering ? new Set(filtered.map((c) => c.resourceId)) : null),
    [filtering, filtered],
  );
  return { ...filter, visibleIds };
}

export function ClassicFilter({
  filters,
  setFilters,
  treasureOnly,
  setTreasureOnly,
}: Omit<ReturnType<typeof useClassicFilter>, 'visibleIds'>) {
  // ポップアップの中で押しているボタンがあるか（ボタンを塗る。バースト段階は別のボタンなので見ない）
  const active = treasureOnly || CLASSIC_FILTER_KINDS.some((kind) => (filters[kind.key]?.length ?? 0) > 0);
  return (
    <Popover
      button="絞り込み"
      buttonClassName={`classic-list-order-button ${active ? 'classic-filter-active' : ''}`}
      label="キャラの選択肢の絞り込み"
      align="left"
    >
      <div className="classic-filter-panel">
        {CLASSIC_FILTER_KINDS.map((kind) => (
          <div key={kind.key} className="classic-filter-row" role="group" aria-label={`${kind.name}で絞り込み`}>
            <span className="classic-filter-row-name">{kind.name}</span>
            {filterButtonValues(kind).map((v) => (
              <button
                key={v}
                type="button"
                className="classic-filter-button"
                aria-pressed={filters[kind.key]?.includes(v) ?? false}
                onClick={() => setFilters((f) => toggleBadgeFilter(f, kind.key, v))}
              >
                {/* 武器種はアルファベットの略称（値のまま。AR・SMG など）、ほかはバッジの名前 */}
                {kind.key === 'weaponType' ? v : kind.badges[v]!.label}
              </button>
            ))}
          </div>
        ))}
        <div className="classic-filter-row" role="group" aria-label="宝もので絞り込み">
          <span className="classic-filter-row-name">宝もの</span>
          <button
            type="button"
            className="classic-filter-button"
            aria-pressed={treasureOnly}
            onClick={() => setTreasureOnly((t) => !t)}
          >
            宝もの
          </button>
        </div>
        <InertButton
          className="classic-filter-clear"
          enabled={active}
          onPress={() => {
            // バースト段階（ポップアップの外のボタン）は残す
            setFilters(({ burstStep }) => (burstStep ? { burstStep } : {}));
            setTreasureOnly(false);
          }}
        >
          クリア
        </InertButton>
      </div>
    </Popover>
  );
}

/** バースト段階の絞り込み（Ⅰ・Ⅱ・Ⅲ のボタン。「絞り込み」のポップアップとは別に並べる） */
export function ClassicBurstFilter({
  filters,
  setFilters,
}: Pick<ReturnType<typeof useClassicFilter>, 'filters' | 'setFilters'>) {
  return (
    <div className="classic-burst-filter" role="group" aria-label="バースト段階で絞り込み">
      {filterButtonValues(BURST_STEP_BADGE_KIND).map((v) => (
        <button
          key={v}
          type="button"
          className="classic-filter-button classic-burst-button"
          aria-pressed={filters.burstStep?.includes(v) ?? false}
          aria-label={BURST_STEP_BADGE_KIND.badges[v]!.label}
          onClick={() => setFilters((f) => toggleBadgeFilter(f, 'burstStep', v))}
        >
          {BURST_STEP_LABEL[v as keyof typeof BURST_STEP_LABEL]}
        </button>
      ))}
    </div>
  );
}
