// ヘッドレスの実行口。編成を runSimulation → simTeamResult で計算し、枠別・区間別の内訳を表で出す。
// 枠ごとに、効果層（OL・キューブ・コレクション）、CT 短縮・弾丸チャージ（即時効果）の記録、バフ状態ごとの区間表を出す。
//   node scripts/sim-run.ts --ids 271,870 [オプション]（オプションの一覧は --help、説明は下の cliArgs の定義）
// 育成値は、--build に無いキャラは Lv200・3 凸・コア 0。スキル定義は data/skills/ にあるものを読む（無ければ定義なし = 通常攻撃のみ、
// 味方のバフは受ける）。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeCombatAttack, computeCombatStat, emptyBuild, type BuildInput } from '../src/build.ts';
import { resolveBuildEffects } from '../src/buildEffects.ts';
import {
  cliSnapshotNotices,
  isBuildSnapshotShaped,
  readBuildSnapshotValue,
  type SnapshotTreasure,
} from '../src/buildSnapshot.ts';
import {
  computeFixedSpecAttack,
  computeFixedSpecDefence,
  computeFixedSpecHp,
  fixedSpecGrowth,
} from '../src/fixedSpec.ts';
import {
  enemyEventsOf,
  enemyInputOf,
  enemyLandingsOf,
  parseEnemyPresets,
  presetForEnemy,
  targetProfileForEnemy,
} from '../src/enemies.ts';
import {
  jumpWindowsOf,
  manualBurstsOf,
  FAR_LANDINGS,
  landingFixed,
  MID_FAR_LANDINGS,
  NEAR_LANDINGS,
  type FarLanding,
  type MidFarLanding,
  type NearLanding,
} from '../src/records/observations/setup.ts';
import { ENEMY_PRESETS_PATH, MASTER_FILES } from '../src/load.ts';
import type { GrowthInput } from '../src/stats.ts';
import { runSimulation, type SimEvent } from '../src/sim/engine.ts';
import { simTeamResult } from '../src/sim/teamResult.ts';
import { MAX_SKILL_LEVELS, type SkillLevels } from '../src/skills/resolve.ts';
import type { TreasurePhase } from '../src/skills/treasure.ts';
import { parseSkillDefinition } from '../src/skills/parse/definition.ts';
import { TEAM_SIZE, type TeamSlotInput } from '../src/team.ts';
import type { BuildMasters, CharacterData, CharacterIndex, Element } from '../src/types.ts';
import type { EnemyInput } from '../src/damage.ts';
import { gameSecondsToFrame } from '../src/time.ts';
import { cliArgs, fail } from './cli.ts';
import { definedSkillIds } from './defined-skills.ts';
import {
  activationRows,
  AUTO_CONDITION_TITLE,
  autoConditionRows,
  buildAttackLine,
  buildEffectsLine,
  burstSummaryLine,
  chainTimeoutsLine,
  COMPOSITION_TITLE,
  compositionRows,
  conditionNotesText,
  conditionSkipsLine,
  cycleReport,
  delayedHitLines,
  dotLines,
  enemyEventsLine,
  fullBurstIntervalsLine,
  headerLine,
  INSTANT_TITLE,
  instantRows,
  landingsLine,
  RANKING_TITLE,
  rankingRows,
  segmentRows,
  segmentsTitle,
  summaryRows,
  totalLine,
  type RunSettings,
} from './sim-run/tables.ts';
import { parseTraceKinds, TRACE_KINDS, traceLines } from './sim-run/trace.ts';

const DATA_DIR = join(import.meta.dirname, '../data');
const OBSERVATIONS_DIR = join(import.meta.dirname, '../../../records/observations');

const { values } = cliArgs(import.meta.url, {
  options: {
    // 編成（resourceId をカンマ区切り。1〜5 体）
    ids: { type: 'string' },
    // 射撃場の「スペック固定」の育成値にする（fixedSpec.ts。--build は使わない）
    'fixed-spec': { type: 'boolean', default: false },
    // 戦闘時間（秒）
    duration: { type: 'string', default: '180' },
    // バーストを回さない
    'no-burst': { type: 'boolean', default: false },
    // バーストを固定 20 秒サイクルにする（既定は動的サイクル: ゲージ・CT・チェーン）
    'fixed-cycle': { type: 'boolean', default: false },
    // 操作キャラの枠（1 始まり）。省略は全員 AI 扱い（SR / RL のフルチャージ倍率がゲージに乗らない）
    controlled: { type: 'string' },
    // --enemy を省いたときの敵の防御力と属性
    defence: { type: 'string', default: '100' },
    element: { type: 'string' },
    // 手入力のコア命中率（省略 1）。指定すると条件は manual
    'core-hit-rate': { type: 'string' },
    // 宝物の段階（resourceId:段階 をカンマ区切り。省略は --build のスナップショットの段階、それも無ければ 0）
    treasure: { type: 'string' },
    // resourceId → 育成入力（BuildInput の各項目と任意の growth。gear の OL 装備に overload（[{ option, level }]、最大 3 行））の
    // JSON。育成データのスナップショット（npm run build:import が private/builds/ に書くもの）もそのまま渡せ、1 件に skillLevels が
    // あればスキル Lv の既定にする（--skill-levels が優先。plan/design-build-snapshot.md 3 節）
    build: { type: 'string' },
    // 手入力の命中率（射撃場 = 1 の相対値。全枠共通。省略 1）。指定すると条件は manual
    'hit-rate': { type: 'string' },
    // 敵のプリセット（data/enemies.json の id。--defence / --element より優先）
    enemy: { type: 'string' },
    // 出来事のセット（data/enemies.json。カンマ区切り）。敵のプリセット（--enemy か、--enemy を省いた敵にあたるプリセット。
    // presetForEnemy）が持つものだけ効く。省略は、そのプリセットの出来事のセットを全部入れる（射撃場の敵ではジャンプあり。画面の
    // 既定と同じ。plan/design-ui-rebuild.md 5.2 節）
    events: { type: 'string' },
    // 出来事を入れない
    'no-jump': { type: 'boolean', default: false },
    // 条件の決め方（auto | manual）。既定は auto（射撃場の表と着地点の時間割りでコア命中率・距離ボーナス・弾丸命中率を決める。
    // 射撃場のプリセットと、--enemy を省いた属性なしの射撃場の的で効く。ほかの敵では手入力の値と注記）。--core-hit-rate か
    // --hit-rate を指定したら manual（距離ボーナスあり・フルチャージ）。自動の枠は、使った条件の発数平均を出す
    condition: { type: 'string' },
    // 着地点の固定（録画と比べるとき用）。中遠は A | B | C の 1 か所（省略は 3 か所の配分）、近（C-0155）・遠（C-0477）は
    // 1 回目・2 回目を A,B で（省略は 2 か所の配分）
    'mid-far': { type: 'string' },
    near: { type: 'string' },
    far: { type: 'string' },
    // スキル Lv（resourceId:slot=Lv をカンマ区切り。slot は skill1・skill2・burst。例 191:skill2=4,260:burst=4）。省略は全部 Lv10
    // （実ビルドの録画と比べるとき用。V-0065）
    'skill-levels': { type: 'string' },
    // 出来事のセットの狙えない窓と着地点の区間の切れ目を、録画で読んだ窓に置き換える（V-0088。照合の setup.jumpWindows と同じ）。
    // 観測値の id（例 0056-11）か、[始まり, 終わり, …] の秒をカンマ区切りで渡す。--events に狙えない窓を持つ出来事のセットが要る
    'jump-windows': { type: 'string' },
    // 手で撃ったチェーンの始まり（I の本当の発動）のフレームの並び（照合の setup.manualBursts と同じ。TeamInput.manualBursts）。
    // 観測値の id か、昇順のフレームをカンマ区切りで渡す。動的サイクルだけ
    'manual-bursts': { type: 'string' },
    // 出来事の列だけを短く出す（区間の表は出さない。plan/design-workflow-simplification-15.md 6 節）。種類をカンマ区切りで:
    // shots（通常射撃。枠ごとの発の番号つき）・bursts（バーストのヒット・フルバースト・ゲージ・チェーン切れ）・buffs（区間に効く値の
    // 付き始めと切れ目）・hits（倍率ダメージ）・instants（即時効果）。all で全部
    trace: { type: 'string' },
    // --trace で出す範囲（ゲームの秒。省略は始めから・終わりまで）
    from: { type: 'string' },
    to: { type: 'string' },
  },
});

if (!values.ids) {
  fail();
}
const ids = values.ids.split(',').map((s) => Number(s.trim()));
if (ids.length < 1 || ids.length > TEAM_SIZE || ids.some((id) => !Number.isInteger(id) || id < 1)) {
  console.error(`--ids must list 1..${TEAM_SIZE} resource ids`);
  process.exit(2);
}
// 戦闘時間（数でない値（NaN）を計算に渡すと、メモリを使い切って落ちる）
const durationSeconds = seconds(values.duration, '--duration', true);
// --trace で出す種類と範囲のフレーム（計算の前に検査する）
const traceKinds = values.trace === undefined ? undefined : traceKindsArg(values.trace);
const traceStart = values.from === undefined ? 0 : gameSecondsToFrame(seconds(values.from, '--from'));
const traceEnd = values.to === undefined ? Infinity : gameSecondsToFrame(seconds(values.to, '--to'));

const treasurePhases = new Map<number, number>();
for (const entry of values.treasure?.split(',') ?? []) {
  const [id, phase] = entry.split(':').map((v) => Number(v.trim()));
  if (!ids.includes(id!) || !Number.isInteger(phase)) {
    console.error(`--treasure expects resourceId:phase for ids in --ids, got "${entry}"`);
    process.exit(2);
  }
  treasurePhases.set(id!, phase!);
}

// スキル Lv（省略した枠・スロットは --build の skillLevels、それも無ければ Lv10。範囲は runSimulation が検証する）
const skillLevelsById = new Map<number, Partial<SkillLevels>>();
for (const entry of values['skill-levels']?.split(',') ?? []) {
  const m = /^\s*(\d+):(skill1|skill2|burst)=(\d+)\s*$/.exec(entry);
  if (m === null || !ids.includes(Number(m[1]))) {
    console.error(
      `--skill-levels expects resourceId:slot=Lv (slot: skill1, skill2, burst) for ids in --ids, got "${entry}"`,
    );
    process.exit(2);
  }
  const id = Number(m[1]);
  const levels = skillLevelsById.get(id) ?? {};
  levels[m[2] as keyof SkillLevels] = Number(m[3]);
  skillLevelsById.set(id, levels);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}
const definedIds = new Set(definedSkillIds());
const fixedSpec = values['fixed-spec'];

// 育成入力。ファイルは { "<resourceId>": { growth?, affectionRank?, gear?, cube?, collection?, recycleRoom?, extraAttack? } }
// か、育成データのスナップショット（npm run build:import が書く。characters の 1 件は skillLevels と treasure も持つ。
// plan/design-build-snapshot.md 3 節）
type BuildFile = Record<
  string,
  Partial<BuildInput> & { growth?: GrowthInput; skillLevels?: SkillLevels; treasure?: SnapshotTreasure | null }
>;
function readBuildFile(path: string): BuildFile {
  const json: unknown = readJson(path);
  if (!isBuildSnapshotShaped(json)) return json as BuildFile;
  // スナップショットは画面の育成状況の読み込みと同じ検査を通す（plan/design-combat-power-sort.md 5.3 節）
  const index = (readJson(join(DATA_DIR, 'characters/index.json')) as CharacterIndex).characters;
  const read = readBuildSnapshotValue(json, index);
  if (!read.ok) {
    console.error(`--build ${path} を読めない:`);
    for (const e of read.errors) console.error(`  ${e}`);
    process.exit(1);
  }
  for (const n of cliSnapshotNotices(read)) console.warn(`--build: ${n}`);
  return read.snapshot.characters;
}
const buildFile = values.build === undefined ? {} : readBuildFile(values.build);
if (values.build !== undefined && fixedSpec) console.warn('--build is ignored under --fixed-spec');
const masters = Object.fromEntries(
  Object.entries(MASTER_FILES).map(([name, file]) => [name, readJson(join(DATA_DIR, 'masters', file))]),
) as BuildMasters;
const DEFAULT_GROWTH: GrowthInput = { level: 200, grade: 3, core: 0 };
// 条件の決め方。既定は auto。コア命中率・弾丸命中率を指定したら手入力
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
const far = values.far?.split(',') as FarLanding[] | undefined;
if (far !== undefined && (!far.every((n) => FAR_LANDINGS.includes(n)) || conditionMode !== 'auto')) {
  console.error('--far takes A or B per far span (e.g. A,B) and needs --condition auto');
  process.exit(2);
}
const condition = {
  coreHitRate: Number(values['core-hit-rate'] ?? '1'),
  distanceBonus: true,
  hitRate: Number(values['hit-rate'] ?? '1'),
};
const modeOf = conditionMode === 'auto' ? { conditionMode: 'auto' as const } : {};
// 敵のプリセット
const enemyPresets = parseEnemyPresets(readJson(join(DATA_DIR, ENEMY_PRESETS_PATH)));
const enemyPreset = values.enemy === undefined ? undefined : enemyPresets.enemies.find((e) => e.id === values.enemy);
if (values.enemy !== undefined && enemyPreset === undefined) {
  console.error(`--enemy: unknown preset ${values.enemy} (${enemyPresets.enemies.map((e) => e.id).join(', ')})`);
  process.exit(2);
}

const slots: TeamSlotInput[] = ids.map((id) => {
  const character = readJson(join(DATA_DIR, `characters/${id}.json`)) as CharacterData;
  const definition = definedIds.has(id) ? parseSkillDefinition(readJson(join(DATA_DIR, `skills/${id}.json`))) : null;
  // 段階の範囲・宝物の有無は runSimulation が検証する（RangeError）
  const skills = {
    definition,
    levels: {
      ...MAX_SKILL_LEVELS,
      ...(fixedSpec ? {} : buildFile[String(id)]?.skillLevels),
      ...skillLevelsById.get(id),
    },
    // --treasure が無ければ、育成データのスナップショットの段階（API の Lv から決めたもの（C-0744）か、画面の編集で選んだもの）
    treasurePhase: (treasurePhases.get(id) ??
      (fixedSpec ? undefined : buildFile[String(id)]?.treasure?.phase) ??
      0) as TreasurePhase,
  };
  return fixedSpec
    ? {
        character,
        growth: fixedSpecGrowth(character),
        condition,
        ...modeOf,
        attackOverride: computeFixedSpecAttack(character).attack,
        // 最終最大HP 基準の効果（casterFinalMaxHp）のための、スペック固定の最大HP
        hpOverride: computeFixedSpecHp(character),
        // 最終防御力の比べ（targetDefense）のための、スペック固定の防御力
        defenceOverride: computeFixedSpecDefence(character),
        skills,
      }
    : { ...withBuild(character, skills, buildFile[String(id)]), ...modeOf };
});

/** 育成入力があれば戦闘中の攻撃力を computeCombatAttack で作り、attackOverride に入れる。無ければ素のステータス */
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
  // 宝物の無いキャラの treasure（読み込みの index は宝物の有無を持たないので、ここでキャラのデータと突き合わせる）。段階が未確定（null）だと
  // 段階 0 で回り、runSimulation の検査を通ってしまう。--treasure で段階を指定したら、それに任せる
  if (entry.treasure != null && character.treasure === null && !treasurePhases.has(character.resourceId)) {
    console.error(`build ${character.name.ja}: 宝物の無いキャラに treasure がある`);
    process.exit(1);
  }
  const { growth: _growth, skillLevels: _skillLevels, treasure, ...rest } = entry;
  if (treasure != null && treasure.phase === null && !treasurePhases.has(character.resourceId))
    console.warn(
      `build ${character.name.ja}: 宝物 Lv${treasure.level} の段階は未確定（API の Lv 1・2 だけが段階 2・3 と分かっている。C-0744）。--treasure で指定する`,
    );
  // 書かれていない項目・部位は空の育成で埋める
  const empty = emptyBuild();
  const build: BuildInput = { ...empty, ...rest, gear: { ...empty.gear, ...rest.gear } };
  const combat = computeCombatAttack(character, growth, build, masters, { treasurePhase: skills.treasurePhase });
  console.log(buildAttackLine(character.name.ja, combat));
  const effects = resolveBuildEffects(character, build, masters, { treasurePhase: skills.treasurePhase });
  say(buildEffectsLine(effects));
  // 同じ育成入力から戦闘中の最大HP と防御力（バフ前）も作る
  const hp = computeCombatStat(character, growth, build, masters, 'hp', { treasurePhase: skills.treasurePhase }).value;
  const defence = computeCombatStat(character, growth, build, masters, 'defence', {
    treasurePhase: skills.treasurePhase,
  }).value;
  return {
    character,
    growth,
    condition,
    attackOverride: combat.attack,
    hpOverride: hp,
    defenceOverride: defence,
    buildEffects: effects.effects,
    skills,
  };
}

const plainEnemy: EnemyInput = {
  defence: Number(values.defence),
  element: (values.element as Element | undefined) ?? null,
  hasCore: true,
};
// 出来事のセットを持つプリセット。--enemy を省いたときは、敵の値にあたるプリセット（属性なしの射撃場の敵も射撃場のプリセット）
const eventPreset = enemyPreset ?? presetForEnemy(enemyPresets.enemies, plainEnemy);
if (values.events !== undefined && values['no-jump']) {
  console.error('--events and --no-jump cannot be used together');
  process.exit(2);
}
const eventSetIds =
  values.events?.split(',').map((s) => s.trim()) ?? (values['no-jump'] ? [] : (eventPreset?.eventSets ?? []));
for (const id of eventSetIds) {
  if (!eventPreset?.eventSets.includes(id)) {
    console.error(`--events: ${id} is not an event set of the enemy ${values.enemy ?? '(no preset)'}`);
    process.exit(2);
  }
}
/** --jump-windows・--manual-bursts の値: 観測値の id（録画 id-番号）か、数をカンマ区切りで並べたもの */
function observationValueArg(flag: string, arg: string): number | number[] {
  if (/^[\d.,\s]+$/.test(arg)) return arg.split(',').map((v) => Number(v.trim()));
  const dash = arg.lastIndexOf('-');
  const recording = dash < 0 ? arg : arg.slice(0, dash);
  const path = join(OBSERVATIONS_DIR, `${recording}.json`);
  const observations = existsSync(path) ? (readJson(path) as { id: string; value: number | number[] }[]) : [];
  const value = observations.find((o) => o.id === arg)?.value;
  if (value === undefined) {
    console.error(`${flag}: observation ${arg} not found in records/observations/${recording}.json`);
    process.exit(2);
  }
  return value;
}
/** --jump-windows: 秒の並び */
function jumpWindowsArg(arg: string): { start: number; end: number }[] {
  const value = observationValueArg('--jump-windows', arg);
  const windows = jumpWindowsOf(value);
  if (windows === undefined) {
    console.error(`--jump-windows: ${arg} is not an ascending list of [start, end, …] seconds`);
    process.exit(2);
  }
  return windows;
}
const jumpWindows = values['jump-windows'] === undefined ? undefined : jumpWindowsArg(values['jump-windows']);
if (jumpWindows !== undefined && eventSetIds.length === 0) {
  console.error('--jump-windows needs an untargetable event set (e.g. range-3min-jump; drop --no-jump)');
  process.exit(2);
}
/** --manual-bursts: フレームの並び */
function manualBurstsArg(arg: string): number[] {
  const frames = manualBurstsOf(observationValueArg('--manual-bursts', arg));
  if (frames === undefined) {
    console.error(`--manual-bursts: ${arg} is not an ascending list of frames`);
    process.exit(2);
  }
  return frames;
}
const manualBursts = values['manual-bursts'] === undefined ? undefined : manualBurstsArg(values['manual-bursts']);
if (manualBursts !== undefined && (values['no-burst'] || values['fixed-cycle'])) {
  console.error('--manual-bursts needs the dynamic burst cycle (drop --no-burst and --fixed-cycle)');
  process.exit(2);
}
const enemyEvents = enemyEventsOf(enemyPresets, eventSetIds, durationSeconds, jumpWindows);
const baseEnemy: EnemyInput = enemyPreset
  ? { ...enemyInputOf(enemyPreset), events: enemyEvents }
  : { ...plainEnemy, ...(enemyEvents.length > 0 ? { events: enemyEvents } : {}) };
// 的の条件の表（自動の条件のときだけ付ける）。射撃場のプリセットのほか、属性なしの射撃場の的（--enemy を
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
            durationSeconds,
            target,
            landingFixed(midFar, near, far),
            jumpWindows,
          ),
        },
  durationSeconds,
  burst: !values['no-burst'],
  burstModel: values['fixed-cycle'] ? ('fixed' as const) : ('dynamic' as const),
  controlledSlot: values.controlled === undefined ? null : Number(values.controlled) - 1,
  ...(manualBursts === undefined ? {} : { manualBursts }),
};
// 頭書きに出す、引数で決まること
const runSettings: RunSettings = {
  fixedSpec,
  build: values.build,
  manualBursts: values['manual-bursts'],
  enemyPresetId: enemyPreset?.id,
  conditionMode,
  condition,
  midFar,
  near,
  far,
};
// 編成の条件の付いた効果と、この編成で効くか（効かない効果は計算に入れない）。計算が入力の誤りで止まる（終了コード 1）ときにも出るように、
// 計算の前に出す
const compositionTable = compositionRows(slots, input.enemy.element);
if (compositionTable.length > 0 && traceKinds === undefined) {
  console.log(COMPOSITION_TITLE);
  console.table(compositionTable);
}
const sim = runSimulation(traceKinds === undefined ? input : { ...input, trace: true });
// 出した後は process.exit を呼ばずに、スクリプトの終わりまで進んで終わる（標準出力をパイプで受けると、大きな出力の直後の process.exit で
// 途中までしか出ない）
if (traceKinds === undefined) printReport();
else printTrace(sim.events, traceKinds);

/** 文があれば 1 行出す（sim-run/tables.ts は、出すものが無いとき undefined を返す） */
function say(line: string | undefined): void {
  if (line !== undefined) console.log(line);
}

/** 頭書きと表（バースト・順位・即時効果・枠ごとの合計・条件・枠ごとの区間と内訳）を出す。見出し・行・文は sim-run/tables.ts が作る */
function printReport(): void {
  const result = simTeamResult(input, sim);
  console.log(headerLine(input, sim.frames, runSettings));
  if (target !== undefined) say(landingsLine(result.landings, target));
  if (eventSetIds.length > 0) console.log(enemyEventsLine(eventSetIds, values['jump-windows'], enemyEvents));
  if (result.schedule && result.burstSummary) {
    console.log(burstSummaryLine(result.schedule, result.burstSummary, slots));
    console.table(activationRows(result.schedule, slots));
    say(chainTimeoutsLine(result.schedule));
    console.log(fullBurstIntervalsLine(result.schedule));
  }
  if (result.history.rankings.length > 0) {
    console.log(RANKING_TITLE);
    console.table(rankingRows(result.history.rankings, slots));
  }
  if (sim.instants.length > 0) {
    console.log(INSTANT_TITLE);
    console.table(instantRows(sim.instants, slots));
  }
  console.table(summaryRows(sim, result, slots));
  console.log(totalLine(result));
  const autoRows = autoConditionRows(result, slots);
  if (autoRows.length > 0) {
    console.log(AUTO_CONDITION_TITLE);
    console.table(autoRows);
  }
  say(conditionNotesText(result));
  for (const [i, slot] of slots.entries()) {
    const c = result.slots[i];
    if (!c) continue;
    console.log(segmentsTitle(i, slot));
    console.table(segmentRows(slot, c));
    say(conditionSkipsLine(result.history.conditionSkips, i));
    const cycles = cycleReport(i, sim, result);
    if (cycles !== undefined) {
      console.log(cycles.line);
      if (cycles.rows.length > 0) console.table(cycles.rows);
    }
    for (const line of dotLines(c)) console.log(line);
    for (const line of delayedHitLines(c)) console.log(line);
  }
}

/** --duration・--from・--to の秒（数でないか、0 未満（positive なら 0 以下）なら止める） */
function seconds(text: string, name: string, positive = false): number {
  const v = Number(text);
  if (text.trim() === '' || !Number.isFinite(v) || v < 0 || (positive && v === 0)) {
    console.error(`${name} は ${positive ? '0 より大きい' : '0 以上の'}秒（数）: ${text}`);
    process.exit(2);
  }
  return v;
}

/** --trace の値を、出す種類にする（知らない種類か、種類が 1 つも無ければ止める） */
function traceKindsArg(kinds: string): ReadonlySet<string> {
  const { wanted, unknown } = parseTraceKinds(kinds);
  if (unknown.length > 0 || wanted.size === 0) {
    const head = unknown.length > 0 ? `--trace の種類が無い: ${unknown.join(',')}` : `--trace に種類が無い: "${kinds}"`;
    console.error(`${head}（${TRACE_KINDS.join('・')}・all）`);
    process.exit(2);
  }
  return wanted;
}

/** --trace: 出来事の列だけを 1 行ずつ出す（区間の表は出さない）。行は sim-run/trace.ts が作る */
function printTrace(events: readonly SimEvent[], wanted: ReadonlySet<string>): void {
  console.log(traceLines(events, wanted, traceStart, traceEnd).join('\n'));
}
