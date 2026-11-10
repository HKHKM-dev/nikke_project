// @vitest-environment happy-dom
// クラシックのスロットのカード（SlotCard.tsx）の見出しの「操作」のボタン: 押した形が操作キャラで、押すとそのスロットを操作キャラにする
import { EMPTY_BUILD, type GrowthInput, type SkillLevels } from '@nikke/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptySlot } from '../team.ts';
import { SlotCard } from './SlotCard.tsx';

afterEach(cleanup);

function renderCard(controlled: boolean) {
  const dispatch = vi.fn();
  render(
    <SlotCard
      slotIndex={1}
      slot={emptySlot()}
      controlled={controlled}
      index={[]}
      excludeIds={new Set()}
      otherPartyIds={new Map()}
      fullySupported={null}
      character={undefined}
      error={undefined}
      fixedSpec={false}
      effectiveGrowth={{} as GrowthInput}
      effectiveSkillLevels={{} as SkillLevels}
      effectiveBuild={EMPTY_BUILD}
      treasurePhase={0}
      masters={null}
      mastersError={null}
      slotResult={null}
      usesHpRatio={false}
      dispatch={dispatch}
    />,
  );
  return { dispatch, button: screen.getByRole('button', { name: 'スロット 2 を操作キャラにする' }) };
}

describe('SlotCard の操作のボタン', () => {
  it('操作キャラのスロットでは押した形になる', () => {
    expect(renderCard(true).button.getAttribute('aria-pressed')).toBe('true');
  });

  it('ほかのスロットでは押していない形で、押すとそのスロットを操作キャラにする', () => {
    const { dispatch, button } = renderCard(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(dispatch).toHaveBeenCalledWith({ type: 'setControlledSlot', index: 1 });
  });
});
