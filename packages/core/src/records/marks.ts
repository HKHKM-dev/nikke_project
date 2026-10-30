// 最小構成の検査の印（結論の minimal）の手入れ（plan/design-workflow-simplification-5.md 1 節）。
// - 行き先の無い印（要素が根拠の観測値のどの録画の要素にも無い）を出す（records:check の誤り）
// - 何も抑えていない印は relevance.ts の unusedMarks（plan/minimal.md の「使われていない印」）
// - スキル定義の notes が並び替わったときに、印の notes の添字を付け替える（records:check が git の差から回す。
//   文の一致で対応づけ、分かれ目の版の印からいつも計算し直す）
import type { SkillDefinition, SkillNote } from '../skills/types.ts';
import { markElements, type Claim, type ClaimFile, type MinimalMark } from './claims.ts';
import type { Observation } from './observations.ts';
import { elementsOf, type MarkRef, type RelevanceContext } from './relevance.ts';
import { entriesOf } from './skills.ts';

/** 行き先の無い印。根拠の観測値の録画が 1 本も引けない印は判断できないので出さない */
export function danglingMarks(
  claims: readonly Claim[],
  observations: readonly Observation[],
  ctx: RelevanceContext,
): MarkRef[] {
  const obs = new Map(observations.map((o) => [o.id, o]));
  const names = new Map<string, Set<string>>();
  const namesOf = (recording: string): Set<string> | undefined => {
    const rec = ctx.recordings.get(recording);
    if (rec === undefined) return undefined;
    let s = names.get(recording);
    if (s === undefined) {
      s = new Set(elementsOf(rec, ctx).map((e) => e.name));
      names.set(recording, s);
    }
    return s;
  };
  const out: MarkRef[] = [];
  for (const c of claims)
    for (const m of c.minimal ?? []) {
      const ids = m.observations === '*' ? c.observations : m.observations;
      const sets = ids.flatMap((id) => {
        const o = obs.get(id);
        if (o === undefined) return [];
        return (o.recordings ?? [o.recording]).flatMap((r) => namesOf(r) ?? []);
      });
      if (sets.length === 0) continue;
      for (const element of markElements(m)) if (!sets.some((s) => s.has(element))) out.push({ claim: c.id, element });
    }
  return out;
}

const NOTE_ELEMENT = /^(.+) ((?:treasureSkills\.)?(?:skill1|skill2|burst))\.notes\[(\d+)\]$/;

/** 前の notes の添字 → 今の notes の添字（文（ja）の一致。同じ添字を優先し、今の notes は 1 回ずつ使う）。対応先が無ければ undefined */
export function noteIndexMap(before: readonly SkillNote[], after: readonly SkillNote[]): (number | undefined)[] {
  const used = new Set<number>();
  const out: (number | undefined)[] = before.map((n, i) => {
    if (after[i]?.ja === n.ja) {
      used.add(i);
      return i;
    }
    return undefined;
  });
  before.forEach((n, i) => {
    if (out[i] !== undefined) return;
    const j = after.findIndex((a, k) => !used.has(k) && a.ja === n.ja);
    if (j >= 0) {
      used.add(j);
      out[i] = j;
    }
  });
  return out;
}

/** 定義の前後の notes の対応。スロットの名前（「burst」「treasureSkills.skill1」など）→ 前の notes と、前の添字 → 今の添字 */
export type NoteMoves = ReadonlyMap<string, { before: readonly SkillNote[]; index: (number | undefined)[] }>;

export function noteMoves(before: SkillDefinition, after: SkillDefinition): NoteMoves {
  const name = (root: string, slot: string) => (root === 'skills' ? slot : `treasureSkills.${slot}`);
  const now = new Map(entriesOf(after).map(({ root, slot, entry }) => [name(root, slot), entry.notes ?? []]));
  return new Map(
    entriesOf(before).map(({ root, slot, entry }) => {
      const notes = entry.notes ?? [];
      return [name(root, slot), { before: notes, index: noteIndexMap(notes, now.get(name(root, slot)) ?? []) }];
    }),
  );
}

export type RenumberResult = { file: ClaimFile; changes: string[]; problems: string[] };

/**
 * 付け替えで変わらない印の鍵: 素性（要素を除いた欄。人が直したら decided が変わる）と、要素の形（notes の添字を除いた名前）
 */
const unnumberedOf = (m: MinimalMark): string =>
  JSON.stringify({
    ...m,
    element: [
      typeof m.element,
      markElements(m).map((e) => {
        const n = NOTE_ELEMENT.exec(e);
        return n === null ? e : `${n[1]} ${n[2]}.notes`;
      }),
    ],
  });

/**
 * 結論の印の notes の添字を、定義の前後の対応（キャラの名前 → noteMoves。分かれ目の版 → 今）で付け替える。
 * 付け替えは、いつも分かれ目の版の結論（base）の印から計算し直す（2 回回しても、同じブランチで定義を 2 回変えても同じ結果になる）。
 * 今の印の元は、base にそのままある印か、素性と要素の形が同じ base の印がちょうど 1 つあるとき、その印。どちらでもない印（このブランチで
 * 書いた・直した印）は、もう今の番号で書いてあるとみて触らない。前の notes に今の対応先が無い要素は、回すたびに problems に出す
 */
export function renumberMarks(
  file: ClaimFile,
  base: ClaimFile | undefined,
  moves: ReadonlyMap<string, NoteMoves>,
): RenumberResult {
  const changes: string[] = [];
  const problems: string[] = [];
  if (file.minimal === undefined || base?.minimal === undefined) return { file, changes, problems };
  const baseMarks = base.minimal.map((b) => ({ mark: b, text: JSON.stringify(b), key: unnumberedOf(b) }));
  const sourceOf = (m: MinimalMark): MinimalMark | undefined => {
    const key = unnumberedOf(m);
    const candidates = baseMarks.filter((b) => b.key === key);
    const text = JSON.stringify(m);
    return (candidates.find((b) => b.text === text) ?? (candidates.length === 1 ? candidates[0] : undefined))?.mark;
  };
  const rename = (element: string): string => {
    const m = NOTE_ELEMENT.exec(element);
    if (m === null) return element;
    const [, who, slot, index] = m as unknown as [string, string, string, string];
    const move = moves.get(who)?.get(slot);
    const i = Number(index);
    if (move === undefined || i >= move.before.length) return element; // 前の版でも行き先が無い印は、行き先の無い印の検査が出す
    const j = move.index[i];
    if (j === undefined) {
      problems.push(
        `${file.id}: 印 ${element}（分かれ目の版の番号）の notes（「${move.before[i]!.ja}」）が今の定義に無い。印を今の要素に直すか外す（直したら decided を今日に）`,
      );
      return element;
    }
    return `${who} ${slot}.notes[${j}]`;
  };
  const minimal: MinimalMark[] = file.minimal.map((m) => {
    const source = sourceOf(m);
    if (source === undefined) return m;
    const element = typeof source.element === 'string' ? rename(source.element) : source.element.map(rename);
    const out = { ...m, element };
    const now = markElements(m);
    markElements(out).forEach((e, k) => {
      if (e !== now[k]) changes.push(`${file.id}: 印 ${now[k]} → ${e}`);
    });
    return out;
  });
  return { file: changes.length === 0 ? file : { ...file, minimal }, changes, problems };
}
