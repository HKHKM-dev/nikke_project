// Stage 5: ヘッドレスの実行口。sim（フレーム逐次）と calc（2 区間の期待値）の枠別・区間別の内訳を表で出す。
//   node scripts/sim-run.ts --ids 271,870 [--fixed-spec] [--duration 180] [--no-burst] [--fixed-cycle] [--controlled 3] [--defence 100] [--element Fire] [--build builds.json]
// Stage 7: バーストは既定で動的サイクル（ゲージ・CT・チェーン）。--fixed-cycle で Stage 5 / 6 の固定 20 秒サイクル。
// --controlled は操作キャラの枠（1 始まり）。省略は全員 AI 扱い（SR / RL のフルチャージ倍率がゲージに乗らない）。
// Stage 10: CT 短縮・弾丸チャージ（即時効果）の記録と、射撃に効くバフの区間（calc が射撃の列から数えた区間は * 付き）を出す。
// 育成値は既定 Lv200・3 凸・コア 0。条件は 18-C2 から既定が自動（射撃場の表。画面の既定と同じ）で、手入力はコア命中率 1・距離ボーナスあり・フルチャージ。
// スキル定義は data/skills/ にあるものを読む（無ければ定義なし = 通常攻撃のみ、味方のバフは受ける）。
// Stage 12: --build は resourceId → 育成入力（BuildInput の各項目と任意の growth）の JSON。--fixed-spec のときは使わない。
// Stage 15: --hit-rate（命中率。射撃場 = 1）と --enemy（data/enemies.json のプリセット）。
// Stage 16-B: --events range-3min-jump（data/enemies.json の出来事のセット。カンマ区切り）。--enemy のプリセットが持つものだけ効く。
// Stage 13: gear の OL 装備に overload（[{ option, level }]、最大 3 行）を書ける。効果層（OL・キューブ・コレクション）を枠ごとに 1 行ずつ出す。
// Stage 18-C: --condition auto|manual。auto は射撃場の表と着地点の時間割りで、コア命中率・距離ボーナス・弾丸命中率を決める
// （射撃場のプリセットと、--enemy を省いた属性なしの射撃場の的で効く。ほかの敵では手入力の値と注記）。manual は --core-hit-rate・
// --hit-rate（省略 1）と距離ボーナスあり。18-C2 から既定は auto で、--core-hit-rate か --hit-rate を指定したら manual。
// --mid-far A|B|C で中遠の着地点を 1 か所に固定する（録画と比べるとき用。省略は 3 か所の配分）。--near A,B で近の 1 回目・2 回目の
// 着地点を固定する（C-0155。省略は 2 か所の配分）。自動の枠は、使った条件の発数平均を出す。
// calc の数え方（plan/design-calc-hybrid.md）: --shot-counting hybrid|firingSlots|average で、枠ごとの表にその数え方の calc の列を足す
// （既定の calc の列は変えない。既定は hybrid）。
// --skill-levels resourceId:slot=Lv をカンマ区切り（slot は skill1・skill2・burst。例 191:skill2=4,260:burst=4）。省略は全部 Lv10
// （実ビルドの録画と比べるとき用。V-0065）。
// --jump-windows で、出来事のセットの狙えない窓と着地点の区間の切れ目を、録画で読んだ窓に置き換える（V-0088。照合の
// setup.jumpWindows と同じ）。観測値の id（例 056-11。records/observations/<録画>.json の値）か、[始まり, 終わり, …] の秒を
// カンマ区切りで渡す。--events に狙えない窓を持つ出来事のセットが要る。
import './below-normal.ts';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { slotsByStep } from '../src/burst/schedule.ts';
import { computeCombatAttack, emptyBuild, type BuildInput } from '../src/build.ts';
import { resolveBuildEffects } from '../src/buildEffects.ts';
import { computeFixedSpecAttack, fixedSpecGrowth } from '../src/fixedSpec.ts';
import {
  LANDING_BAND_LABEL,
  enemyEventsOf,
  enemyInputOf,
  enemyLandingsOf,
  parseEnemyPresets,
  targetProfileForEnemy,
} from '../src/enemies.ts';
import {
  jumpWindowsOf,
  landingFixed,
  MID_FAR_LANDINGS,
  NEAR_LANDINGS,
  type MidFarLanding,
  type NearLanding,
} from '../src/records/observations.ts';
import { ENEMY_PRESETS_PATH, MASTER_FILES } from '../src/load.ts';
import type { GrowthInput } from '../src/stats.ts';
import { runSimulation, simGroupTotals, simIntervalTotals } from '../src/sim/engine.ts';
import { firingParams } from '../src/frame/firing.ts';
import { MAX_SKILL_LEVELS, type ResolvedTrigger, type SkillLevels } from '../src/skills/resolve.ts';
import type { TreasurePhase } from '../src/skills/treasure.ts';
import { compositionAllows } from '../src/skills/composition.ts';
import { SKILL_SLOTS, parseSkillDefinition, parseSkillIndex } from '../src/skills/types.ts';
import { computeTeamDamage } from '../src/calc/model.ts';
import { planTeamRun } from '../src/frame/plan.ts';
import { TEAM_SIZE, type TeamSlotInput } from '../src/team.ts';
import type { BuildMasters, CharacterData, Element } from '../src/types.ts';
import type { EnemyInput } from '../src/damage.ts';
import { framesToGameSeconds, gameSecondsToFrame } from '../src/time.ts';

const DATA_DIR = join(import.meta.dirname, '../data');
const OBSERVATIONS_DIR = join(import.meta.dirname, '../../../records/observations');

/** Stage 8: 回数トリガーも 1 語で出す（normalShot/10、burstUse≥2） */
function triggerLabel(t: ResolvedTrigger): string {
  if (typeof t === 'string') return t;
  // ニヒリスター編: 時間の周期のトリガー（every10s）
  if ('everySeconds' in t) return `every${t.everySeconds}s`;
  // ペルソナ編: 効果名のトリガー（applied:followUp）
  if ('applied' in t) return `applied:${t.applied}`;
  // クルミ S2 編: フルバースト中だけ数える回数トリガー（normalHit/36@fullBurst、数え直しなら @fullBurst!）
  // ソルジャーE.G. 編: 確率のきっかけ（normalHit@5%。窓は期待値の小片）
  if ('every' in t && t.chance !== undefined) return `${t.count}@${+(t.chance * 100).toFixed(4)}%`;
  if ('every' in t)
    return `${t.count}/${t.every}${t.during ? `@${t.during}${t.reset === 'fullBurstStart' ? '!' : ''}` : ''}`;
  return `${t.count}≥${t.atLeast}`;
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
    'core-hit-rate': { type: 'string' },
    // Stage 9: 宝物の段階（resourceId:段階 をカンマ区切り。省略は全員 0）
    treasure: { type: 'string' },
    // Stage 12: 育成入力の JSON ファイル
    build: { type: 'string' },
    // Stage 15: 命中率（射撃場 = 1 の相対値。全枠共通）と敵のプリセット（data/enemies.json の id。--defence / --element より優先）
    'hit-rate': { type: 'string' },
    enemy: { type: 'string' },
    events: { type: 'string' },
    // Stage 18-C: 条件の決め方（auto | manual。18-C2 から既定 auto）と、中遠の着地点の固定（A | B | C）
    condition: { type: 'string' },
    'mid-far': { type: 'string' },
    near: { type: 'string' },
    // plan/design-calc-hybrid.md: 別の数え方の calc を並べて出す（hybrid・firingSlots・average）
    'shot-counting': { type: 'string' },
    // 実ビルドの録画と比べるときのスキル Lv（resourceId:slot=Lv をカンマ区切り。省略は全部 Lv10）
    'skill-levels': { type: 'string' },
    // 録画で読んだ的のジャンプの窓（観測値の id か秒の並び。V-0088）
    'jump-windows': { type: 'string' },
  },
});

if (!values.ids) {
  console.error(
    'usage: node scripts/sim-run.ts --ids 271,870 [--fixed-spec] [--duration 180] [--no-burst] [--fixed-cycle] [--treasure 101:3] [--build builds.json] [--condition manual] [--hit-rate 0.8] [--enemy range-bigarms-wind] [--events range-3min-jump] [--mid-far A] [--near A,B] [--shot-counting hybrid|firingSlots|average] [--skill-levels 191:skill2=4] [--jump-windows 056-11]',
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

// スキル Lv（省略した枠・スロットは Lv10。範囲は computeTeamDamage が検証する）
const skillLevelsById = new Map<number, SkillLevels>();
for (const entry of values['skill-levels']?.split(',') ?? []) {
  const m = /^\s*(\d+):(skill1|skill2|burst)=(\d+)\s*$/.exec(entry);
  if (m === null || !ids.includes(Number(m[1]))) {
    console.error(
      `--skill-levels expects resourceId:slot=Lv (slot: skill1, skill2, burst) for ids in --ids, got "${entry}"`,
    );
    process.exit(2);
  }
  const id = Number(m[1]);
  const levels = skillLevelsById.get(id) ?? { ...MAX_SKILL_LEVELS };
  levels[m[2] as keyof SkillLevels] = Number(m[3]);
  skillLevelsById.set(id, levels);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}
const skillIndex = parseSkillIndex(readJson(join(DATA_DIR, 'skills/index.json')));
const fixedSpec = values['fixed-spec'];

// Stage 12: 育成入力。ファイルは { "<resourceId>": { growth?, affectionRank?, gear?, cube?, collection?, recycleRoom?, extraAttack? } }
type BuildFile = Record<string, Partial<BuildInput> & { growth?: GrowthInput }>;
const buildFile: BuildFile = values.build === undefined ? {} : (readJson(values.build) as BuildFile);
if (values.build !== undefined && fixedSpec) console.warn('--build is ignored under --fixed-spec');
const masters = Object.fromEntries(
  Object.entries(MASTER_FILES).map(([name, file]) => [name, readJson(join(DATA_DIR, 'masters', file))]),
) as BuildMasters;
const DEFAULT_GROWTH: GrowthInput = { level: 200, grade: 3, core: 0 };
// Stage 18-C: 条件の決め方。18-C2 から既定は auto。コア命中率・弾丸命中率を指定したら手入力
const conditionMode =
  values.condition ?? (values['core-hit-rate'] !== undefined || values['hit-rate'] !== undefined ? 'manual' : 'auto');
if (conditionMode !== 'auto' && conditionMode !== 'manual') {
  console.error(`--condition must be auto or manual, got ${conditionMode}`);
  process.exit(2);
}
if (conditionMode === 'auto' && (values['core-hit-rate'] !== undefined || values['hit-rate'] !== undefined)) {
  console.error('--core-hit-rate / --hit-rate are manual conditions; drop them or use --condition manual');
  process.exit(2);
}
const midFar = values['mid-far'] as MidFarLanding | undefined;
if (midFar !== undefined && (!MID_FAR_LANDINGS.includes(midFar) || conditionMode !== 'auto')) {
  console.error('--mid-far takes A, B or C and needs --condition auto');
  process.exit(2);
}
const near = values.near?.split(',') as NearLanding[] | undefined;
if (near !== undefined && (!near.every((n) => NEAR_LANDINGS.includes(n)) || conditionMode !== 'auto')) {
  console.error('--near takes A or B per near span (e.g. A,B) and needs --condition auto');
  process.exit(2);
}
const condition = {
  coreHitRate: Number(values['core-hit-rate'] ?? '1'),
  distanceBonus: true,
  fullCharge: true,
  hitRate: Number(values['hit-rate'] ?? '1'),
};
const modeOf = conditionMode === 'auto' ? { conditionMode: 'auto' as const } : {};
// Stage 15: 敵のプリセット
const enemyPresets = parseEnemyPresets(readJson(join(DATA_DIR, ENEMY_PRESETS_PATH)));
const enemyPreset = values.enemy === undefined ? undefined : enemyPresets.enemies.find((e) => e.id === values.enemy);
if (values.enemy !== undefined && enemyPreset === undefined) {
  console.error(`--enemy: unknown preset ${values.enemy} (${enemyPresets.enemies.map((e) => e.id).join(', ')})`);
  process.exit(2);
}

const slots: TeamSlotInput[] = ids.map((id) => {
  const character = readJson(join(DATA_DIR, `characters/${id}.json`)) as CharacterData;
  const definition = skillIndex.resourceIds.includes(id)
    ? parseSkillDefinition(readJson(join(DATA_DIR, `skills/${id}.json`)))
    : null;
  // 段階の範囲・宝物の有無は computeTeamDamage が検証する（RangeError）
  const skills = {
    definition,
    levels: skillLevelsById.get(id) ?? MAX_SKILL_LEVELS,
    treasurePhase: (treasurePhases.get(id) ?? 0) as TreasurePhase,
  };
  return fixedSpec
    ? {
        character,
        growth: fixedSpecGrowth(character),
        condition,
        ...modeOf,
        attackOverride: computeFixedSpecAttack(character).attack,
        skills,
      }
    : { ...withBuild(character, skills, buildFile[String(id)]), ...modeOf };
});

/** Stage 12: 育成入力があれば戦闘中の攻撃力を computeCombatAttack で作り、attackOverride に入れる。無ければ素のステータス */
function withBuild(
  character: CharacterData,
  skills: {
    definition: ReturnType<typeof parseSkillDefinition> | null;
    levels: SkillLevels;
    treasurePhase: TreasurePhase;
  },
  entry: BuildFile[string] | undefined,
): TeamSlotInput {
  const growth = entry?.growth ?? DEFAULT_GROWTH;
  if (entry === undefined) return { character, growth, condition, skills };
  const { growth: _growth, ...rest } = entry;
  // 書かれていない項目・部位は空の育成で埋める（Stage 14: calc の育成の JSON の取り込みと同じ）
  const empty = emptyBuild();
  const build: BuildInput = { ...empty, ...rest, gear: { ...empty.gear, ...rest.gear } };
  const combat = computeCombatAttack(character, growth, build, masters, { treasurePhase: skills.treasurePhase });
  console.log(
    `build ${character.name.ja}: attack ${combat.attack} = round((${combat.gradeBase} + affection ${combat.affection}` +
      ` + recycle ${combat.recycleRoom}) × core) ${combat.withCore}` +
      ` + gear ${combat.gear} + cube ${combat.cube} + collection ${combat.collection} + extra ${combat.extra}`,
  );
  const effects = resolveBuildEffects(character, build, masters, { treasurePhase: skills.treasurePhase });
  if (effects.effects.length > 0 || effects.notes.length > 0) {
    const pctOf = (v: number) => `${(v * 100).toFixed(2)}%`;
    console.log(
      `  effects: ${effects.effects.map((e) => `${e.source.kind} ${e.stat} +${pctOf(e.value)}`).join(', ') || 'none'}` +
        (effects.notes.length > 0
          ? `; not applied: ${effects.notes.map((n) => `${n.source.kind} ${n.source.name.en} (${n.level})`).join(', ')}`
          : ''),
    );
  }
  return { character, growth, condition, attackOverride: combat.attack, buildEffects: effects.effects, skills };
}

const eventSetIds = values.events?.split(',').map((s) => s.trim()) ?? [];
for (const id of eventSetIds) {
  if (!enemyPreset?.eventSets.includes(id)) {
    console.error(`--events: ${id} is not an event set of --enemy ${values.enemy ?? '(none)'}`);
    process.exit(2);
  }
}
/** --jump-windows: 観測値の id（録画 id-番号）か、秒をカンマ区切りで並べたもの */
function jumpWindowsArg(arg: string): { start: number; end: number }[] {
  let value: number | number[] | undefined;
  if (/^[\d.,\s]+$/.test(arg)) {
    value = arg.split(',').map((v) => Number(v.trim()));
  } else {
    const dash = arg.lastIndexOf('-');
    const recording = dash < 0 ? arg : arg.slice(0, dash);
    const path = join(OBSERVATIONS_DIR, `${recording}.json`);
    const observations = existsSync(path) ? (readJson(path) as { id: string; value: number | number[] }[]) : [];
    value = observations.find((o) => o.id === arg)?.value;
    if (value === undefined) {
      console.error(`--jump-windows: observation ${arg} not found in records/observations/${recording}.json`);
      process.exit(2);
    }
  }
  const windows = jumpWindowsOf(value);
  if (windows === undefined) {
    console.error(`--jump-windows: ${arg} is not an ascending list of [start, end, …] seconds`);
    process.exit(2);
  }
  return windows;
}
const jumpWindows = values['jump-windows'] === undefined ? undefined : jumpWindowsArg(values['jump-windows']);
if (jumpWindows !== undefined && eventSetIds.length === 0) {
  console.error('--jump-windows needs --events with an untargetable event set (e.g. range-3min-jump)');
  process.exit(2);
}
const enemyEvents = enemyEventsOf(enemyPresets, eventSetIds, Number(values.duration), jumpWindows);
const baseEnemy: EnemyInput = enemyPreset
  ? { ...enemyInputOf(enemyPreset), events: enemyEvents }
  : { defence: Number(values.defence), element: (values.element as Element | undefined) ?? null, hasCore: true };
// Stage 18-C: 的の条件の表（自動の条件のときだけ付ける）。18-C2: 射撃場のプリセットのほか、属性なしの射撃場の的（--enemy を
// 省いた既定の敵）も射撃場の表を使う。表の無い敵では、自動でも手入力の値になり、注記が出る
const target = conditionMode === 'auto' ? targetProfileForEnemy(enemyPresets, baseEnemy) : undefined;
if (values.condition === 'auto' && target === undefined) {
  console.warn('--condition auto: the enemy has no target profile; manual values are used');
}
const input = {
  slots,
  enemy:
    target === undefined
      ? baseEnemy
      : {
          ...baseEnemy,
          target,
          landings: enemyLandingsOf(
            enemyPresets,
            eventSetIds,
            Number(values.duration),
            target,
            landingFixed(midFar, near),
            jumpWindows,
          ),
        },
  durationSeconds: Number(values.duration),
  burst: !values['no-burst'],
  burstModel: values['fixed-cycle'] ? ('fixed' as const) : ('dynamic' as const),
  controlledSlot: values.controlled === undefined ? null : Number(values.controlled) - 1,
};
const shotCounting = values['shot-counting'];
if (
  shotCounting !== undefined &&
  shotCounting !== 'hybrid' &&
  shotCounting !== 'firingSlots' &&
  shotCounting !== 'average'
) {
  console.error(`--shot-counting takes hybrid, firingSlots or average, got ${shotCounting}`);
  process.exit(2);
}
// 編成の条件（burstStepMix・squad・withCharacter・enemyElement）の付いた効果と、この編成で効くか（効かない効果は計算に入れない）
const compositionCharacters = slots.map((s) => s.character);
const compositionRows = slots.flatMap((slot, i) =>
  SKILL_SLOTS.flatMap((skill) =>
    (slot.skills?.definition?.skills[skill].effects ?? []).flatMap((e, effectIndex) => {
      const mix = 'burstStepMix' in e ? e.burstStepMix : undefined;
      const squad = 'squad' in e ? e.squad : undefined;
      const withCharacter = 'withCharacter' in e ? e.withCharacter : undefined;
      const enemyElement = 'enemyElement' in e ? e.enemyElement : undefined;
      if (mix === undefined && squad === undefined && withCharacter === undefined && enemyElement === undefined)
        return [];
      const conditions = [
        mix && `other ${mix.otherBurstStep} ${mix.present ? 'present' : 'absent'}`,
        squad && `same squad (${slot.character.squad}) ${squad.present ? 'present' : 'absent'}`,
        withCharacter && `character ${withCharacter.rid} ${withCharacter.present ? 'present' : 'absent'}`,
        enemyElement && `enemy ${enemyElement}`,
      ].filter(Boolean);
      return [
        {
          slot: `slot ${i + 1} ${slot.character.name.ja}`,
          effect: `${skill}[${effectIndex}] ${e.kind}`,
          condition: conditions.join(' & '),
          applies: compositionAllows(e, compositionCharacters, i, input.enemy.element),
        },
      ];
    }),
  ),
);
if (compositionRows.length > 0) {
  console.log('composition conditions (effects that do not apply are left out)');
  console.table(compositionRows);
}
const sim = runSimulation(input);
const calc = computeTeamDamage(input);
// 比べる数え方の calc（比較の列だけに使う。列の見出しの (b) は「比べる側」の意味）
const calcB = shotCounting === undefined ? null : computeTeamDamage(input, { shotCounting });
// Stage 11 紅蓮BS: 射撃の列（循環の窓ごとの並びの表示用）
const plan = planTeamRun(input);

const fmt = (n: number, digits = 0) => n.toLocaleString('en-US', { maximumFractionDigits: digits });
const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

console.log(
  `duration ${input.durationSeconds}s (${sim.frames}f), burst ${input.burst ? input.burstModel : 'off'}, ` +
    `fixed spec ${fixedSpec}, build ${values.build ?? 'none'}, controlled ${input.controlledSlot === null ? 'none (all AI)' : `slot ${input.controlledSlot + 1}`}, ` +
    `enemy ${enemyPreset?.id ?? 'custom'} defence ${input.enemy.defence}, element ${input.enemy.element ?? 'none'}, ` +
    `conditions ${conditionMode}${
      conditionMode === 'manual'
        ? ` (core ${condition.coreHitRate}, hit rate ${condition.hitRate})`
        : [midFar ? `mid-far ${midFar}` : '', near ? `near ${near.join(',')}` : '']
            .filter(Boolean)
            .map((x) => ` (${x})`)
            .join('')
    }`,
);
// Stage 18-C: 着地点の区間
if (calc.landings.length > 0 && target !== undefined) {
  const labelOf = (id: string | null): string => {
    if (id === null) return 'unmeasured';
    const band = target.landings.find((l) => l.id === id)?.band ?? id;
    const name = band in LANDING_BAND_LABEL ? LANDING_BAND_LABEL[band as keyof typeof LANDING_BAND_LABEL].en : id;
    return id in target.mixes ? `${name} (mix)` : `${name} [${id}]`;
  };
  console.log(
    `landings ${calc.landings.map((s) => `${framesToGameSeconds(s.start).toFixed(1)}-${framesToGameSeconds(s.end).toFixed(1)}s ${labelOf(s.landing)}`).join(', ')}`,
  );
}
if (eventSetIds.length > 0) {
  console.log(
    `enemy events ${eventSetIds.join(', ')}${jumpWindows === undefined ? '' : ` (jump windows ${values['jump-windows']})`}: ${enemyEvents.map((e) => `${e.kind} ${e.start.toFixed(1)}-${e.end.toFixed(1)}s`).join(', ')}`,
  );
}
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
      time: `${framesToGameSeconds(a.frame).toFixed(2)}s`,
      frame: a.frame,
      step: STEP[a.step],
      nike: `slot ${a.slotIndex + 1} ${slots[a.slotIndex]!.character.name.ja}`,
      fullBurst: a.startsFullBurst
        ? `start (${framesToGameSeconds((calc.schedule?.fullBurstWindows.find((w) => w.start >= a.frame)?.end ?? a.frame) - a.frame).toFixed(1)}s)`
        : '',
      // Stage 11: そのフルバーストを開いたチェーンで撃った枠（「直前にバーストスキルを使用した味方」）
      burstUsers: a.startsFullBurst
        ? (calc.schedule?.fullBurstWindows.find((w) => w.start >= a.frame)?.burstUsers ?? [])
            .map((i) => i + 1)
            .join(',')
        : '',
    })),
  );
  if (calc.schedule.chainTimeouts.length > 0) {
    console.log(
      `chain timeouts at ${calc.schedule.chainTimeouts.map((f) => `${framesToGameSeconds(f).toFixed(2)}s`).join(', ')}`,
    );
  }
  const starts = calc.schedule.fullBurstWindows.map((w) => w.start);
  console.log(
    `full burst intervals ${starts
      .slice(1)
      .map((f, k) => `${framesToGameSeconds(f - starts[k]!).toFixed(2)}s`)
      .join(', ')}`,
  );
}

// Stage 11 アリス編: 「最終攻撃力が最も高い味方 N 機」の発火ごとの順位。同じ発火の同じ対象（S1 の 2 効果など）はまとめる
if (calc.timeline.rankings.length > 0) {
  const merged = new Map<string, Record<string, string | number>>();
  for (const r of calc.timeline.rankings) {
    const key = `${r.frame}.${r.sourceSlotIndex}.${r.effect.source.skill}.${r.targets.join(',')}`;
    if (merged.has(key)) continue;
    merged.set(key, {
      time: `${framesToGameSeconds(r.frame).toFixed(2)}s`,
      frame: r.frame,
      from: `slot ${r.sourceSlotIndex + 1} ${r.effect.source.skill}`,
      targets: r.targets
        .map((i) => `slot ${i + 1} ${slots[i]!.character.name.ja} ${fmt(r.finalAttacks[i]!)}`)
        .join(' / '),
      tied: r.tied ? 'yes (slot order)' : '',
    });
  }
  console.log('top final ATK targets (topAttack)');
  console.table([...merged.values()]);
}

// Stage 10: 即時効果（CT 短縮・弾丸チャージ）。同じフレーム・同じ枠はまとめる。Stage 11: 回復（heal）も出る
if (sim.instants.length > 0) {
  const merged = new Map<string, { time: string; kind: string; from: string; to: string; amount: number }>();
  for (const x of sim.instants) {
    const key = `${x.frame}.${x.effect.kind}.${x.slotIndex}`;
    const row = merged.get(key) ?? {
      time: `${framesToGameSeconds(x.frame).toFixed(2)}s`,
      kind: x.effect.kind,
      from: `slot ${x.sourceSlotIndex + 1}`,
      to: `slot ${x.slotIndex + 1} ${slots[x.slotIndex]!.character.name.ja}`,
      amount: 0,
    };
    row.amount += x.amount;
    merged.set(key, row);
  }
  console.log(
    'instant effects (cooldownReduction: frames actually cut, ammoRefill: rounds added, heal: always 0, burstGauge: ratio of the gauge max)',
  );
  console.table([...merged.values()]);
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
    ...(calcB === null ? {} : bColumns(i, s.totalDamage)),
  };
});
console.table(rows);

/** 比べる数え方の calc の合計と sim との差、射撃の列から数えたグループの数（既定の calc → 比べる側） */
function bColumns(i: number, simTotal: number): Record<string, string> {
  const c = calc.slots[i]!;
  const b = calcB!.slots[i]!;
  const shotGroups = (r: typeof c) => r.segments.filter((g) => g.triggerSource === 'shots').length;
  return {
    'shots groups (calc→b)': `${shotGroups(c)}/${c.segments.length} → ${shotGroups(b)}/${b.segments.length}`,
    'calc (b) total': fmt(b.totalDamage),
    'diff (b)': pct((simTotal - b.totalDamage) / (b.totalDamage || 1)),
  };
}
console.log(
  `TOTAL sim ${fmt(sim.totalDamage)}  calc ${fmt(calc.totalDamage)}  diff ${pct((sim.totalDamage - calc.totalDamage) / (calc.totalDamage || 1))}` +
    (calcB === null
      ? ''
      : `  calc (b) ${fmt(calcB.totalDamage)}  diff (b) ${pct((sim.totalDamage - calcB.totalDamage) / (calcB.totalDamage || 1))}`),
);

// Stage 18-C: 自動の枠で使った条件の平均（1 パス目の射撃の列の発数で重みを付けた。calc と sim で同じ値）
const autoRows = calc.slots.flatMap((c, i) =>
  c?.autoCondition
    ? [
        {
          slot: i + 1,
          name: slots[i]!.character.name.ja,
          shots: c.autoCondition.shots,
          'core hit rate': c.autoCondition.coreHitRate.toFixed(4),
          'distance bonus': pct(c.autoCondition.distanceBonus),
          'bullet hit rate': c.autoCondition.hitRate.toFixed(4),
          'hit rate up': pct(c.autoCondition.hitRateUp),
        },
      ]
    : [],
);
if (autoRows.length > 0) {
  console.log('auto conditions (shot-weighted means)');
  console.table(autoRows);
}
const noteLines = calc.slots.flatMap((c, i) =>
  (c?.notes ?? [])
    .filter((n) => n.code.startsWith('auto-') || n.code.startsWith('landing-') || n.code === 'hit-rate')
    .map((n) => `  [slot ${i + 1}] ${n.level}: ${n.message.ja}`),
);
if (noteLines.length > 0) console.log(`condition notes\n${noteLines.join('\n')}`);

// Stage 6: バフ状態ごとの区間表（枠ごと）。sim はフレームで数えた実トリガー数、calc はレート × 秒数
for (const [i, slot] of slots.entries()) {
  const c = calc.slots[i];
  if (!c) continue;
  const simGroups = simGroupTotals(sim, i);
  console.log(`
[slot ${i + 1}] ${slot.character.name.ja} — segments`);
  console.table(
    c.segments.map((g, j) => ({
      ranges: g.ranges
        .map((r) => `${framesToGameSeconds(r.start).toFixed(1)}-${framesToGameSeconds(r.end).toFixed(1)}s`)
        .join(' '),
      sec: g.seconds.toFixed(1),
      FB: g.fullBurst ? 'yes' : '',
      attack: fmt(g.trigger.attack),
      boost: g.trigger.boost.total.toFixed(3),
      atkDmg: g.trigger.attackDamageMultiplier.toFixed(4),
      // Stage 11 モダニア: 使用武器の変更（1 発の倍率）と、最大装弾数（スタックの▼・装弾数無限込み）
      weapon: g.buffs.weapon ? `${(g.trigger.weaponMultiplier * 100).toFixed(2)}%` : '',
      ammo: g.buffs.infiniteAmmo > 0 ? '∞' : firingParams(slot.character.shot, g.buffs).maxAmmo,
      perTrigger:
        g.trigger.perShot > 0
          ? `${fmt(g.trigger.perTrigger)} (${fmt(g.trigger.normal)}+${fmt(g.trigger.perShot)})`
          : fmt(g.trigger.perTrigger),
      'triggers sim/calc': `${simGroups[j]?.triggers ?? 0} / ${g.triggers.toFixed(1)}${g.triggerSource === 'shots' ? '*' : ''}`,
      'damage sim/calc': `${fmt(simGroups[j]?.damage ?? 0)} / ${fmt(g.damage)}`,
      timed: compactTimed(g.timedEffects)
        .map(
          ({ e, n }) =>
            `${triggerLabel(e.trigger)} ${e.stat}${e.value < 0 ? '' : '+'}${e.scaling === 'flat' ? `${e.value}${e.stat === 'chargeSpeed' ? 's' : ''}` : `${(e.value * 100).toFixed(2)}%`}${n > 1 ? ` ×${n}` : ''}${e.targetWeapon ? ` (${e.targetWeapon})` : ''}`,
        )
        .join(', '),
    })),
  );
  // Stage 11 モダニア: 条件「自分が 〈stat〉 増加状態なら」を満たさずに発火しなかった回数
  if (c.conditionSkips.length > 0) {
    console.log(
      `condition skips: ${c.conditionSkips.length} (${c.conditionSkips.map((x) => framesToGameSeconds(x.frame).toFixed(2)).join(', ')}s)`,
    );
  }
  printCycles(i, c);
  printDots(c);
  printDelayedHits(c);
}

/** 遅れて出る倍率ダメージ編（plan/design-delayed-skill-hit.md）: delayFrames のある倍率ダメージの遅れと、出た秒・1 回の値 */
function printDelayedHits(c: NonNullable<(typeof calc.slots)[number]>): void {
  const delayed = c.skillHits.activations.filter((a) => a.effect.delayFrames !== undefined);
  if (delayed.length === 0) return;
  const byEffect = new Map<string, typeof delayed>();
  for (const a of delayed) {
    const key = `${a.effect.source.skill}.${a.effect.effectIndex}`;
    byEffect.set(key, [...(byEffect.get(key) ?? []), a]);
  }
  for (const [key, list] of byEffect) {
    const e = list[0]!.effect;
    console.log(
      `delayed hit ${key}: ${(e.multiplier * 100).toFixed(2)}% +${e.delayFrames}f after ${triggerLabel(e.trigger)} ×${list.length} = ${fmt(list.reduce((t, a) => t + a.hit.perActivation, 0))} (at ${list.map((a) => a.seconds.toFixed(2)).join(', ')}s)`,
    );
  }
}

/** ニヒリスター編: 持続ダメージの内訳（効果ごとの tick の数・合計と、付いた回ごとの最初の tick の秒。plan/design-nihilister.md 2.1 節） */
function printDots(c: NonNullable<(typeof calc.slots)[number]>): void {
  const ticks = c.skillHits.activations.filter((a) => a.effect.dot !== undefined);
  if (ticks.length === 0) return;
  const byEffect = new Map<
    string,
    {
      n: number;
      damage: number;
      multiplier: number;
      seconds: number[];
      stacks: number[];
      maxStacks: number;
      label: string;
    }
  >();
  for (const a of ticks) {
    const key = `${a.effect.source.skill}.${a.effect.effectIndex}`;
    const d = byEffect.get(key) ?? {
      n: 0,
      damage: 0,
      multiplier: a.effect.multiplier,
      seconds: [],
      stacks: [],
      maxStacks: a.effect.dot!.maxStacks,
      // アニス：スター S2・バースト編: 周期の自動攻撃も dot の形で出す
      label: a.effect.dot!.autoAttack ? 'autoAttack' : 'dot',
    };
    d.n += 1;
    d.damage += a.hit.perActivation;
    d.seconds.push(a.seconds);
    // レイヴン編: スタックする持続ダメージは tick ごとのスタックの数も出す
    if (a.stacks !== undefined) d.stacks.push(a.stacks);
    byEffect.set(key, d);
  }
  for (const [key, d] of byEffect) {
    const perStack = d.maxStacks > 1 ? `/stack (max ${d.maxStacks})` : '';
    const stacks = d.stacks.length > 0 ? ` (stacks ${d.stacks.join(', ')})` : '';
    console.log(
      `${d.label} ${key}: ${(d.multiplier * 100).toFixed(2)}%${perStack} ×${d.n} ticks = ${fmt(d.damage)} (ticks at ${d.seconds.map((x) => x.toFixed(2)).join(', ')}s)${stacks}`,
    );
  }
}

/**
 * Stage 11 紅蓮BS: 段の循環の内訳（段ごとの回数・合計）と、間隔の変更の窓ごとの並び
 * （窓の前の段なしの発数 p・窓の中の段・窓の後の最初の段が何発目か。plan/design-stage11-scarlet-bs.md 0.3・7.5 節）
 */
function printCycles(slotIndex: number, c: NonNullable<(typeof calc.slots)[number]>): void {
  const cycled = c.skillHits.activations.filter((a) => a.effect.cycle !== undefined);
  if (cycled.length === 0) return;
  const letter = (step: number) => String.fromCharCode(65 + step);
  const bySteps = new Map<number, { n: number; damage: number; multiplier: number }>();
  for (const a of cycled) {
    const s = bySteps.get(a.effect.cycle!.step) ?? { n: 0, damage: 0, multiplier: a.effect.multiplier };
    s.n += 1;
    s.damage += a.hit.perActivation;
    bySteps.set(a.effect.cycle!.step, s);
  }
  console.log(
    `cycle tiers: ${[...bySteps.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([step, s]) => `${letter(step)} ${(s.multiplier * 100).toFixed(2)}% ×${s.n} = ${fmt(s.damage)}`)
      .join(', ')}`,
  );
  const shots = plan.shots[slotIndex]?.frames ?? [];
  const stepAt = new Map(cycled.map((a) => [gameSecondsToFrame(a.seconds), a.effect.cycle!.step]));
  const rows = c.cycleWindows.map((w) => {
    const before = shots.filter((f) => f < w.start);
    let lastTier = before.length - 1;
    while (lastTier >= 0 && !stepAt.has(before[lastTier]!)) lastTier -= 1;
    const inside = shots.filter((f) => f >= w.start && f < w.end);
    const after = shots.filter((f) => f >= w.end);
    const k = after.findIndex((f) => stepAt.has(f));
    return {
      window: `${framesToGameSeconds(w.start).toFixed(2)}-${framesToGameSeconds(w.end).toFixed(2)}s`,
      'last tier before': lastTier < 0 ? '-' : letter(stepAt.get(before[lastTier]!)!),
      p: lastTier < 0 ? before.length : before.length - 1 - lastTier,
      inside: `${inside.length} ${inside.map((f) => (stepAt.has(f) ? letter(stepAt.get(f)!) : '-')).join('')}`,
      'first tier after': k < 0 ? '-' : `shot ${k + 1} (${letter(stepAt.get(after[k]!)!)})`,
    };
  });
  if (rows.length > 0) console.table(rows);
}

/** Stage 11 モダニア: 同じ効果のスタックの段をまとめる（「critDamage+14.25% ×5」） */
function compactTimed<T extends { sourceSlotIndex: number; effectIndex: number; source: { skill: string } }>(
  effects: readonly T[],
): { e: T; n: number }[] {
  const out: { e: T; n: number }[] = [];
  for (const e of effects) {
    const found = out.find(
      (x) =>
        x.e.sourceSlotIndex === e.sourceSlotIndex &&
        x.e.source.skill === e.source.skill &&
        x.e.effectIndex === e.effectIndex,
    );
    if (found) found.n += 1;
    else out.push({ e, n: 1 });
  }
  return out;
}
