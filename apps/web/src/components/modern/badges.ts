// モダン UI のバッジ（旧プロジェクトの SVG。plan/design-modern-ui.md 2.5 節）。
// どれも vite.config.ts の assetsInlineLimit 未満なので Vite が束の中に埋め込む（アーティファクトのファイル数を使わない）。
// 属性の色はバッジの図柄の色で、styles.css の [data-element] が --el に置く。
import { ELEMENT_LABEL, WEAPON_LABEL, type CharacterIndexEntry } from '@nikke/core';
import burstStep1 from '../../assets/badges/burst_1I.svg';
import burstStep2 from '../../assets/badges/burst_2II.svg';
import burstStep3 from '../../assets/badges/burst_3III.svg';
import burstAllStep from '../../assets/badges/burst_4special.svg';
import classAttacker from '../../assets/badges/class_1attacker.svg';
import classDefender from '../../assets/badges/class_2defender.svg';
import classSupporter from '../../assets/badges/class_3supporter.svg';
import elementFire from '../../assets/badges/element_1fire.svg';
import elementWater from '../../assets/badges/element_2water.svg';
import elementElectronic from '../../assets/badges/element_3electric.svg';
import elementIron from '../../assets/badges/element_4iron.svg';
import elementWind from '../../assets/badges/element_5wind.svg';
import weaponAR from '../../assets/badges/weapon_1AR.svg';
import weaponSMG from '../../assets/badges/weapon_2SMG.svg';
import weaponSG from '../../assets/badges/weapon_3SG.svg';
import weaponSR from '../../assets/badges/weapon_4SR.svg';
import weaponRL from '../../assets/badges/weapon_5RL.svg';
import weaponMG from '../../assets/badges/weapon_6MG.svg';
import { BURST_STEP_LABEL, CLASS_LABEL } from '../../skillLabels.ts';

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

function badgesOf<T extends string>(srcs: Record<T, string>, label: (value: T) => string): Record<T, Badge> {
  const entries = Object.entries(srcs) as [T, string][];
  return Object.fromEntries(entries.map(([value, src]) => [value, { src, label: label(value) }])) as Record<T, Badge>;
}

/** バッジの種類（並びは絵の左上に縦に並べる順と、トレイの絞り込みの順） */
export const BADGE_KINDS: readonly BadgeKind[] = [
  {
    key: 'element',
    name: '属性',
    badges: badgesOf<CharacterIndexEntry['element']>(
      { Fire: elementFire, Water: elementWater, Wind: elementWind, Iron: elementIron, Electronic: elementElectronic },
      (v) => ELEMENT_LABEL[v].ja,
    ),
  },
  {
    key: 'burstStep',
    name: 'バースト段階',
    badges: badgesOf<CharacterIndexEntry['burstStep']>(
      { Step1: burstStep1, Step2: burstStep2, Step3: burstStep3, AllStep: burstAllStep },
      (v) => `バースト ${BURST_STEP_LABEL[v]}`,
    ),
  },
  {
    key: 'class',
    name: 'クラス',
    badges: badgesOf<CharacterIndexEntry['class']>(
      { Attacker: classAttacker, Defender: classDefender, Supporter: classSupporter },
      (v) => CLASS_LABEL[v],
    ),
  },
  {
    key: 'weaponType',
    name: '武器種',
    badges: badgesOf<CharacterIndexEntry['weaponType']>(
      { AR: weaponAR, SMG: weaponSMG, SG: weaponSG, SR: weaponSR, RL: weaponRL, MG: weaponMG },
      (v) => WEAPON_LABEL[v].ja,
    ),
  },
];

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
