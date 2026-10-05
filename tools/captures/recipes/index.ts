// レシピの一覧（read.ts --recipe <名前>）
import { hudJumps } from './hud-jumps.ts';
import { nearLanding } from './near-landing.ts';
import { reloadSegments } from './reload-segments.ts';
import { sgPellets } from './sg-pellets.ts';
import { smgMags } from './smg-mags.ts';
import type { Recipe } from './types.ts';

export const RECIPES: readonly Recipe[] = [hudJumps, sgPellets, reloadSegments, nearLanding, smgMags];

export function findRecipe(name: string): Recipe | undefined {
  return RECIPES.find((r) => r.name === name);
}
