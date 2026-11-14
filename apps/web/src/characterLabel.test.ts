import type { CharacterIndexEntry } from '@nikke/core';
import { describe, expect, it } from 'vitest';
import { characterLabel } from './components/CharacterPicker.tsx';

// 未対応の項目があるかは data/skills/support.json（生成物。packages/core/src/skills/support.ts の buildSkillSupportIndex が作る）で決まる
describe('characterLabel', () => {
  it('formats characterLabel with or without (未)', () => {
    const dummy: CharacterIndexEntry = {
      resourceId: 10,
      nameCode: 10,
      name: { ja: 'ラピ', en: 'Rapi' },
      rarity: 'SR',
      class: 'Attacker',
      corporation: 'ELYSION',
      element: 'Fire',
      weaponType: 'AR',
      burstStep: 'Step3',
      hasTreasure: false,
    };
    expect(characterLabel(dummy, false)).toBe('ラピ');
    expect(characterLabel(dummy, true)).toBe('ラピ（未）');
    expect(characterLabel(dummy, true, true)).toBe('ラピ（未）（ほかの編成で使用中）');
  });
});
