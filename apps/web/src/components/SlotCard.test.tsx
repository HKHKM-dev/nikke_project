// @vitest-environment happy-dom
// クラシックのスロットのカード（SlotCard.tsx）の見出しの「操作」のラジオボタン: 選んだ形が操作キャラで、選ぶとそのスロットを操作キャラにする
import { EMPTY_BUILD, MAX_SKILL_LEVELS } from '@nikke/core';
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
      visibleIds={null}
      otherPartyIds={new Map()}
      fullySupported={null}
      character={undefined}
      error={undefined}
      fixedSpec={false}
      shown={{
        growth: { level: 200, grade: 3, core: 0 },
        build: EMPTY_BUILD,
        skillLevels: MAX_SKILL_LEVELS,
        treasurePhase: 0,
      }}
      masters={null}
      mastersError={null}
      slotResult={null}
      usesHpRatio={false}
      rosterGrowth={null}
      dispatch={dispatch}
    />,
  );
  return { dispatch, radio: screen.getByRole<HTMLInputElement>('radio', { name: 'スロット 2 を操作キャラにする' }) };
}

describe('SlotCard の操作のラジオボタン', () => {
  it('操作キャラのスロットでは選んだ形になる', () => {
    expect(renderCard(true).radio.checked).toBe(true);
  });

  it('ほかのスロットでは選んでいない形で、選ぶとそのスロットを操作キャラにする', () => {
    const { dispatch, radio } = renderCard(false);
    expect(radio.checked).toBe(false);
    fireEvent.click(radio);
    expect(dispatch).toHaveBeenCalledWith({ type: 'setControlledSlot', index: 1 });
  });
});
