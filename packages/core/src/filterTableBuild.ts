// 絞り込みの表（filterTable.ts）を、キャラのデータから作る。説明文の効果の分類（skills/catalog.ts）を使うので、画面と Worker が
// 読み込む index.ts からは出さない。使うのは fetch-data（キャラのデータと一緒に書く）と scripts/filter-table.ts（手元のデータから作り直す）
import {
  FILTER_EFFECTS,
  normalizeSearchText,
  FILTER_SIDES,
  sidesOf,
  SPECIAL_ATTACKS,
  TRAITS,
  type FilterEffect,
  type FilterSide,
  type FilterTable,
  type FilterTableEntry,
} from './filterTable.ts';
import { classifyCharacters, slotsOf, type CatalogEffect } from './skills/catalog.ts';
import { fillSkillDescription } from './skills/resolve.ts';
import type { CharacterData } from './types.ts';

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
  // 「敵全体を挑発」（ヘイト）は自分の側の句に読まれるが、敵を挑発する効果なので敵の挑発に数える（effectTag）
  'control:selfTaunt': 'taunt',
  'control:stun': 'stun',
};
const EFFECTS_BY_KEY = new Map<string, FilterEffect>(FILTER_EFFECTS.map((e) => [e.key, e]));

/** 効果の句 1 つの項目（`${鍵}:${側}`）。項目に無いものは null */
function effectTag(e: CatalogEffect): string | null {
  let key: string | undefined;
  let side: FilterSide;
  if (e.side === 'enemy') {
    side = 'enemy';
    key = e.stat ? ENEMY_STAT_KEY[e.stat.canon]?.[e.stat.dir] : KIND_KEY[e.kind];
  } else if (e.kind === 'control:selfTaunt') {
    side = 'enemy';
    key = KIND_KEY[e.kind];
  } else if (e.side === 'self' || e.side === 'ally') {
    side = e.side;
    if (e.stat) key = e.stat.dir === 'up' ? (STAT_KEY[e.stat.canon] ?? e.stat.canon) : STAT_DOWN_KEY[e.stat.canon];
    else key = KIND_KEY[e.kind];
  } else return null;
  const effect = key === undefined ? undefined : EFFECTS_BY_KEY.get(key);
  if (effect === undefined || !sidesOf(effect).includes(side)) return null;
  return `${key}:${side}`;
}

function specialAttacksOf(effects: readonly CatalogEffect[], descriptions: string): string[] {
  const kinds = new Set(effects.map((e) => e.kind));
  const has: Record<(typeof SPECIAL_ATTACKS)[number]['key'], boolean> = {
    // 「貫通特化」は単独の句のほか、使用武器変更の中の「追加効果:貫通特化」にも書かれる
    pierce: descriptions.includes('貫通特化'),
    dot: kinds.has('damage:dot'),
    distributed: kinds.has('damage:distributed'),
    true: kinds.has('damage:true') || kinds.has('damage:burstTrue') || kinds.has('flag:trueDamageConversion'),
    sequential: descriptions.includes('順番に攻撃'),
    weaponChange: kinds.has('weaponChange'),
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

/** スキル名と説明文（基礎版と宝物版）。説明文は書式の印を除き、値の差し込みを最大 Lv の値にする */
function skillTexts(c: CharacterData): string {
  return slotsOf(c)
    .map(([, s]) => `${s.name.ja}\n${fillSkillDescription(s, 'ja', (levels) => levels?.at(-1) ?? '')}`)
    .join('\n');
}

export function buildFilterTable(characters: readonly CharacterData[]): FilterTable {
  const { effects } = classifyCharacters(characters, new Set());
  const effectsOf = new Map<number, CatalogEffect[]>();
  for (const e of effects) {
    const list = effectsOf.get(e.rid);
    if (list === undefined) effectsOf.set(e.rid, [e]);
    else list.push(e);
  }
  const effectOrder = FILTER_EFFECTS.flatMap((f) => FILTER_SIDES.map((s) => `${f.key}:${s}`));
  const entries = [...characters]
    .sort((a, b) => a.resourceId - b.resourceId)
    .map((c): [string, FilterTableEntry] => {
      const own = effectsOf.get(c.resourceId) ?? [];
      const texts = skillTexts(c);
      const tags = new Set(own.map(effectTag).filter((t) => t !== null));
      return [
        String(c.resourceId),
        {
          burstCooldown: c.burstSkill.cooldownSeconds,
          skillText: normalizeSearchText(texts),
          effects: effectOrder.filter((t) => tags.has(t)),
          special: specialAttacksOf(own, texts),
          traits: traitsOf(c, own),
        },
      ];
    });
  return { formatVersion: 1, characters: Object.fromEntries(entries) };
}
