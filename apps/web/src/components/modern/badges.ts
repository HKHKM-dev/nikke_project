// モダン UI のバッジ（plan/design-modern-ui.md 2.5 節）。assets/badges は apps/web/badges-src から npm run badges:build で書き出したもの。
// ファイル名は <キャラのデータの項目名>_<その値>.svg（命名規則は apps/web/scripts/badges.ts の冒頭）なので、項目と値からファイルを引く。
// 画面は読んだバッジを 1 つのスプライト（BadgeSprite）にして文書に 1 度だけ置き、バッジは <use> で出す（BadgeIcon。
// plan/design-badge-color.md）。色の役の CSS の変数（--badge-<役>）が <use> の中まで届くので、白黒のバッジの色は CSS で決まる。
// 束に入るのは下の glob が読む項目のバッジだけ（文字列で束に入る。アーティファクトのファイル数を使わない）。
import {
  COLLECTION_LEVEL_MAX,
  ELEMENT_LABEL,
  TREASURE_PHASE_MAX,
  WEAPON_LABEL,
  type BuildSnapshot,
  type CharacterIndexEntry,
  type CollectionInput,
  type TreasurePhase,
} from '@nikke/core';
import { rosterFields } from '../../roster.ts';
import { BURST_STEP_LABEL, CLASS_LABEL } from '../../skillLabels.ts';
import { CONSOLE_CORPORATIONS, CORPORATION_LABEL, type ConsoleCorporation } from '../../team.ts';

const BADGE_SVGS = import.meta.glob<string>(
  [
    '../../assets/badges/element_*.svg',
    '../../assets/badges/burstStep_*.svg',
    '../../assets/badges/class_*.svg',
    '../../assets/badges/weaponType_*.svg',
    '../../assets/badges/corporation_*.svg',
    '../../assets/badges/collection_*.svg',
    '../../assets/badges/grade_*.svg',
    '../../assets/badges/core_*.svg',
  ],
  { eager: true, query: '?raw', import: 'default' },
);

/** 読んだバッジの viewBox（拡張子なしの名前 → viewBox） */
const VIEW_BOXES = new Map<string, string>();

/** スプライトの中身（読んだバッジごとの <symbol id="badge-<名前>">） */
export const BADGE_SYMBOLS = Object.entries(BADGE_SVGS)
  .map(([path, svg]) => {
    const name = path.slice(path.lastIndexOf('/') + 1, -'.svg'.length);
    const [, attrs = '', body = ''] = /^<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/.exec(svg) ?? [];
    const viewBox = /\sviewBox="([^"]+)"/.exec(attrs)?.[1];
    if (viewBox === undefined) throw new Error(`バッジ ${name}.svg に viewBox が無い`);
    VIEW_BOXES.set(name, viewBox);
    return `<symbol id="badge-${name}" viewBox="${viewBox}">${body}</symbol>`;
  })
  .join('');

/** バッジ（拡張子なしの名前）の viewBox。無ければ落とす */
export function badgeViewBox(name: string): string {
  const viewBox = VIEW_BOXES.get(name);
  if (viewBox === undefined) throw new Error(`バッジ ${name}.svg が assets/badges に無い（か glob で読んでいない）`);
  return viewBox;
}

/** 名前のバッジがあることを確かめて返す（無ければ読み込みで落とす） */
function badgeName(name: string): string {
  badgeViewBox(name);
  return name;
}

/**
 * 限界突破の星とコア強化の印のバッジ（GrowthMarks.tsx）。星は白黒で、突破したかどうかで色を CSS で変える
 * （styles.css の .growth-marks-star）
 */
export const GROWTH_BADGES = { star: badgeName('grade_star'), core: badgeName('core_plain') } as const;

/** ニケ一覧の宝物の絞り込みのボタンのバッジ */
export const TREASURE_FILTER_BADGE = badgeName('collection_plain');

/** コレクションのバッジ（通常の版と、LV が上限・宝物が最後の段階の版） */
const COLLECTION_BADGES = {
  plain: badgeName('collection_rarity'),
  max: badgeName('collection_rarity-max'),
} as const;

/** バッジを出すキャラの項目 */
export type BadgeKey = 'element' | 'burstStep' | 'class' | 'weaponType' | 'corporation';
/**
 * name はバッジの拡張子なしの名前。tone は同じ絵に値ごとの差し色を付けるときの値（BadgeIcon が badge-tone-<tone> のクラスを付け、
 * styles.css が色を決める。コレクションのレア度）
 */
export type Badge = { name: string; label: string; tone?: string };
export type BadgeKind = {
  key: BadgeKey;
  /** 絞り込みの名前 */
  name: string;
  /** 項目の値 → バッジ（並びはゲームの表示の順） */
  badges: Readonly<Record<string, Badge>>;
  /** どの値で絞っても合う値（トレイの絞り込みのボタンは出さない。バースト段階の全段階） */
  matchesAll?: string;
};

/** 項目の値ごとのバッジ（values の順に並べる）。ファイルが無い値があれば読み込みで落とす */
function badgesOf<K extends BadgeKey>(
  key: K,
  values: readonly CharacterIndexEntry[K][],
  label: (value: CharacterIndexEntry[K]) => string,
): Record<string, Badge> {
  return Object.fromEntries(
    values.map((value) => [value, { name: badgeName(`${key}_${value}`), label: label(value) }]),
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
    // 全段階（AllStep）のボタンは出さず、全段階のニケは、どの段階で絞っても出す
    matchesAll: 'AllStep',
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
  {
    key: 'corporation',
    name: '企業',
    badges: badgesOf('corporation', CONSOLE_CORPORATIONS, (v) => CORPORATION_LABEL[v as ConsoleCorporation]),
  },
];

const kindOf = (key: BadgeKey): BadgeKind => BADGE_KINDS.find((kind) => kind.key === key)!;

/** クラシックのキャラの選択肢の絞り込みに出すバッジの種類と順（クラス・属性・武器種・企業。ClassicView） */
export const CLASSIC_FILTER_KINDS: readonly BadgeKind[] = [
  kindOf('class'),
  kindOf('element'),
  kindOf('weaponType'),
  kindOf('corporation'),
];

/** キャラの絵の左上に縦に出すバッジの順（属性・武器種・バースト段階。クラスは出さず、トレイの絞り込みにだけ使う） */
export const VISUAL_BADGE_KINDS: readonly BadgeKind[] = [kindOf('element'), kindOf('weaponType'), kindOf('burstStep')];

/** ニケ一覧の正方形の絵の左上に縦に出すバッジの順（武器種・バースト段階）。属性は右下に別に出す（ELEMENT_BADGE_KIND） */
export const COMPACT_BADGE_KINDS: readonly BadgeKind[] = [kindOf('weaponType'), kindOf('burstStep')];
export const ELEMENT_BADGE_KIND: BadgeKind = kindOf('element');

/**
 * スロットの絵の左上（バースト段階の下）に出すコレクションのバッジ。宝物を付けていれば SSR（最後の段階は上限の黒の版）、
 * R・SR のコレクションなら その色（LV が上限なら黒の版）、どちらも無ければ出さない。絵はレア度によらず同じで、レア度の色は tone
 */
export function collectionBadge(
  collection: CollectionInput,
  treasurePhase: TreasurePhase,
  hasTreasure: boolean,
): Badge | null {
  const pick = (tone: string, max: boolean, label: string): Badge => ({
    name: max ? COLLECTION_BADGES.max : COLLECTION_BADGES.plain,
    label,
    tone,
  });
  if (hasTreasure && treasurePhase > 0) {
    return pick('SSR', treasurePhase === TREASURE_PHASE_MAX, `宝物 段階 ${treasurePhase}`);
  }
  if (collection === null) return null;
  const max = collection.level === COLLECTION_LEVEL_MAX;
  return pick(collection.rarity, max, `コレクション ${collection.rarity} LV ${collection.level}`);
}

/**
 * ニケ一覧（縦長）のコレクションのバッジ。育成状況にいるニケだけ、スロットに写すのと同じコレクション・宝物で出す
 * （rosterFields。宝物の段階が未確定なら宝物なし）。スペック固定はコレクションを使わないので出さない
 */
export function trayCollectionBadge(
  char: Pick<CharacterIndexEntry, 'resourceId'>,
  roster: BuildSnapshot | null,
  fixedSpec: boolean,
): Badge | null {
  const entry = fixedSpec ? undefined : roster?.characters[String(char.resourceId)];
  if (!entry) return null;
  const { build, treasurePhase } = rosterFields(entry);
  return collectionBadge(build.collection, treasurePhase, entry.treasure !== null);
}

/** トレイの絞り込みのボタンに出す値（どの値で絞っても合う値 matchesAll は出さない） */
export function filterButtonValues(kind: BadgeKind): string[] {
  return Object.keys(kind.badges).filter((v) => v !== kind.matchesAll);
}

/** バッジの絞り込み（項目 → 選んだ値。1 つも選んでいない項目は持たず、絞らない） */
export type BadgeFilters = Partial<Record<BadgeKey, readonly string[]>>;

/**
 * キャラが選んだ値に合うか。同じ項目で選んだ値どうしは OR（どれか 1 つに合えばよい）、項目どうしは AND。
 * どの値で絞っても合う値（matchesAll。バースト段階の全段階）のキャラは、その項目ではいつも合う
 */
export function matchesBadgeFilters(char: Pick<CharacterIndexEntry, BadgeKey>, filters: BadgeFilters): boolean {
  return BADGE_KINDS.every(({ key, matchesAll }) => {
    const values = filters[key];
    return values === undefined || values.includes(char[key]) || (matchesAll !== undefined && char[key] === matchesAll);
  });
}

/** バッジを押した後の絞り込み。選んでいた値なら外し、それ以外はその項目の選んだ値に足す */
export function toggleBadgeFilter(filters: BadgeFilters, key: BadgeKey, value: string): BadgeFilters {
  const { [key]: current = [], ...rest } = filters;
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return next.length === 0 ? rest : { ...rest, [key]: next };
}
