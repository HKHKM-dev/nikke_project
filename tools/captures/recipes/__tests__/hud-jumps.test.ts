import { describe, expect, it } from 'vitest';
import { HUD_FALLBACK_OPTION, HUD_JUMPS_CACHE_KEY, hudReading } from '../hud-jumps.ts';

describe('hudReading', () => {
  it('既定は閾値 150 だけで読み、いままでのキャッシュを使う', () => {
    expect(hudReading({})).toEqual({ args: [], cacheKey: HUD_JUMPS_CACHE_KEY });
    expect(hudReading({ [HUD_FALLBACK_OPTION]: '0' })).toEqual({ args: [], cacheKey: HUD_JUMPS_CACHE_KEY });
  });

  it('--opt hud-fallback=1 で hud.ts --fallback で読み、別の名前のキャッシュに置く', () => {
    expect(hudReading({ [HUD_FALLBACK_OPTION]: '1' })).toEqual({
      args: ['--fallback'],
      cacheKey: `${HUD_JUMPS_CACHE_KEY}-fallback`,
    });
  });
});
