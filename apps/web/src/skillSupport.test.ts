import { describe, expect, it } from 'vitest';
import { characterLabel } from './components/CharacterPicker.tsx';
import { fullySupportedCharacterIds, hasUnsupportedSkill } from './skillSupport.ts';
import type { CharacterIndexEntry } from '@nikke/core';

describe('skillSupport', () => {
  it('identifies fully supported characters without unimplemented notes', () => {
    // 10: ラピ (完全対応)
    expect(fullySupportedCharacterIds.has(10)).toBe(true);
    expect(hasUnsupportedSkill(10)).toBe(false);

    // 16: ラピ：レッドフード (unimplemented notes あり)
    expect(fullySupportedCharacterIds.has(16)).toBe(false);
    expect(hasUnsupportedSkill(16)).toBe(true);

    // 11: ネオン (スキル定義なし)
    expect(fullySupportedCharacterIds.has(11)).toBe(false);
    expect(hasUnsupportedSkill(11)).toBe(true);
  });

  it('formats characterLabel with or without (未)', () => {
    const dummy: CharacterIndexEntry = {
      resourceId: 10,
      name: { ja: 'ラピ', en: 'Rapi' },
      rarity: 'SR',
      class: 'Attacker',
      corporation: 'ELYSION',
      element: 'Fire',
      weaponType: 'AR',
      burstStep: 'Step3',
    };
    expect(characterLabel(dummy, false)).toBe('ラピ');
    expect(characterLabel(dummy, true)).toBe('ラピ（未）');
  });
});
