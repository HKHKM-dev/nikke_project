// 育成データの取り込みの名前の決め方（plan/design-build-snapshot.md 2.2 節）。import.ts から使う。

/** 取得の時刻（ISO）を日本時間の日付（YYYY-MM-DD）にする */
export function jstDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`fetchedAt が日時でない: ${iso}`);
  return new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
}

/** スナップショットの名前の形（<日付> か <日付>-<枝番>） */
export const SNAPSHOT_NAME = /^\d{4}-\d{2}-\d{2}(-\d+)?$/;

/**
 * 取り込む生のデータの名前。同じ日の同じ中身（fetchedAt で見る）が既にあればその名前、無ければ空いている名前
 * （<日付>、<日付>-2、<日付>-3 …）。existing は既存の名前 → その fetchedAt。
 */
export function snapshotName(fetchedAt: string, existing: ReadonlyMap<string, string>): string {
  const date = jstDate(fetchedAt);
  for (const [name, at] of existing) if (at === fetchedAt && name.startsWith(date)) return name;
  for (let n = 1; ; n++) {
    const name = n === 1 ? date : `${date}-${n}`;
    if (!existing.has(name)) return name;
  }
}

function nameKey(name: string): [string, number] {
  const m = /^(\d{4}-\d{2}-\d{2})(?:-(\d+))?$/.exec(name);
  if (m === null) throw new Error(`スナップショットの名前でない: ${name}`);
  return [m[1]!, Number(m[2] ?? 1)];
}

/** 名前を古い順に並べる（同じ日は枝番の順。文字列の順だと -10 が -2 より前になるため） */
export function sortNames(names: Iterable<string>): string[] {
  return [...names].sort((a, b) => {
    const [da, na] = nameKey(a);
    const [db, nb] = nameKey(b);
    return da < db ? -1 : da > db ? 1 : na - nb;
  });
}

/** name の直前のスナップショットの名前（無ければ null） */
export function previousName(names: Iterable<string>, name: string): string | null {
  const sorted = sortNames(new Set([...names, name]));
  const i = sorted.indexOf(name);
  return i > 0 ? sorted[i - 1]! : null;
}
