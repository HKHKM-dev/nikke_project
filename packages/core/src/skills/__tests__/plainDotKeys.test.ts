// 確率のきっかけの dot と restartOnReapply の dot（frame/plan.ts の専用の道）が読まない欄は、読み込みで止める
// （skills/parse/dot.ts の PLAIN_DOT_REJECTED_KEYS。plan/design-chance-dot-damage.md 3.1・9 節）
import { describe, expect, it } from 'vitest';
import { rawDefinition } from '../../__tests__/data.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { DOT_KEYS, PLAIN_DOT_REJECTED_KEYS } from '../parse/dot.ts';

// ハランの S1: 確率のきっかけで、restartOnReapply の dot
const HARAN = 230;
type Raw = { skills: Record<string, { effects: Record<string, unknown>[] }> };

/** 欄の値（中身は見ずに止めるので、読み込みの形だけ合わせる。durationUntil は維持の欄と組めないので維持の欄を外す） */
function patchOf(key: string): Record<string, unknown> {
  if (key === 'durationUntil') return { durationUntil: 'battleEnd', durationRef: undefined };
  return { [key]: 1 };
}

function parseS1(patch: Record<string, unknown>) {
  const raw = structuredClone(rawDefinition<Raw>(HARAN));
  Object.assign(raw.skills.skill1!.effects[0]!, patch);
  return () => parseSkillDefinition(raw);
}

describe('専用の道の dot が書けない欄', () => {
  it('writes each dot key once, either read by the dedicated path or rejected for it', () => {
    expect(new Set(DOT_KEYS).size).toBe(DOT_KEYS.length);
    expect(parseS1({})).not.toThrow();
  });

  it.each(PLAIN_DOT_REJECTED_KEYS.map((k) => [k]))('rejects %s on a chance dot', (key) => {
    expect(parseS1(patchOf(key))).toThrow(`a dot on a chance trigger cannot have ${key}`);
  });

  it.each(PLAIN_DOT_REJECTED_KEYS.map((k) => [k]))('rejects %s on a dot with restartOnReapply', (key) => {
    expect(parseS1({ trigger: { count: 'normalShot' }, ...patchOf(key) })).toThrow(
      `a dot with restartOnReapply cannot have ${key}`,
    );
  });
});
