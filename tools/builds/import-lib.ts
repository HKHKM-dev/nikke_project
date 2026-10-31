// 育成データの取り込みの名前の決め方（plan/design-build-snapshot.md 2.2 節）と、録画に結び付けるスナップショットの選び方（同 6 節）。
// store.ts と tools/captures/intake.ts から使う。
import { SNAPSHOT_NAME } from '../../packages/core/src/records/ids.ts';
import type { SnapshotTreasure } from '../../packages/core/src/shiftypad.ts';

/** 取得の時刻（ISO）を日本時間の日付（YYYY-MM-DD）にする */
export function jstDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`fetchedAt が日時でない: ${iso}`);
  return new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
}

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
  const m = SNAPSHOT_NAME.exec(name);
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

/**
 * 録画に結び付けるスナップショットの既定（plan/design-build-snapshot.md 6 節）: 撮った日（date）以前でいちばん新しいもの。
 * 撮った日に取ったものが無ければ、知らせ（notice）を付ける
 */
export function snapshotForRecording(
  names: Iterable<string>,
  date: string,
): { name: string | null; notice: string | null } {
  const name = sortNames(names).findLast((n) => n.slice(0, 10) <= date) ?? null;
  const notice =
    name?.startsWith(date) === true
      ? null
      : `撮った日（${date}）の育成が無い（${name === null ? 'その日以前のスナップショットが無い' : `最新は ${name}`}）`;
  return { name, notice };
}

/**
 * 聞いたスナップショットの答え: 空なら既定、- なら書かない（null）、ほかは名前。名前の形でなければ undefined
 */
export function parseSnapshotAnswer(answer: string, fallback: string | null): string | null | undefined {
  const a = answer.trim();
  if (a === '') return fallback;
  if (a === '-') return null;
  return SNAPSHOT_NAME.test(a) ? a : undefined;
}

/** 取り込みの 1 枠（宝物を持つキャラの枠だけを渡す） */
export type TreasureSlot = { slot: number; rid: number; name: string };

/**
 * 宝物を持つ枠の段階（plan/design-workflow-simplification-6.md 3 節）。--treasure の値（given。0 は宝物なし）を優先し、無ければ
 * スナップショット（null なら無い）の段階（C-0744）。宝物を付けていなければ書かない。段階が決まらない枠（スナップショットが無い・
 * キャラが無い・Lv 0）は missing に出す（オーナーに確かめて --treasure で書く）
 */
export function treasureForSlots(
  slots: readonly TreasureSlot[],
  given: ReadonlyMap<number, number>,
  snapshot: {
    name: string;
    characters: Readonly<Record<string, { treasure: Pick<SnapshotTreasure, 'level' | 'phase'> | null }>>;
  } | null,
): { phases: Map<number, number>; notices: string[]; missing: string[] } {
  const phases = new Map<number, number>();
  const notices: string[] = [];
  const missing: string[] = [];
  for (const { slot, rid, name } of slots) {
    const c = snapshot?.characters[rid];
    // スナップショットの段階（0 は宝物なし）か、決まらない理由
    const known =
      snapshot === null
        ? '育成のスナップショットが無い'
        : c === undefined
          ? `スナップショット ${snapshot.name} にキャラが無い`
          : c.treasure === null
            ? 0
            : (c.treasure.phase ?? `スナップショット ${snapshot.name} の宝物が Lv ${c.treasure.level}（段階が未確定）`);
    const g = given.get(slot);
    const phase = g ?? (typeof known === 'number' ? known : undefined);
    if (phase === undefined) {
      missing.push(`枠 ${slot}（${name}）: ${known}`);
      continue;
    }
    if (phase > 0) phases.set(slot, phase);
    if (g === undefined)
      notices.push(
        `枠 ${slot}（${name}）: 宝物${phase > 0 ? `の段階 ${phase}` : 'なし（基礎版）'}（スナップショット ${snapshot!.name}）`,
      );
    else if (typeof known === 'number' && known !== g)
      notices.push(`枠 ${slot}（${name}）: --treasure は段階 ${g}、スナップショット ${snapshot!.name} は段階 ${known}`);
  }
  return { phases, notices, missing };
}
