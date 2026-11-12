// スキル定義の読み込みの検査のうち、バーストゲージ・バースト段階に効く効果（burstGaugeHit・allyGaugeAdd・burstReentry・burstStepChange）の読み込み。型は ../types.ts
import {
  type AllyGaugeAddEffect,
  BASIC_BURST_STEPS,
  type BurstGaugeHitEffect,
  type BurstReentryEffect,
  type BurstStepChangeEffect,
  isShotCountTrigger,
  isTimerTrigger,
} from '../types.ts';
import { fail, type Json, oneOf, parseAssumes, parseLocalizedText, rejectUnknownKeys } from './common.ts';
import { parseTrigger } from './trigger.ts';

export function parseBurstGaugeHitEffect(v: Record<string, Json>, path: string): BurstGaugeHitEffect {
  rejectUnknownKeys(v, ['kind', 'trigger', 'delayFrames', 'assumes', 'claims'], path);
  const trigger = parseTrigger(v.trigger, `${path}.trigger`, { timer: true });
  // モラン編（plan/design-moran.md 2 節）: 射撃の回数のトリガーも書ける。during・chance は parseTrigger が弾く
  if (!isTimerTrigger(trigger) && !isShotCountTrigger(trigger)) {
    fail(
      `${path}.trigger`,
      'burstGaugeHit needs a timer trigger ({ everySeconds }) or a shot count trigger ({ count })',
    );
  }
  if (isShotCountTrigger(trigger) && trigger.stacksRef !== undefined) {
    fail(`${path}.trigger.stacksRef`, 'stacksRef cannot be used in burstGaugeHit');
  }
  const effect: BurstGaugeHitEffect = { kind: 'burstGaugeHit', trigger };
  if (v.delayFrames !== undefined) {
    // 周期のスキルのヒットのゲージは、ヒットのフレームで溜まる（C-0404・C-0409 の HUD の読み。plan/design-timer-ceil.md 7 節）。
    // 回数トリガーの遅れ編: 射撃の回数のトリガーは、発火した射撃の後に遅れて溜まる（モラン S2 の挑発。C-0480）。上で両方に限ってある
    const d = v.delayFrames;
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 1) {
      fail(`${path}.delayFrames`, `expected a positive integer, got ${JSON.stringify(d)}`);
    }
    effect.delayFrames = d;
  }
  parseAssumes(v, effect, path);
  return effect;
}

export function parseBurstReentryEffect(v: Record<string, Json>, path: string): BurstReentryEffect {
  rejectUnknownKeys(v, ['kind', 'step', 'burstStepMix', 'squad', 'assumes', 'claims'], path);
  const effect: BurstReentryEffect = { kind: 'burstReentry', step: oneOf(BASIC_BURST_STEPS, v.step, `${path}.step`) };
  parseAssumes(v, effect, path);
  return effect;
}

export function parseBurstStepChangeEffect(v: Record<string, Json>, path: string): BurstStepChangeEffect {
  rejectUnknownKeys(v, ['kind', 'step', 'name', 'burstStepMix', 'squad', 'assumes', 'claims'], path);
  const effect: BurstStepChangeEffect = {
    kind: 'burstStepChange',
    step: oneOf(BASIC_BURST_STEPS, v.step, `${path}.step`),
  };
  if (v.name !== undefined) effect.name = parseLocalizedText(v.name, `${path}.name`);
  parseAssumes(v, effect, path);
  return effect;
}

export function parseAllyGaugeAddEffect(v: Record<string, Json>, path: string): AllyGaugeAddEffect {
  rejectUnknownKeys(v, ['kind', 'ref', 'assumes', 'claims'], path);
  const ref = v.ref;
  if (typeof ref !== 'number' || !Number.isInteger(ref) || ref < 1) {
    fail(`${path}.ref`, `expected a positive integer, got ${JSON.stringify(ref)}`);
  }
  const effect: AllyGaugeAddEffect = { kind: 'allyGaugeAdd', ref };
  parseAssumes(v, effect, path);
  return effect;
}
