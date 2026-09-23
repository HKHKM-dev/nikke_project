// Stage 5: ヘッドレスの実行口。sim（フレーム逐次）と calc（2 区間の期待値）の枠別・区間別の内訳を表で出す。
//   node scripts/sim-run.ts --ids 271,870 [--fixed-spec] [--duration 180] [--no-burst] [--fixed-cycle] [--controlled 3] [--defence 100] [--element Fire]
// Stage 7: バーストは既定で動的サイクル（ゲージ・CT・チェーン）。--fixed-cycle で Stage 5 / 6 の固定 20 秒サイクル。
// --controlled は操作キャラの枠（1 始まり）。省略は全員 AI 扱い（SR / RL のフルチャージ倍率がゲージに乗らない）。
// 育成値は既定 Lv200・3 凸・コア 0、条件は コア命中率 1・距離ボーナスあり・フルチャージ（calc の既定と同じ）。
// スキル定義は data/skills/ にあるものを読む（無ければ定義なし = 通常攻撃のみ、味方のバフは受ける）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { slotsByStep } from '../src/burst/schedule.ts';
import { computeFixedSpecAttack, fixedSpecGrowth } from '../src/fixedSpec.ts';
import { runSimulation, simGroupTotals, simIntervalTotals } from '../src/sim/engine.ts';
import { MAX_SKILL_LEVELS, type ResolvedTrigger } from '../src/skills/resolve.ts';
import type { TreasurePhase } from '../src/skills/treasure.ts';
import { parseSkillDefinition, parseSkillIndex } from '../src/skills/types.ts';
import { computeTeamDamage, TEAM_SIZE, type TeamSlotInput } from '../src/team.ts';
import type { CharacterData, Element } from '../src/types.ts';
import { FPS } from '../src/weapons.ts';

const DATA_DIR = join(import.meta.dirname, '../data');

/** Stage 8: 回数トリガーも 1 語で出す（normalShot/10、burstUse≥2） */
function triggerLabel(t: ResolvedTrigger): string {
  if (typeof t === 'string') return t;
  return 'every' in t ? `${t.count}/${t.every}` : `${t.count}≥${t.atLeast}`;
}

const { values } = parseArgs({
  options: {
    ids: { type: 'string' },
    'fixed-spec': { type: 'boolean', default: false },
    duration: { type: 'string', default: '180' },
    'no-burst': { type: 'boolean', default: false },
    'fixed-cycle': { type: 'boolean', default: false },
    controlled: { type: 'string' },
    defence: { type: 'string', default: '100' },
    element: { type: 'string' },
    'core-hit-rate': { type: 'string', default: '1' },
    // Stage 9: 宝物の段階（resourceId:段階 をカンマ区切り。省略は全員 0）
    treasure: { type: 'string' },
  },
});

if (!values.ids) {
  console.error(
    'usage: node scripts/sim-run.ts --ids 271,870 [--fixed-spec] [--duration 180] [--no-burst] [--fixed-cycle] [--treasure 101:3]',
  );
  process.exit(2);
}
const ids = values.ids.split(',').map((s) => Number(s.trim()));
if (ids.length < 1 || ids.length > TEAM_SIZE || ids.some((id) => !Number.isInteger(id) || id < 1)) {
  console.error(`--ids must list 1..${TEAM_SIZE} resource ids`);
  process.exit(2);
}

const treasurePhases = new Map<number, number>();
for (const entry of values.treasure?.split(',') ?? []) {
  const [id, phase] = entry.split(':').map((v) => Number(v.trim()));
  if (!ids.includes(id!) || !Number.isInteger(phase)) {
    console.error(`--treasure expects resourceId:phase for ids in --ids, got "${entry}"`);
    process.exit(2);
  }
  treasurePhases.set(id!, phase!);
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
  // 段階の範囲・宝物の有無は computeTeamDamage が検証する（RangeError）
  const skills = {
    definition,
    levels: MAX_SKILL_LEVELS,
    treasurePhase: (treasurePhases.get(id) ?? 0) as TreasurePhase,
  };
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
  burstModel: values['fixed-cycle'] ? ('fixed' as const) : ('dynamic' as const),
  controlledSlot: values.controlled === undefined ? null : Number(values.controlled) - 1,
};
const sim = runSimulation(input);
const calc = computeTeamDamage(input);

const fmt = (n: number, digits = 0) => n.toLocaleString('en-US', { maximumFractionDigits: digits });
const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

console.log(
  `duration ${input.durationSeconds}s (${sim.frames}f), burst ${input.burst ? input.burstModel : 'off'}, ` +
    `fixed spec ${fixedSpec}, controlled ${input.controlledSlot === null ? 'none (all AI)' : `slot ${input.controlledSlot + 1}`}, ` +
    `enemy defence ${input.enemy.defence}, element ${input.enemy.element ?? 'none'}`,
);
if (calc.schedule && calc.burstSummary) {
  const byStep = slotsByStep(calc.schedule);
  const who = (list: number[]) =>
    list.length === 0 ? '-' : list.map((i) => `slot ${i + 1} ${slots[i]!.character.name.ja}`).join(' / ');
  const b = calc.burstSummary;
  const sec = (v: number | null) => (v === null ? '-' : `${v.toFixed(2)}s`);
  console.log(
    `full bursts ${b.fullBursts} (first ${sec(b.firstFullBurstSeconds)}, mean cycle ${sec(b.meanCycleSeconds)}, ` +
      `uptime ${pct(b.fullBurstUptime)}), activations ${b.activations}, chain timeouts ${b.chainTimeouts}; ` +
      `I: ${who(byStep.Step1)}, II: ${who(byStep.Step2)}, III: ${who(byStep.Step3)}`,
  );
  const STEP = { Step1: 'I', Step2: 'II', Step3: 'III' } as const;
  console.table(
    calc.schedule.activations.map((a) => ({
      time: `${(a.frame / FPS).toFixed(2)}s`,
      frame: a.frame,
      step: STEP[a.step],
      nike: `slot ${a.slotIndex + 1} ${slots[a.slotIndex]!.character.name.ja}`,
      fullBurst: a.startsFullBurst
        ? `start (${(((calc.schedule?.fullBurstWindows.find((w) => w.start >= a.frame)?.end ?? a.frame) - a.frame) / FPS).toFixed(1)}s)`
        : '',
    })),
  );
  if (calc.schedule.chainTimeouts.length > 0) {
    console.log(`chain timeouts at ${calc.schedule.chainTimeouts.map((f) => `${(f / FPS).toFixed(2)}s`).join(', ')}`);
  }
}

const rows = slots.map((slot, i) => {
  const s = sim.slots[i]!;
  const c = calc.slots[i]!;
  return {
    slot: i + 1,
    name: slot.character.name.ja,
    weapon: slot.character.weaponType,
    burst: slot.character.burstStep,
    // Stage 9: 宝物の段階（宝物版で計算したスロット数）
    treasure: c.treasurePhase === 0 ? '-' : `${c.treasurePhase} (${c.treasureSlots.join('+')})`,
    attack: fmt(c.segments[0]?.trigger.attack ?? c.baseAttack),
    'sim normal (nonFB/FB triggers)': `${fmt(simIntervalTotals(s).nonFullBurst.damage)} (${simIntervalTotals(s).nonFullBurst.triggers}/${simIntervalTotals(s).fullBurst.triggers})`,
    'calc normal': fmt(c.normalDamage),
    segments: c.segments.length,
    'burst skill (sim=calc)': `${fmt(s.burst.damage)} (${s.burst.activations.length}× ${fmt(s.burst.hit?.perActivation ?? 0)})`,
    // Stage 8: トリガー付きの倍率ダメージ（damage）
    'skill hits (sim=calc)': `${fmt(s.skillHits.damage)} (${s.skillHits.frames.length}×)`,
    'sim total': fmt(s.totalDamage),
    'calc total': fmt(c.totalDamage),
    diff: pct((s.totalDamage - c.totalDamage) / (c.totalDamage || 1)),
  };
});
console.table(rows);
console.log(
  `TOTAL sim ${fmt(sim.totalDamage)}  calc ${fmt(calc.totalDamage)}  diff ${pct((sim.totalDamage - calc.totalDamage) / (calc.totalDamage || 1))}`,
);

// Stage 6: バフ状態ごとの区間表（枠ごと）。sim はフレームで数えた実トリガー数、calc はレート × 秒数
for (const [i, slot] of slots.entries()) {
  const c = calc.slots[i];
  if (!c) continue;
  const simGroups = simGroupTotals(sim, i);
  console.log(`
[slot ${i + 1}] ${slot.character.name.ja} — segments`);
  console.table(
    c.segments.map((g, j) => ({
      ranges: g.ranges.map((r) => `${(r.start / FPS).toFixed(1)}-${(r.end / FPS).toFixed(1)}s`).join(' '),
      sec: g.seconds.toFixed(1),
      FB: g.fullBurst ? 'yes' : '',
      attack: fmt(g.trigger.attack),
      boost: g.trigger.boost.total.toFixed(3),
      atkDmg: g.trigger.attackDamageMultiplier.toFixed(4),
      perTrigger: fmt(g.trigger.perTrigger),
      'triggers sim/calc': `${simGroups[j]?.triggers ?? 0} / ${g.triggers.toFixed(1)}`,
      'damage sim/calc': `${fmt(simGroups[j]?.damage ?? 0)} / ${fmt(g.damage)}`,
      timed: g.timedEffects
        .map(
          (e) =>
            `${triggerLabel(e.trigger)} ${e.stat}+${(e.value * 100).toFixed(2)}%${e.targetWeapon ? ` (${e.targetWeapon})` : ''}`,
        )
        .join(', '),
    })),
  );
}
