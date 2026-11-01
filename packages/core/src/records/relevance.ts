// 最小構成の検査（plan/design-minimal-relevance.md）: 効きうる未確定の要素だけに警告を出す。PR 3 は静的な判定（2 節・4.2 節）と出力（5 節）。
// 警告の単位は「確定の結論 × 根拠の観測値」の組。観測値の録画の編成の全枠について、効果・notes（計算に無関係を除く）・定義の無いキャラ・
// 的の表に無い通常攻撃の条件を要素として並べ、根拠が確定（か範囲外）でないもののうち、結論の対象でなく、その録画で起きえて、
// 観測量に効きうるものを残す。1 つでも残れば警告。人の判断の印（結論の minimal）のある要素は外す。
// 感度（4.1 節。sim を回し直す）は PR 4 で足す。それまでは compare を持つ観測値にも静的な判定を当てる。
import { compositionAllows, resolveSelfState, selfStateLookupsForTeam } from '../skills/composition.ts';
import { applyTreasure, treasureSlots } from '../skills/treasure.ts';
import {
  INDIRECT_PATH_NAMES,
  SHOT_COUNT_KINDS,
  SKILL_SLOTS,
  contentStatOf,
  isCoverHealedTrigger,
  type BuffStat,
  type IndirectPath,
  type NoteEffect,
  type SkillDefinition,
  type SkillEffect,
  type SkillEntry,
  type SkillNote,
} from '../skills/types.ts';
import type { NamedStateId } from '../skills/states.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import type { SkillSlot } from '../types.ts';
import { markElements, type Claim, type ClaimState, type ClaimWhen } from './claims.ts';
import { normalConditionMeasured } from './minimal.ts';
import type { Observation, ObservationKind, ObservationSource, RecordsData } from './observations.ts';
import type { RecordingEntry } from './recordings.ts';
import type { SkillRoot } from './skills.ts';

/** 効果の分類（plan/design-minimal-check.md 8.4 節の段 3）。unknown は分類が決まらない（stat や種類が unknown の notes） */
export type ElementClass =
  | 'damageValue'
  | 'critRate'
  | 'hitRate'
  | 'firing'
  | 'burstTiming'
  | 'otherHit'
  | 'heal'
  // 2 段目の段 17 の PR 1: 遮蔽物 HP 回復（「遮蔽物の HP を回復した時」の効果を通してだけ効く。回復と同じ扱い）
  | 'coverHeal'
  | 'normalCondition'
  | 'unknown';

/** 観測値の kind ごとに効きうる分類（同 8.4 節の段 3。total は全部、position・size はなし） */
const ALLOWED: Record<ObservationKind, readonly ElementClass[] | 'all'> = {
  hit: ['damageValue', 'otherHit'],
  rate: ['critRate', 'hitRate', 'normalCondition'],
  interval: ['firing'],
  timing: ['firing', 'burstTiming', 'otherHit', 'heal', 'coverHeal', 'hitRate', 'normalCondition'],
  count: ['firing', 'burstTiming', 'otherHit', 'heal', 'coverHeal', 'hitRate', 'normalCondition'],
  gauge: ['firing', 'burstTiming', 'otherHit', 'hitRate', 'normalCondition'],
  total: 'all',
  position: [],
  size: [],
};

const STAT_CLASS: Record<BuffStat, ElementClass> = {
  attack: 'damageValue',
  critRate: 'critRate',
  critDamage: 'damageValue',
  attackDamage: 'damageValue',
  chargeDamage: 'damageValue',
  distributedDamage: 'damageValue',
  sequentialAttackDamage: 'damageValue',
  burstGaugeSpeed: 'burstTiming',
  // 2 段目の段 11 の PR 3: バーストスキルのクールタイム▼（維持の付いた形）。バーストの時刻を変える
  burstCooldown: 'burstTiming',
  maxAmmo: 'firing',
  reloadSpeed: 'firing',
  chargeSpeed: 'firing',
  // 2 段目の段 9 の PR 2: 攻撃速度▲（発と発の間）
  attackSpeed: 'firing',
  spinUpSpeed: 'firing',
  hitRate: 'hitRate',
  infiniteAmmo: 'firing',
  elementDamage: 'damageValue',
  coreDamage: 'damageValue',
  normalAttackDamage: 'damageValue',
  normalCritRate: 'critRate',
  chargeDamageMultiplier: 'damageValue',
  damageTaken: 'damageValue',
  enemyDefenseDown: 'damageValue',
  projectileExplosionDamage: 'damageValue',
  // 2 段目の段 12 の PR 2: 発射体付着ダメージ▲（付着のヒットの値）と有利コードのダメージ適用（電撃コードの敵の 1 ヒットの値）
  projectileStickDamage: 'damageValue',
  elementAdvantage: 'damageValue',
  fixedChargeTime: 'firing',
  trueDamage: 'damageValue',
  trueDamageConversion: 'damageValue',
  sustainedDamage: 'damageValue',
  // 2 段目の段 6 の PR 2: 最大HP▲ は発動者の最終最大HP 基準の攻撃力▲を通して値に効く（notes のときと同じ分類）
  maxHp: 'damageValue',
  // 2 段目の段 11 の PR 2: 最大HP のみ▲ も同じ（最終最大HP への足し方が最大HP▲ と同じ）
  maxHpOnly: 'damageValue',
  // 2 段目の段 7: 防御力▲ は、対象の絞り込み（自分より最終防御力が低い味方）を通して値に効く（防御力▲ だけの効果は、経路 defense の
  // 間接の要素と同じに見る。notRelevantReason）
  defense: 'damageValue',
};

const KIND_CLASS: Record<string, ElementClass> = {
  burstDamage: 'otherHit',
  damage: 'otherHit',
  dot: 'otherHit',
  autoAttack: 'otherHit',
  weaponChange: 'otherHit',
  heal: 'heal',
  coverHeal: 'coverHeal',
  cooldownReduction: 'burstTiming',
  burstGauge: 'burstTiming',
  // 2 段目の段 21（plan/design-skill-stage21.md 2.1 節）: フルバーストの窓の長さ（窓の終わり・窓の中の発・フルバースト終了時のきっかけ）
  fullBurstExtend: 'burstTiming',
  burstGaugeHit: 'burstTiming',
  shotPause: 'firing',
  burstReentry: 'burstTiming',
  burstStepChange: 'burstTiming',
  allyGaugeAdd: 'burstTiming',
  ammoRefill: 'firing',
  cycle: 'firing',
  cycleEvery: 'firing',
};

/**
 * 観測値に効きうる分類。間隔（interval）は射撃の刻みだけだが、出どころがバーストの段・CT（burstChain）か時計（clock）の間隔には、
 * バーストの時刻（ゲージ・CT▼・再突入）も効く（design-minimal-relevance.md 10.5 節。2026-10-08、オーナー決定の案 A）
 */
export function allowedClasses(o: Pick<Observation, 'kind' | 'scope'>): readonly ElementClass[] | 'all' {
  if (o.kind === 'interval' && (o.scope?.source === 'burstChain' || o.scope?.source === 'clock'))
    return ['firing', 'burstTiming'];
  return ALLOWED[o.kind];
}

/** 指標から決まる観測量の出どころ（design-minimal-relevance.md 3.1 節。1 ヒットの値の指標だけ） */
const METRIC_SOURCE: Record<string, ObservationSource> = {
  hitDamage: 'normal',
  perShotHitDamage: 'normal',
  burstHitDamage: 'burst',
  dotHitDamage: 'dot',
  dotStackTickDamage: 'dot',
  skillHitDamage: 'skill',
  skillHitShotIndices: 'skill',
  skillHitNormalHits: 'skill',
};

/** 判定の要素（design-minimal-relevance.md 2 節の 2） */
export type MinimalElement = {
  /** 枠（1 始まり） */
  slot: number;
  /** 印（結論の minimal の element）と出力に使う名前。「イサベル skill2.notes[0]」の形 */
  name: string;
  /** 定義の場所（formatPlace の形からバッククォートを除いたもの）。定義の無いキャラ・通常攻撃の条件は無し */
  places: string[];
  type: 'effect' | 'note' | 'noDefinition' | 'normalCondition';
  /** 効果の種類・stat・対象・きっかけ（notes は effect の欄。定義の無いキャラと通常攻撃の条件は無し） */
  shape?: {
    kind: string;
    stat?: string;
    /**
     * 名前の付いた状態の語彙編: 状態の付与の中身の stat（分類は中身の stat の分類。plan/design-named-state-impl.md 1.8 節）。
     * 2 段目の段 1（plan/design-skill-stage1.md 3 節）: 中身は、同じ定義のその状態の付与のどれかが持つもの（中身の無い付与も、
     * 付ける状態の中身で数える）。解除（removeState）も、外す状態の中身
     */
    stats?: string[];
    target?: string;
    trigger?: string;
    targetWeapon?: string;
    targetElement?: string;
    /** 2 段目の段 9: 対象の絞り込み「〈クラス〉型の味方」 */
    targetClass?: string;
    /** 2 段目の段 7: 対象の絞り込み「自分より最終防御力が低い味方」（防御力▲ の読む側） */
    targetDefense?: string;
  };
  /** 効果のスロット */
  skillSlot?: SkillSlot;
  /** 効果の定義の中の位置（感度で定義から外す・置き換えるのに使う。subIndex は状態の付与の中身の項目） */
  effectRef?: { rid: number; root: SkillRoot; slot: SkillSlot; index: number; subIndex?: number };
  /** 根拠の結論（補足の refers の notes の claims も含める） */
  claims: string[];
  /** 分類の設計書の論点 7（plan/design-indirect-notes.md 2 節）: 間接の notes の経路（動かす側） */
  path?: IndirectPath;
  /** 同: 読む側の印（効果・notes の reads） */
  reads?: IndirectPath[];
};

/**
 * 2 段目の段 1: 定義のその状態の中身の stat（付与のどれかが持つ中身。無ければ空）。2 段目の段 14 の PR 3: 最大スタック数▲の項目は
 * 'maxStacksUp'（分類は順番の攻撃のヒットの数を変える otherHit。statClassOf）
 */
function stateStatsOf(def: SkillDefinition, state: NamedStateId): string[] {
  for (const slot of SKILL_SLOTS) {
    for (const g of def.skills[slot].effects) {
      if (g.kind === 'state' && g.state === state && g.contents !== undefined) return g.contents.map(contentStatOf);
    }
  }
  return [];
}

/** 鍵の名前をそのままきっかけの名前にするきっかけ（shapeOfEffect） */
const NAMED_TRIGGER_KEYS = ['applied', 'fullStack', 'chargeTick', 'chargeFull'] as const;

/** 効果の形のきっかけの名前（shapeOfEffect。名前に直せないきっかけは無し） */
function triggerNameOf(t: unknown): string | undefined {
  if (typeof t === 'string') return t;
  if (t === null || typeof t !== 'object') return undefined;
  if ('count' in t) return String(t.count);
  if ('everySeconds' in t) return 'timer';
  return NAMED_TRIGGER_KEYS.find((k) => k in t);
}

/**
 * 効果の形（きっかけは名前に直す: 文字列はそのまま、回数トリガーは count、時間の周期は timer、効果名は applied。2 段目の段 14 の PR 2:
 * 溜めの周期は chargeTick、溜めが満ちた時は chargeFull）
 */
function shapeOfEffect(e: SkillEffect, def: SkillDefinition): NonNullable<MinimalElement['shape']> {
  const v = e as Record<string, unknown>;
  const trigger = triggerNameOf(v.trigger);
  return {
    kind: e.kind,
    ...(typeof v.stat === 'string' ? { stat: v.stat } : {}),
    ...(e.kind === 'state' || e.kind === 'removeState' || e.kind === 'stackChange'
      ? { stats: stateStatsOf(def, e.state) }
      : {}),
    ...(typeof v.target === 'string' ? { target: v.target } : {}),
    ...(trigger !== undefined ? { trigger } : {}),
    ...(typeof v.targetWeapon === 'string' ? { targetWeapon: v.targetWeapon } : {}),
    ...(typeof v.targetElement === 'string' ? { targetElement: v.targetElement } : {}),
    ...(typeof v.targetClass === 'string' ? { targetClass: v.targetClass } : {}),
    ...(typeof v.targetDefense === 'string' ? { targetDefense: v.targetDefense } : {}),
  };
}

function shapeOfNote(e: NoteEffect | undefined): MinimalElement['shape'] {
  if (e === undefined) return { kind: 'unknown' };
  return { ...e };
}

/** 録画の台帳・結論と、sim の入力のデータ（感度の鍵と予測が同じものを読む） */
export type RelevanceContext = RecordsData & {
  recordings: ReadonlyMap<string, RecordingEntry>;
  claims: readonly Claim[];
};

/** 録画の編成の全枠の要素（宝物の段階と編成の条件を当てる。計算に無関係の notes は数えない。9 節の 4） */
export function elementsOf(recording: RecordingEntry, ctx: RelevanceContext): MinimalElement[] {
  const out: MinimalElement[] = [];
  const teamCharacters = recording.team.map((m) => ctx.characters.get(m.rid) ?? null);
  // 2 段目の段 1（plan/design-skill-stage1.md 1.1 節）: 編成で決まる自分の状態の条件（selfState）は、編成の段と同じに決める
  const teamDefinitions = recording.team.map((m) => {
    const character = ctx.characters.get(m.rid);
    const base = ctx.skills.get(m.rid);
    if (character === undefined || base === undefined) return null;
    return applyTreasure(character, base, (m.treasurePhase ?? 0) as TreasurePhase).definition ?? null;
  });
  const selfStates = selfStateLookupsForTeam(teamDefinitions, teamCharacters, recording.target.element);
  recording.team.forEach((member, i) => {
    const character = ctx.characters.get(member.rid);
    const base = ctx.skills.get(member.rid);
    // 要素の名前はキャラのデータの名前（台帳の呼び名は録画ごとに揺れる。印は名前で合わせる。design-minimal-relevance.md 11.4 節）
    const who = character?.name.ja ?? member.name;
    if (character === undefined || base === undefined) {
      out.push({ slot: member.slot, name: `${who}（定義なし）`, places: [], type: 'noDefinition', claims: [] });
    } else {
      const phase = (member.treasurePhase ?? 0) as TreasurePhase;
      const treasure = new Set(treasureSlots(character, phase));
      const def = applyTreasure(character, base, phase).definition!;
      for (const slot of SKILL_SLOTS) {
        const entry = def.skills[slot];
        const root: SkillRoot = treasure.has(slot) ? 'treasureSkills' : 'skills';
        const prefix = root === 'skills' ? '' : 'treasureSkills.';
        const place = (part: string) => `data/skills/${member.rid}.json の ${prefix}${slot} の ${part}`;
        const notes = entry.notes ?? [];
        const referring = (index: number) =>
          notes.flatMap((n, j) => (n.refers === `effects[${index}]` ? [{ note: n, j }] : []));
        entry.effects.forEach((e, index) => {
          if (!compositionAllows(e, teamCharacters, i, recording.target.element)) return;
          if (resolveSelfState(e, selfStates[i]!) === null) return;
          const refs = referring(index);
          const shape = shapeOfEffect(e, def);
          out.push({
            slot: member.slot,
            name: `${who} ${prefix}${slot}.effects[${index}]`,
            places: [place(`effects[${index}]`), ...refs.map(({ j }) => place(`notes[${j}]`))],
            type: 'effect',
            shape,
            skillSlot: slot,
            effectRef: { rid: member.rid, root, slot, index },
            claims: [...(e.claims ?? []), ...refs.flatMap(({ note }) => note.claims ?? [])],
            ...(e.reads === undefined ? {} : { reads: e.reads }),
          });
          // 名前の付いた状態の語彙編（plan/design-named-state-impl.md 1.8 節）: 中身の項目に claims があれば、項目を 1 つの要素にする
          // （付与の要素は状態の窓。中身の値の根拠は項目の claims）
          if (e.kind !== 'state') return;
          e.contents?.forEach((item, subIndex) => {
            if (item.claims === undefined) return;
            const { stats: _stats, ...grantShape } = shape;
            out.push({
              slot: member.slot,
              name: `${who} ${prefix}${slot}.effects[${index}].contents[${subIndex}]`,
              places: [place(`effects[${index}].contents[${subIndex}]`)],
              type: 'effect',
              shape: { ...grantShape, stat: contentStatOf(item) },
              skillSlot: slot,
              effectRef: { rid: member.rid, root, slot, index, subIndex },
              claims: item.claims,
            });
          });
        });
        notes.forEach((n: SkillNote, j) => {
          if (n.kind === 'noDamage' || n.refers !== undefined) return;
          out.push({
            slot: member.slot,
            name: `${who} ${prefix}${slot}.notes[${j}]`,
            places: [place(`notes[${j}]`)],
            type: 'note',
            shape: shapeOfNote(n.effect),
            skillSlot: slot,
            claims: n.claims ?? [],
            ...(n.path === undefined ? {} : { path: n.path }),
            ...(n.reads === undefined ? {} : { reads: n.reads }),
          });
        });
      }
    }
    if (character !== undefined && !normalConditionMeasured(character, recording, ctx.enemies))
      out.push({
        slot: member.slot,
        name: `${who} 通常攻撃の条件`,
        places: [],
        type: 'normalCondition',
        claims: [],
      });
  });
  return out;
}

/** 仮説の when がその録画で成り立つか（design-minimal-relevance.md 3.5 節。書いた条件が全部成り立つとき） */
export function whenHolds(when: ClaimWhen, recording: RecordingEntry, ctx: RelevanceContext): boolean {
  const members = recording.team.map((m) => ({ member: m, character: ctx.characters.get(m.rid) }));
  if (when.teamHas !== undefined) {
    const t = when.teamHas;
    const ok = members.some(
      ({ member, character }) =>
        (t.rid === undefined || member.rid === t.rid) &&
        (t.burstStage === undefined || character?.burstStep === t.burstStage) &&
        (t.weaponType === undefined || character?.weaponType === t.weaponType) &&
        (t.squad === undefined || character?.squad === t.squad),
    );
    if (!ok) return false;
  }
  if (when.sameStatSources !== undefined) {
    const { stat, atLeast } = when.sameStatSources;
    const elements = elementsOf(recording, ctx).filter((e) => e.type === 'effect');
    // 名前の付いた状態の語彙編: 状態の付与は中身の stat の出どころ（claims のある項目は別の要素なので、付与の側では数えない）
    const sources = elements.filter(
      (e) =>
        e.shape?.stat === stat ||
        (e.shape?.stats ?? []).some(
          (s, j) => s === stat && !elements.some((x) => x.name === `${e.name}.contents[${j}]`),
        ),
    ).length;
    if (sources < atLeast) return false;
  }
  if (when.enemyElement !== undefined && recording.target.element !== when.enemyElement) return false;
  return true;
}

/** 要素が未確定なら理由（「根拠なし」「仮説 C-NNNN」など）。確定なら undefined（2 節の 3） */
export function unconfirmedReason(
  element: MinimalElement,
  recording: RecordingEntry,
  ctx: RelevanceContext,
  byId: ReadonlyMap<string, Claim> = new Map(ctx.claims.map((c) => [c.id, c])),
): string | undefined {
  if (element.type === 'noDefinition') return '定義なし';
  if (element.type === 'normalCondition') return '的の表に無い';
  // 分類の設計書の論点 7（plan/design-indirect-notes.md 2 節）: 間接の要素は、読む側のいる編成ではいつも未確定（notes の結論は、読む側の
  // いない編成の根拠）。効くのは読む側のいる時だけなので、効きうるかは notRelevantReason が見る
  if (element.path !== undefined) return `間接（${INDIRECT_PATH_NAMES[element.path].ja}）: 読む側のいる編成の根拠なし`;
  if (element.claims.length === 0) return '根拠なし';
  const open = openClaims(element, recording, ctx, byId);
  return open.length === 0 ? undefined : open.map((id) => `${byId.get(id)?.state ?? '?'} ${id}`).join('・');
}

/** 要素の根拠のうち、確定・範囲外でなく、when がその録画で成り立つ結論（2 節の 3） */
function openClaims(
  element: MinimalElement,
  recording: RecordingEntry,
  ctx: RelevanceContext,
  byId: ReadonlyMap<string, Claim>,
): string[] {
  return element.claims.filter((id) => {
    const c = byId.get(id);
    const state: ClaimState | undefined = c?.state;
    if (state === '確定' || state === '範囲外') return false;
    if (state === '仮説' && c!.when !== undefined) return whenHolds(c!.when, recording, ctx);
    return true;
  });
}

/** 端だけ未確定の要素の、端のずれうる範囲（plan/design-minimal-edge.md 3.1 節。フレーム。負は早い側） */
export type EdgeRange = { start: [number, number]; end: [number, number] };

/** 付き始めを早める変換を当ててよい分類（2 パス目のダメージで読む効果。plan/design-minimal-edge.md 3.3 節の限界） */
const EDGE_EARLY_CLASSES: readonly ElementClass[] = ['damageValue', 'critRate'];

/**
 * 端だけ未確定か（plan/design-minimal-edge.md 3.1 節）。timed の定義の効果で、根拠に確定の結論が 1 つ以上あり、開いた結論がすべて
 * edge を持つ仮説でその subject.places がこの効果の場所を含むとき、端ごとに範囲の和をとって返す。そうでなければ undefined。
 * 付き始めを早める範囲は、1 パス目で読む分類の効果には当てない（undefined）
 */
export function edgeRangeOf(
  element: MinimalElement,
  recording: RecordingEntry,
  ctx: RelevanceContext,
  byId: ReadonlyMap<string, Claim> = new Map(ctx.claims.map((c) => [c.id, c])),
): EdgeRange | undefined {
  if (element.type !== 'effect' || element.shape?.kind !== 'timed' || element.effectRef?.subIndex !== undefined)
    return undefined;
  if (!element.claims.some((id) => byId.get(id)?.state === '確定')) return undefined;
  const open = openClaims(element, recording, ctx, byId);
  if (open.length === 0) return undefined;
  let range: EdgeRange | undefined;
  for (const id of open) {
    const c = byId.get(id);
    if (c?.state !== '仮説' || c.edge === undefined || c.subject === undefined || !('places' in c.subject))
      return undefined;
    const places = c.subject.places.map((p) => p.replaceAll('`', ''));
    if (!element.places.some((p) => places.includes(p))) return undefined;
    const s = c.edge.start ?? [0, 0];
    const e = c.edge.end ?? [0, 0];
    range =
      range === undefined
        ? { start: [s[0], s[1]], end: [e[0], e[1]] }
        : {
            start: [Math.min(range.start[0], s[0]), Math.max(range.start[1], s[1])],
            end: [Math.min(range.end[0], e[0]), Math.max(range.end[1], e[1])],
          };
  }
  if (range!.start[0] < 0 && !EDGE_EARLY_CLASSES.includes(classOf(element))) return undefined;
  return range;
}

/** 2 つの範囲が同じか（どちらも無いときも同じ） */
export function sameEdgeRange(a: EdgeRange | undefined, b: EdgeRange | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** 2 段目の段 14 の PR 2: 撃つ枠の溜めで起きるきっかけ（撃たない枠では起きない。射撃の回数のきっかけと同じ扱い） */
const SHOT_TRIGGERS: ReadonlySet<string> = new Set([...SHOT_COUNT_KINDS, 'chargeTick', 'chargeFull']);
const FULL_BURST_TRIGGERS: ReadonlySet<string> = new Set([
  'fullBurstStart',
  'fullBurstEnd',
  'burstStage2Enter',
  'burstStage3Enter',
]);

/** その録画で起きえないか（2 節の 4）。起きえないなら理由、起きうるなら undefined */
export function impossibleReason(element: MinimalElement, recording: RecordingEntry): string | undefined {
  const member = recording.team.find((m) => m.slot === element.slot);
  const single = recording.team.length === 1;
  const trigger = element.shape?.trigger;
  if (member?.fires === false) {
    if (element.type === 'normalCondition') return '撃たない枠';
    if (trigger !== undefined && SHOT_TRIGGERS.has(trigger)) return '撃たない枠';
  }
  if (member?.bursts === false || single) {
    const why = single ? '単騎（C-0024）' : 'バーストを使わない枠';
    if (element.skillSlot === 'burst' && element.type !== 'noDefinition') return why;
    if (trigger === 'burstUse' || trigger === 'burstHit') return why;
  }
  if (single && trigger !== undefined && FULL_BURST_TRIGGERS.has(trigger)) return '単騎（C-0024）';
  return undefined;
}

/** stat の分類 */
function statClassOf(stat: string | undefined): ElementClass {
  if (stat === undefined || stat === 'unknown') return 'unknown';
  // 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節）: 状態の中身の最大スタック数▲（オートファイアの順番の攻撃の数を変える）
  if (stat === 'maxStacksUp') return 'otherHit';
  return STAT_CLASS[stat as BuffStat] ?? 'unknown';
}

/**
 * 要素の分類（4.2 節の 5）。名前の付いた状態の語彙編（plan/design-named-state-impl.md 1.8 節）: 状態の付与は中身の stat の分類
 * （中身の分類が揃わない・中身の無い付与は分類が決まらない unknown）。中身の項目の要素は項目の stat の分類
 */
export function classOf(element: MinimalElement): ElementClass {
  if (element.type === 'normalCondition') return 'normalCondition';
  const shape = element.shape;
  if (shape === undefined || shape.kind === 'unknown') return 'unknown';
  if (shape.kind === 'passive' || shape.kind === 'timed') return statClassOf(shape.stat);
  if (shape.kind === 'state' || shape.kind === 'removeState' || shape.kind === 'stackChange') {
    if (shape.stat !== undefined) return statClassOf(shape.stat);
    const classes = new Set((shape.stats ?? []).map(statClassOf));
    return classes.size === 1 ? [...classes][0]! : 'unknown';
  }
  return KIND_CLASS[shape.kind] ?? 'unknown';
}

/** 観測値の枠（scope.slot か compare.args.slot。'all' や分からないときは undefined） */
export function observedSlots(o: Observation): number[] | undefined {
  const s = o.scope?.slot ?? (o.compare?.args.slot !== undefined ? Number(o.compare.args.slot) : undefined);
  if (s === undefined || s === 'all') return undefined;
  return Array.isArray(s) ? s : [s];
}

/** 観測量の出どころ（scope.source か、指標から） */
export function observedSource(o: Observation): ObservationSource | undefined {
  return o.scope?.source ?? (o.compare !== undefined ? METRIC_SOURCE[o.compare.metric] : undefined);
}

/** 編成に、回復を受けた時（trigger: healed）がきっかけの効果か notes を持つキャラがいるか（宝物版のスロットも見る） */
export function teamHasHealedTrigger(recording: RecordingEntry, ctx: RelevanceContext): boolean {
  return teamHasTrigger(recording, ctx, (t) => t === 'healed');
}

/** 2 段目の段 17 の PR 1: 編成に、遮蔽物 HP 回復を受けた時（trigger: { coverHealed }）がきっかけの効果か notes を持つキャラがいるか */
export function teamHasCoverHealedTrigger(recording: RecordingEntry, ctx: RelevanceContext): boolean {
  return teamHasTrigger(recording, ctx, isCoverHealedTrigger);
}

function teamHasTrigger(recording: RecordingEntry, ctx: RelevanceContext, matches: (t: unknown) => boolean): boolean {
  const hits = (x: { trigger?: unknown } | undefined) => x !== undefined && matches(x.trigger);
  return recording.team.some((m) => {
    const def = ctx.skills.get(m.rid);
    if (def === undefined) return false;
    const slots = [def.skills, def.treasureSkills ?? {}].flatMap((s) => Object.values(s) as SkillEntry[]);
    return slots.some(
      (s) => s.effects.some((e) => hits(e as { trigger?: unknown })) || (s.notes ?? []).some((n) => hits(n.effect)),
    );
  });
}

/** 録画の編成の要素（間接の要素の読む側を引くのに使う。文脈 × 録画ごとに作る） */
const teamElements = new WeakMap<RelevanceContext, Map<string, MinimalElement[]>>();
function elementsOfTeam(recording: RecordingEntry, ctx: RelevanceContext): MinimalElement[] {
  let byRecording = teamElements.get(ctx);
  if (byRecording === undefined) {
    byRecording = new Map();
    teamElements.set(ctx, byRecording);
  }
  let elements = byRecording.get(recording.id);
  if (elements === undefined) {
    elements = elementsOf(recording, ctx);
    byRecording.set(recording.id, elements);
  }
  return elements;
}

/** 2 段目の段 7: 防御力▲ だけの効果（状態の中身が防御力▲ だけの付与も）。与ダメージの式を読まない */
function isDefenseOnly(element: MinimalElement): boolean {
  const shape = element.shape;
  if (element.type !== 'effect' || shape === undefined) return false;
  if (shape.stat !== undefined) return shape.stat === 'defense';
  return shape.stats !== undefined && shape.stats.length > 0 && shape.stats.every((stat) => stat === 'defense');
}

/**
 * 静的な判定（4.2 節）。効かないなら理由、効きうるなら undefined。readerExcluded は、間接の要素の読む側のうち、この観測値に効かないと
 * 分かっているもの（人の判断の印・感度で効かない。relevanceOf が渡す）
 */
export function notRelevantReason(
  element: MinimalElement,
  o: Observation,
  recording: RecordingEntry,
  ctx: RelevanceContext,
  readerExcluded: (reader: MinimalElement) => boolean = () => false,
): string | undefined {
  if (element.type === 'noDefinition') return undefined;
  // 分類の設計書の論点 7（plan/design-indirect-notes.md 2 節）: 間接の要素は、同じ経路を読む要素が編成にいて、その要素がこの録画で起きえて
  // この観測値に効きうる時だけ効きうる（効く分類と対象は、読む側で見る）。2 段目の段 7（plan/design-skill-stage7.md 1.2 節）: 防御力▲ の
  // 効果も与ダメージの式を読まず、防御力を読む側を通してだけ値に効くので、経路 defense の間接の要素と同じに見る
  const path = element.path ?? (isDefenseOnly(element) ? 'defense' : undefined);
  if (path !== undefined) {
    const readers = elementsOfTeam(recording, ctx).filter((r) => r.reads?.includes(path));
    const name = INDIRECT_PATH_NAMES[path].ja;
    if (readers.length === 0) return `${name}を読む味方がいない`;
    const observed = observedSlots(o);
    const effective = readers.some(
      (r) =>
        !readerExcluded(r) &&
        impossibleReason(r, recording) === undefined &&
        notRelevantReason(r, o, recording, ctx) === undefined &&
        // 2 段目の段 7（同 1.4 節）: 「自分と自分より最終防御力が低い味方」の読む側は発動者をいつも対象にするので、防御力の比べで値が
        // 変わりうるのは、観測した枠のうち発動者でない枠（観測した枠が分からなければ効きうるとみる）
        (r.shape?.targetDefense === undefined || observed === undefined || observed.some((slot) => slot !== r.slot)),
    );
    return effective ? undefined : `${name}を読む効果がこの観測値に効かない`;
  }
  const cls = classOf(element);
  // 回復は「回復を受けた時」の効果を通してだけ観測量に効く（11.8 節。2026-10-08、オーナー決定）
  if (cls === 'heal' && !teamHasHealedTrigger(recording, ctx)) return '回復を受けた時の効果を持つ味方がいない';
  if (cls === 'coverHeal' && !teamHasCoverHealedTrigger(recording, ctx))
    return '遮蔽物の HP を回復した時の効果を持つ味方がいない';
  const single = o.kind === 'hit' || o.kind === 'rate';
  if (observedSource(o) === 'normal' && o.kind === 'hit' && cls === 'otherHit') return '別のヒット';
  const slots = observedSlots(o);
  const shape = element.shape;
  if (single && slots !== undefined && shape !== undefined) {
    if (shape.target === 'self' && !slots.includes(element.slot)) return '対象が観測した枠でない';
    const observed = slots.map((s) => ctx.characters.get(recording.team.find((m) => m.slot === s)?.rid ?? -1));
    if (
      shape.targetWeapon !== undefined &&
      observed.every((c) => c !== undefined && c.weaponType !== shape.targetWeapon)
    )
      return '対象の武器種が観測した枠と違う';
    if (
      shape.targetElement !== undefined &&
      observed.every((c) => c !== undefined && c.element !== shape.targetElement)
    )
      return '対象のコードが観測した枠と違う';
    // 2 段目の段 9（plan/design-skill-stage9.md 1.1 節）: 「〈クラス〉型の味方」も、武器種・コードと同じく観測した枠のクラスで外す
    if (shape.targetClass !== undefined && observed.every((c) => c !== undefined && c.class !== shape.targetClass))
      return '対象のクラスが観測した枠と違う';
  }
  if (cls === 'unknown') return undefined;
  const allowed = allowedClasses(o);
  if (allowed !== 'all' && !allowed.includes(cls)) return `観測値（${o.kind}）に効かない分類`;
  return undefined;
}

export type PairWarning = {
  observation: string;
  recordings: string[];
  /** 効きうる未確定の要素（名前と、未確定の理由） */
  elements: { name: string; reason: string }[];
  /** 印で外した要素 */
  marked: string[];
};

/** unmeasured は、感度で決めるはずの要素のうち、感度の結果が無いか古くて静的な判定で代えた数 */
export type ClaimRelevance = { claim: string; pairs: number; warnings: PairWarning[]; unmeasured: number };

// ---- 感度の結果（4.1 節。design-minimal-relevance.md 10.6 節） ----

/** 感度の結果の 1 件（観測値 × 要素）。key は入力（録画・比べる指定・編成の定義）から作り、合わなければ古いとみる */
export type SensitivityEntry = {
  observation: string;
  element: string;
  key: string;
  /** 外す（P−）か常に効かせる（P+）の予測が、基準の予測から許容を超えて動いたか（計算できなかったときも true） */
  effective: boolean;
  /** 基準との差（compareValue の diff。計算しなかった・できなかったときは null） */
  minus: number | null;
  plus: number | null;
  /**
   * 端だけ未確定の要素（plan/design-minimal-edge.md 3.4 節）: P−・P+ の代わりに回した、端を広げる・縮める変換の範囲と基準との差。
   * relevanceOf は、いまの要素の範囲（edgeRangeOf）と合わなければ古いとみる
   */
  edge?: { range: EdgeRange; widen: number | null; narrow: number | null };
  error?: string;
};

/** 観測値 ID|要素の名前 → 結果 */
export type SensitivityIndex = ReadonlyMap<string, SensitivityEntry>;

/** 感度の結果の索引の鍵（観測値 × 要素） */
export function sensitivityId(observation: string, element: string): string {
  return `${observation}|${element}`;
}

/** 感度の計算の仕方を変えたら上げる（鍵が変わり、結果は古いとみなされる） */
export const SENSITIVITY_VERSION = 3;

/** 感度を使う観測値（sim と比べるもの） */
export function usesSensitivity(o: Observation): boolean {
  return o.use === 'compare' && o.compare?.model === 'sim' && o.invalid === undefined;
}

/** FNV-1a（64 ビットを 2 つの 32 ビットで）。ブラウザでも動くように node:crypto は使わない */
function hash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** 計算に効かない欄（根拠・notes・表示の文）を除く */
const keyReplacer = (k: string, v: unknown) => (['claims', 'notes', 'ja', 'en', 'reads'].includes(k) ? undefined : v);

/** 大きい入力（キャラのデータ・的の表・育成のマスタ）の要約。同じオブジェクトを何度も JSON にしない（読み込んだデータは書き換えない前提） */
const digests = new WeakMap<object, string>();
function digestOf(value: object): string {
  let d = digests.get(value);
  if (d === undefined) {
    d = hash(JSON.stringify(value, keyReplacer));
    digests.set(value, d);
  }
  return d;
}

/**
 * 感度の入力の鍵: 版・録画の台帳・比べる指定・編成の定義とキャラのデータ・的の表・比べる指定が名前で指す観測値の値・
 * スペック固定 OFF の録画の育成のマスタ（根拠と notes を除く）。sim が読むデータを全部入れる（モデルのコードは入れない）
 */
export function sensitivityKey(
  o: Observation,
  recording: RecordingEntry,
  ctx: Pick<RelevanceContext, 'skills' | 'characters' | 'enemies' | 'observationValues' | 'buildMasters'>,
): string {
  const defs = recording.team.map((m) => ctx.skills.get(m.rid) ?? null);
  // キャラのデータは大きいので、オブジェクトごとに 1 回だけ要約する（定義はテストが同じオブジェクトを書き換えて比べるので丸ごと）
  const characters = recording.team.map((m) => {
    const c = ctx.characters.get(m.rid);
    return c === undefined ? null : digestOf(c);
  });
  // 比べる指定が観測値の id で指す値（jumpWindows・manualBursts・obstacles・pelletHits など）
  const values: Record<string, unknown> = {};
  JSON.stringify(o.compare?.setup ?? null, (_k, v: unknown) => {
    const value = typeof v === 'string' ? ctx.observationValues?.get(v) : undefined;
    if (value !== undefined) values[v as string] = value;
    return v;
  });
  const masters = recording.fixedSpec === false && ctx.buildMasters !== undefined ? digestOf(ctx.buildMasters) : null;
  return hash(
    JSON.stringify(
      {
        v: SENSITIVITY_VERSION,
        recording,
        compare: o.compare,
        defs,
        characters,
        enemies: digestOf(ctx.enemies),
        values,
        masters,
      },
      keyReplacer,
    ),
  );
}

/** 確定の結論ごとの組の判定（2 節）。失効した観測値と、録画の台帳に無い観測値は数えない */
export function relevanceOf(
  claims: readonly Claim[],
  observations: readonly Observation[],
  ctx: RelevanceContext,
  /** 感度の結果（records/minimal/sensitivity.json）。鍵が今の入力と合うものだけ使う */
  sensitivity: SensitivityIndex = new Map(),
): ClaimRelevance[] {
  const keys = new Map<string, string>();
  const byId = new Map(ctx.claims.map((c) => [c.id, c]));
  const obs = new Map(observations.map((o) => [o.id, o]));
  const out: ClaimRelevance[] = [];
  for (const c of claims) {
    if (c.state !== '確定') continue;
    const subject = new Set(c.subject !== undefined && 'places' in c.subject ? c.subject.places : []);
    let pairs = 0;
    let unmeasured = 0;
    const warnings: PairWarning[] = [];
    for (const id of c.observations) {
      const o = obs.get(id);
      if (o === undefined || o.invalid !== undefined) continue;
      const recs = (o.recordings ?? [o.recording]).flatMap((r) => {
        const rec = ctx.recordings.get(r);
        return rec === undefined ? [] : [rec];
      });
      if (recs.length === 0) continue;
      pairs++;
      const elements: { name: string; reason: string }[] = [];
      const marked: string[] = [];
      const markedFor = (name: string) =>
        (c.minimal ?? []).some(
          (m) => markElements(m).includes(name) && (m.observations === '*' || m.observations.includes(o.id)),
        );
      for (const rec of recs) {
        // 分類の設計書の論点 7（plan/design-indirect-notes.md 2 節）: 間接の要素の読む側のうち、印か感度でこの観測値に効かないもの
        const readerExcluded = (r: MinimalElement): boolean => {
          if (markedFor(r.name)) return true;
          if (!usesSensitivity(o) || r.type !== 'effect') return false;
          const cacheKey = `${o.id}|${rec.id}`;
          const key = keys.get(cacheKey) ?? sensitivityKey(o, rec, ctx);
          keys.set(cacheKey, key);
          const s = sensitivity.get(sensitivityId(o.id, r.name));
          return (
            s !== undefined &&
            s.key === key &&
            sameEdgeRange(s.edge?.range, edgeRangeOf(r, rec, ctx, byId)) &&
            !s.effective
          );
        };
        for (const e of elementsOf(rec, ctx)) {
          if (e.places.some((p) => subject.has(p))) continue;
          let reason = unconfirmedReason(e, rec, ctx, byId);
          if (reason === undefined) continue;
          if (impossibleReason(e, rec) !== undefined) continue;
          // 感度（4.1 節）: sim と比べる観測値と定義の効果の組は、今の入力の鍵と合う結果があればそれで決める
          let measured = false;
          if (usesSensitivity(o) && e.type === 'effect') {
            const cacheKey = `${o.id}|${rec.id}`;
            const key = keys.get(cacheKey) ?? sensitivityKey(o, rec, ctx);
            keys.set(cacheKey, key);
            const s = sensitivity.get(sensitivityId(o.id, e.name));
            const edge = edgeRangeOf(e, rec, ctx, byId);
            if (s !== undefined && s.key === key && sameEdgeRange(s.edge?.range, edge)) {
              if (!s.effective) continue;
              reason = `${reason}${edge === undefined ? '' : '（端）'}・感度で効く`;
              measured = true;
            } else unmeasured++;
          }
          if (!measured && notRelevantReason(e, o, rec, ctx, readerExcluded) !== undefined) continue;
          if (elements.some((x) => x.name === e.name) || marked.includes(e.name)) continue;
          const mark = markedFor(e.name);
          if (mark) marked.push(e.name);
          else elements.push({ name: e.name, reason });
        }
      }
      if (elements.length > 0 || marked.length > 0)
        warnings.push({ observation: o.id, recordings: recs.map((r) => r.id), elements, marked });
    }
    out.push({ claim: c.id, pairs, warnings, unmeasured });
  }
  return out;
}

/** 結論 ID → 警告のある組の数と組の数（claims.md の行） */
export function relevanceCounts(results: readonly ClaimRelevance[]): Map<string, { warned: number; pairs: number }> {
  return new Map(
    results.map((r) => [r.claim, { warned: r.warnings.filter((w) => w.elements.length > 0).length, pairs: r.pairs }]),
  );
}

// ---- plan/minimal.md（生成） ----

/** 結論の文の先頭（全文は claims.md） */
const short = (text: string) => ([...text].length > 80 ? `${[...text].slice(0, 80).join('')}…` : text);

/** 観測値の ID の並びを、同じ録画の連番は「`0010-01`〜`0010-04`」にまとめる（結論の根拠の書き方と同じ） */
export function compressIds(ids: readonly string[]): string[] {
  const out: string[] = [];
  let run: { rec: string; from: string; to: string; last: number; width: number } | undefined;
  const flush = () => {
    if (run === undefined) return;
    out.push(
      run.from === run.to ? `\`${run.rec}-${run.from}\`` : `\`${run.rec}-${run.from}\`〜\`${run.rec}-${run.to}\``,
    );
    run = undefined;
  };
  for (const id of ids) {
    const m = /^(.+)-(\d+)$/.exec(id);
    if (m === null) {
      flush();
      out.push(`\`${id}\``);
      continue;
    }
    const n = Number(m[2]);
    if (run !== undefined && run.rec === m[1] && n === run.last + 1 && m[2]!.length === run.width) {
      run.to = m[2]!;
      run.last = n;
    } else {
      flush();
      run = { rec: m[1]!, from: m[2]!, to: m[2]!, last: n, width: m[2]!.length };
    }
  }
  flush();
  return out;
}

const HEADER = `# 最小構成の検査

- **このファイルは生成する（手で書かない）**。\`npm run records:check\` で作り直す（[design-minimal-relevance.md](design-minimal-relevance.md) 5 節）。
- 確定の結論と、その根拠の観測値の組ごとに、観測値の録画の編成から、根拠が確定（か範囲外）でない要素（効果・notes・定義の無いキャラ・的の表に無い通常攻撃の条件）を並べ、結論の対象（\`subject\`）・その録画で起きないもの（撃たない枠・バーストを使わない枠・単騎）・観測量に効かないもの（静的な判定。同 4.2 節）を外して、残ったものを出す。計算に無関係の notes は数えない。
- sim と比べる観測値と定義の効果の組は、静的な判定の代わりに感度（同 4.1 節。その効果を外す・常に効かせると予測が許容を超えて動くか）で決める。感度の結果は \`npm run records:minimal\` が \`records/minimal/sensitivity.json\` に書き、入力（録画・比べる指定・編成の定義）が変わった組は、計算し直すまで静的な判定に戻す。
- 残った要素が 1 つでもある組が警告。人の判断の印（結論の \`minimal\`。同 4.3 節）のある要素は外し、「印」に出す。
- 結論ごとに、残った要素と、それが残った組の観測値を並べる。要素の後ろの括弧は、未確定の理由（根拠なし・仮説の結論・定義なし・的の表に無い）。感度で効くと決まったものには「感度で効く」を足す。`;

export function renderMinimal(results: readonly ClaimRelevance[], claims: readonly Claim[]): string {
  const byId = new Map(claims.map((c) => [c.id, c]));
  const pairs = results.reduce((n, r) => n + r.pairs, 0);
  const warned = results.flatMap((r) => r.warnings.filter((w) => w.elements.length > 0));
  const claimsWarned = results.filter((r) => r.warnings.some((w) => w.elements.length > 0));
  const allWarned = claimsWarned.filter((r) => r.warnings.filter((w) => w.elements.length > 0).length === r.pairs);
  const lines = [
    HEADER,
    '',
    `件数: 確定の結論 ${results.length}・組 ${pairs}。警告のある組 ${warned.length}（結論 ${claimsWarned.length}。うち組がすべて警告 ${allWarned.length}）`,
  ];
  const unmeasured = results.reduce((n, r) => n + r.unmeasured, 0);
  if (unmeasured > 0)
    lines.push(
      '',
      `**感度の結果が無いか古い要素: ${unmeasured}**（静的な判定で代えた。\`npm run records:minimal\` で計算し直す）`,
    );
  const shown = results.filter((r) => r.warnings.length > 0);
  if (shown.length > 0) lines.push('', '## 警告と印のある結論');
  for (const r of shown) {
    const c = byId.get(r.claim);
    const n = r.warnings.filter((w) => w.elements.length > 0).length;
    lines.push('', `### ${r.claim}（警告 ${n} / ${r.pairs} 組）`, '', short(c?.text ?? ''), '');
    // 要素ごとに、残った組の観測値をまとめる（同じ要素が多くの組に残るので）
    const byElement = new Map<string, string[]>();
    const marks = new Map<string, string[]>();
    for (const w of r.warnings) {
      for (const e of w.elements) {
        const key = `${e.name}（${e.reason}）`;
        byElement.set(key, [...(byElement.get(key) ?? []), w.observation]);
      }
      for (const m of w.marked) marks.set(m, [...(marks.get(m) ?? []), w.observation]);
    }
    const ids = (os: readonly string[]) => compressIds(os).join('・');
    for (const [key, os] of byElement) lines.push(`- ${key}: ${ids(os)}`);
    for (const [name, os] of marks) lines.push(`- 印 ${name}: ${ids(os)}`);
  }
  // 何も抑えていない印（plan/design-workflow-simplification-5.md 1 節の (c)）。消さない（結論が仮説に戻るとまた要る）
  const unused = unusedMarks(results, byId);
  if (unused.length > 0) {
    lines.push(
      '',
      `## 使われていない印（${unused.length}）`,
      '',
      'どの組の警告も抑えていない印（要素が確定の結論に結び付いた・感度で効かないと決まったなど）。',
      '',
    );
    for (const u of unused) lines.push(`- ${u.claim}: ${u.element}`);
  }
  return `${lines.join('\n')}\n`;
}

/** 印の指す先（結論と要素の名前） */
export type MarkRef = { claim: string; element: string };

/** 何も抑えていない印（確定の結論の印で、どの組の警告の「印」にも出ないもの）。結論が仮説に戻るとまた要るので、消さずに一覧に出す */
function unusedMarks(results: readonly ClaimRelevance[], byId: ReadonlyMap<string, Claim>): MarkRef[] {
  const out: MarkRef[] = [];
  for (const r of results) {
    const used = new Set(r.warnings.flatMap((w) => w.marked));
    for (const m of byId.get(r.claim)?.minimal ?? [])
      for (const element of markElements(m)) if (!used.has(element)) out.push({ claim: r.claim, element });
  }
  return out;
}

/** 警告のある組を「要素（観測値…）」の 1 行にまとめる（records:new・records:close の理由と注意） */
export function summarizeWarnings(pairs: readonly PairWarning[]): string {
  const byElement = new Map<string, string[]>();
  for (const w of pairs)
    for (const e of w.elements) byElement.set(e.name, [...(byElement.get(e.name) ?? []), w.observation]);
  return [...byElement].map(([name, os]) => `${name}（${compressIds(os).join('・').replaceAll('`', '')}）`).join('、');
}
