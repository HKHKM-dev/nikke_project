// スキル定義の読み込みの検査のうち、段の循環（cycle）と、その間隔の変更（cycleEvery）の読み込み。型は ../types.ts
import {
  type CycleEffect,
  type CycleEveryEffect,
  type CycleStep,
  isShotCountTrigger,
  SKILL_DAMAGE_TYPES,
  SKILL_SLOTS,
} from '../types.ts';
import {
  fail,
  isRecord,
  type Json,
  oneOf,
  parseAssumes,
  parseDuration,
  parseGaugeHits,
  parsePositiveInt,
  parseRef,
  rejectUnknownKeys,
} from './common.ts';
import { parseTrigger } from './trigger.ts';

/** 段の循環 */
export function parseCycleEffect(v: Record<string, Json>, path: string): CycleEffect {
  rejectUnknownKeys(v, ['kind', 'trigger', 'steps', 'assumes', 'claims'], path);
  const trigger = parseTrigger(v.trigger, `${path}.trigger`);
  if (!isShotCountTrigger(trigger)) fail(`${path}.trigger`, 'a cycle needs a shot count trigger');
  if (trigger.count === 'lastShot') fail(`${path}.trigger.count`, 'lastShot is not allowed in a cycle');
  if (trigger.count === 'weaponChangeShot') fail(`${path}.trigger.count`, 'weaponChangeShot is not allowed in a cycle');
  if (trigger.count === 'pelletHit') fail(`${path}.trigger.count`, 'pelletHit is not allowed in a cycle');
  if (trigger.stacksRef !== undefined) fail(`${path}.trigger.stacksRef`, 'stacksRef is not allowed in a cycle');
  if (!Array.isArray(v.steps) || v.steps.length < 2) fail(`${path}.steps`, 'expected an array of at least 2 steps');
  const steps = v.steps.map((raw, i): CycleStep => {
    const stepPath = `${path}.steps[${i}]`;
    if (!isRecord(raw)) fail(stepPath, 'expected an object');
    rejectUnknownKeys(raw, ['kind', 'ref', 'damageType', 'gaugeHits', 'delayFrames', 'assumes'], stepPath);
    if (raw.kind !== 'damage') fail(`${stepPath}.kind`, `expected "damage", got ${JSON.stringify(raw.kind)}`);
    const step: CycleStep = {
      kind: 'damage',
      ref: parseRef(raw.ref, `${stepPath}.ref`),
      damageType: oneOf(SKILL_DAMAGE_TYPES, raw.damageType, `${stepPath}.damageType`),
    };
    if (raw.gaugeHits !== undefined) step.gaugeHits = parseGaugeHits(raw.gaugeHits, `${stepPath}.gaugeHits`, 1);
    if (raw.delayFrames !== undefined) step.delayFrames = parsePositiveInt(raw.delayFrames, `${stepPath}.delayFrames`);
    parseAssumes(raw, step, stepPath);
    return step;
  });
  const effect: CycleEffect = { kind: 'cycle', trigger, steps };
  parseAssumes(v, effect, path);
  return effect;
}

/** 循環の間隔の変更。slot に cycle がちょうど 1 つあるかは定義全体で見る（validateCycles） */
export function parseCycleEveryEffect(v: Record<string, Json>, path: string): CycleEveryEffect {
  rejectUnknownKeys(
    v,
    [
      'kind',
      'trigger',
      'slot',
      'every',
      'decreaseRef',
      'burstStepMix',
      'durationRef',
      'durationSeconds',
      'assumes',
      'claims',
    ],
    path,
  );
  const trigger = parseTrigger(v.trigger, `${path}.trigger`);
  // 自分の射撃で自分の循環を速めると判定が循環するので、射撃の回数トリガーは書けない（plan/design-stage11-scarlet-bs.md 2.2 節）
  if (isShotCountTrigger(trigger)) fail(`${path}.trigger`, 'cycleEvery cannot be triggered by a shot count');
  if ((v.every === undefined) === (v.decreaseRef === undefined))
    fail(path, 'expected exactly one of every and decreaseRef');
  const effect: CycleEveryEffect = {
    kind: 'cycleEvery',
    trigger,
    slot: oneOf(SKILL_SLOTS, v.slot, `${path}.slot`),
    ...(v.every !== undefined
      ? { every: parsePositiveInt(v.every, `${path}.every`) }
      : { decreaseRef: parseRef(v.decreaseRef, `${path}.decreaseRef`) }),
    ...parseDuration(v, path),
  };
  parseAssumes(v, effect, path);
  return effect;
}
