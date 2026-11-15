// キャラの絞り込み（バッジと、宝物のあるニケ）の状態と、合うニケ。モダンのニケ一覧（CharacterTray）と、
// クラシックのキャラの選択肢（ClassicFilter）が使う。同じ種類は OR、種類どうしと宝物は AND（matchesBadgeFilters）。保存しない
import type { CharacterIndexEntry } from '@nikke/core';
import { useMemo, useState } from 'react';
import { matchesBadgeFilters, type BadgeFilters } from './modern/badges.ts';

export function useCharacterFilter(index: readonly CharacterIndexEntry[]) {
  const [filters, setFilters] = useState<BadgeFilters>({});
  /** 宝物のあるニケだけにする（バッジの絞り込みと AND） */
  const [treasureOnly, setTreasureOnly] = useState(false);
  const filtering = treasureOnly || Object.keys(filters).length > 0;
  /** 合うニケ（並びは index のまま。絞り込んでいなければ index そのもの） */
  const filtered = useMemo(
    () =>
      filtering ? index.filter((c) => (!treasureOnly || c.hasTreasure) && matchesBadgeFilters(c, filters)) : index,
    [index, filters, treasureOnly, filtering],
  );
  return { filters, setFilters, treasureOnly, setTreasureOnly, filtering, filtered };
}
