import type { CharacterIndexEntry } from '@nikke/core';
import { describe, expect, it } from 'vitest';
import { characterLabel } from './components/CharacterPicker.tsx';

// 未対応の項目があるかは data/skills/support.json（生成物。packages/core/src/skills/__tests__/support.test.ts）で決まる
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
    };
    expect(characterLabel(dummy, false)).toBe('ラピ');
    expect(characterLabel(dummy, true)).toBe('ラピ（未）');
  });
});
