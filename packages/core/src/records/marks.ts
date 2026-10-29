// 最小構成の検査の印（結論の minimal）の手入れ（plan/design-workflow-simplification-5.md 1 節）。
// - 行き先の無い印（要素が根拠の観測値のどの録画の要素にも無い）を出す（records:check の誤り）
// - 何も抑えていない印は relevance.ts の unusedMarks（plan/minimal.md の「使われていない印」）
// - スキル定義の notes が並び替わったときに、印の notes の添字を付け替える（records:check が git の差から回す。
//   文の一致で対応づけ、分かれ目の版のままの印だけを書き替える）
import type { SkillDefinition, SkillNote } from '../skills/types.ts';
import { SKILL_SLOTS } from '../skills/types.ts';
import { markElements, type Claim, type ClaimFile, type MinimalMark } from './claims.ts';
import type { MarkRef } from './relevance.ts';
import type { Observation } from './observations.ts';
import { elementsOf, type RelevanceContext } from './relevance.ts';

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

/** 定義の notes を「skill1」「treasureSkills.burst」などのスロットの名前ごとに */
export function notesBySlot(def: SkillDefinition): Map<string, readonly SkillNote[]> {
  const out = new Map<string, readonly SkillNote[]>();
  for (const slot of SKILL_SLOTS) {
    out.set(slot, def.skills[slot]?.notes ?? []);
    const t = def.treasureSkills?.[slot];
    if (t !== undefined) out.set(`treasureSkills.${slot}`, t.notes ?? []);
  }
  return out;
}

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

export type RenumberResult = { file: ClaimFile; changes: string[]; problems: string[] };

/**
 * 結論の印の notes の添字を、定義の前後（キャラの名前 → 前の版と今の版）で付け替える。書き替えるのは、分かれ目の版の結論（base）に
 * そのままある印だけ（このブランチで書いた・直した印は、もう今の番号で書いてあるとみる）。前の notes に今の対応先が無い印は problems に出す
 */
export function renumberMarks(
  file: ClaimFile,
  base: ClaimFile | undefined,
  defs: ReadonlyMap<string, { before: SkillDefinition; after: SkillDefinition }>,
): RenumberResult {
  const changes: string[] = [];
  const problems: string[] = [];
  if (file.minimal === undefined || base?.minimal === undefined) return { file, changes, problems };
  const baseMarks = new Set(base.minimal.map((m) => JSON.stringify(m)));
  const slots = new Map<
    string,
    { before: Map<string, readonly SkillNote[]>; after: Map<string, readonly SkillNote[]> }
  >();
  const slotsOf = (who: string) => {
    const d = defs.get(who);
    if (d === undefined) return undefined;
    let s = slots.get(who);
    if (s === undefined) {
      s = { before: notesBySlot(d.before), after: notesBySlot(d.after) };
      slots.set(who, s);
    }
    return s;
  };
  const rename = (element: string): string => {
    const m = NOTE_ELEMENT.exec(element);
    if (m === null) return element;
    const [, who, slot, index] = m as unknown as [string, string, string, string];
    const s = slotsOf(who);
    if (s === undefined) return element;
    const before = s.before.get(slot) ?? [];
    const i = Number(index);
    if (i >= before.length) return element; // 前の版でも行き先が無い（誤りは行き先の無い印の検査が出す）
    const j = noteIndexMap(before, s.after.get(slot) ?? [])[i];
    if (j === undefined) {
      problems.push(
        `${file.id}: 印 ${element} の notes（「${before[i]!.ja}」）が今の定義に無い。印を今の要素に直すか外す（直したら decided を今日に）`,
      );
      return element;
    }
    if (j === i) return element;
    const next = `${who} ${slot}.notes[${j}]`;
    changes.push(`${file.id}: 印 ${element} → ${next}`);
    return next;
  };
  const minimal: MinimalMark[] = file.minimal.map((m) => {
    if (!baseMarks.has(JSON.stringify(m))) return m;
    const element = typeof m.element === 'string' ? rename(m.element) : m.element.map(rename);
    return { ...m, element };
  });
  return { file: changes.length === 0 ? file : { ...file, minimal }, changes, problems };
}
