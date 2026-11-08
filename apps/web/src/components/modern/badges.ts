// モダン UI のバッジ（plan/design-modern-ui.md 2.5 節）。assets/badges は apps/web/badges-src から npm run badges:build で書き出したもの。
// ファイル名は <キャラのデータの項目名>_<その値>.svg（命名規則は apps/web/scripts/badges.ts の冒頭）なので、項目と値からファイルを引く。
// どれも vite.config.ts の assetsInlineLimit 未満なので Vite が束の中に埋め込む（アーティファクトのファイル数を使わない）。
// 束に入るのは下の glob が読む項目のバッジだけ。
import {
  COLLECTION_LEVEL_MAX,
  ELEMENT_LABEL,
  TREASURE_PHASE_MAX,
  WEAPON_LABEL,
  type CharacterIndexEntry,
  type CollectionInput,
  type TreasurePhase,
} from '@nikke/core';
import { BURST_STEP_LABEL, CLASS_LABEL } from '../../skillLabels.ts';

const BADGE_SRCS = import.meta.glob<string>(
  [
    '../../assets/badges/element_*.svg',
    '../../assets/badges/burstStep_*.svg',
    '../../assets/badges/class_*.svg',
    '../../assets/badges/weaponType_*.svg',
    '../../assets/badges/collection_*.svg',
    '../../assets/badges/grade_*.svg',
    '../../assets/badges/core_*.svg',
  ],
  { eager: true, import: 'default' },
);

/** バッジのファイル（拡張子なしの名前）の URL。無ければ読み込みで落とす */
function badgeSrc(name: string): string {
  const src = BADGE_SRCS[`../../assets/badges/${name}.svg`];
  if (src === undefined) throw new Error(`バッジ ${name}.svg が assets/badges に無い`);
  return src;
}

/** 限界突破の星（1 回分が埋まっているか）とコア強化の印のバッジ（GrowthMarks.tsx） */
export const GROWTH_BADGE_SRC = {
  gradeFilled: badgeSrc('grade_filled'),
  gradeEmpty: badgeSrc('grade_empty'),
  core: badgeSrc('core_plain'),
} as const;

/** バッジを出すキャラの項目 */
export type BadgeKey = 'element' | 'burstStep' | 'class' | 'weaponType';
export type Badge = { src: string; label: string };
export type BadgeKind = {
  key: BadgeKey;
  /** 絞り込みの名前 */
  name: string;
  /** 項目の値 → バッジ（並びはゲームの表示の順） */
  badges: Readonly<Record<string, Badge>>;
};

/** 項目の値ごとのバッジ（values の順に並べる）。ファイルが無い値があれば読み込みで落とす */
function badgesOf<K extends BadgeKey>(
  key: K,
  values: readonly CharacterIndexEntry[K][],
  label: (value: CharacterIndexEntry[K]) => string,
): Record<string, Badge> {
  return Object.fromEntries(
    values.map((value) => {
      const src = BADGE_SRCS[`../../assets/badges/${key}_${value}.svg`];
      if (src === undefined) throw new Error(`バッジ ${key}_${value}.svg が assets/badges に無い`);
      return [value, { src, label: label(value) }];
    }),
  );
}

/** バッジの種類（並びは絵の左上に縦に並べる順と、トレイの絞り込みの順） */
export const BADGE_KINDS: readonly BadgeKind[] = [
  {
    key: 'element',
    name: '属性',
    badges: badgesOf('element', ['Fire', 'Water', 'Wind', 'Iron', 'Electronic'], (v) => ELEMENT_LABEL[v].ja),
  },
  {
    key: 'burstStep',
    name: 'バースト段階',
    badges: badgesOf('burstStep', ['Step1', 'Step2', 'Step3', 'AllStep'], (v) => `バースト ${BURST_STEP_LABEL[v]}`),
  },
  {
    key: 'class',
    name: 'クラス',
    badges: badgesOf('class', ['Attacker', 'Defender', 'Supporter'], (v) => CLASS_LABEL[v]),
  },
  {
    key: 'weaponType',
    name: '武器種',
    badges: badgesOf('weaponType', ['AR', 'SMG', 'SG', 'SR', 'RL', 'MG'], (v) => WEAPON_LABEL[v].ja),
  },
];

const kindOf = (key: BadgeKey): BadgeKind => BADGE_KINDS.find((kind) => kind.key === key)!;

/** キャラの絵の左上に縦に出すバッジの順（属性・武器種・バースト段階。クラスは出さず、トレイの絞り込みにだけ使う） */
export const VISUAL_BADGE_KINDS: readonly BadgeKind[] = [kindOf('element'), kindOf('weaponType'), kindOf('burstStep')];

/** ニケ一覧の正方形の絵の左上に縦に出すバッジの順（武器種・バースト段階）。属性は右下に別に出す（ELEMENT_BADGE_KIND） */
export const COMPACT_BADGE_KINDS: readonly BadgeKind[] = [kindOf('weaponType'), kindOf('burstStep')];
export const ELEMENT_BADGE_KIND: BadgeKind = kindOf('element');

/**
 * スロットの絵の左上（バースト段階の下）に出すコレクションのバッジ。宝物を付けていれば SSR（最後の段階は上限の黒の版）、
 * R・SR のコレクションなら その色（LV が上限なら黒の版）、どちらも無ければ出さない
 */
export function collectionBadge(
  collection: CollectionInput,
  treasurePhase: TreasurePhase,
  hasTreasure: boolean,
): Badge | null {
  const pick = (value: string, label: string): Badge => {
    return { src: badgeSrc(`collection_${value}`), label };
  };
  if (hasTreasure && treasurePhase > 0) {
    return pick(treasurePhase === TREASURE_PHASE_MAX ? 'SSR-max' : 'SSR', `宝物 段階 ${treasurePhase}`);
  }
  if (collection === null) return null;
  const max = collection.level === COLLECTION_LEVEL_MAX;
  return pick(`${collection.rarity}${max ? '-max' : ''}`, `コレクション ${collection.rarity} LV ${collection.level}`);
}

/** バッジの絞り込み（項目 → 選んだ値。無い項目は絞らない） */
export type BadgeFilters = Partial<Record<BadgeKey, string>>;

/** キャラが選んだ値にすべて合うか（項目どうしは AND） */
export function matchesBadgeFilters(char: Pick<CharacterIndexEntry, BadgeKey>, filters: BadgeFilters): boolean {
  return BADGE_KINDS.every(({ key }) => filters[key] === undefined || char[key] === filters[key]);
}

/** バッジを押した後の絞り込み。押されていた値なら解除し、それ以外はその項目をその値にする */
export function toggleBadgeFilter(filters: BadgeFilters, key: BadgeKey, value: string): BadgeFilters {
  const { [key]: current, ...rest } = filters;
  return current === value ? rest : { ...rest, [key]: value };
}
