// 1 パス目の最適化の段 1（plan/design-first-pass-perf.md 3.1・4 節）: 件の列は、件を作る関数が読む入力が変わったときだけ作り直す。
// 読む入力の落とし漏れがあると、その入力が変わった後も古い件を読む。いまの定義では古い件を読んでも結果に出ないことがある
// （ループの後の履歴は作り直されるので）ため、1 パス目を verifyItems で回し、ループの中で読むたびに、いまの入力から作り直した件と比べる。
// 編成は、定義にある件の列の種類と分かれ道（3.1 節の表）がそろうように選んだ（状態の N 発の間・フルバーストの終わりまでは定義に無い）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runFirstPass } from '../frame/firstPass.ts';
import { applyCompositionToTeam } from '../skills/composition.ts';
import type { HeldTrack } from '../skills/holders.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { applyTreasureToTeam, type TreasurePhase } from '../skills/treasure.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { toTimelineSlots, type TeamInput, type TeamSlotInput } from '../team.ts';
import { battleSecondsToFrames } from '../time.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

function fixedSlot(id: number, treasurePhase: TreasurePhase = 0): TeamSlotInput {
  const character = readJson<CharacterData>(`../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(character);
  return {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
      treasurePhase,
    },
  };
}

function team(slots: TeamSlotInput[], durationSeconds = 180): TeamInput {
  return {
    slots,
    enemy: { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true },
    durationSeconds,
    burst: true,
    controlledSlot: 2,
  };
}

const TEAMS: [string, TeamInput][] = [
  // 主力: スタック・消費・フルバーストの終わりまでの timed・循環の間隔の変更
  ['主力（82, 330, 271, 870, 225）', team([82, 330, 271, 870, 225].map((id) => fixedSlot(id)))],
  // N 発の間（ミランダの宝物版）・減少（ソーダ：トゥインクルバニー）・解除（マナ）
  ['32 宝物 3, 20, 314, 290, 352', team([fixedSlot(32, 3), ...[20, 314, 290, 352].map((id) => fixedSlot(id))])],
  // 撃ち切り・リロードの込め終わりまで・確率のきっかけ・敵の状態・while（確かめが重いので 60 秒）
  [
    '103, 511, 300, 862, 95（60 秒）',
    team(
      [103, 511, 300, 862, 95].map((id) => fixedSlot(id)),
      60,
    ),
  ],
];

/** 件の列の種類と分かれ道（3.1 節の表の行） */
function kindsOf(track: HeldTrack): string[] {
  const o = track.origin;
  const kinds: string[] = [o.kind];
  const fields = o.kind === 'timed' ? o.effect : o.kind === 'state' ? o.grant : null;
  if (fields?.durationShots !== undefined) kinds.push(`${o.kind}:shots`);
  if (fields?.durationUntil !== undefined) kinds.push(`${o.kind}:${fields.durationUntil}`);
  if (fields?.maxStacks !== undefined) kinds.push(`${o.kind}:stack`);
  if (track.opportunities !== null) kinds.push('chance');
  if (track.closes.length > 0) kinds.push('closes');
  if (track.consumes.length > 0) kinds.push('consumes');
  if (track.decreases.length > 0) kinds.push('decreases');
  return kinds;
}

describe('件の列は、件を作る関数が読む入力が変わったときに作り直す（plan/design-first-pass-perf.md 3.1 節）', () => {
  const seen = new Set<string>();
  it.each(TEAMS)('%s: ループの中で読む件 = いまの入力から作り直した件', (_, input) => {
    // frame/plan.ts の planTeamRun と同じ入力（条件は手入力なので、着地点の区間は無い）
    const { slots } = applyCompositionToTeam(applyTreasureToTeam(input));
    const { history } = runFirstPass(toTimelineSlots(slots), {
      frames: battleSecondsToFrames(input.durationSeconds),
      burst: true,
      controlledSlot: input.controlledSlot ?? null,
      verifyItems: true,
    });
    for (const track of history.tracks) for (const kind of kindsOf(track)) seen.add(kind);
  });

  it('編成が 3.1 節の表の種類と分かれ道をそろえる', () => {
    expect([...seen].sort()).toEqual(
      expect.arrayContaining([
        'chance',
        'closes',
        'consumes',
        'cycleEvery',
        'decreases',
        'enemyState',
        'healWindow',
        'passive',
        'state:stack',
        'timed:ammoSpent',
        'timed:fullBurstEnd',
        'timed:reloadEnd',
        'timed:shots',
        'while',
      ]),
    );
  });
});
