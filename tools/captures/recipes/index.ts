// レシピの一覧（read.ts --recipe <名前>）
import { hudJumps } from './hud-jumps.ts';
import { sgPellets } from './sg-pellets.ts';
import type { Recipe } from './types.ts';

export const RECIPES: readonly Recipe[] = [hudJumps, sgPellets];

export function findRecipe(name: string): Recipe | undefined {
  return RECIPES.find((r) => r.name === name);
}
