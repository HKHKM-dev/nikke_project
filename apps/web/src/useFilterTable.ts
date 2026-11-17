// 絞り込みの表（data/characters/filter.json。plan/design-character-filter.md 3 節）を、要るとき（enabled）に 1 回だけ読む。
// 読んだ表は画面全体で使い回す（ニケ一覧が描き直されても、読み直さない）。版と形は loadFilterTable が確かめ、違えば error にする
import { loadFilterTable, type FilterTable } from '@nikke/core';
import { useEffect, useState } from 'react';

let loaded: FilterTable | null = null;
let pending: Promise<FilterTable> | null = null;

/** retry は、読めなかった後にもう一度読む（窓を開き直したとき） */
export function useFilterTable(enabled: boolean): {
  table: FilterTable | null;
  error: string | null;
  retry: () => void;
} {
  const [table, setTable] = useState<FilterTable | null>(loaded);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || table !== null || error !== null) return;
    let cancelled = false;
    pending ??= loadFilterTable({ baseUrl: import.meta.env.BASE_URL }).then((t) => (loaded = t));
    pending.then(
      (t) => {
        if (!cancelled) setTable(t);
      },
      (e: unknown) => {
        // 読めなかったら、次に開いたとき（retry）に読み直す
        pending = null;
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, table, error]);
  return { table: table ?? loaded, error, retry: () => setError(null) };
}
