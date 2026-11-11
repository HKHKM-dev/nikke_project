// スキル定義の読み込みの検査のうち、状態の付与・解除・取り消し、スタックとカウンタの増減の読み込み。型は ../types.ts
import { COUNTER_IDS, counterMax } from '../counters.ts';
import { stateMatches } from '../states.ts';
import { dependsOnContext } from '../targets.ts';
import {
  type CancelStateEffect,
  type CounterChangeEffect,
  type CounterFullTrigger,
  type EffectTrigger,
  type EndedTrigger,
  isAppliedTrigger,
  isChanceTrigger,
  isCounterFullTrigger,
  isEnemyHeldStat,
  isPelletStat,
  isStacksCondition,
  type MaxStacksUpContentItem,
  type SkillCooldownDownContentItem,
  type RemoveDebuffEffect,
  type RemoveStateEffect,
  type StackChangeEffect,
  type StatContentItem,
  type StateContentItem,
  type StateGrantEffect,
} from '../types.ts';
import {
  fail,
  isRecord,
  type Json,
  oneOf,
  parseClaimRefs,
  parseLocalizedText,
  parseNamedStateId,
  parsePositiveInt,
  parseRef,
} from './common.ts';
import { CONDITION_KEYS_OF, parseCondition, validateUsedBurst } from './condition.ts';
import { type GrantTimedFields, parseTimedEffect, parseTimedFields } from './timed.ts';
import { parseTargetCount } from './target.ts';
import {
  parseAppliedTrigger,
  parseCounterFullTrigger,
  parseSinceTimerTrigger,
  parseTimerDelayFrames,
  parseTrigger,
} from './trigger.ts';

/** 名前の付いた状態の語彙編: 付与に書けない欄（値の欄は中身に書く） */
const STATE_GRANT_VALUE_KEYS = ['stat', 'ref', 'scaling', 'decrease'] as const;

/**
 * 名前の付いた状態の語彙編（plan/design-named-state.md 5.2・5.3 節）: 状態の付与。欄は timed から値の欄を除いたもので、規則も
 * timed と同じ（parseTimedFields）。中身の項目は、付与の欄と合わせた timed として今の timed の規則に通す（stat ごとの規則が
 * 中身にもそのまま効く）。同じ状態のほかの付与との規則（中身は 1 つ・維持とスタックの上限が同じ）は validateStateGrants
 */
export function parseStateGrantEffect(v: Record<string, Json>, path: string): StateGrantEffect {
  for (const key of STATE_GRANT_VALUE_KEYS) {
    if (v[key] !== undefined) fail(`${path}.${key}`, `a state grant has no value (write ${key} in contents)`);
  }
  if (v.amplifies !== undefined) fail(`${path}.amplifies`, 'amplifies is not allowed in a state grant');
  for (const key of Object.keys(v)) {
    if (!STATE_GRANT_KEYS.includes(key)) fail(`${path}.${key}`, 'unknown field');
  }
  // エレグのバースト編: target: "enemy" は敵に付く状態の付与。敵の件の timed と同じく target: "allies" に読み替えて残りの欄を読む。
  // マスト編（plan/design-mast.md 2.1 節）: スタック（maxStacks・maxStacksRef）は書ける（件は味方の状態と同じ stackItems で作る）
  const onEnemy = v.target === 'enemy';
  if (onEnemy) {
    for (const key of [
      'targetWeapon',
      'targetElement',
      'targetClass',
      'targetSquad',
      'targetState',
      'includeSelf',
      'targetBurstStep',
      'targetDefense',
      'excludeSelf',
      'fixedTargets',
      'targetCount',
      'targetCountRef',
      'undispellable',
      'stacksFrom',
      'stackImmutable',
      'condition',
    ]) {
      if (v[key] !== undefined) fail(`${path}.${key}`, 'not allowed in a grant on the enemy (target "enemy")');
    }
    v = { ...v, target: 'allies' };
  }
  const state = parseNamedStateId(v.state, `${path}.state`, onEnemy ? 'enemy' : 'ally');
  // 2 段目の段 4: { applied } は書ける（連鎖させない。同じ定義の中の連鎖は validateAppliedTriggers）。
  // トーブの基礎版編（plan/design-tove-base.md 2.1 節）: 確率のきっかけも書ける（件はスタック数の分布の期待値の小片。validateChanceGrant）
  const fields = parseTimedFields(v, path, undefined, true);
  // ツバイ編（plan/design-zwei.md 2.3 節）: 発数の維持のスタックは timed だけ（状態の件は holders.ts の stateItems が作らない）
  if (fields.durationShots !== undefined || fields.durationShotsRef !== undefined) {
    if (fields.maxStacks !== undefined || fields.maxStacksRef !== undefined)
      fail(path, 'a state grant with a duration in shots cannot stack');
  }
  validateCounterGrant(fields, path, onEnemy);
  validateSelfHpGrant(fields, path, onEnemy);
  validateChanceGrant(fields, v, path, onEnemy);
  if (isAppliedTrigger(fields.trigger) && fields.trigger.applied === state) {
    fail(`${path}.trigger`, `a grant of "${state}" cannot be triggered by its own state`);
  }
  // 循環の禁止: 付与が、自分の付ける状態を見て対象や発火を決めない（plan/design-stage11-modernia.md 11.2 節の 7。2 段目の段 1 の
  // selfState も同じ。plan/design-skill-stage1.md 1.1 節）
  if (fields.targetState !== undefined && stateMatches(fields.targetState, state)) {
    fail(`${path}.targetState`, `a grant of "${state}" cannot look at its own state`);
  }
  // 2 段目の段 5: 家族の根を見る条件も、家族の状態の付与には書けない。
  // 2 段目の段 16 の PR 2（plan/design-skill-stage16.md 2.2 節）: 「〈状態〉でなければ」（present: false）だけは書ける。付いている間の
  // 再発火を止めるだけで連鎖しない（段 1.5 の selfState は前のフレームまでに付いた件を見るので、同じフレームの自分の付与は見ない）
  if (
    fields.condition?.selfState !== undefined &&
    stateMatches(fields.condition.selfState.state, state) &&
    fields.condition.selfState.present !== false
  ) {
    fail(`${path}.condition.selfState`, `a grant of "${state}" cannot look at its own state`);
  }
  const effect: StateGrantEffect = { kind: 'state', state, ...fields };
  if (onEnemy) {
    if (isAppliedTrigger(fields.trigger))
      fail(`${path}.trigger`, 'a grant on the enemy cannot be triggered by { applied }');
    // 中身の有無は定義の単位で見る（validateStateGrants。2026-10-29 のキャラの編: 同じ敵の状態を 2 つのきっかけで付ける）
    effect.enemy = true;
  }
  // 2 段目の段 1（plan/design-skill-stage1.md 1.3 節）: 解除不可の印
  if (v.undispellable !== undefined) {
    if (v.undispellable !== true)
      fail(`${path}.undispellable`, `expected true, got ${JSON.stringify(v.undispellable)}`);
    effect.undispellable = true;
  }
  if (v.stacksFrom !== undefined) {
    // 2 段目の段 10: スタックの数をカウンタの値か、自分の状態のスタック数（PR 3）から取る
    const from = v.stacksFrom;
    if (!isRecord(from) || Object.keys(from).length !== 1)
      fail(`${path}.stacksFrom`, 'expected { counter } or { state }');
    for (const key of Object.keys(from)) {
      if (key !== 'counter' && key !== 'state') fail(`${path}.stacksFrom.${key}`, 'unknown field');
    }
    if (from.state !== undefined) {
      const source = parseNamedStateId(from.state, `${path}.stacksFrom.state`, 'ally');
      if (source === state) fail(`${path}.stacksFrom.state`, `a grant of "${state}" cannot count its own stacks`);
      if (effect.maxStacks === undefined) fail(`${path}.maxStacks`, 'stacksFrom { state } needs maxStacks');
      effect.stacksFrom = { state: source };
    } else {
      const counter = oneOf(COUNTER_IDS, from.counter, `${path}.stacksFrom.counter`);
      if (effect.maxStacks === undefined || effect.maxStacks < counterMax(counter)) {
        fail(
          `${path}.maxStacks`,
          `stacksFrom needs maxStacks of at least the max of ${counter} (${counterMax(counter)})`,
        );
      }
      effect.stacksFrom = { counter };
    }
  }
  // 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節。論点 6）: 1 回の発火で付けるスタックの数（使用回数）
  if (v.stacksPerFireRef !== undefined) {
    if (effect.maxStacks === undefined && effect.maxStacksRef === undefined)
      fail(`${path}.stacksPerFireRef`, 'stacksPerFireRef needs maxStacks or maxStacksRef');
    if (effect.stacksFrom !== undefined)
      fail(`${path}.stacksPerFireRef`, 'stacksPerFireRef cannot be used with stacksFrom');
    effect.stacksPerFireRef = parseRef(v.stacksPerFireRef, `${path}.stacksPerFireRef`);
  }
  // マスト編（plan/design-mast.md 2.1 節）: スタックの維持の数え方
  if (v.stackRefresh !== undefined) {
    if (v.stackRefresh !== 'each') fail(`${path}.stackRefresh`, 'expected "each" (omit it for the default)');
    if (effect.maxStacks === undefined && effect.maxStacksRef === undefined)
      fail(`${path}.stackRefresh`, 'stackRefresh needs maxStacks or maxStacksRef');
    effect.stackRefresh = 'each';
  }
  // ナユタ編（plan/design-nayuta.md 2.5 節）: スタック量増減効果無効（同じ定義の stackChange は validateStackChanges が弾く）
  if (v.stackImmutable !== undefined) {
    if (v.stackImmutable !== true)
      fail(`${path}.stackImmutable`, `expected true, got ${JSON.stringify(v.stackImmutable)}`);
    if (effect.maxStacks === undefined && effect.maxStacksRef === undefined)
      fail(`${path}.stackImmutable`, 'stackImmutable needs maxStacks or maxStacksRef');
    effect.stackImmutable = true;
  }
  // 徹甲炸裂弾の▲の付く時刻（plan/design-explosive-round-lead.md 3 節）: 発の leadFrames 前から始める付与
  if (v.leadFrames !== undefined) {
    const t = fields.trigger;
    if (typeof t !== 'object' || t === null || !('count' in t) || t.count !== 'weaponChangeShot' || isChanceTrigger(t))
      fail(`${path}.leadFrames`, 'leadFrames needs the trigger { count: "weaponChangeShot" }');
    // 1 パス目は発の leadFrames 前のフレームで件を登録する（同 5.3 節）ので、発のフレームで判定するものは書けない
    if (effect.condition !== undefined) fail(`${path}.condition`, 'condition cannot be used with leadFrames');
    if (effect.stacksFrom !== undefined) fail(`${path}.stacksFrom`, 'stacksFrom cannot be used with leadFrames');
    // 対象を発火の文脈（攻撃力の順位・バーストを使った枠・最終防御力の比べ）で決めるものも、文脈の無い登録では誰にも掛からない
    if (dependsOnContext(effect))
      fail(
        `${path}.target`,
        `${effect.target} cannot be used with leadFrames (the targets depend on the fire context)`,
      );
    effect.leadFrames = parsePositiveInt(v.leadFrames, `${path}.leadFrames`);
  }
  if (v.contents !== undefined) {
    if (!Array.isArray(v.contents) || v.contents.length === 0) fail(`${path}.contents`, 'expected a non-empty array');
    effect.contents = v.contents.map((item, i) => parseStateContentItem(item, v, `${path}.contents[${i}]`, onEnemy));
  }
  // 2 段目の段 4（plan/design-skill-stage4.md 1.2 節）: 維持 0 秒の付与は、名前の付いた即時効果の付いた記録だけを作る（窓は無い）
  if (effect.durationSeconds === 0) {
    for (const key of ['contents', 'maxStacks', 'maxStacksRef', 'undispellable']) {
      if (v[key] !== undefined)
        fail(`${path}.${key}`, 'a grant lasting 0 seconds holds nothing (it only records the application)');
    }
  }
  return effect;
}

/**
 * 2 段目の段 19 の PR 1（plan/design-skill-stage19.md 2.1 節。論点 2）: カウンタで続く状態の付与。{ counterFull } のきっかけと
 * durationUntil: { counterEmpty } は同じカウンタで組み（片方だけは書けない）、自分にだけ付け、スタックしない（閉じるのは持ち主の件の列ごと）
 */
/**
 * トーブの基礎版編（plan/design-tove-base.md 2.1 節）: 確率のきっかけの付与。件は機会ごとのスタック数の分布から作る期待値の小片
 * （skills/chance.ts の chanceStackPieces）で、付いた記録を作らない。秒の維持で、味方に付け、発火の文脈や条件では決めない。見る側は
 * while（スタックの条件の確率）と stacksFrom（スタック数の期待値）だけ（skills/parse/crossChecks.ts の validateChanceStates）
 */
function validateChanceGrant(fields: GrantTimedFields, v: Record<string, Json>, path: string, onEnemy: boolean): void {
  if (!isChanceTrigger(fields.trigger)) return;
  for (const key of [
    'condition',
    'durationShots',
    'durationShotsRef',
    'durationUntil',
    'stacksFrom',
    'stacksPerFireRef',
    'leadFrames',
    'stackRefresh',
    'stackImmutable',
    'delayFrames',
  ]) {
    if (v[key] !== undefined)
      fail(`${path}.${key}`, `a chance trigger cannot be combined with ${key} in a state grant`);
  }
  // v は敵の付与を target: "allies" に読み替えた後なので、読み替える前の印で見る
  if (onEnemy) fail(`${path}.target`, 'a chance trigger cannot grant a state on the enemy');
  if (v.durationSeconds === 0)
    fail(`${path}.durationSeconds`, 'a chance grant needs a duration (it records no application)');
  if (dependsOnContext(fields as StateGrantEffect))
    fail(
      `${path}.target`,
      `${fields.target} cannot be used with a chance trigger (the targets depend on the fire context)`,
    );
}

function validateCounterGrant(fields: GrantTimedFields, path: string, onEnemy: boolean): void {
  const full = isCounterFullTrigger(fields.trigger) ? fields.trigger.counterFull : undefined;
  const until = fields.durationUntil;
  const empty = typeof until === 'object' && 'counterEmpty' in until ? until.counterEmpty : undefined;
  if (full === undefined && empty === undefined) return;
  if (full !== empty)
    fail(
      path,
      `a grant on { counterFull } lasts until the same counter is empty (durationUntil { counterEmpty }), got ${JSON.stringify(fields.trigger)} and ${JSON.stringify(until)}`,
    );
  // fields は敵の付与を target: "allies" に読み替えた後なので、文言は読み替える前の target で出す
  if (fields.target !== 'self') {
    const written = onEnemy ? 'enemy' : fields.target;
    fail(
      `${path}.target`,
      `a grant lasting until a counter is empty is only on "self", got ${JSON.stringify(written)}`,
    );
  }
  if (fields.maxStacks !== undefined || fields.maxStacksRef !== undefined)
    fail(path, 'a grant lasting until a counter is empty cannot stack');
  if (fields.condition !== undefined) fail(`${path}.condition`, 'a grant on { counterFull } cannot have a condition');
}

/**
 * A2 の B モード編（plan/design-hp-down-interval.md 2.2 節）: HP の割合で解除される状態の付与（durationUntil: { selfHpAtMostRef }）。閉じるのは
 * 持ち主の件の列ごとなので、自分にだけ付け、スタックしない
 */
function validateSelfHpGrant(fields: GrantTimedFields, path: string, onEnemy: boolean): void {
  const until = fields.durationUntil;
  if (typeof until !== 'object' || !('selfHpAtMostRef' in until)) return;
  if (onEnemy || fields.target !== 'self')
    fail(`${path}.target`, 'a grant lasting until the HP drops is only on "self"');
  if (fields.maxStacks !== undefined || fields.maxStacksRef !== undefined)
    fail(path, 'a grant lasting until the HP drops cannot stack');
  // 発火のフレームの HP の割合で付くかを決める（skills/holders.ts の段 1 の付与）ので、条件で段を上げない
  if (fields.condition !== undefined)
    fail(`${path}.condition`, 'a grant lasting until the HP drops cannot have a condition');
}

/** 名前の付いた状態の語彙編: 付与に書ける欄（timed の欄から値の欄を除き、state・contents を足したもの） */
const STATE_GRANT_KEYS: readonly string[] = [
  'kind',
  'state',
  'contents',
  'undispellable',
  'trigger',
  'target',
  'targetWeapon',
  'targetElement',
  'targetClass',
  'targetSquad',
  'targetCount',
  'targetCountRef',
  'excludeSelf',
  'targetState',
  'includeSelf',
  'targetBurstStep',
  'durationRef',
  'durationSeconds',
  'durationShots',
  'durationShotsRef',
  'durationUntil',
  'maxStacks',
  'maxStacksRef',
  'stacksFrom',
  'stacksPerFireRef',
  'leadFrames',
  'stackRefresh',
  'stackImmutable',
  'condition',
  'burstStepMix',
  'squad',
  'withCharacter',
  'enemyElement',
  'delayFrames',
  'assumes',
  'claims',
];

/**
 * 名前の付いた状態の語彙編（plan/design-named-state.md 5.3 節）: 中身の 1 項目。付与の欄（grant）と合わせた timed を
 * parseTimedEffect に通して、stat ごとの規則を確かめる
 */
function parseStateContentItem(
  item: Json,
  grant: Record<string, Json>,
  path: string,
  onEnemy = false,
): StateContentItem {
  if (!isRecord(item)) fail(path, 'expected an object');
  // 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節）: 「〈状態〉の最大スタック数 N▲」
  if (item.maxStacksUp !== undefined) return parseMaxStacksUpItem(item, grant, path, onEnemy);
  // 魔術師のカード編（plan/design-arcana-magician.md 2.1 節）: 「スキル N クールタイム X%▼」（維持の付いた形）
  if (item.skillCooldownDown !== undefined) return parseSkillCooldownDownItem(item, grant, path, onEnemy);
  for (const key of Object.keys(item)) {
    if (!['stat', 'ref', 'scaling', 'decrease', 'claims'].includes(key)) fail(`${path}.${key}`, 'unknown field');
  }
  const timed = parseTimedEffect(contentAsTimed(grant, item), path);
  // 持ち主ごとの一覧編（plan/design-holder-effects.md 2.8 節）: 味方の状態の中身に敵の件（受けるダメージ▲）は書けない。
  // エレグのバースト編: 敵に付く状態の中身は、敵が持つ stat だけ
  if (onEnemy) {
    if (!isEnemyHeldStat(timed.stat))
      fail(`${path}.stat`, `a state on the enemy holds only enemy-held stats, got ${timed.stat}`);
  } else if (timed.stat === 'damageTaken') {
    fail(`${path}.stat`, 'damageTaken is held by the enemy, not by a state of an ally');
  }
  // ドロシー：セレンディピティ編: ペレットの数の stat は timed にだけ書ける（使い手がいない）
  if (isPelletStat(timed.stat)) fail(`${path}.stat`, `${timed.stat} is only allowed in timed`);
  const out: StatContentItem = { stat: timed.stat };
  if (timed.ref !== undefined) out.ref = timed.ref;
  if (timed.scaling !== undefined) out.scaling = timed.scaling;
  if (timed.decrease) out.decrease = true;
  if (item.claims !== undefined) out.claims = parseClaimRefs(item.claims, `${path}.claims`);
  return out;
}

/**
 * 魔術師のカード編（plan/design-arcana-magician.md 2.1 節）: 中身の「スキル N クールタイム X%▼」。slot は持ち主のスロット、percentRef は
 * 付与のあるスロットの説明文の値（%）。味方の状態だけ
 */
function parseSkillCooldownDownItem(
  item: Record<string, Json>,
  grant: Record<string, Json>,
  path: string,
  onEnemy: boolean,
): SkillCooldownDownContentItem {
  for (const key of Object.keys(item)) {
    if (key !== 'skillCooldownDown' && key !== 'claims') fail(`${path}.${key}`, 'unknown field');
  }
  if (onEnemy) fail(`${path}.skillCooldownDown`, 'skillCooldownDown is only allowed in a state of an ally');
  // スタックの数で縮め方が変わるかは確かめていない（1 パス目は付いているかだけを見る）
  if (grant.maxStacks !== undefined || grant.maxStacksRef !== undefined || grant.stacksPerFireRef !== undefined)
    fail(`${path}.skillCooldownDown`, 'skillCooldownDown is not allowed in a stacking grant');
  const down = item.skillCooldownDown;
  if (!isRecord(down)) fail(`${path}.skillCooldownDown`, 'expected { slot, percentRef }');
  for (const key of Object.keys(down)) {
    if (key !== 'slot' && key !== 'percentRef') fail(`${path}.skillCooldownDown.${key}`, 'unknown field');
  }
  const slot = oneOf(['skill1', 'skill2'] as const, down.slot, `${path}.skillCooldownDown.slot`);
  const out: SkillCooldownDownContentItem = {
    skillCooldownDown: { slot, percentRef: parseRef(down.percentRef, `${path}.skillCooldownDown.percentRef`) },
  };
  if (item.claims !== undefined) out.claims = parseClaimRefs(item.claims, `${path}.claims`);
  return out;
}

/**
 * 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節。論点 5）: 中身の「〈状態〉の最大スタック数 N▲」。持ち主は付与の対象で、自分にだけ
 * 付く付与に書ける（上限を足す先は持ち主の state の件の列）。state は味方の状態で、付与の状態とは別。同じ定義にその状態をスタックで付ける
 * 付与が要ること（validateMaxStacksUps）は、定義全体で見る
 */
function parseMaxStacksUpItem(
  item: Record<string, Json>,
  grant: Record<string, Json>,
  path: string,
  onEnemy: boolean,
): MaxStacksUpContentItem {
  for (const key of Object.keys(item)) {
    if (key !== 'maxStacksUp' && key !== 'claims') fail(`${path}.${key}`, 'unknown field');
  }
  if (onEnemy || grant.target !== 'self')
    fail(`${path}.maxStacksUp`, 'maxStacksUp is only allowed in a grant on "self"');
  const up = item.maxStacksUp;
  if (!isRecord(up)) fail(`${path}.maxStacksUp`, 'expected { state, amountRef }');
  for (const key of Object.keys(up)) {
    if (key !== 'state' && key !== 'amountRef') fail(`${path}.maxStacksUp.${key}`, 'unknown field');
  }
  const state = parseNamedStateId(up.state, `${path}.maxStacksUp.state`, 'ally');
  if (state === grant.state) fail(`${path}.maxStacksUp.state`, `a state cannot raise its own max stacks (${state})`);
  const out: MaxStacksUpContentItem = {
    maxStacksUp: { state, amountRef: parseRef(up.amountRef, `${path}.maxStacksUp.amountRef`) },
  };
  if (item.claims !== undefined) out.claims = parseClaimRefs(item.claims, `${path}.claims`);
  return out;
}

/**
 * 名前の付いた状態の語彙編: 付与の欄と中身の項目を合わせた timed（検証用。plan/design-named-state.md 3.2 節）。
 * 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節）: チャージ時間の固定（fixedChargeTime）の中身は、状態のスタック（使用回数）に
 * よらず 1 回だけ効く（固定の秒は足し合わせない。skills/buffs.ts の applyResolvedEffect）ので、付与のスタックの欄を渡さない
 */
export function contentAsTimed(grant: Record<string, Json>, item: Record<string, Json>): Record<string, Json> {
  // 付与の delayFrames（周期の付与の遅れ）は付与の発火の欄なので、中身の規則には渡さない
  const {
    kind: _kind,
    state: _state,
    contents: _contents,
    claims: _claims,
    undispellable: _u,
    delayFrames: _delay,
    stacksPerFireRef: _perFire,
    leadFrames: _lead,
    stackRefresh: _refresh,
    ...fields
  } = grant;
  const { claims: _itemClaims, ...value } = item;
  // トーブの基礎版編: 確率の付与の中身は、スタックの段ごとの期待値の小片になる（段の数は付与が持つ）ので、スタックの欄を中身の規則に渡さない
  if (isRecord(fields.trigger) && isChanceTrigger(fields.trigger as EffectTrigger)) {
    delete fields.maxStacks;
    delete fields.maxStacksRef;
  }
  // 2 段目の段 19 の PR 1: カウンタで続く状態（{ counterFull } で付き、0 になるまで）の中身の規則は、戦闘開始時から「持続」の付与と同じ
  // （付くフレームも窓も件の一覧が決める。きっかけ { counterFull } は timed には書けない）
  if (isRecord(fields.durationUntil) && 'counterEmpty' in fields.durationUntil) {
    fields.durationUntil = 'battleEnd';
    fields.trigger = 'battleStart';
  }
  // A2 の B モード編: HP の割合で解除される状態の中身の規則は、閉じる（件の一覧）までは「持続」の付与と同じ
  if (isRecord(fields.durationUntil) && 'selfHpAtMostRef' in fields.durationUntil) fields.durationUntil = 'battleEnd';
  if (value.stat === 'fixedChargeTime') {
    delete fields.maxStacks;
    delete fields.maxStacksRef;
  }
  return { ...fields, ...value, kind: 'timed' };
}

/** 2 段目の段 10（plan/design-skill-stage10.md 2.3 節）: カウンタの増減。対象は自分だけ */
export function parseCounterChangeEffect(v: Record<string, Json>, path: string): CounterChangeEffect {
  for (const key of Object.keys(v)) {
    if (
      ![
        'kind',
        'counter',
        'trigger',
        'target',
        'amount',
        'amountRef',
        'decrease',
        'condition',
        'assumes',
        'claims',
      ].includes(key)
    ) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  const counter = oneOf(COUNTER_IDS, v.counter, `${path}.counter`);
  let trigger: EffectTrigger | EndedTrigger | CounterFullTrigger;
  if (isRecord(v.trigger) && v.trigger.ended !== undefined) {
    for (const key of Object.keys(v.trigger)) if (key !== 'ended') fail(`${path}.trigger.${key}`, 'unknown field');
    trigger = { ended: parseNamedStateId(v.trigger.ended, `${path}.trigger.ended`, 'ally') };
  } else if (isRecord(v.trigger) && v.trigger.counterFull !== undefined) {
    trigger = parseCounterFullTrigger(v.trigger, `${path}.trigger`)!;
  } else if (isRecord(v.trigger) && v.trigger.applied !== undefined) {
    // 2 段目の段 19 の PR 1（plan/design-skill-stage19.md 2.1 節。論点 3）: 「変身後、バッテリー N%▼」
    trigger = parseAppliedTrigger(v.trigger, `${path}.trigger`)!;
  } else if (isRecord(v.trigger) && v.trigger.since !== undefined) {
    // 同（論点 2）: 状態の付いた時から数える周期（変身の間 0.2 秒ごとの▼）
    trigger = parseSinceTimerTrigger(v.trigger, `${path}.trigger`)!;
  } else {
    // 2 段目の段 16 の PR 1（plan/design-skill-stage16.md 2.1 節）: 時間の周期のきっかけも（千束の超感覚の 2 秒ごとの▼）
    trigger = parseTrigger(v.trigger, `${path}.trigger`, true);
  }
  if (v.target !== 'self') fail(`${path}.target`, `expected "self", got ${JSON.stringify(v.target)}`);
  const effect: CounterChangeEffect = { kind: 'counterChange', counter, trigger, target: 'self' };
  if ((v.amount === undefined) === (v.amountRef === undefined))
    fail(path, 'expected exactly one of amount and amountRef');
  if (v.amount !== undefined) effect.amount = parsePositiveInt(v.amount, `${path}.amount`);
  else effect.amountRef = parseRef(v.amountRef, `${path}.amountRef`);
  if (v.decrease !== undefined) {
    if (v.decrease !== true) fail(`${path}.decrease`, `expected true, got ${JSON.stringify(v.decrease)}`);
    effect.decrease = true;
  }
  if (v.condition !== undefined) {
    effect.condition = parseCondition(v.condition, `${path}.condition`, CONDITION_KEYS_OF.counterChange, true);
    validateUsedBurst(effect.condition, trigger, `${path}.condition`);
    // 増減の判定（skills/holders.ts の counterConditionHolds）は状態が付いているかだけを見る。スタック数の条件は使うキャラが無いので拒否する
    if (isStacksCondition(effect.condition.selfState)) {
      fail(`${path}.condition.selfState`, 'a stack count condition is not supported in counterChange (only presence)');
    }
  }
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

/**
 * 2 段目の段 3（plan/design-skill-stage3.md 1.1・1.5 節）: スタック量の増加と減少（decrease）。対象は自分だけ。トリガーと条件は解除と
 * 同じ。同じ定義にその状態をスタックで付ける付与が要ること（validateStackChanges）は、定義全体で見る
 */
export function parseStackChangeEffect(v: Record<string, Json>, path: string): StackChangeEffect {
  for (const key of Object.keys(v)) {
    if (
      ![
        'kind',
        'state',
        'trigger',
        'target',
        'amount',
        'amountRef',
        'decrease',
        'closesAtZero',
        'condition',
        'assumes',
        'claims',
      ].includes(key)
    ) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  if (v.target !== 'self' && v.target !== 'enemy') {
    fail(
      `${path}.target`,
      `expected "self" or "enemy" (changing the stacks of an ally is not supported), got ${JSON.stringify(v.target)}`,
    );
  }
  const target = v.target;
  const state = parseNamedStateId(v.state, `${path}.state`, target === 'enemy' ? 'enemy' : 'ally');
  // 2 段目の段 13 の PR 3: 敵の持続ダメージのスタック量▲は、フルバーストの中の命中を数える（during）
  const trigger = parseTrigger(v.trigger, `${path}.trigger`, false, target === 'enemy');
  const effect: StackChangeEffect = { kind: 'stackChange', state, trigger, target };
  if ((v.amount === undefined) === (v.amountRef === undefined))
    fail(path, 'expected exactly one of amount and amountRef');
  if (v.amount !== undefined) effect.amount = parsePositiveInt(v.amount, `${path}.amount`);
  else effect.amountRef = parseRef(v.amountRef, `${path}.amountRef`);
  // 2 段目の段 3（plan/design-skill-stage3.md 1.5 節）: スタック量の減少
  if (v.decrease !== undefined) {
    if (v.decrease !== true) fail(`${path}.decrease`, `expected true, got ${JSON.stringify(v.decrease)}`);
    effect.decrease = true;
  }
  // 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節。論点 6）: 減少で 0 になったら件を閉じる（使用回数を使い切った時）
  if (v.closesAtZero !== undefined) {
    if (v.closesAtZero !== true) fail(`${path}.closesAtZero`, `expected true, got ${JSON.stringify(v.closesAtZero)}`);
    if (!effect.decrease || target !== 'self')
      fail(`${path}.closesAtZero`, 'closesAtZero needs decrease on target "self"');
    effect.closesAtZero = true;
  }
  if (target === 'enemy') {
    if (effect.decrease) fail(`${path}.decrease`, 'decrease is not allowed with target enemy');
    const condition =
      v.condition === undefined ? undefined : parseCondition(v.condition, `${path}.condition`, ['enemyState']);
    if (condition?.enemyState !== state)
      fail(`${path}.condition`, `target enemy needs the condition { enemyState: "${state}" }`);
    effect.condition = condition;
  } else if (v.condition !== undefined) {
    const condition = parseCondition(v.condition, `${path}.condition`, CONDITION_KEYS_OF.removeState);
    validateUsedBurst(condition, trigger, `${path}.condition`);
    effect.condition = condition;
  }
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

/**
 * 2 段目の段 1（plan/design-skill-stage1.md 1.2 節）: 解除。対象は自分だけ。トリガーの確率のきっかけ・{ applied }・時間の周期の
 * きっかけは書けない（使い手の時に足す）。条件は、自分がその状態なら（selfState）のように、外す状態を見てもよい（閉じるのは f + 1 で、
 * f の判定には付いている）
 */
export function parseRemoveStateEffect(v: Record<string, Json>, path: string): RemoveStateEffect {
  for (const key of Object.keys(v)) {
    if (!['kind', 'state', 'trigger', 'target', 'condition', 'assumes', 'claims'].includes(key)) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  const state = parseNamedStateId(v.state, `${path}.state`, 'ally');
  const trigger = parseTrigger(v.trigger, `${path}.trigger`, false, false, false, false, false, true);
  if (v.target !== 'self') {
    fail(
      `${path}.target`,
      `expected "self" (removing a state of an ally is not supported), got ${JSON.stringify(v.target)}`,
    );
  }
  const effect: RemoveStateEffect = { kind: 'removeState', state, trigger, target: 'self' };
  if (v.condition !== undefined) {
    // 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節）: 「フルバースト状態でなければ」（inFullBurst: false）も書ける
    // （「通常攻撃をした時、フルバースト状態でなければ、フルアクティブ解除」）
    const condition = parseCondition(v.condition, `${path}.condition`, CONDITION_KEYS_OF.removeState, true);
    validateUsedBurst(condition, trigger, `${path}.condition`);
    effect.condition = condition;
  }
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

/**
 * 課題 2-59（plan/design-debuff-removal.md 2.2 節）: デバフ解除。target は allies か debuffedRandom（pick が要る）。delayFrames は時間の周期の
 * きっかけにだけ書ける
 */
export function parseRemoveDebuffEffect(v: Record<string, Json>, path: string): RemoveDebuffEffect {
  for (const key of Object.keys(v)) {
    if (
      ![
        'kind',
        'trigger',
        'target',
        'count',
        'targetCount',
        'targetCountRef',
        'delayFrames',
        'assumes',
        'claims',
      ].includes(key)
    ) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  const trigger = parseTrigger(v.trigger, `${path}.trigger`, true);
  const target = oneOf(['allies', 'debuffedRandom'] as const, v.target, `${path}.target`);
  const effect: RemoveDebuffEffect = {
    kind: 'removeDebuff',
    trigger,
    target,
    count: parsePositiveInt(v.count, `${path}.count`),
    ...parseTargetCount(v, target, path),
  };
  const delayFrames = parseTimerDelayFrames(v.delayFrames, trigger, `${path}.delayFrames`);
  if (delayFrames !== undefined) effect.delayFrames = delayFrames;
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

/**
 * 2 段目の段 13 の PR 2（plan/design-skill-stage13.md 2.5 節）: 消去。いまは敵の持続ダメージの状態（同じ定義の dot の state）だけで、
 * 対象は敵。解除不可の件も閉じる
 */
export function parseCancelStateEffect(v: Record<string, Json>, path: string): CancelStateEffect {
  for (const key of Object.keys(v)) {
    if (!['kind', 'state', 'trigger', 'target', 'assumes', 'claims'].includes(key))
      fail(`${path}.${key}`, 'unknown field');
  }
  const state = parseNamedStateId(v.state, `${path}.state`, 'enemy');
  const trigger = parseTrigger(v.trigger, `${path}.trigger`);
  if (v.target !== 'enemy') fail(`${path}.target`, `expected "enemy", got ${JSON.stringify(v.target)}`);
  const effect: CancelStateEffect = { kind: 'cancelState', state, trigger, target: 'enemy' };
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}
