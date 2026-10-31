// フォルクヴァン（242）のバーストの吸収回復: 対象は最終攻撃力の上位 2 機で、順位はバーストを使ったフレームに付く窓を入れずに出す
// （plan/design-heal-top-attack.md 2 節の A・5 節）。録画 0710 の編成（V-0517、C-0695）で、回復の対象とアスカの S1 を見る。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { healsOf } from './historyHelpers.ts';
import { gameSecondsToFrames } from '../time.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
type Raw = { skills: Record<string, { effects: Record<string, unknown>[] }> };

/** 定義を読み、edit で生の JSON を書き換えてから解く（フォルクヴァンの回復のトリガー・機数を替え、効果を足すのに使う） */
function fixedSlot(id: number, edit?: (raw: Raw) => void): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const raw = readJson<Raw>(`../../data/skills/${id}.json`);
  edit?.(raw);
  return {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: { definition: parseSkillDefinition(raw), levels: MAX_SKILL_LEVELS },
  };
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };

function team(slots: TeamSlotInput[], controlledSlot: number): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst: true, controlledSlot };
}

const FOLKWANG = 242;

/** 枠 slot のフォルクヴァンの回復を受けた枠（フレームの順。同じフレームは枠の順） */
function healTargets(input: TeamInput, slot: number): { frame: number; slotIndex: number }[] {
  return healsOf(planTeamRun(input))
    .filter((h) => h.sourceSlotIndex === slot)
    .map(({ frame, slotIndex }) => ({ frame, slotIndex }))
    .sort((a, b) => a.frame - b.frame || a.slotIndex - b.slotIndex);
}

describe('録画 0710 の編成（ラム・I-DOLL・サン・フォルクヴァン・アスカ）', () => {
  const input = team([fixedSlot(822), fixedSlot(308), fixedSlot(FOLKWANG), fixedSlot(830)], 2);
  const plan = planTeamRun(input);
  const FW = 2;
  const ASUKA = 3;
  const uses = plan.schedule!.activations.filter((a) => a.slotIndex === FW).map((a) => a.frame);

  // 順位はアスカ → フォルクヴァン（自分も候補）→ サン → ラム
  it('heals Asuka and Folkwang herself on every burst use', () => {
    expect(uses.length).toBeGreaterThan(3);
    expect(healTargets(input, FW)).toEqual(
      uses.flatMap((frame) => [
        { frame, slotIndex: FW },
        { frame, slotIndex: ASUKA },
      ]),
    );
  });

  // C-0695: 使った時に 1 回だけ S1 を起こし、吸収回復の窓の中の命中では付き直さない（窓は発動ごとに 1 つ）
  it('gives Asuka S1 once per burst use, for 25 s from the use', () => {
    const s1 = itemsOf(plan.history, { holder: ASUKA, kind: 'timed', skill: 'skill1', stat: 'attack' });
    expect(s1.map((i) => i.start)).toEqual(uses);
    // 最後の回は戦闘の終わりで切れる
    for (const i of s1.slice(0, -1)) expect(i.end - i.start).toBe(gameSecondsToFrames(25));
    // 次の発動（40 秒後）より前に切れる
    s1.slice(0, -1).forEach((i, k) => expect(i.end).toBeLessThan(uses[k + 1]!));
  });
});

// 回復と同じフレームに付く攻撃力▲: 試しにフォルクヴァンのバーストに自分の攻撃力 65.81%▲（10 秒。ref 3・durationRef 4）を足すと、
// 順位に入れればフォルクヴァンがアスカより上になる。いまの定義には、回復と同じフレームに付く攻撃力▲は無い（設計書 3 節）
describe('同じフレームに付く攻撃力▲（録画 0710 の編成で、回復を 1 機にする）', () => {
  const FW = 2;
  const ASUKA = 3;
  const boosted = (trigger: string) =>
    fixedSlot(FOLKWANG, (raw) => {
      const effects = raw.skills.burst!.effects;
      Object.assign(effects[0]!, { targetCount: 1, trigger });
      effects.push({ kind: 'timed', trigger: 'burstUse', target: 'self', stat: 'attack', ref: 3, durationRef: 4 });
    });
  const inputWith = (trigger: string) => team([fixedSlot(822), fixedSlot(308), boosted(trigger), fixedSlot(830)], 2);

  it('leaves out the attack increase applied in the frame of the burst use (A)', () => {
    const input = inputWith('burstUse');
    const plan = planTeamRun(input);
    const own = itemsOf(plan.history, { holder: FW, kind: 'timed', skill: 'burst', stat: 'attack' });
    const targets = healTargets(input, FW);
    expect(targets.length).toBeGreaterThan(3);
    for (const t of targets) expect(own.some((i) => i.start === t.frame)).toBe(true);
    expect(targets.every((t) => t.slotIndex === ASUKA)).toBe(true);
  });

  it('counts an attack increase applied in an earlier frame', () => {
    // 回復をフルバーストの開始に替えると、その前（II の発動）に付いた▲が順位に入る
    const targets = healTargets(inputWith('fullBurstStart'), FW);
    expect(targets.length).toBeGreaterThan(3);
    expect(targets.every((t) => t.slotIndex === FW)).toBe(true);
  });
});
