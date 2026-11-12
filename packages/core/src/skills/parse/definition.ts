// スキル定義の読み込みの検査のうち、定義のファイル（data/skills/{resourceId}.json）と索引の読み込みの入口。types.ts が再び公開する。型は ../types.ts
import {
  type BurstStepChangeEffect,
  type ClaimRefs,
  deriveSkillSupport,
  isShotCountTrigger,
  SKILL_SLOTS,
  type SkillDefinition,
  type SkillEntry,
  type SkillIndex,
  type SkillNote,
  type SkillSlot,
  type SkillSupportGap,
  type SkillSupportIndex,
} from '../types.ts';
import { fail, isRecord, type Json, parseNonNegativeInt, rejectUnknownKeys } from './common.ts';
import { validateBurstHitTriggers, validateCrossChecks } from './crossChecks.ts';
import { parseEffect } from './effect.ts';
import { NOTE_REFERS, parseNote } from './notes.ts';

/** 名前の付いたバースト段階の変更と同じ（か逆の）編成の条件 burstStepMix の効果に、どちらの側かを書く（BurstStepMode） */
function markBurstStepModes(skills: Record<SkillSlot, SkillEntry>, change: BurstStepChangeEffect | undefined): void {
  const mix = change?.burstStepMix;
  if (change?.name === undefined || mix === undefined) return;
  for (const slot of SKILL_SLOTS) {
    for (const e of skills[slot].effects) {
      if (
        e.kind === 'burstStepChange' ||
        !('burstStepMix' in e) ||
        e.burstStepMix?.otherBurstStep !== mix.otherBurstStep
      )
        continue;
      e.burstStepMode = { name: change.name, changed: e.burstStepMix.present === mix.present };
    }
  }
}

/**
 * 使用武器の変更の state を、同じきっかけ・維持・条件・根拠の、中身の無い自分への付与にする
 * （状態を見る側は付与だけを見るので、変更の窓と同じ窓の付与を足す。plan/design-nayuta.md 2.5 節の論点 2）。
 * 足した付与は weaponChangeOf の印を持ち、スロットの効果の終わりに並ぶ
 * （手書きの効果の番号は変わらない）
 */
function weaponChangeGrantsOf(
  raws: readonly Json[],
  effects: readonly SkillEntry['effects'][number][],
  path: string,
  slot: SkillSlot,
): SkillEntry['effects'][number][] {
  const out: SkillEntry['effects'][number][] = [];
  effects.forEach((e, i) => {
    if (e.kind !== 'weaponChange' || e.state === undefined) return;
    const raw = raws[i] as Record<string, Json>;
    const grant: Record<string, Json> = { kind: 'state', state: e.state, trigger: raw.trigger!, target: 'self' };
    for (const key of ['durationRef', 'durationSeconds', 'condition', 'claims'] as const)
      if (raw[key] !== undefined) grant[key] = raw[key];
    const parsed = parseEffect(grant, `${path}.effects[${i}].state`, slot);
    if (parsed.kind !== 'state') throw new Error('unreachable: a state grant parsed to another kind');
    parsed.weaponChangeOf = true;
    out.push(parsed);
  });
  return out;
}

function parseEntry(v: Json, slot: SkillSlot, root: 'skills' | 'treasureSkills' = 'skills'): SkillEntry {
  const path = `${root}.${slot}`;
  if (!isRecord(v)) fail(path, 'expected an object');
  if (v.support !== undefined)
    fail(`${path}.support`, 'support is derived from effects and notes (plan/design-skill-note-kinds.md); remove it');
  if (!Array.isArray(v.effects)) fail(`${path}.effects`, 'expected an array');
  const effects = v.effects.map((e, i) => parseEffect(e, `${path}.effects[${i}]`, slot));
  effects.push(...weaponChangeGrantsOf(v.effects, effects, path, slot));
  validateBurstHitTriggers(effects, slot, path);
  let notes: SkillNote[] | undefined;
  if (v.notes !== undefined) {
    if (!Array.isArray(v.notes)) fail(`${path}.notes`, 'expected an array');
    notes = v.notes.map((n, i) => parseNote(n, `${path}.notes[${i}]`));
  }
  if (effects.length === 0 && (notes ?? []).length === 0)
    fail(`${path}.notes`, 'a slot without effects needs notes saying why');
  notes?.forEach((n, i) => {
    const index = n.refers === undefined ? undefined : Number(NOTE_REFERS.exec(n.refers)![1]);
    if (index !== undefined && index >= effects.length)
      fail(`${path}.notes[${i}].refers`, `${n.refers} is not an effect of this slot`);
  });
  const entry: SkillEntry = { support: deriveSkillSupport(effects, notes), effects };
  if (v.sequential !== undefined) {
    if (v.sequential !== true) fail(`${path}.sequential`, 'expected true');
    // スキルのスロットにも書ける（plan/design-ludmilla-wo.md 2.4 節）。burst は先頭が burstDamage
    if (slot === 'burst' && effects[0]?.kind !== 'burstDamage') {
      fail(`${path}.sequential`, 'the first effect of a sequential burst must be burstDamage');
    }
    // 順番の効果は、射撃の回数の発火の次のフレームから窓を数える（frame/plan.ts）。遅れたヒットとの順は決めていない
    if (effects.some((e) => e.kind === 'damage' && e.delayFrames !== undefined && isShotCountTrigger(e.trigger))) {
      fail(`${path}.sequential`, 'a sequential skill cannot have a delayed shot count damage');
    }
    entry.sequential = true;
  }
  if (notes !== undefined) entry.notes = notes;
  return entry;
}

/** JSON.parse 済みの値を検証して SkillDefinition にする。不正なら Error */
export function parseSkillDefinition(raw: Json): SkillDefinition {
  if (!isRecord(raw)) fail('', 'expected an object');
  if (raw.formatVersion !== 1) fail('formatVersion', `expected 1, got ${JSON.stringify(raw.formatVersion)}`);
  if (typeof raw.resourceId !== 'number' || !Number.isInteger(raw.resourceId) || raw.resourceId < 1) {
    fail('resourceId', 'expected a positive integer');
  }
  if (typeof raw.checkedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.checkedAt)) {
    fail('checkedAt', 'expected a YYYY-MM-DD string');
  }
  if (!isRecord(raw.skills)) fail('skills', 'expected an object');
  rejectUnknownKeys(raw.skills, SKILL_SLOTS, 'skills', 'unknown skill slot');
  const skills = {} as Record<SkillSlot, SkillEntry>;
  for (const slot of SKILL_SLOTS) skills[slot] = parseEntry(raw.skills[slot], slot);
  // バースト再突入は 1 つの定義に 1 つまで（次の段階は 1 つしか持てない）。バースト段階の変更も
  // （持つ枠の段は 1 つしか持てない）
  const effects = SKILL_SLOTS.flatMap((slot) => skills[slot]!.effects);
  for (const kind of ['burstReentry', 'burstStepChange', 'allyGaugeAdd'] as const) {
    if (effects.filter((e) => e.kind === kind).length > 1) fail('skills', `at most one ${kind} effect per definition`);
  }
  markBurstStepModes(
    skills,
    effects.find((e): e is BurstStepChangeEffect & ClaimRefs => e.kind === 'burstStepChange'),
  );
  validateCrossChecks(skills, 'skills');
  const def: SkillDefinition = { formatVersion: 1, resourceId: raw.resourceId, checkedAt: raw.checkedAt, skills };
  // 古い形の states は弾く（静的な付与（kind: 'state'）で書く）
  if (raw.states !== undefined) {
    fail('states', 'states was replaced by a static state grant (kind "state". plan/design-named-state.md)');
  }
  if (raw.treasureSkills !== undefined) {
    const treasure = raw.treasureSkills;
    if (!isRecord(treasure)) fail('treasureSkills', 'expected an object');
    const treasureSkills: Partial<Record<SkillSlot, SkillEntry>> = {};
    for (const key of Object.keys(treasure)) {
      if (!(SKILL_SLOTS as readonly string[]).includes(key)) fail(`treasureSkills.${key}`, 'unknown skill slot');
      const slot = key as SkillSlot;
      treasureSkills[slot] = parseEntry(treasure[slot], slot, 'treasureSkills');
    }
    validateCrossChecks({ ...skills, ...treasureSkills }, 'treasureSkills');
    def.treasureSkills = treasureSkills;
  }
  return def;
}

export function parseSkillIndex(raw: Json): SkillIndex {
  if (!isRecord(raw)) fail('index', 'expected an object');
  if (raw.formatVersion !== 1) fail('index.formatVersion', `expected 1, got ${JSON.stringify(raw.formatVersion)}`);
  if (!Array.isArray(raw.resourceIds) || !raw.resourceIds.every((id) => Number.isInteger(id) && (id as number) > 0)) {
    fail('index.resourceIds', 'expected an array of positive integers');
  }
  return { formatVersion: 1, resourceIds: raw.resourceIds as number[] };
}

/** 対応状況の索引（生成物。skills/support.ts）。不正なら Error */
export function parseSkillSupportIndex(raw: Json): SkillSupportIndex {
  if (!isRecord(raw)) fail('support', 'expected an object');
  if (raw.formatVersion !== 1) fail('support.formatVersion', `expected 1, got ${JSON.stringify(raw.formatVersion)}`);
  const ids = raw.fullySupported;
  if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id) && (id as number) > 0)) {
    fail('support.fullySupported', 'expected an array of positive integers');
  }
  // 件数は知らせにだけ使うので、無い（古い索引）ときは空にする
  const gaps: Record<string, SkillSupportGap> = {};
  if (raw.gaps !== undefined) {
    if (!isRecord(raw.gaps)) fail('support.gaps', 'expected an object');
    for (const [id, gap] of Object.entries(raw.gaps)) {
      if (!isRecord(gap)) fail(`support.gaps.${id}`, 'expected { unimplemented, assumed }');
      gaps[id] = {
        unimplemented: parseNonNegativeInt(gap.unimplemented, `support.gaps.${id}.unimplemented`),
        assumed: parseNonNegativeInt(gap.assumed, `support.gaps.${id}.assumed`),
      };
    }
  }
  return { formatVersion: 1, fullySupported: ids as number[], gaps };
}
