import { describe, expect, it } from 'vitest';
import { BURST_STEP_LABEL, ELEMENT_LABEL } from './CharacterVisual.tsx';

describe('CharacterVisual helpers', () => {
  it('maps burst steps to roman numerals', () => {
    expect(BURST_STEP_LABEL.Step1).toBe('Ⅰ');
    expect(BURST_STEP_LABEL.Step2).toBe('Ⅱ');
    expect(BURST_STEP_LABEL.Step3).toBe('Ⅲ');
    expect(BURST_STEP_LABEL.AllStep).toBe('ALL');
  });

  it('maps elements to japanese names', () => {
    expect(ELEMENT_LABEL.Fire).toBe('灼熱');
    expect(ELEMENT_LABEL.Water).toBe('水冷');
    expect(ELEMENT_LABEL.Wind).toBe('風圧');
    expect(ELEMENT_LABEL.Iron).toBe('鉄甲');
    expect(ELEMENT_LABEL.Electronic).toBe('電撃');
  });
});
