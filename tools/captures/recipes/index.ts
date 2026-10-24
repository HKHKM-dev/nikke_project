// レシピの一覧（read.ts --recipe <名前>）
import { arCores } from './ar-cores.ts';
import { buffEdge } from './buff-edge.ts';
import { burstPanel } from './burst-panel.ts';
import { farLanding } from './far-landing.ts';
import { chargeShots } from './charge-shots.ts';
import { hudJumps } from './hud-jumps.ts';
import { midfarLanding } from './midfar-landing.ts';
import { nearLanding } from './near-landing.ts';
import { reloadSegments } from './reload-segments.ts';
import { sgPellets } from './sg-pellets.ts';
import { smgCores } from './smg-cores.ts';
import { smgMags } from './smg-mags.ts';
import type { Recipe } from './types.ts';

export const RECIPES: readonly Recipe[] = [
  hudJumps,
  sgPellets,
  reloadSegments,
  nearLanding,
  midfarLanding,
  farLanding,
  smgMags,
  smgCores,
  arCores,
  buffEdge,
  chargeShots,
  burstPanel,
];

export function findRecipe(name: string): Recipe | undefined {
  return RECIPES.find((r) => r.name === name);
}
