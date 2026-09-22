// Stage 5: ヘッドレスの実行口。sim（フレーム逐次）と calc（2 区間の期待値）の枠別・区間別の内訳を表で出す。
//   node scripts/sim-run.ts --ids 271,870 [--fixed-spec] [--duration 180] [--no-burst] [--defence 100] [--element Fire]
// 育成値は既定 Lv200・3 凸・コア 0、条件は コア命中率 1・距離ボーナスあり・フルチャージ（calc の既定と同じ）。
// スキル定義は data/skills/ にあるものを読む（無ければ定義なし = 通常攻撃のみ、味方のバフは受ける）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { computeFixedSpecAttack, fixedSpecGrowth } from '../src/fixedSpec.ts';
import { runSimulation } from '../src/sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../src/skills/resolve.ts';
import { parseSkillDefinition, parseSkillIndex } from '../src/skills/types.ts';
import { computeTeamDamage, TEAM_SIZE, type TeamSlotInput } from '../src/team.ts';
import type { CharacterData, Element } from '../src/types.ts';
import { FPS } from '../src/weapons.ts';

const DATA_DIR = join(import.meta.dirname, '../data');

const { values } = parseArgs({
  options: {
    ids: { type: 'string' },
    'fixed-spec': { type: 'boolean', default: false },
    duration: { type: 'string', default: '180' },
    'no-burst': { type: 'boolean', default: false },
    defence: { type: 'string', default: '100' },
    element: { type: 'string' },
    'core-hit-rate': { type: 'string', default: '1' },
  },
});

if (!values.ids) {
  console.error('usage: node scripts/sim-run.ts --ids 271,870 [--fixed-spec] [--duration 180] [--no-burst]');
  process.exit(2);
}
const ids = values.ids.split(',').map((s) => Number(s.trim()));
if (ids.length < 1 || ids.length > TEAM_SIZE || ids.some((id) => !Number.isInteger(id) || id < 1)) {
  console.error(`--ids must list 1..${TEAM_SIZE} resource ids`);
  process.exit(2);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}
const skillIndex = parseSkillIndex(readJson(join(DATA_DIR, 'skills/index.json')));
const fixedSpec = values['fixed-spec'];
const condition = { coreHitRate: Number(values['core-hit-rate']), distanceBonus: true, fullCharge: true };

const slots: TeamSlotInput[] = ids.map((id) => {
  const character = readJson(join(DATA_DIR, `characters/${id}.json`)) as CharacterData;
  const definition = skillIndex.resourceIds.includes(id)
    ? parseSkillDefinition(readJson(join(DATA_DIR, `skills/${id}.json`)))
    : null;
  const skills = { definition, levels: MAX_SKILL_LEVELS };
  return fixedSpec
    ? {
        character,
        growth: fixedSpecGrowth(character),
        condition,
        attackOverride: computeFixedSpecAttack(character).attack,
        skills,
      }
    : { character, growth: { level: 200, grade: 3, core: 0 }, condition, skills };
});

const input = {
  slots,
  enemy: { defence: Number(values.defence), element: (values.element as Element | undefined) ?? null, hasCore: true },
  durationSeconds: Number(values.duration),
  burst: !values['no-burst'],
};
const sim = runSimulation(input);
const calc = computeTeamDamage(input);

const fmt = (n: number, digits = 0) => n.toLocaleString('en-US', { maximumFractionDigits: digits });
const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

console.log(
  `duration ${input.durationSeconds}s (${sim.frames}f), burst ${input.burst ? 'fixed 20s cycle' : 'off'}, ` +
    `fixed spec ${fixedSpec}, enemy defence ${input.enemy.defence}, element ${input.enemy.element ?? 'none'}`,
);
if (calc.schedule) {
  const a = calc.schedule.assignment;
  const who = (i: number | null) => (i === null ? '-' : `slot ${i + 1} ${slots[i]!.character.name.ja}`);
  console.log(
    `activations ${calc.schedule.activationFrames.length} (first at ${(calc.schedule.activationFrames[0] ?? 0) / FPS}s), ` +
      `full burst ${calc.schedule.fullBurstFramesTotal / FPS}s; I: ${who(a.Step1)}, II: ${who(a.Step2)}, III: ${who(a.Step3)}`,
  );
}

const rows = slots.map((slot, i) => {
  const s = sim.slots[i]!;
  const c = calc.slots[i]!;
  return {
    slot: i + 1,
    name: slot.character.name.ja,
    weapon: slot.character.weaponType,
    burst: slot.character.burstStep,
    attack: fmt(c.result.attack),
    'sim normal (nonFB/FB triggers)': `${fmt(s.normal.nonFullBurst.damage)} (${s.normal.nonFullBurst.triggers}/${s.normal.fullBurst.triggers})`,
    'calc normal (nonFB+FB)': fmt(c.result.totalDamage + (c.fullBurstResult?.totalDamage ?? 0)),
    'burst skill (sim=calc)': `${fmt(s.burst.damage)} (${s.burst.activations.length}× ${fmt(s.burst.hit?.perActivation ?? 0)})`,
    'sim total': fmt(s.totalDamage),
    'calc total': fmt(c.totalDamage),
    diff: pct((s.totalDamage - c.totalDamage) / (c.totalDamage || 1)),
  };
});
console.table(rows);
console.log(
  `TOTAL sim ${fmt(sim.totalDamage)}  calc ${fmt(calc.totalDamage)}  diff ${pct((sim.totalDamage - calc.totalDamage) / (calc.totalDamage || 1))}`,
);
