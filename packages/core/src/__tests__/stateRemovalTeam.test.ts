// 2 段目の段 1 の PR 2（plan/design-skill-stage1.md 1.2・1.4〜1.6 節・2.2 節）: 解除（removeState）、直前に自分がバーストを使用して
// いれば（condition.usedBurst）、状態ごとの静的の決め方、時間で変わるバーストゲージのチャージ速度と、それで書き直したマナの定義。
// 定義は data/skills のもの（クイーン（真）・マナ）と、それを書き換えたもの
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { applyCompositionToTeam } from '../skills/composition.ts';
import { itemsOf } from '../skills/holders.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition, staticStatesOf, type SkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData, Element } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
type RawEffect = Record<string, unknown>;
type RawDefinition = { skills: Record<string, { effects: RawEffect[]; notes?: unknown[] }> };
const rawDefinition = (id: number) => readJson<RawDefinition>(`../../data/skills/${id}.json`);
const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);

const MANA = 290;
const QUEEN = 870;

function slotOf(id: number, definition?: unknown): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
  };
  const raw = definition ?? (DEFINED.has(id) ? rawDefinition(id) : undefined);
  if (raw !== undefined) slot.skills = { definition: parseSkillDefinition(raw), levels: MAX_SKILL_LEVELS };
  return slot;
}

function run(slots: TeamSlotInput[], element: Element | null, controlledSlot: number | null) {
  const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element, hasCore: true };
  const input: TeamInput = { slots, enemy, durationSeconds: 180, burst: true, controlledSlot };
  return planTeamRun(applyCompositionToTeam(input));
}

const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const parse = (effects: RawEffect[]): SkillDefinition =>
  parseSkillDefinition({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-16',
    skills: { skill1: { effects }, skill2: empty, burst: empty },
  });

const forever = (state: string, extra: RawEffect = {}): RawEffect => ({
  kind: 'state',
  state,
  trigger: 'battleStart',
  target: 'self',
  durationUntil: 'battleEnd',
  ...extra,
});
const remove = (state: string, extra: RawEffect = {}): RawEffect => ({
  kind: 'removeState',
  state,
  trigger: 'fullBurstStart',
  target: 'self',
  ...extra,
});

describe('解除と usedBurst の読み込み', () => {
  it('reads a removal of a state on self, with a condition', () => {
    const def = parse([forever('camouflage'), remove('camouflage', { condition: { selfState: 'camouflage' } })]);
    expect(def.skills.skill1.effects[1]).toEqual({
      kind: 'removeState',
      state: 'camouflage',
      trigger: 'fullBurstStart',
      target: 'self',
      condition: { selfState: { state: 'camouflage', present: true } },
    });
  });

  it('rejects a removal of an ally, of an enemy state, with a chance or timer trigger, and unknown fields', () => {
    expect(() => parse([remove('camouflage', { target: 'allies' })])).toThrow(/expected "self"/);
    expect(() => parse([remove('hacked')])).toThrow(/held by the enemy/);
    expect(() => parse([remove('camouflage', { trigger: { count: 'normalHit', chance: 50 } })])).toThrow(/chance/);
    expect(() => parse([remove('camouflage', { trigger: { everySeconds: 5 } })])).toThrow(/timer trigger/);
    expect(() => parse([remove('camouflage', { durationSeconds: 1 })])).toThrow(/unknown field/);
  });

  it('allows usedBurst only with the start or the end of Full Burst', () => {
    const regrant = forever('camouflage', { trigger: 'fullBurstEnd', condition: { usedBurst: true } });
    expect(parse([forever('camouflage'), regrant]).skills.skill1.effects[1]).toMatchObject({
      condition: { usedBurst: true },
    });
    expect(parse([remove('camouflage', { condition: { usedBurst: true } })]).skills.skill1.effects).toHaveLength(1);
    expect(() => parse([{ ...regrant, trigger: 'burstUse' }])).toThrow(/usedBurst is only allowed with trigger/);
    expect(() => parse([{ ...regrant, condition: { usedBurst: false } }])).toThrow(/usedBurst: expected true/);
    const timed = {
      kind: 'timed',
      trigger: 'fullBurstStart',
      target: 'self',
      stat: 'attack',
      ref: 1,
      durationSeconds: 1,
    };
    expect(parse([{ ...timed, condition: { usedBurst: true } }]).skills.skill1.effects).toHaveLength(1);
  });

  it('does not make a state static when the definition removes it', () => {
    expect(staticStatesOf(parse([forever('camouflage')]))).toEqual(['camouflage']);
    expect(staticStatesOf(parse([forever('camouflage'), remove('camouflage')]))).toEqual([]);
  });
});

describe('解除で閉じる件（クイーン（真）の定義を書き換え）', () => {
  /** ラム（I）+ デルタ（II）+ クイーン（真）（III・操作）。クイーン（真）だけが III なので、どのフルバーストでもクイーン（真）が撃つ */
  const q = 2;
  const extra = rawDefinition(QUEEN).skills.skill1!.effects.length;
  const withEffects = (effects: RawEffect[]) => {
    const raw = structuredClone(rawDefinition(QUEEN));
    raw.skills.skill1!.effects.push(...effects);
    return run([slotOf(822), slotOf(20), slotOf(QUEEN, raw)], 'Wind', q);
  };
  const camouflageItems = (plan: ReturnType<typeof run>) =>
    itemsOf(plan.history, { holder: q, state: 'camouflage' }).map((i) => [i.start, i.end]);
  const fullBursts = (plan: ReturnType<typeof run>) => plan.schedule!.fullBurstWindows;

  it('closes the item at the frame after the removal fires (f + 1)', () => {
    const plan = withEffects([forever('camouflage'), remove('camouflage')]);
    const first = fullBursts(plan)[0]!;
    expect(camouflageItems(plan)).toEqual([[0, first.start + 1]]);
  });

  it('re-grants with usedBurst at the end of Full Burst, and the selfState of the same frame still sees the state', () => {
    const attack = {
      kind: 'timed',
      trigger: 'fullBurstStart',
      target: 'self',
      stat: 'attackDamage',
      ref: 1,
      durationSeconds: 1,
      condition: { selfState: 'camouflage' },
    };
    const plan = withEffects([
      forever('camouflage'),
      remove('camouflage'),
      forever('camouflage', { trigger: 'fullBurstEnd', condition: { usedBurst: true } }),
      attack,
    ]);
    const windows = fullBursts(plan);
    expect(windows.length).toBeGreaterThan(1);
    expect(windows.every((w) => w.burstUsers.includes(q))).toBe(true);
    const frames = plan.history.frames;
    const expected: [number, number][] = [[0, windows[0]!.start + 1]];
    windows.forEach((w, k) => {
      if (w.end >= frames) return;
      expected.push([w.end, k + 1 < windows.length ? windows[k + 1]!.start + 1 : frames]);
    });
    expect(camouflageItems(plan)).toEqual(expected);
    // 解除と同じフルバーストの開始の攻撃ダメージ▲は、外れる前の状態を見て毎回発火する
    const fired = itemsOf(plan.history, {
      holder: q,
      sourceSlotIndex: q,
      kind: 'timed',
      skill: 'skill1',
      effectIndex: extra + 3,
    });
    expect(fired.map((i) => i.start)).toEqual(windows.map((w) => w.start));
  });

  it('lets a grant at the same frame win, and keeps an undispellable state', () => {
    const sameFrame = withEffects([
      forever('camouflage'),
      remove('camouflage'),
      forever('camouflage', { trigger: 'fullBurstStart' }),
    ]);
    expect(camouflageItems(sameFrame)).toEqual([[0, sameFrame.history.frames]]);
    const undispellable = withEffects([forever('camouflage', { undispellable: true }), remove('camouflage')]);
    expect(camouflageItems(undispellable)).toEqual([[0, undispellable.history.frames]]);
  });
});

/** マナの定義を、2 段目の段 1 より前の書き方（マターシグマを常時パッシブ・フルバーストの開始の効果は毎回発動）に戻したもの */
function manaBeforeStage1(): RawDefinition {
  const raw = structuredClone(rawDefinition(MANA));
  const s2 = raw.skills.skill2!.effects;
  const conditionless = (e: RawEffect): RawEffect => {
    const { condition: _condition, ...rest } = e;
    return rest;
  };
  raw.skills.skill2!.effects = [
    { kind: 'passive', target: 'self', stat: 'burstGaugeSpeed', ref: 1 },
    conditionless(s2[1]!),
    conditionless(s2[2]!),
    s2[3]!,
  ];
  return raw;
}

describe('マナ（2 段目の段 1 の 2.2 節）', () => {
  it('writes Metal γ as a static state and Metal σ as a state removed at the start of Full Burst', () => {
    const def = parseSkillDefinition(rawDefinition(MANA));
    expect(staticStatesOf(def)).toEqual(['metalGamma']);
    expect(def.skills.skill2.effects.map((e) => e.kind)).toEqual([
      'state',
      'timed',
      'timed',
      'timed',
      'removeState',
      'state',
    ]);
  });

  it('gives the same gauge as the old passive while Mana bursts in every Full Burst (録画 020 の編成)', () => {
    const slots = (mana: unknown) => [slotOf(291), slotOf(20), slotOf(MANA, mana)];
    const now = run(slots(undefined), 'Electronic', 2);
    const before = run(slots(manaBeforeStage1()), 'Electronic', 2);
    expect(now.schedule!.fullBurstWindows.every((w) => w.burstUsers.includes(2))).toBe(true);
    expect(now.schedule!.gaugeFullFrames).toEqual(before.schedule!.gaugeFullFrames);
    expect(now.schedule!.fullBurstWindows).toEqual(before.schedule!.fullBurstWindows);
    // 単騎（フルバーストが無い）でも、1 回目の満タンは常時の値と同じ
    const solo = run([slotOf(MANA)], 'Electronic', 0);
    const soloBefore = run([slotOf(MANA, manaBeforeStage1())], 'Electronic', 0);
    expect(solo.schedule!.gaugeFullFrames).toEqual(soloBefore.schedule!.gaugeFullFrames);
  });

  it('does not re-grant Metal σ after a Full Burst in which Mana did not burst (録画 043 の形の編成)', () => {
    // フラワー（I）+ クラウン（II）+ アリス（III）+ マナ（III）。III の候補は枠の若い順なので、アリスとマナが交互に撃つ
    const m = 3;
    const slots = (mana: unknown) => [slotOf(304), slotOf(330), slotOf(191), slotOf(MANA, mana)];
    const now = run(slots(undefined), 'Fire', 2);
    const before = run(slots(manaBeforeStage1()), 'Fire', 2);
    const windows = now.schedule!.fullBurstWindows;
    const skipped = windows.filter((w) => !w.burstUsers.includes(m));
    expect(skipped.length).toBeGreaterThan(0);
    expect(windows.some((w) => w.burstUsers.includes(m))).toBe(true);
    // 付け直しは、マナが撃ったフルバーストの終わりだけ（撃たなかった回は条件を満たさなかった記録）
    const regrants = itemsOf(now.history, { holder: m, state: 'metalSigma' }).map((i) => i.start);
    const frames = now.history.frames;
    expect(regrants).toEqual([
      0,
      ...windows.filter((w) => w.burstUsers.includes(m) && w.end < frames).map((w) => w.end),
    ]);
    const skips = now.history.conditionSkips.filter(
      (x) => x.sourceSlotIndex === m && x.state === 'metalSigma' && x.effect.effectIndex === 5,
    );
    expect(skips.map((x) => x.frame)).toEqual(skipped.filter((w) => w.end < frames).map((w) => w.end));
    // マターシグマが付いていないフルバーストの開始では、攻撃ダメージ▲・攻撃力▲も付かない
    const attackDamage = itemsOf(now.history, {
      holder: m,
      sourceSlotIndex: m,
      kind: 'timed',
      skill: 'skill2',
      effectIndex: 1,
    });
    const onAt = (frame: number) =>
      itemsOf(now.history, { holder: m, state: 'metalSigma' }).some((i) => i.start <= frame && frame < i.end);
    expect(attackDamage.map((i) => i.start)).toEqual(windows.filter((w) => onAt(w.start)).map((w) => w.start));
    // ゲージは、マナが撃たなかったフルバーストの後だけ遅く満ちる（チャージ速度▲なし）
    const late = now.schedule!.gaugeFullFrames.map((f, k) => f - before.schedule!.gaugeFullFrames[k]!);
    expect(late.every((d) => d >= 0)).toBe(true);
    expect(late.some((d) => d > 0)).toBe(true);
  });
});
