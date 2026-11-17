// 絞り込みの表（filterTable.ts）を、キャラのデータから作る。説明文の効果の分類（skills/catalog.ts）を使うので、画面と Worker が
// 読み込む index.ts からは出さない。使うのは fetch-data（キャラのデータと一緒に書く）と scripts/filter-table.ts（手元のデータから作り直す）
import {
  FILTER_EFFECTS,
  normalizeSearchText,
  SPECIAL_ATTACKS,
  TRAITS,
  type FilterSide,
  type FilterTable,
  type FilterTableEntry,
} from './filterTable.ts';
import { classifyCharacters, type CatalogEffect } from './skills/catalog.ts';
import { SKILL_SLOTS } from './skills/types.ts';
import type { CharacterData, SkillRaw } from './types.ts';

/** catalog の stat の canon を、効果の鍵にまとめる（無いものはそのまま） */
const STAT_KEY: Record<string, string> = {
  chargeDamageMultiplier: 'chargeDamage',
  oneEnemyBurstDamage: 'burstDamage',
  allEnemiesBurstDamage: 'burstDamage',
  burstDamageByTargetText: 'burstDamage',
};
/** 自・味の▼で項目にするもの（受けるダメージ▼） */
const STAT_DOWN_KEY: Record<string, string> = {
  damageTaken: 'damageTakenDown',
  damageTakenFromElement: 'damageTakenDown',
};
/** 敵への stat の項目（受けるダメージ▲・防御力▼・攻撃力▼） */
const ENEMY_STAT_KEY: Record<string, Record<'up' | 'down', string | undefined>> = {
  damageTaken: { up: 'damageTaken', down: undefined },
  defense: { up: undefined, down: 'defenseDown' },
  attack: { up: undefined, down: 'attackDown' },
};
/** stat でない効果の kind を、効果の鍵にする */
const KIND_KEY: Record<string, string> = {
  'heal:instant': 'heal',
  'heal:overTime': 'heal',
  'heal:lifesteal': 'heal',
  'heal:share': 'heal',
  'heal:revive': 'heal',
  'shield:barrier': 'barrier',
  'heal:barrier': 'barrier',
  'instant:ammoRefill': 'ammoRefill',
  'instant:burstCooldown': 'burstCooldown',
  'instant:burstGauge': 'burstGauge',
  'fullBurst:extend': 'fullBurstExtend',
  'control:taunt': 'taunt',
  'control:stun': 'stun',
};
const EFFECT_KEYS = new Set(FILTER_EFFECTS.map((e) => e.key));

/** 効果の句 1 つの項目（`${鍵}:${側}`）。項目に無いものは null */
function effectTag(e: CatalogEffect): string | null {
  let key: string | undefined;
  let side: FilterSide;
  if (e.side === 'enemy') {
    side = 'enemy';
    key = e.stat ? ENEMY_STAT_KEY[e.stat.canon]?.[e.stat.dir] : KIND_KEY[e.kind];
  } else if (e.side === 'self' || e.side === 'ally') {
    side = e.side;
    if (e.stat) key = e.stat.dir === 'up' ? (STAT_KEY[e.stat.canon] ?? e.stat.canon) : STAT_DOWN_KEY[e.stat.canon];
    else key = KIND_KEY[e.kind];
  } else return null;
  if (key === undefined || !EFFECT_KEYS.has(key)) return null;
  // 敵デバフの項目は敵だけ、ほかは自・味だけ
  if ((side === 'enemy') !== (FILTER_EFFECTS.find((f) => f.key === key)!.group === '敵デバフ')) return null;
  return `${key}:${side}`;
}

function specialAttacksOf(effects: readonly CatalogEffect[], text: string): string[] {
  const kinds = new Set(effects.map((e) => e.kind));
  const has: Record<(typeof SPECIAL_ATTACKS)[number]['key'], boolean> = {
    pierce: kinds.has('weaponChange:pierce'),
    dot: kinds.has('damage:dot'),
    distributed: kinds.has('damage:distributed'),
    true: kinds.has('damage:true') || kinds.has('damage:burstTrue') || kinds.has('flag:trueDamageConversion'),
    sequential: text.includes('順番ニ攻撃'),
    weaponChange: [...kinds].some((k) => k.startsWith('weaponChange')),
  };
  return SPECIAL_ATTACKS.filter((a) => has[a.key]).map((a) => a.key);
}

function traitsOf(c: CharacterData, effects: readonly CatalogEffect[]): string[] {
  const has: Record<(typeof TRAITS)[number]['key'], boolean> = {
    burstReentry: effects.some((e) => e.kind === 'burst:reentry'),
    splitReload: c.shot.reloadBullet < 1,
  };
  return TRAITS.filter((t) => has[t.key]).map((t) => t.key);
}

/** 説明文の書式（色・用語の印）を除き、値の差し込みを最大 Lv の値にする */
function skillDescriptionText(skill: SkillRaw): string {
  return skill.description.ja
    .replace(/<\/?word_group[^>]*>/g, '')
    .replace(/<\/?color[^>]*>/g, '')
    .replace(/\{description_value_(\d+)\}/g, (_, n: string) => skill.values[Number(n) - 1]?.at(-1) ?? '')
    .replace(/｣/g, '」');
}

function skillsOf(c: CharacterData): SkillRaw[] {
  const base = SKILL_SLOTS.map((s) => c.skills[s]);
  return c.treasure === null ? base : [...base, ...SKILL_SLOTS.map((s) => c.treasure!.skills[s])];
}

export function buildFilterTable(characters: readonly CharacterData[]): FilterTable {
  const { effects } = classifyCharacters(characters, new Set());
  const effectsOf = new Map<number, CatalogEffect[]>();
  for (const e of effects) {
    const list = effectsOf.get(e.rid);
    if (list === undefined) effectsOf.set(e.rid, [e]);
    else list.push(e);
  }
  const effectOrder = FILTER_EFFECTS.flatMap((f) => (['self', 'ally', 'enemy'] as const).map((s) => `${f.key}:${s}`));
  const entries = [...characters]
    .sort((a, b) => a.resourceId - b.resourceId)
    .map((c): [string, FilterTableEntry] => {
      const own = effectsOf.get(c.resourceId) ?? [];
      const skillText = normalizeSearchText(
        skillsOf(c)
          .map((s) => `${s.name.ja}\n${skillDescriptionText(s)}`)
          .join('\n'),
      );
      const tags = new Set(own.map(effectTag).filter((t) => t !== null));
      return [
        String(c.resourceId),
        {
          burstCooldown: c.burstSkill.cooldownSeconds,
          skillText,
          effects: effectOrder.filter((t) => tags.has(t)),
          special: specialAttacksOf(own, skillText),
          traits: traitsOf(c, own),
        },
      ];
    });
  return { formatVersion: 1, characters: Object.fromEntries(entries) };
}
