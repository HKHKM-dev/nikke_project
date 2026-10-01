// 読み取りのレシピ（plan/design-records-automation.md 3.4 節）。
// レシピは「録画 → 観測値の列」の手順を 1 つのモジュールにしたもの。名前と版を持ち、出力の観測値の method.tool に
// `recipe:<名前>@<版>` を書く。目で数える値はレシピの外（観測値の method.note に書く）。
import type { Observation, ObservationKind } from '../../../packages/core/src/records/observations.ts';
import type { RecordingEntry } from '../../../packages/core/src/records/recordings.ts';

/** レシピに渡す文脈 */
export type RecipeContext = {
  recording: RecordingEntry;
  /** 録画の実体のパス */
  video: string;
  /** 中間出力のキャッシュを置く所（録画ごと。追跡しない） */
  derivedDir: string;
  /** 観測値の source に書く検証記録の ID */
  source: string;
  /** 観測値の readAt（YYYY-MM-DD） */
  readAt: string;
  /** レシピごとの引数（--opt key=value） */
  options: Readonly<Record<string, string>>;
  /** 進み具合や注意を出す */
  log: (message: string) => void;
};

/** レシピの出力。観測値の id は read.ts が採番するので、ここでは空にする */
export type RecipeObservation = Omit<Observation, 'id' | 'recording' | 'source' | 'readAt'>;

export type Recipe = {
  name: string;
  version: number;
  /** 何を出すか（1〜2 文） */
  describe: string;
  /** --opt で受ける引数の説明（key → 説明） */
  options: Readonly<Record<string, string>>;
  run: (ctx: RecipeContext) => Promise<RecipeObservation[]>;
};

export function toolName(recipe: Pick<Recipe, 'name' | 'version'>): string {
  return `recipe:${recipe.name}@${recipe.version}`;
}

/** 観測値の骨。description と method.note はレシピが埋める */
export function observation(
  recipe: Pick<Recipe, 'name' | 'version'>,
  kind: ObservationKind,
  value: number | number[],
  description: string,
  note: string,
  extra: Partial<Pick<Observation, 'unit' | 'use' | 'spread'>> = {},
): RecipeObservation {
  return {
    kind,
    use: extra.use ?? 'record',
    value,
    ...(extra.unit === undefined ? {} : { unit: extra.unit }),
    ...(extra.spread === undefined ? {} : { spread: extra.spread }),
    description,
    method: { tool: toolName(recipe), note },
  };
}

/** 小数を桁で丸める（観測値に書く割合） */
export function roundTo(value: number, digits: number): number {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}
