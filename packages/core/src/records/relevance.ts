// 最小構成の検査（plan/design-minimal-relevance.md）: 効きうる未確定の要素だけに警告を出す。PR 3 は静的な判定（2 節・4.2 節）と出力（5 節）。
// 警告の単位は「確定の結論 × 根拠の観測値」の組。観測値の録画の編成の全枠について、効果・notes（計算に無関係を除く）・定義の無いキャラ・
// 的の表に無い通常攻撃の条件を要素として並べ、根拠が確定（か範囲外）でないもののうち、結論の対象でなく、その録画で起きえて、
// 観測量に効きうるものを残す。1 つでも残れば警告。人の判断の印（結論の minimal）のある要素は外す。
// 感度（4.1 節。sim を回し直す）は PR 4 で足す。それまでは compare を持つ観測値にも静的な判定を当てる。
import { compositionAllows } from '../skills/composition.ts';
import { applyTreasure, treasureSlots } from '../skills/treasure.ts';
import {
  SHOT_COUNT_KINDS,
  SKILL_SLOTS,
  type BuffStat,
  type NoteEffect,
  type SkillDefinition,
  type SkillEffect,
  type SkillNote,
} from '../skills/types.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import type { CharacterData, EnemyPresetMaster, SkillSlot } from '../types.ts';
import type { Claim, ClaimState, ClaimWhen } from './claims.ts';
import { normalConditionMeasured } from './minimal.ts';
import type { Observation, ObservationKind, ObservationSource } from './observations.ts';
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
  | 'normalCondition'
  | 'unknown';

/** 観測値の kind ごとに効きうる分類（同 8.4 節の段 3。total は全部、position・size はなし） */
const ALLOWED: Record<ObservationKind, readonly ElementClass[] | 'all'> = {
  hit: ['damageValue', 'otherHit'],
  rate: ['critRate', 'hitRate', 'normalCondition'],
  interval: ['firing'],
  timing: ['firing', 'burstTiming', 'otherHit', 'heal', 'hitRate', 'normalCondition'],
  count: ['firing', 'burstTiming', 'otherHit', 'heal', 'hitRate', 'normalCondition'],
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
  burstGaugeSpeed: 'burstTiming',
  maxAmmo: 'firing',
  reloadSpeed: 'firing',
  chargeSpeed: 'firing',
  hitRate: 'hitRate',
  infiniteAmmo: 'firing',
  elementDamage: 'damageValue',
  coreDamage: 'damageValue',
  normalAttackDamage: 'damageValue',
  normalCritRate: 'critRate',
  chargeDamageMultiplier: 'damageValue',
  damageTaken: 'damageValue',
  projectileExplosionDamage: 'damageValue',
  fixedChargeTime: 'firing',
  trueDamage: 'damageValue',
  trueDamageConversion: 'damageValue',
  sustainedDamage: 'damageValue',
};

const KIND_CLASS: Record<string, ElementClass> = {
  burstDamage: 'otherHit',
  damage: 'otherHit',
  dot: 'otherHit',
  autoAttack: 'otherHit',
  weaponChange: 'otherHit',
  heal: 'heal',
  cooldownReduction: 'burstTiming',
  burstGauge: 'burstTiming',
  burstGaugeHit: 'burstTiming',
  burstReentry: 'burstTiming',
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
    target?: string;
    trigger?: string;
    targetWeapon?: string;
    targetElement?: string;
  };
  /** 効果のスロット */
  skillSlot?: SkillSlot;
  /** 根拠の結論（補足の refers の notes の claims も含める） */
  claims: string[];
};

/** 効果の形（きっかけは名前に直す: 文字列はそのまま、回数トリガーは count、時間の周期は timer、効果名は applied） */
function shapeOfEffect(e: SkillEffect): NonNullable<MinimalElement['shape']> {
  const v = e as Record<string, unknown>;
  const t = v.trigger;
  const trigger =
    typeof t === 'string'
      ? t
      : t !== null && typeof t === 'object'
        ? 'count' in t
          ? String((t as { count: string }).count)
          : 'everySeconds' in t
            ? 'timer'
            : 'applied' in t
              ? 'applied'
              : undefined
        : undefined;
  return {
    kind: e.kind,
    ...(typeof v.stat === 'string' ? { stat: v.stat } : {}),
    ...(typeof v.target === 'string' ? { target: v.target } : {}),
    ...(trigger !== undefined ? { trigger } : {}),
    ...(typeof v.targetWeapon === 'string' ? { targetWeapon: v.targetWeapon } : {}),
    ...(typeof v.targetElement === 'string' ? { targetElement: v.targetElement } : {}),
  };
}

function shapeOfNote(e: NoteEffect | undefined): MinimalElement['shape'] {
  if (e === undefined) return { kind: 'unknown' };
  return { ...e };
}

export type RelevanceContext = {
  recordings: ReadonlyMap<string, RecordingEntry>;
  characters: ReadonlyMap<number, CharacterData>;
  skills: ReadonlyMap<number, SkillDefinition>;
  enemies: EnemyPresetMaster;
  claims: readonly Claim[];
};

/** 録画の編成の全枠の要素（宝物の段階と編成の条件を当てる。計算に無関係の notes は数えない。9 節の 4） */
export function elementsOf(recording: RecordingEntry, ctx: RelevanceContext): MinimalElement[] {
  const out: MinimalElement[] = [];
  const teamCharacters = recording.team.map((m) => ctx.characters.get(m.rid) ?? null);
  recording.team.forEach((member, i) => {
    const character = ctx.characters.get(member.rid);
    const base = ctx.skills.get(member.rid);
    if (character === undefined || base === undefined) {
      out.push({ slot: member.slot, name: `${member.name}（定義なし）`, places: [], type: 'noDefinition', claims: [] });
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
          const refs = referring(index);
          out.push({
            slot: member.slot,
            name: `${member.name} ${prefix}${slot}.effects[${index}]`,
            places: [place(`effects[${index}]`), ...refs.map(({ j }) => place(`notes[${j}]`))],
            type: 'effect',
            shape: shapeOfEffect(e),
            skillSlot: slot,
            claims: [...(e.claims ?? []), ...refs.flatMap(({ note }) => note.claims ?? [])],
          });
        });
        notes.forEach((n: SkillNote, j) => {
          if (n.kind === 'noDamage' || n.refers !== undefined) return;
          out.push({
            slot: member.slot,
            name: `${member.name} ${prefix}${slot}.notes[${j}]`,
            places: [place(`notes[${j}]`)],
            type: 'note',
            shape: shapeOfNote(n.effect),
            skillSlot: slot,
            claims: n.claims ?? [],
          });
        });
      }
    }
    if (character !== undefined && !normalConditionMeasured(character, recording, ctx.enemies))
      out.push({
        slot: member.slot,
        name: `${member.name} 通常攻撃の条件`,
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
    const sources = elementsOf(recording, ctx).filter((e) => e.type === 'effect' && e.shape?.stat === stat).length;
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
  if (element.claims.length === 0) return '根拠なし';
  const open = element.claims.filter((id) => {
    const c = byId.get(id);
    const state: ClaimState | undefined = c?.state;
    if (state === '確定' || state === '範囲外') return false;
    if (state === '仮説' && c!.when !== undefined) return whenHolds(c!.when, recording, ctx);
    return true;
  });
  return open.length === 0 ? undefined : open.map((id) => `${byId.get(id)?.state ?? '?'} ${id}`).join('・');
}

const SHOT_TRIGGERS: ReadonlySet<string> = new Set(SHOT_COUNT_KINDS);
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
    if (trigger === 'burstUse') return why;
  }
  if (single && trigger !== undefined && FULL_BURST_TRIGGERS.has(trigger)) return '単騎（C-0024）';
  return undefined;
}

/** 要素の分類（4.2 節の 4） */
export function classOf(element: MinimalElement): ElementClass {
  if (element.type === 'normalCondition') return 'normalCondition';
  const shape = element.shape;
  if (shape === undefined || shape.kind === 'unknown') return 'unknown';
  if (shape.kind === 'passive' || shape.kind === 'timed') {
    if (shape.stat === undefined || shape.stat === 'unknown') return 'unknown';
    return STAT_CLASS[shape.stat as BuffStat] ?? 'unknown';
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

/** 静的な判定（4.2 節）。効かないなら理由、効きうるなら undefined */
export function notRelevantReason(
  element: MinimalElement,
  o: Observation,
  recording: RecordingEntry,
  ctx: RelevanceContext,
): string | undefined {
  if (element.type === 'noDefinition') return undefined;
  const cls = classOf(element);
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

export type ClaimRelevance = { claim: string; pairs: number; warnings: PairWarning[] };

/** 確定の結論ごとの組の判定（2 節）。失効した観測値と、録画の台帳に無い観測値は数えない */
export function relevanceOf(
  claims: readonly Claim[],
  observations: readonly Observation[],
  ctx: RelevanceContext,
): ClaimRelevance[] {
  const byId = new Map(ctx.claims.map((c) => [c.id, c]));
  const obs = new Map(observations.map((o) => [o.id, o]));
  const out: ClaimRelevance[] = [];
  for (const c of claims) {
    if (c.state !== '確定') continue;
    const subject = new Set(c.subject !== undefined && 'places' in c.subject ? c.subject.places : []);
    let pairs = 0;
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
      for (const rec of recs) {
        for (const e of elementsOf(rec, ctx)) {
          if (e.places.some((p) => subject.has(p))) continue;
          const reason = unconfirmedReason(e, rec, ctx, byId);
          if (reason === undefined) continue;
          if (impossibleReason(e, rec) !== undefined) continue;
          if (notRelevantReason(e, o, rec, ctx) !== undefined) continue;
          if (elements.some((x) => x.name === e.name) || marked.includes(e.name)) continue;
          const mark = (c.minimal ?? []).some(
            (m) => m.element === e.name && (m.observations === '*' || m.observations.includes(o.id)),
          );
          if (mark) marked.push(e.name);
          else elements.push({ name: e.name, reason });
        }
      }
      if (elements.length > 0 || marked.length > 0)
        warnings.push({ observation: o.id, recordings: recs.map((r) => r.id), elements, marked });
    }
    out.push({ claim: c.id, pairs, warnings });
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

/** 観測値の ID の並びを、同じ録画の連番は「`010-01`〜`010-04`」にまとめる（結論の根拠の書き方と同じ） */
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
- 残った要素が 1 つでもある組が警告。人の判断の印（結論の \`minimal\`。同 4.3 節）のある要素は外し、「印」に出す。感度（sim を回し直す判定。同 4.1 節）は未実装で、\`compare\` を持つ観測値にも静的な判定を当てている。
- 結論ごとに、残った要素と、それが残った組の観測値を並べる。要素の後ろの括弧は、未確定の理由（根拠なし・仮説の結論・定義なし・的の表に無い）。`;

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
  return `${lines.join('\n')}\n`;
}
