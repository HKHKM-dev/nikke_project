// ヘッドレスの実行口。編成を runSimulation → simTeamResult で計算し、枠別・区間別の内訳を表で出す。
// 枠ごとに、効果層（OL・キューブ・コレクション）、CT 短縮・弾丸チャージ（即時効果）の記録、バフ状態ごとの区間表を出す。
//   node scripts/sim-run.ts --ids 271,870 [オプション]（オプションの説明は下の parseArgs の定義）
// 育成値は、--build に無いキャラは Lv200・3 凸・コア 0。スキル定義は data/skills/ にあるものを読む（無ければ定義なし = 通常攻撃のみ、
// 味方のバフは受ける）。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { slotsByStep } from '../src/burst/schedule.ts';
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
  LANDING_BAND_LABEL,
  enemyEventsOf,
  enemyInputOf,
  enemyLandingsOf,
  parseEnemyPresets,
  presetForEnemy,
  targetProfileForEnemy,
} from '../src/enemies.ts';
import {
  jumpWindowsOf,
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
import { runSimulation, simIntervalTotals } from '../src/sim/engine.ts';
import { simTeamResult } from '../src/sim/teamResult.ts';
import { firingParams } from '../src/frame/firing.ts';
import {
  MAX_SKILL_LEVELS,
  isCounterWhileEffect,
  isHpWhileEffect,
  type ItemEffect,
  isStateContent,
  type ResolvedTrigger,
  type SkillLevels,
} from '../src/skills/resolve.ts';
import { itemsOf } from '../src/skills/holders.ts';
import type { TreasurePhase } from '../src/skills/treasure.ts';
import { compositionAllows, resolveSelfState, selfStateLookupsForTeam } from '../src/skills/composition.ts';
import { SKILL_SLOTS, parseSkillDefinition, parseSkillIndex, type SkillEffect } from '../src/skills/types.ts';
import { TEAM_SIZE, type TeamSlotInput } from '../src/team.ts';
import type { BuildMasters, CharacterData, CharacterIndex, Element } from '../src/types.ts';
import type { EnemyInput } from '../src/damage.ts';
import { framesToGameSeconds, gameSecondsToFrame } from '../src/time.ts';

const DATA_DIR = join(import.meta.dirname, '../data');
const OBSERVATIONS_DIR = join(import.meta.dirname, '../../../records/observations');

/** 件を持つ効果の出どころの欄（状態・カウンタ・HP の割合の while は条件、持続バフはきっかけ） */
function itemLabel(e: ItemEffect): string {
  if (isStateContent(e)) return `while:${e.whileState}`;
  if (isCounterWhileEffect(e)) return `while:${e.whileCounter.counter}>=${e.whileCounter.atLeast}`;
  if (isHpWhileEffect(e)) return `while:hp>=${e.whileSelfHp.atLeast}`;
  return triggerLabel(e.trigger);
}

/** 回数トリガーも 1 語で出す（normalShot/10、burstUse≥2） */
function triggerLabel(t: ResolvedTrigger): string {
  if (typeof t === 'string') return t;
  // カウンタが上限に届いた時（counterFull:restraintChains）
  if ('counterFull' in t) return `counterFull:${t.counterFull}`;
  // 時間の周期のトリガー（every10s）
  // 状態の付いた時から数える周期（every0.2s:since:transformation）
  if ('everySeconds' in t) return `every${t.everySeconds}s${t.since === undefined ? '' : `:since:${t.since.applied}`}`;
  // 状態が付いた時のトリガー（applied:followUp。id は名前の付いた状態の目録の id）
  if ('applied' in t) return `applied:${t.applied}`;
  // フルスタックの消費のきっかけ（fullStack:relax）
  if ('fullStack' in t) return `fullStack:${t.fullStack}`;
  // 使用武器の変更の終わり
  if ('weaponChangeEnd' in t) return 'weaponChangeEnd';
  // リロードの込め終わり
  if ('reloadEnd' in t) return 'reloadEnd';
  // 遮蔽物 HP 回復を受けた時
  if ('coverHealed' in t) return 'coverHealed';
  // 自分の〈スロット〉を発動した時（skillFired:skill2）
  if ('skillFired' in t) return `skillFired:${t.skillFired}`;
  // 溜めの周期（chargeTick0.2s）と、溜めが満ちた時
  if ('chargeTick' in t) return `chargeTick${t.chargeTick.everySeconds}s`;
  if ('chargeFull' in t) return 'chargeFull';
  // 自分の HP の割合が閾値以下の間（hp<=70%）
  if ('selfHpAtMost' in t) return `hp<=${+(t.selfHpAtMost * 100).toFixed(2)}%`;
  // 両隣の味方の HP の割合（adjacentHp<=90%・adjacentHpFull）
  if ('adjacentHpAtMost' in t) return `adjacentHp<=${+(t.adjacentHpAtMost * 100).toFixed(2)}%`;
  if ('adjacentHpFull' in t) return 'adjacentHpFull';
  // 召喚の攻撃（summon:nearFeather）
  if ('summon' in t) return `summon:${t.summon}`;
  // 自分の状態が終わった時（ended:prediction）
  if ('ended' in t) return `ended:${t.ended}`;
  // フルバースト中だけ数える回数トリガー（normalHit/36@fullBurst、数え直しなら @fullBurst!）
  // 確率のきっかけ（normalHit@5%。窓は期待値の小片）
  if ('every' in t && t.chance !== undefined) return `${t.count}@${+(t.chance * 100).toFixed(4)}%`;
  if ('every' in t)
    return `${t.count}/${t.every}${t.during ? `@${typeof t.during === 'object' ? t.during.state : t.during}${t.reset === 'fullBurstStart' ? '!' : ''}` : ''}`;
  return `${t.count}≥${t.atLeast}${t.atMost !== undefined ? `≤${t.atMost}` : ''}`;
}

/** 効果の行に添える状態の id（付与・解除・スタック量の増減。味方の全部のスタック可能バフへの▲は allStackable） */
function stateLabelOf(e: SkillEffect): string {
  if (e.kind === 'stackChange') return e.target === 'allies' ? ' allStackable' : ` ${e.state}`;
  return e.kind === 'state' || e.kind === 'removeState' ? ` ${e.state}` : '';
}

const { values } = parseArgs({
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
  },
});

if (!values.ids) {
  console.error(
    'usage: node scripts/sim-run.ts --ids 271,870 [--fixed-spec] [--duration 180] [--no-burst] [--fixed-cycle] [--treasure 101:3] [--build builds.json] [--condition manual] [--hit-rate 0.8] [--enemy range-bigarms-wind] [--events range-3min-jump] [--no-jump] [--mid-far A] [--near A,B] [--far A,B] [--skill-levels 191:skill2=4] [--jump-windows 0056-11]',
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
const skillIndex = parseSkillIndex(readJson(join(DATA_DIR, 'skills/index.json')));
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
  fullCharge: true,
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
  const definition = skillIndex.resourceIds.includes(id)
    ? parseSkillDefinition(readJson(join(DATA_DIR, `skills/${id}.json`)))
    : null;
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
  console.error('--jump-windows needs an untargetable event set (e.g. range-3min-jump; drop --no-jump)');
  process.exit(2);
}
const enemyEvents = enemyEventsOf(enemyPresets, eventSetIds, Number(values.duration), jumpWindows);
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
            Number(values.duration),
            target,
            landingFixed(midFar, near, far),
            jumpWindows,
          ),
        },
  durationSeconds: Number(values.duration),
  burst: !values['no-burst'],
  burstModel: values['fixed-cycle'] ? ('fixed' as const) : ('dynamic' as const),
  controlledSlot: values.controlled === undefined ? null : Number(values.controlled) - 1,
};
// 編成の条件（burstStepMix・squad・withCharacter・enemyElement・row）の付いた効果と、この編成で効くか（効かない効果は計算に入れない）
const compositionCharacters = slots.map((s) => s.character);
// 編成で決まる自分の状態の条件（selfState。plan/design-skill-stage1.md 1.1 節）
const selfStates = selfStateLookupsForTeam(
  slots.map((s) => s.skills?.definition ?? null),
  compositionCharacters,
  input.enemy.element,
);
const compositionRows = slots.flatMap((slot, i) =>
  SKILL_SLOTS.flatMap((skill) =>
    (slot.skills?.definition?.skills[skill].effects ?? []).flatMap((e, effectIndex) => {
      const mix = 'burstStepMix' in e ? e.burstStepMix : undefined;
      const squad = 'squad' in e ? e.squad : undefined;
      const withCharacter = 'withCharacter' in e ? e.withCharacter : undefined;
      const enemyElement = 'enemyElement' in e ? e.enemyElement : undefined;
      const row = 'row' in e ? e.row : undefined;
      const selfState = 'condition' in e ? e.condition?.selfState : undefined;
      const decided = selfState !== undefined && selfStates[i]!(selfState.state) !== undefined;
      if (
        mix === undefined &&
        squad === undefined &&
        withCharacter === undefined &&
        enemyElement === undefined &&
        row === undefined &&
        !decided
      )
        return [];
      const conditions = [
        mix && `other ${mix.otherBurstStep} ${mix.present ? 'present' : 'absent'}`,
        squad && `same squad (${slot.character.squad}) ${squad.present ? 'present' : 'absent'}`,
        withCharacter && `character ${withCharacter.rid} ${withCharacter.present ? 'present' : 'absent'}`,
        enemyElement && `enemy ${enemyElement}`,
        row && `${row} row`,
        decided && selfState !== undefined && `self ${selfState.present ? 'in' : 'not in'} ${selfState.state}`,
      ].filter(Boolean);
      return [
        {
          slot: `slot ${i + 1} ${slot.character.name.ja}`,
          // 付与の行には状態の id も出す（state camouflage）。解除も（removeState metalSigma）
          effect: `${skill}[${effectIndex}] ${e.kind}${stateLabelOf(e)}`,
          condition: conditions.join(' & '),
          applies:
            compositionAllows(e, compositionCharacters, i, input.enemy.element) &&
            resolveSelfState(e, selfStates[i]!) !== null,
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
const result = simTeamResult(input, sim);

const fmt = (n: number, digits = 0) => n.toLocaleString('en-US', { maximumFractionDigits: digits });
const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

console.log(
  `duration ${input.durationSeconds}s (${sim.frames}f), burst ${input.burst ? input.burstModel : 'off'}, ` +
    `fixed spec ${fixedSpec}, build ${values.build ?? 'none'}, controlled ${input.controlledSlot === null ? 'none (all AI)' : `slot ${input.controlledSlot + 1}`}, ` +
    `enemy ${enemyPreset?.id ?? 'custom'} defence ${input.enemy.defence}, element ${input.enemy.element ?? 'none'}, ` +
    `conditions ${conditionMode}${
      conditionMode === 'manual'
        ? ` (core ${condition.coreHitRate}, hit rate ${condition.hitRate})`
        : [midFar ? `mid-far ${midFar}` : '', near ? `near ${near.join(',')}` : '', far ? `far ${far.join(',')}` : '']
            .filter(Boolean)
            .map((x) => ` (${x})`)
            .join('')
    }`,
);
// 着地点の区間
if (result.landings.length > 0 && target !== undefined) {
  const labelOf = (id: string | null): string => {
    if (id === null) return 'unmeasured';
    const band = target.landings.find((l) => l.id === id)?.band ?? id;
    const name = band in LANDING_BAND_LABEL ? LANDING_BAND_LABEL[band as keyof typeof LANDING_BAND_LABEL].en : id;
    return id in target.mixes ? `${name} (mix)` : `${name} [${id}]`;
  };
  console.log(
    `landings ${result.landings.map((s) => `${framesToGameSeconds(s.start).toFixed(1)}-${framesToGameSeconds(s.end).toFixed(1)}s ${labelOf(s.landing)}`).join(', ')}`,
  );
}
if (eventSetIds.length > 0) {
  console.log(
    `enemy events ${eventSetIds.join(', ')}${jumpWindows === undefined ? '' : ` (jump windows ${values['jump-windows']})`}: ${enemyEvents.map((e) => `${e.kind} ${e.start.toFixed(1)}-${e.end.toFixed(1)}s`).join(', ')}`,
  );
}
if (result.schedule && result.burstSummary) {
  const byStep = slotsByStep(result.schedule);
  const who = (list: number[]) =>
    list.length === 0 ? '-' : list.map((i) => `slot ${i + 1} ${slots[i]!.character.name.ja}`).join(' / ');
  const b = result.burstSummary;
  const sec = (v: number | null) => (v === null ? '-' : `${v.toFixed(2)}s`);
  console.log(
    `full bursts ${b.fullBursts} (first ${sec(b.firstFullBurstSeconds)}, mean cycle ${sec(b.meanCycleSeconds)}, ` +
      `uptime ${pct(b.fullBurstUptime)}), activations ${b.activations}, chain timeouts ${b.chainTimeouts}; ` +
      `I: ${who(byStep.Step1)}, II: ${who(byStep.Step2)}, III: ${who(byStep.Step3)}`,
  );
  const STEP = { Step1: 'I', Step2: 'II', Step3: 'III' } as const;
  console.table(
    result.schedule.activations.map((a) => ({
      time: `${framesToGameSeconds(a.frame).toFixed(2)}s`,
      frame: a.frame,
      step: STEP[a.step],
      nike: `slot ${a.slotIndex + 1} ${slots[a.slotIndex]!.character.name.ja}`,
      fullBurst: a.startsFullBurst
        ? `start (${framesToGameSeconds((result.schedule?.fullBurstWindows.find((w) => w.start >= a.frame)?.end ?? a.frame) - a.frame).toFixed(1)}s)`
        : '',
      // そのフルバーストを開いたチェーンで撃った枠（「直前にバーストスキルを使用した味方」）
      burstUsers: a.startsFullBurst
        ? (result.schedule?.fullBurstWindows.find((w) => w.start >= a.frame)?.burstUsers ?? [])
            .map((i) => i + 1)
            .join(',')
        : '',
    })),
  );
  if (result.schedule.chainTimeouts.length > 0) {
    console.log(
      `chain timeouts at ${result.schedule.chainTimeouts.map((f) => `${framesToGameSeconds(f).toFixed(2)}s`).join(', ')}`,
    );
  }
  const starts = result.schedule.fullBurstWindows.map((w) => w.start);
  console.log(
    `full burst intervals ${starts
      .slice(1)
      .map((f, k) => `${framesToGameSeconds(f - starts[k]!).toFixed(2)}s`)
      .join(', ')}`,
  );
}

// 「最終攻撃力が最も高い味方 N 機」の発火ごとの順位。同じ発火の同じ対象（S1 の 2 効果など）はまとめる
if (result.history.rankings.length > 0) {
  const merged = new Map<string, Record<string, string | number>>();
  for (const r of result.history.rankings) {
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

// 即時効果（CT 短縮・弾丸チャージ）。同じフレーム・同じ枠はまとめる。回復（heal）も出る
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
    'instant effects (cooldownReduction: frames actually cut, negative when lengthened by an increase, ammoRefill: rounds added, heal: always 0, burstGauge: ratio of the gauge max)',
  );
  console.table([...merged.values()]);
}

const rows = slots.map((slot, i) => {
  const s = sim.slots[i]!;
  const c = result.slots[i]!;
  return {
    slot: i + 1,
    name: slot.character.name.ja,
    weapon: slot.character.weaponType,
    burst: slot.character.burstStep,
    // 宝物の段階（宝物版で計算したスロット数）
    treasure: c.treasurePhase === 0 ? '-' : `${c.treasurePhase} (${c.treasureSlots.join('+')})`,
    attack: fmt(c.segments[0]?.trigger.attack ?? c.baseAttack),
    'normal (nonFB/FB triggers)': `${fmt(c.normalDamage)} (${simIntervalTotals(s).nonFullBurst.triggers}/${simIntervalTotals(s).fullBurst.triggers})`,
    segments: c.segments.length,
    'burst skill': `${fmt(s.burst.damage)} (${s.burst.activations.length}× ${fmt(s.burst.hit?.perActivation ?? 0)})`,
    // トリガー付きの倍率ダメージ（damage）
    'skill hits': `${fmt(s.skillHits.damage)} (${s.skillHits.frames.length}×)`,
    total: fmt(c.totalDamage),
    share: pct(c.share),
  };
});
console.table(rows);

console.log(`TOTAL ${fmt(result.totalDamage)}`);

// 自動の枠で使った条件の平均（1 パス目の射撃の列の発数で重みを付けた）
const autoRows = result.slots.flatMap((c, i) =>
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
const noteLines = result.slots.flatMap((c, i) =>
  (c?.notes ?? [])
    .filter((n) => n.code.startsWith('auto-') || n.code.startsWith('landing-') || n.code === 'hit-rate')
    .map((n) => `  [slot ${i + 1}] ${n.level}: ${n.message.ja}`),
);
if (noteLines.length > 0) console.log(`condition notes\n${noteLines.join('\n')}`);

// バフ状態ごとの区間表（枠ごと）。発数は 1 パス目の射撃の列から数えた数
for (const [i, slot] of slots.entries()) {
  const c = result.slots[i];
  if (!c) continue;
  console.log(`
[slot ${i + 1}] ${slot.character.name.ja} — segments`);
  console.table(
    c.segments.map((g) => ({
      ranges: g.ranges
        .map((r) => `${framesToGameSeconds(r.start).toFixed(1)}-${framesToGameSeconds(r.end).toFixed(1)}s`)
        .join(' '),
      sec: g.seconds.toFixed(1),
      FB: g.fullBurst ? 'yes' : '',
      attack: fmt(g.trigger.attack),
      boost: g.trigger.boost.total.toFixed(3),
      atkDmg: g.trigger.attackDamageMultiplier.toFixed(4),
      // 使用武器の変更（1 発の倍率）と、最大装弾数（スタックの▼・装弾数無限込み）
      weapon: g.buffs.weapon ? `${(g.trigger.weaponMultiplier * 100).toFixed(2)}%` : '',
      ammo: g.buffs.infiniteAmmo > 0 ? '∞' : firingParams(slot.character.shot, g.buffs).maxAmmo,
      perTrigger:
        g.trigger.perShot > 0
          ? `${fmt(g.trigger.perTrigger)} (${fmt(g.trigger.normal)}+${fmt(g.trigger.perShot)})`
          : fmt(g.trigger.perTrigger),
      triggers: g.triggers,
      damage: fmt(g.damage),
      timed: compactTimed(g.timedEffects)
        .map(
          ({ e, n }) =>
            // 状態の中身はトリガーの代わりに、効いている状態（while:camouflage）
            `${itemLabel(e)} ${e.stat}${e.value < 0 ? '' : '+'}${e.scaling === 'flat' ? `${e.value}${e.stat === 'chargeSpeed' ? 's' : ''}` : e.scaling === 'casterDefence' ? `${Math.round(e.appliedAmount)} (caster ${(e.value * 100).toFixed(2)}%)` : `${(e.value * 100).toFixed(2)}%`}${n > 1 ? ` ×${n}` : ''}${e.targetWeapon ? ` (${e.targetWeapon})` : ''}`,
        )
        .join(', '),
    })),
  );
  // 条件「自分が 〈stat〉 増加状態なら」を満たさずに発火しなかった回数（履歴の判定の記録）
  const skips = result.history.conditionSkips.filter((x) => x.sourceSlotIndex === i);
  if (skips.length > 0) {
    console.log(
      `condition skips: ${skips.length} (${skips.map((x) => framesToGameSeconds(x.frame).toFixed(2)).join(', ')}s)`,
    );
  }
  printCycles(i, c);
  printDots(c);
  printDelayedHits(c);
}

/** delayFrames のある倍率ダメージの遅れと、出た秒・1 回の値（plan/design-delayed-skill-hit.md） */
function printDelayedHits(c: NonNullable<(typeof result.slots)[number]>): void {
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

/** 持続ダメージの内訳（効果ごとの tick の数・合計と、付いた回ごとの最初の tick の秒。plan/design-nihilister.md 2.1 節） */
function printDots(c: NonNullable<(typeof result.slots)[number]>): void {
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
      // 周期の自動攻撃も dot の形で出す
      label: a.effect.dot!.autoAttack ? 'autoAttack' : 'dot',
    };
    d.n += 1;
    d.damage += a.hit.perActivation;
    d.seconds.push(a.seconds);
    // スタックする持続ダメージは tick ごとのスタックの数も出す
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
 * 段の循環の内訳（段ごとの回数・合計）と、間隔の変更の窓ごとの並び
 * （窓の前の段なしの発数 p・窓の中の段・窓の後の最初の段が何発目か。plan/design-stage11-scarlet-bs.md 0.3・7.5 節）
 */
function printCycles(slotIndex: number, c: NonNullable<(typeof result.slots)[number]>): void {
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
  const shots = sim.shots[slotIndex]?.frames ?? [];
  const stepAt = new Map(cycled.map((a) => [gameSecondsToFrame(a.seconds), a.effect.cycle!.step]));
  // 間隔の変更の件（時刻の順）
  const rows = itemsOf(result.history, { holder: slotIndex, kind: 'cycleEvery' }).map((w) => {
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

/** 同じ効果のスタックの段をまとめる（「critDamage+14.25% ×5」） */
function compactTimed<
  T extends { sourceSlotIndex: number; effectIndex: number; subIndex?: number; source: { skill: string } },
>(effects: readonly T[]): { e: T; n: number }[] {
  const out: { e: T; n: number }[] = [];
  for (const e of effects) {
    // 状態の中身は付与の中身の何番目か（subIndex）でも分ける
    const found = out.find(
      (x) =>
        x.e.sourceSlotIndex === e.sourceSlotIndex &&
        x.e.source.skill === e.source.skill &&
        x.e.effectIndex === e.effectIndex &&
        x.e.subIndex === e.subIndex,
    );
    if (found) found.n += 1;
    else out.push({ e, n: 1 });
  }
  return out;
}
