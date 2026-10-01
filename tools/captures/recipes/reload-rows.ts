// reload.ts --mode fit --shots の出力（1 行 1 リロードの JSON）を読み、観測値にする行を選ぶ（純粋な関数。V-0057 の読み方）。
// 取り消し（的のジャンプの窓で消えた回）・窓をまたいだ回・最終弾の読み違いの回は、最終弾 → 完了の集計から外す。

export type ReloadRow = {
  start: number;
  end: number;
  max: number;
  stages: number;
  canceled: boolean;
  fit: { rate: number; zero: number; frames: number; rms: number } | null;
  barSpan: number | null;
  chunks?: { start: number; end: number; max: number; rate?: number; zero?: number; frames?: number; rms?: number }[];
  lastShot?: number | null;
  lastToEnd?: number | null;
  endToNext?: number | null;
  zeroMinusShot?: number | null;
  window?: boolean;
  misread?: boolean;
};

/** 当てはめの残差の上限（px。reload.ts の MAX_FIT_RMS と同じ） */
export const MAX_FIT_RMS = 3;

export function parseReloadRows(text: string): ReloadRow[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as ReloadRow);
}

export type ReloadSummary = {
  /** 取り消し・窓を除いた回（最終弾の読み違いも除く）の最終弾 → 完了 */
  lastToEnd: { end: number; value: number }[];
  /** 取り消し・窓を除いた回の完了 → 次の増分 */
  endToNext: { end: number; value: number }[];
  /** 分割リロードでない武器: リロード全体のバーの長さ（当てはめの残差が小さい回）。--stages: 段ごとのバーの長さ */
  barFrames: number[];
  excluded: { canceled: number; window: number; misread: number };
};

export function summarizeReloads(rows: readonly ReloadRow[], stages: boolean): ReloadSummary {
  const usable = rows.filter((r) => !r.canceled && r.window !== true);
  const kept = usable.filter((r) => r.misread !== true && r.lastToEnd != null);
  const barFrames = stages
    ? usable.flatMap((r) =>
        (r.chunks ?? []).flatMap((c) =>
          c.frames !== undefined && c.rms !== undefined && c.rms <= MAX_FIT_RMS ? [c.frames] : [],
        ),
      )
    : usable.flatMap((r) => (r.fit !== null && r.fit.rms <= MAX_FIT_RMS ? [r.fit.frames] : []));
  return {
    lastToEnd: kept.map((r) => ({ end: r.end, value: r.lastToEnd! })),
    endToNext: usable.filter((r) => r.endToNext != null).map((r) => ({ end: r.end, value: r.endToNext! })),
    barFrames,
    excluded: {
      canceled: rows.filter((r) => r.canceled).length,
      window: rows.filter((r) => !r.canceled && r.window === true).length,
      misread: usable.filter((r) => r.misread === true).length,
    },
  };
}
