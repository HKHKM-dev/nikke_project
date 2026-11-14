// クラシックのキャラの選択肢の絞り込み。スロットの上に、「絞り込み」のボタンで開くポップアップ（クラス・属性・武器種・企業と、
// 宝物のあるニケのボタン。バッジの絵は使わず文字で出す）と、それとは別に並べるバースト段階の Ⅰ・Ⅱ・Ⅲ のボタン。押しているボタンは青くする。
// 同じ種類は OR、種類どうしと宝物は AND（matchesBadgeFilters。全段階のニケは、どの段階で絞っても出す）
import type { CharacterIndexEntry } from '@nikke/core';
import { useMemo, useState } from 'react';
import { BURST_STEP_LABEL } from '../skillLabels.ts';
import {
  CLASSIC_FILTER_KINDS,
  filterButtonValues,
  matchesBadgeFilters,
  toggleBadgeFilter,
  BADGE_KINDS,
  type BadgeFilters as BadgeFilterValues,
} from './modern/badges.ts';
import { Popover } from './Popover.tsx';

/** 絞り込みの状態と、合うニケ（絞り込んでいなければ null） */
export function useClassicFilter(index: readonly CharacterIndexEntry[]) {
  const [filters, setFilters] = useState<BadgeFilterValues>({});
  const [treasureOnly, setTreasureOnly] = useState(false);
  const filtering = treasureOnly || Object.keys(filters).length > 0;
  const visibleIds = useMemo(
    () =>
      filtering
        ? new Set(
            index
              .filter((c) => (!treasureOnly || c.hasTreasure) && matchesBadgeFilters(c, filters))
              .map((c) => c.resourceId),
          )
        : null,
    [index, filters, treasureOnly, filtering],
  );
  return { filters, setFilters, treasureOnly, setTreasureOnly, visibleIds };
}

export function ClassicFilter({
  filters,
  setFilters,
  treasureOnly,
  setTreasureOnly,
}: Omit<ReturnType<typeof useClassicFilter>, 'visibleIds'>) {
  // ポップアップの中で押しているボタンの数（ボタンに添える。バースト段階は別のボタンなので数えない）
  const count =
    CLASSIC_FILTER_KINDS.reduce((n, kind) => n + (filters[kind.key]?.length ?? 0), 0) + (treasureOnly ? 1 : 0);
  return (
    <Popover
      button={count > 0 ? `絞り込み（${count}）` : '絞り込み'}
      buttonClassName={`classic-list-order-button ${count > 0 ? 'classic-filter-active' : ''}`}
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
                {kind.badges[v]!.label}
              </button>
            ))}
          </div>
        ))}
        <div className="classic-filter-row" role="group" aria-label="宝物で絞り込み">
          <span className="classic-filter-row-name">宝物</span>
          <button
            type="button"
            className="classic-filter-button"
            aria-pressed={treasureOnly}
            onClick={() => setTreasureOnly((t) => !t)}
          >
            宝物のあるニケ
          </button>
        </div>
        <button
          type="button"
          className="classic-filter-clear"
          disabled={count === 0}
          onClick={() => {
            // バースト段階（ポップアップの外のボタン）は残す
            setFilters(({ burstStep }) => (burstStep ? { burstStep } : {}));
            setTreasureOnly(false);
          }}
        >
          クリア
        </button>
      </div>
    </Popover>
  );
}

const BURST_STEP_KIND = BADGE_KINDS.find((kind) => kind.key === 'burstStep')!;

/** バースト段階の絞り込み（Ⅰ・Ⅱ・Ⅲ のボタン。「絞り込み」のポップアップとは別に並べる） */
export function ClassicBurstFilter({
  filters,
  setFilters,
}: Pick<ReturnType<typeof useClassicFilter>, 'filters' | 'setFilters'>) {
  return (
    <div className="classic-burst-filter" role="group" aria-label="バースト段階で絞り込み">
      {filterButtonValues(BURST_STEP_KIND).map((v) => (
        <button
          key={v}
          type="button"
          className="classic-filter-button classic-burst-button"
          aria-pressed={filters.burstStep?.includes(v) ?? false}
          aria-label={`バースト ${BURST_STEP_LABEL[v as keyof typeof BURST_STEP_LABEL]}`}
          onClick={() => setFilters((f) => toggleBadgeFilter(f, 'burstStep', v))}
        >
          {BURST_STEP_LABEL[v as keyof typeof BURST_STEP_LABEL]}
        </button>
      ))}
    </div>
  );
}
