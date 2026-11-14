// スキル定義の読み込みの検査のうち、定義 1 件の中の、スロットや効果をまたぐ検査。型は ../types.ts
import { type NamedStateId, namedStateWithoutContents, stateMatches } from '../states.ts';
import {
  type ClaimRefs,
  type CounterChangeEffect,
  type CycleEffect,
  type CycleEveryEffect,
  type DotEffect,
  type EffectTrigger,
  isAppliedTrigger,
  isChanceTrigger,
  isEndedTrigger,
  isFullStackTrigger,
  isMaxStacksUpContent,
  isShotCountTrigger,
  isStateCountWindow,
  isStateEndUntil,
  isStatContent,
  isStaticStateGrant,
  isSummonAttackTrigger,
  isTimerTrigger,
  type SelfStateCondition,
  type ShotCountTrigger,
  SKILL_SLOTS,
  type SkillEffect,
  type SkillEntry,
  type SkillSlot,
  statContentsOf,
  type StateGrantEffect,
  summonCountsOf,
  type SummonEffect,
} from '../types.ts';
import { fail } from './common.ts';
import { contentAsTimed } from './state.ts';
import { parseTimedEffect, validateChanceStat } from './timed.ts';

/**
 * トリガー burstHit は、バーストの倍率ダメージ（burstDamage）のある burst スロットの
 * timed・付与にだけ書ける（ヒットの無いバースト・ほかのスロットでは発火のフレームが決まらない。plan/design-elegg.md 8.9 節）
 */
export function validateBurstHitTriggers(effects: readonly SkillEffect[], slot: SkillSlot, path: string): void {
  effects.forEach((e, i) => {
    if (!('trigger' in e) || e.trigger !== 'burstHit') return;
    const at = `${path}.effects[${i}].trigger`;
    if (e.kind !== 'timed' && e.kind !== 'state')
      fail(at, `burstHit is allowed only in timed and state grants, not in ${e.kind}`);
    if (slot !== 'burst') fail(at, 'burstHit is allowed only in the burst slot');
    if (!effects.some((x) => x.kind === 'burstDamage')) fail(at, 'burstHit needs a burstDamage in the same slot');
  });
}

/**
 * cycle は 1 スロットに 1 つまで。cycleEvery の slot にはちょうど 1 つの cycle があり、
 * every が即値ならそれより小さい（間隔を「速める」効果だけ。everyRef との比較は Lv で決まるので解決時に見る）
 */
function validateCycles(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  for (const slot of SKILL_SLOTS) {
    const cycles = entries[slot]?.effects.filter((e) => e.kind === 'cycle') ?? [];
    if (cycles.length > 1) fail(`${root}.${slot}.effects`, 'at most one cycle per skill');
  }
  for (const slot of SKILL_SLOTS) {
    entries[slot]?.effects.forEach((e, i) => {
      if (e.kind !== 'cycleEvery') return;
      const path = `${root}.${slot}.effects[${i}]`;
      const target = entries[e.slot]?.effects.find((x): x is CycleEffect => x.kind === 'cycle');
      if (target === undefined) {
        validateCountTriggersEvery(entries[e.slot]?.effects ?? [], e, path);
        return;
      }
      if (e.every === undefined) fail(`${path}.decreaseRef`, 'decreaseRef is only allowed for a slot without a cycle');
      if (target.trigger.every !== undefined && e.every >= target.trigger.every) {
        fail(`${path}.every`, `must be less than the cycle's every (${target.trigger.every})`);
      }
    });
  }
}

/**
 * cycle の無いスロットへの cycleEvery（射撃の回数のきっかけの間隔の変更。plan/design-skill-stage12.md 2.4 節）。
 * 窓の間隔は解決時に「きっかけの回数 − decreaseRef の値」にするので、対象のスロットの射撃の回数のきっかけは 1 つ以上あり、どれも同じ
 * 回数の種類と同じ N（everyRef か every）で、窓を見るのは damage（gaugeHits なし）・shotPause・counterChange だけ（ほかの効果の数え方は
 * 窓を見ないので、書けば窓の中で食い違う）
 */
function validateCountTriggersEvery(effects: readonly SkillEffect[], e: CycleEveryEffect, path: string): void {
  if (e.decreaseRef === undefined)
    fail(`${path}.every`, `${e.slot} has no cycle (use decreaseRef for its shot counts)`);
  const counted = effects.filter(
    (x) => 'trigger' in x && isShotCountTrigger(x.trigger as EffectTrigger),
  ) as (SkillEffect & { trigger: ShotCountTrigger })[];
  if (counted.length === 0) fail(`${path}.slot`, `${e.slot} has neither a cycle nor a shot count trigger`);
  const first = counted[0]!.trigger;
  for (const x of counted) {
    if (x.kind !== 'damage' && x.kind !== 'shotPause' && x.kind !== 'counterChange')
      fail(`${path}.slot`, `a shot count trigger of ${x.kind} in ${e.slot} does not follow cycleEvery`);
    if (x.kind === 'damage' && x.gaugeHits !== undefined)
      fail(`${path}.slot`, `a damage with gaugeHits in ${e.slot} does not follow cycleEvery`);
    const t = x.trigger;
    if (
      t.count !== first.count ||
      t.every !== first.every ||
      t.everyRef !== first.everyRef ||
      t.stacksRef !== undefined ||
      t.during !== undefined ||
      t.firesDuring !== undefined ||
      t.chance !== undefined ||
      t.chanceRef !== undefined
    ) {
      fail(`${path}.slot`, `the shot count triggers in ${e.slot} must be the same plain { count, every(Ref) }`);
    }
  }
}

/**
 * チャージ時間の固定は 1 つの定義に 1 つまで（重なると秒が足し合わされる）。状態の中身の固定も 1 つまで
 * （plan/design-skill-stage14.md 2.7 節。状態どうしの勝ち負けを決めていない。timed の固定との兼ね合いは
 * skills/buffs.ts の applyResolvedEffect）
 */
function validateFixedChargeTimeCount(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  const effects = SKILL_SLOTS.flatMap((slot) => entries[slot]?.effects ?? []);
  const timed = effects.filter((e) => e.kind === 'timed' && e.stat === 'fixedChargeTime').length;
  if (timed > 1) fail(root, 'at most one fixedChargeTime effect per definition');
  const contents = effects
    .flatMap((e) => (e.kind === 'state' ? statContentsOf(e.contents) : []))
    .filter((c) => c.stat === 'fixedChargeTime').length;
  if (contents > 1) fail(root, 'at most one fixedChargeTime state content per definition');
}

/**
 * 同じ定義に、状態 state を自分にスタックで付ける付与がある（スタック量の増減・フルスタック・最大スタック数▲の先）。holder が enemy なら、
 * 敵にスタックで付ける付与（dot の stacksFrom の元。plan/design-mast.md 2.3 節）
 */
function hasSelfStackingGrant(
  entries: Partial<Record<SkillSlot, SkillEntry>>,
  state: NamedStateId,
  holder: 'self' | 'enemy' = 'self',
): boolean {
  return SKILL_SLOTS.flatMap((slot) => entries[slot]?.effects ?? []).some(
    (g) =>
      g.kind === 'state' &&
      g.state === state &&
      (holder === 'enemy' ? g.enemy === true : g.target === 'self') &&
      (g.maxStacks !== undefined || g.maxStacksRef !== undefined),
  );
}

/**
 * 即着弾に替える使用武器の変更（instantFire）と、コアの命中の回数のきっかけ（coreHit）は同じ定義に持てない。変更後の武器の発のコア命中率は、
 * 2 パス目が的の表の変更後の武器の行（frame/landing.ts の weaponChangeParts）に替えるが、きっかけを数える 1 パス目（frame/firstPass.ts の
 * hitsAt）は基礎の武器の値のままなので、数がずれる。使うキャラが無いので拒否する
 */
function validateInstantFireCoreHits(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  const effects = SKILL_SLOTS.flatMap((slot) => entries[slot]?.effects ?? []);
  if (!effects.some((e) => e.kind === 'weaponChange' && e.instantFire === true)) return;
  for (const slot of SKILL_SLOTS) {
    entries[slot]?.effects.forEach((e, i) => {
      if (
        'trigger' in e &&
        !isEndedTrigger(e.trigger) &&
        isShotCountTrigger(e.trigger) &&
        e.trigger.count === 'coreHit'
      ) {
        fail(
          `${root}.${slot}.effects[${i}].trigger`,
          'a coreHit count trigger cannot be combined with an instantFire weapon change',
        );
      }
    });
  }
}

/**
 * 同じきっかけの使用武器の変更が 2 つ以上なら（「段階別の効果」「各段階の効果のみ適用」。plan/design-maxwell-om.md 2.2 節）、
 * どの 2 つも、同じフレームに付かないことが条件から分かる（射手は変更の武器を 1 つしか持てない）。スロットをまたいでも見る。
 * 分かるのは、使った段階（burstStep）が両方にあって違うときと、同じ状態のスタック数の条件（stacks の数か stacksBelow。
 * stacksRef・'full' は Lv で区間が動くので数えない）の区間 [stacks, stacksBelow) が重ならないときだけ
 */
function validateWeaponChangeStages(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  const changes = SKILL_SLOTS.flatMap((slot) =>
    (entries[slot]?.effects ?? []).flatMap((e, i) =>
      e.kind === 'weaponChange'
        ? [{ e, path: `${root}.${slot}.effects[${i}]`, trigger: JSON.stringify(e.trigger) }]
        : [],
    ),
  );
  const rangeOf = (e: (typeof changes)[number]['e']) => {
    const self = e.condition?.selfState;
    if (self === undefined || self.stacksRef !== undefined || self.stacks === 'full') return null;
    return { state: self.state, from: self.stacks ?? 0, to: self.stacksBelow ?? Infinity };
  };
  changes.forEach((a, k) => {
    for (const b of changes.slice(0, k)) {
      if (a.trigger !== b.trigger) continue;
      const [sa, sb] = [a.e.condition?.burstStep, b.e.condition?.burstStep];
      if (sa !== undefined && sb !== undefined && sa !== sb) continue;
      const [ra, rb] = [rangeOf(a.e), rangeOf(b.e)];
      if (ra !== null && rb !== null && ra.state === rb.state && (ra.to <= rb.from || rb.to <= ra.from)) continue;
      fail(
        `${a.path}.condition`,
        `weapon changes with the same trigger (${b.path}) must not apply together: give them different burstStep or non-overlapping stack ranges of the same state (stacks as a number or stacksBelow)`,
      );
    }
  });
}

/**
 * フルスタックの消費のきっかけは、同じ定義にその状態を自分にスタックで付ける付与が
 * 要り、その状態の付与はどれも射撃の回数のきっかけ（フルスタックになる件が、回復を当てる前のフレームまでに登録される。plan/design-skill-stage3.md 1.3 節）
 */
function validateFullStackTriggers(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  const grants = SKILL_SLOTS.flatMap((slot) => entries[slot]?.effects ?? []).filter(
    (e): e is StateGrantEffect & ClaimRefs => e.kind === 'state',
  );
  for (const slot of SKILL_SLOTS) {
    entries[slot]?.effects.forEach((e, i) => {
      if (!('trigger' in e) || !isFullStackTrigger(e.trigger)) return;
      const state = e.trigger.fullStack;
      const own = grants.filter((g) => g.state === state);
      if (!hasSelfStackingGrant(entries, state) || !own.every((g) => isShotCountTrigger(g.trigger))) {
        fail(
          `${root}.${slot}.effects[${i}].trigger`,
          `a full-stack trigger of "${state}" needs grants of the same state on self with maxStacks and shot count triggers in the definition`,
        );
      }
    });
  }
}

/**
 * timed・付与の { applied } は連鎖させない（plan/design-skill-stage4.md 1.1 節）。同じ定義の中で、{ applied } の付与が
 * 付ける状態を、ほかの timed・付与の { applied } が見ない（damage の { applied } は見てよい。ダメージは記録を作らないので閉じる）
 */
function validateAppliedTriggers(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  const chained = new Set<NamedStateId>();
  for (const slot of SKILL_SLOTS) {
    for (const e of entries[slot]?.effects ?? [])
      if (e.kind === 'state' && isAppliedTrigger(e.trigger)) chained.add(e.state);
  }
  for (const slot of SKILL_SLOTS) {
    entries[slot]?.effects.forEach((e, i) => {
      if ((e.kind !== 'timed' && e.kind !== 'state') || !isAppliedTrigger(e.trigger)) return;
      if (chained.has(e.trigger.applied)) {
        fail(
          `${root}.${slot}.effects[${i}].trigger`,
          `"${e.trigger.applied}" is granted on an applied trigger in the definition (applied triggers do not chain)`,
        );
      }
    });
  }
}

/**
 * 条件 selfState の sameFiring は、状態の付与にだけ書け、同じ
 * スロットのそれより前に、見る状態を同じきっかけで付ける付与が要る（その付与が同じ発火で付ける分を数える）。次のフレームの件を見るので、
 * 見る状態の付与は定義の中でどれも同じきっかけで、スタックごとの維持（stackRefresh: each）でないこと（ほかの出どころの件や、
 * 次のフレームに切れる古いスタックを数えない）。while には書けない（plan/design-quency-eq.md 2 節の論点 3）
 */
function validateSameFiring(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  for (const slot of SKILL_SLOTS) {
    const effects = entries[slot]?.effects ?? [];
    effects.forEach((e, i) => {
      const path = `${root}.${slot}.effects[${i}]`;
      if (e.kind === 'passive' && e.while !== undefined && 'selfState' in e.while && e.while.selfState.sameFiring)
        fail(`${path}.while.selfState.sameFiring`, 'sameFiring is not allowed in while');
      const self = 'condition' in e ? e.condition?.selfState : undefined;
      if (self?.sameFiring !== true) return;
      if (e.kind !== 'state')
        fail(`${path}.condition.selfState.sameFiring`, 'sameFiring is allowed only in a state grant');
      const trigger = JSON.stringify(e.trigger);
      const lower = effects
        .slice(0, i)
        .some((g) => g.kind === 'state' && g.state === self.state && JSON.stringify(g.trigger) === trigger);
      if (!lower)
        fail(
          `${path}.condition.selfState.sameFiring`,
          `needs an earlier grant of "${self.state}" with the same trigger in the same slot`,
        );
      const others = SKILL_SLOTS.flatMap((x) => entries[x]?.effects ?? []).filter(
        (g) => g.kind === 'state' && g.state === self.state,
      );
      if (
        others.some((g) => g.kind === 'state' && (JSON.stringify(g.trigger) !== trigger || g.stackRefresh === 'each'))
      )
        fail(
          `${path}.condition.selfState.sameFiring`,
          `every grant of "${self.state}" must have the same trigger and refresh all stacks`,
        );
    });
  }
}

/**
 * counterChange・dot の { applied } と、周期の since が見る状態は、同じ定義にその状態を
 * 自分に付ける付与が要る（自分に付いた記録と、自分の件の終わりを読む。plan/design-skill-stage19.md 2.1 節）。currentHpDown の since も同じ
 */
function validateOwnStateTriggers(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  const effects = SKILL_SLOTS.flatMap((slot) => entries[slot]?.effects ?? []);
  const needGrant = (state: NamedStateId, at: string, kind: string) => {
    if (!effects.some((g) => g.kind === 'state' && g.state === state && g.target === 'self'))
      fail(at, `a ${kind} on "${state}" needs a grant of the same state on self in the definition`);
  };
  for (const slot of SKILL_SLOTS) {
    entries[slot]?.effects.forEach((e, i) => {
      const at = `${root}.${slot}.effects[${i}]`;
      // 状態の終わりのきっかけ・自分の状態の窓で数える回数・ほかの状態の終わりまでの維持（plan/design-grave.md 2.1・2.4・2.5 節）
      if (e.kind === 'ammoDecrease' || e.kind === 'state') {
        const t = e.trigger;
        if (isEndedTrigger(t)) needGrant(t.ended, `${at}.trigger`, e.kind);
        if (e.kind === 'state' && isShotCountTrigger(t) && isStateCountWindow(t.during))
          needGrant(t.during.state, `${at}.trigger.during`, e.kind);
        const until = e.kind === 'state' ? e.durationUntil : undefined;
        if (isStateEndUntil(until)) needGrant(until.stateEnd, `${at}.durationUntil`, e.kind);
        return;
      }
      if (e.kind !== 'counterChange' && e.kind !== 'dot' && e.kind !== 'currentHpDown') return;
      const t = e.trigger;
      const state = isAppliedTrigger(t) ? t.applied : isTimerTrigger(t) ? t.since?.applied : undefined;
      if (state === undefined) return;
      needGrant(state, `${at}.trigger`, e.kind);
    });
  }
}

/**
 * スタック量の増減は、同じ定義にその状態をスタックで付ける付与（対象は自分）が
 * 要る（上限・維持・中身は付与のもの。plan/design-skill-stage3.md 1.1・1.5 節）
 */
function validateStackChanges(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  // スタック量増減効果無効の状態（同じ状態の付与で揃う。validateStateGrants。plan/design-nayuta.md 2.5 節）
  const immutable = new Set(
    SKILL_SLOTS.flatMap((slot) => entries[slot]?.effects ?? []).flatMap((g) =>
      g.kind === 'state' && g.stackImmutable === true ? [g.state] : [],
    ),
  );
  for (const slot of SKILL_SLOTS) {
    entries[slot]?.effects.forEach((e, i) => {
      if (e.kind !== 'stackChange' || e.target === 'enemy') return;
      if (!hasSelfStackingGrant(entries, e.state)) {
        fail(
          `${root}.${slot}.effects[${i}]`,
          `stackChange of "${e.state}" needs a grant of the same state on self with maxStacks in the definition`,
        );
      }
      // スタック量増減効果無効の状態のスタック量は変わらない
      if (immutable.has(e.state)) {
        fail(
          `${root}.${slot}.effects[${i}]`,
          `stackChange of "${e.state}" has no effect (the state is stackImmutable)`,
        );
      }
    });
  }
}

/**
 * 状態の中身の「〈状態〉の最大スタック数 N▲」は、同じ定義にその状態を自分に
 * スタックで付ける付与が要る（足す先の上限。plan/design-skill-stage14.md 2.7 節）
 */
function validateStateContentKinds(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  for (const slot of SKILL_SLOTS) {
    entries[slot]?.effects.forEach((e, i) => {
      if (e.kind !== 'state') return;
      e.contents?.forEach((item, j) => {
        if (!isMaxStacksUpContent(item)) return;
        const target = item.maxStacksUp.state;
        if (!hasSelfStackingGrant(entries, target))
          fail(
            `${root}.${slot}.effects[${i}].contents[${j}]`,
            `maxStacksUp of "${target}" needs a grant of the same state on self with maxStacks in the definition`,
          );
      });
    });
  }
}

/**
 * 周期のクールタイムの印（cooldown）は damage と burstGaugeHit にだけ書け、
 * carry・atStart・periodShorten・gaugePerHit とは組まない（plan/design-arcana-magician.md 2.2 節）。
 * burstGaugeHit は遅れ（delayFrames）が要る（1 パス目が発火のフレームの
 * 後で予約するので、発火と同じフレームのゲージには足せない）。同じスロットの印のある周期は同じ秒（1 つのスキルのクールタイム）
 */
function validateCooldownTimers(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  for (const slot of SKILL_SLOTS) {
    let seconds: number | undefined;
    entries[slot]?.effects.forEach((e, i) => {
      if (!('trigger' in e) || !isTimerTrigger(e.trigger) || e.trigger.cooldown !== true) return;
      const path = `${root}.${slot}.effects[${i}].trigger.cooldown`;
      if (e.kind !== 'damage' && e.kind !== 'burstGaugeHit')
        fail(path, `cooldown is only allowed in damage and burstGaugeHit, got ${e.kind}`);
      if (e.trigger.carry === true || e.trigger.atStart === true)
        fail(path, 'cooldown cannot be used with carry or atStart');
      if (e.kind === 'damage' && (e.periodShorten !== undefined || e.gaugePerHit !== undefined))
        fail(path, 'cooldown cannot be used with periodShorten or gaugePerHit');
      if (e.kind === 'burstGaugeHit' && e.delayFrames === undefined)
        fail(path, 'cooldown in burstGaugeHit needs delayFrames');
      if (seconds !== undefined && seconds !== e.trigger.everySeconds)
        fail(path, `cooldown timers in one slot need the same everySeconds (${seconds} and ${e.trigger.everySeconds})`);
      seconds = e.trigger.everySeconds;
    });
  }
}

function validateSummons(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  const summons = SKILL_SLOTS.flatMap((slot) => entries[slot]?.effects ?? []).filter(
    (e): e is SummonEffect & ClaimRefs => e.kind === 'summon',
  );
  for (const slot of SKILL_SLOTS) {
    entries[slot]?.effects.forEach((e, i) => {
      if (e.kind !== 'damage' || !isSummonAttackTrigger(e.trigger)) return;
      const { summon, intervalSeconds } = e.trigger;
      const deploys = summons.filter((d) => d.summon === summon);
      if (deploys.length === 0)
        fail(
          `${root}.${slot}.effects[${i}].trigger`,
          `a summon attack of "${summon}" needs a summon of it in the definition`,
        );
      for (const d of deploys)
        for (const n of summonCountsOf(d.lifetimesSeconds))
          if (intervalSeconds[n] === undefined)
            fail(`${root}.${slot}.effects[${i}].trigger.intervalSeconds`, `needs the interval for ${n} ${summon}`);
    });
  }
}

/**
 * 消去（cancelState）と敵のスタック量▲（stackChange の target
 * enemy）は、同じ定義の firstTick halfAfterLatest の dot の state を指す（消去で tick を止めるのは、付けるたびに刻みを付け直す形だけ。frame/dot.ts の latestDotTicks。plan/design-skill-stage13.md 2.4・2.5 節）。dot の stacksFrom の
 * enemyState も、同じ定義の dot の state を指す
 */
function validateDotStateRefs(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  const dots = SKILL_SLOTS.flatMap((slot) => entries[slot]?.effects ?? []).filter(
    (e): e is DotEffect & ClaimRefs => e.kind === 'dot' && e.state !== undefined,
  );
  for (const slot of SKILL_SLOTS) {
    entries[slot]?.effects.forEach((e, i) => {
      const onDot = (e.kind === 'cancelState' || e.kind === 'stackChange') && e.target === 'enemy';
      if (onDot && !dots.some((d) => d.state === e.state && d.firstTick === 'halfAfterLatest'))
        fail(
          `${root}.${slot}.effects[${i}]`,
          `${e.kind} of "${e.state}" needs a dot of the same state with firstTick halfAfterLatest in the definition`,
        );
      // 元は、同じ定義の dot の状態か、敵にスタックで付く状態の付与（海風。plan/design-mast.md 2.3 節）
      const from = e.kind === 'dot' ? e.stacksFrom?.enemyState : undefined;
      if (from !== undefined && !dots.some((d) => d.state === from) && !hasSelfStackingGrant(entries, from, 'enemy'))
        fail(
          `${root}.${slot}.effects[${i}].stacksFrom`,
          `stacksFrom needs a dot of the state "${from}", or a grant of it on the enemy with stacks, in the definition`,
        );
    });
  }
}

/**
 * while の状態は、同じ定義に、その状態を自分に付けうる時間で変わる付与（対象が
 * self か allies）が要る（plan/design-skill-stage9.md 1.3 節）。スタックの条件（stacks・stacksRef）なら、
 * その付与にスタックの上限が要る。静的な状態は常時の効果で書く
 */
/**
 * 確率のきっかけで付く状態は、その状態の付与がその 1 つだけで、ほかの効果が見てよいのは
 * while（スタックの条件の確率を値に掛ける）と stacksFrom（スタック数の期待値）だけ（plan/design-tove-base.md 2.1 節）。
 * 件が期待値の小片なので、「付いているか」で決める条件・
 * { applied }・{ fullStack }・スタックの増減などは意味が決まらない
 */
function validateChanceStates(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  const all = SKILL_SLOTS.flatMap((slot) =>
    (entries[slot]?.effects ?? []).map((e, i) => ({ e, at: `${root}.${slot}.effects[${i}]` })),
  );
  const chanceStates = all.flatMap(({ e }) => (e.kind === 'state' && isChanceTrigger(e.trigger) ? [e.state] : []));
  for (const state of chanceStates) {
    const grants = all.filter(({ e }) => e.kind === 'state' && e.state === state);
    if (grants.length !== 1)
      fail(grants[1]!.at, `"${state}" is granted by a chance trigger, so it cannot have another grant`);
    for (const { e, at } of all) {
      if (e.kind === 'state' && e.state === state) continue;
      // 許す読み方（while の selfState・stacksFrom の state）を除いて、状態の名前がどこかに出れば誤り
      // 読む側の値も期待値（確率 × 値）になるので、確率の timed と同じく足し合わせて意味のある stat だけ
      const rest: Record<string, unknown> = { ...e, claims: undefined, assumes: undefined };
      if (
        e.kind === 'passive' &&
        e.while !== undefined &&
        'selfState' in e.while &&
        e.while.selfState.state === state
      ) {
        validateChanceStat(e.stat, `${at}.stat`);
        rest.while = undefined;
      }
      if (e.kind === 'state' && e.stacksFrom !== undefined && 'state' in e.stacksFrom && e.stacksFrom.state === state) {
        statContentsOf(e.contents).forEach((c, k) => validateChanceStat(c.stat, `${at}.contents[${k}].stat`));
        rest.stacksFrom = undefined;
      }
      if (JSON.stringify(rest).includes(JSON.stringify(state)))
        fail(at, `"${state}" is granted by a chance trigger, so it can only be read by while or stacksFrom`);
    }
  }
}

function validateWhileEffects(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  const grants = SKILL_SLOTS.flatMap((slot) => entries[slot]?.effects ?? []).filter(
    (e): e is StateGrantEffect & ClaimRefs => e.kind === 'state',
  );
  const counterChanges = SKILL_SLOTS.flatMap((slot) => entries[slot]?.effects ?? []).filter(
    (e): e is CounterChangeEffect & ClaimRefs => e.kind === 'counterChange',
  );
  for (const slot of SKILL_SLOTS) {
    entries[slot]?.effects.forEach((e, i) => {
      // 使用武器の変更の発ごとの防御力無視（trueDamageWhile。plan/design-laplace.md 2.2 節）も、while と同じ付与を求める
      if (e.kind === 'weaponChange' && e.trueDamageWhile !== undefined) {
        checkStateWhile(e.trueDamageWhile.selfState, `${root}.${slot}.effects[${i}].trueDamageWhile`);
        return;
      }
      if ((e.kind !== 'passive' && e.kind !== 'allyGaugeAdd') || e.while === undefined) return;
      // カウンタの while は、同じ定義にそのカウンタを増やす counterChange が要る
      if ('selfCounter' in e.while) {
        const { counter } = e.while.selfCounter;
        if (!counterChanges.some((c) => c.counter === counter && c.decrease !== true))
          fail(
            `${root}.${slot}.effects[${i}].while`,
            `while on "${counter}" needs a counterChange that increases it in the definition`,
          );
        return;
      }
      checkStateWhile(e.while.selfState, `${root}.${slot}.effects[${i}].while`);
    });
  }
  function checkStateWhile({ state, stacks, stacksRef }: SelfStateCondition, path: string): void {
    const own = grants.filter(
      (g) => stateMatches(state, g.state) && !isStaticStateGrant(g) && (g.target === 'self' || g.target === 'allies'),
    );
    const stacked = stacks !== undefined || stacksRef !== undefined;
    const ok = own.some((g) => !stacked || g.maxStacks !== undefined || g.maxStacksRef !== undefined);
    if (!ok) {
      fail(
        path,
        `while on "${state}" needs a grant of the same state on self (target self or allies, not static${stacked ? ', with maxStacks' : ''}) in the definition`,
      );
    }
  }
}

/**
 * 同じ定義の同じ状態の付与どうしの規則（plan/design-named-state.md 5.2・5.6 節）。中身（contents）を
 * 持つのは 1 つだけ、維持の形（秒・発数・出来事）とスタックの有無は同じ（即値は値も。Lv で決まる値は解決のときに見る）。
 * 中身を持たない付与も、中身の項目と合わせた timed として今の規則を通す（状態の窓を共有するので、stat ごとの規則がどの付与にも効く）
 */
function validateStateGrants(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  const byState = new Map<NamedStateId, { effect: StateGrantEffect; path: string }[]>();
  for (const slot of SKILL_SLOTS) {
    entries[slot]?.effects.forEach((e, i) => {
      if (e.kind !== 'state') return;
      byState.set(e.state, [...(byState.get(e.state) ?? []), { effect: e, path: `${root}.${slot}.effects[${i}]` }]);
    });
  }
  for (const [state, grants] of byState) {
    const bearers = grants.filter((g) => g.effect.contents !== undefined);
    // 敵に付く状態は、中身を読む側がまだ無いので、どれかの付与が中身を持ち、同じ状態のほかの付与は中身を共有する
    // （plan/design-new-chars-1029.md 9 節。マリアン：クイーンの S1 の弱点露出は、槍とバースト使用時の 2 つで付く）
    // 目録で中身なしと決めた敵の状態（ターゲット指定。中身の攻撃力▼はダメージに関係しない）は、中身を書かない
    const enemyGrant = grants.find((g) => g.effect.enemy === true);
    if (enemyGrant !== undefined && bearers.length === 0 && !namedStateWithoutContents(state)) {
      fail(`${enemyGrant.path}.contents`, 'a grant on the enemy needs contents (no reader of the state yet)');
    }
    if (bearers.length > 1) {
      fail(`${bearers[1]!.path}.contents`, `only one grant of "${state}" in a definition may have contents`);
    }
    const first = grants[0]!;
    for (const g of grants.slice(1)) {
      // 静的な付与の形と時間で変わる付与が混ざった状態は静的にしない
      // （staticStatesOf。plan/design-skill-stage1.md 1.4 節）。解除不可は件の列ごとに見るので、同じ状態の付与で揃える
      if ((g.effect.undispellable === true) !== (first.effect.undispellable === true)) {
        fail(g.path, `grants of "${state}" need the same undispellable`);
      }
      // スタック量増減効果無効も状態の印なので揃える
      if ((g.effect.stackImmutable === true) !== (first.effect.stackImmutable === true)) {
        fail(g.path, `grants of "${state}" need the same stackImmutable`);
      }
      if (durationFormOf(g.effect) !== durationFormOf(first.effect)) {
        fail(g.path, `grants of "${state}" need the same duration (${durationFormOf(first.effect)})`);
      }
      if (stackFormOf(g.effect) !== stackFormOf(first.effect)) {
        fail(g.path, `grants of "${state}" need the same max stacks (${stackFormOf(first.effect)})`);
      }
    }
    const bearer = bearers[0];
    if (bearer === undefined) continue;
    for (const g of grants) {
      if (g === bearer) continue;
      bearer.effect.contents!.forEach((item, j) => {
        // 最大スタック数▲の項目は timed の規則を持たない
        if (!isStatContent(item)) return;
        parseTimedEffect(contentAsTimed(g.effect, item), `${g.path}（${bearer.path}.contents[${j}] と合わせて）`);
      });
    }
  }
}

/** 付与の維持の形（同じ状態の付与どうしで比べる。即値は値も） */
function durationFormOf(e: StateGrantEffect): string {
  if (e.durationUntil !== undefined) return `until ${JSON.stringify(e.durationUntil)}`;
  if (e.durationShots !== undefined) return `shots ${e.durationShots}`;
  if (e.durationShotsRef !== undefined) return 'shots (ref)';
  if (e.durationSeconds !== undefined) return `seconds ${e.durationSeconds}`;
  return 'seconds (ref)';
}

/** 付与のスタックの形（同じ状態の付与どうしで比べる。即値は値も） */
function stackFormOf(e: StateGrantEffect): string {
  if (e.maxStacks !== undefined) return `${e.maxStacks}`;
  return e.maxStacksRef !== undefined ? 'ref' : 'none';
}

/**
 * 定義全体の検査を、決まった順に全部通す（skills と、skills に宝物版を重ねた treasureSkills の両方に。parseSkillDefinition）。
 * 新しい検査はこの列に足す
 */
export function validateCrossChecks(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  for (const check of [
    validateCycles,
    validateFixedChargeTimeCount,
    validateInstantFireCoreHits,
    validateWeaponChangeStages,
    validateStateGrants,
    validateStackChanges,
    validateStateContentKinds,
    validateFullStackTriggers,
    validateAppliedTriggers,
    validateSameFiring,
    validateOwnStateTriggers,
    validateWhileEffects,
    validateChanceStates,
    validateDotStateRefs,
    validateSummons,
    validateCooldownTimers,
  ])
    check(entries, root);
}
