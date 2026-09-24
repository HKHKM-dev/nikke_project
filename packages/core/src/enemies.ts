// Stage 15: 敵のプリセット（data/enemies.json）の検証と、計算の入力（EnemyInput）への変換（plan/design-stage12.md 5.2 節）。
// calc の敵フォームで選び、値はそのあと上書きできる。
import type { EnemyInput } from './damage.ts';
import { ELEMENTS } from './element.ts';
import type { EnemyContent, EnemyPreset, EnemyPresetMaster } from './types.ts';

export const ENEMY_CONTENTS = [
  'range',
  'interception',
  'soloRaid',
  'unionRaid',
] as const satisfies readonly EnemyContent[];

export const ENEMY_CONTENT_LABEL: Record<EnemyContent, { ja: string; en: string }> = {
  range: { ja: '射撃場', en: 'Shooting range' },
  interception: { ja: '迎撃戦', en: 'Interception' },
  soloRaid: { ja: 'ソロレイド', en: 'Solo Raid' },
  unionRaid: { ja: 'ユニオンレイド', en: 'Union Raid' },
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseEnemy(v: unknown, path: string): EnemyPreset {
  if (!isRecord(v)) throw new TypeError(`${path}: must be an object`);
  const str = (key: string): string => {
    const value = v[key];
    if (typeof value !== 'string' || value === '') throw new TypeError(`${path}.${key}: must be a non-empty string`);
    return value;
  };
  const name = v.name;
  if (!isRecord(name) || typeof name.ja !== 'string' || typeof name.en !== 'string') {
    throw new TypeError(`${path}.name: must be { ja, en }`);
  }
  const content = v.content;
  if (!(ENEMY_CONTENTS as readonly unknown[]).includes(content))
    throw new TypeError(`${path}.content: unknown ${String(content)}`);
  const element = v.element;
  if (element !== null && !(ELEMENTS as readonly unknown[]).includes(element)) {
    throw new TypeError(`${path}.element: unknown ${String(element)}`);
  }
  if (typeof v.hasCore !== 'boolean') throw new TypeError(`${path}.hasCore: must be a boolean`);
  const defence = v.defence;
  if (typeof defence !== 'number' || !Number.isFinite(defence) || defence < 0) {
    throw new TypeError(`${path}.defence: must be a non-negative number (measured values only)`);
  }
  const level = v.level;
  if (level !== null && !(typeof level === 'number' && Number.isInteger(level) && level > 0)) {
    throw new TypeError(`${path}.level: must be a positive integer or null`);
  }
  const measuredAt = str('measuredAt');
  if (!DATE.test(measuredAt)) throw new TypeError(`${path}.measuredAt: must be YYYY-MM-DD`);
  return {
    id: str('id'),
    name: { ja: name.ja, en: name.en },
    content: content as EnemyContent,
    element: element as EnemyPreset['element'],
    hasCore: v.hasCore,
    defence,
    level: level as number | null,
    measuredAt,
    source: str('source'),
  };
}

/** data/enemies.json を検証する。形が合わない・id の重複は TypeError */
export function parseEnemyPresets(raw: unknown): EnemyPresetMaster {
  if (!isRecord(raw) || raw.formatVersion !== 1) throw new TypeError('enemies: formatVersion must be 1');
  if (typeof raw.source !== 'string') throw new TypeError('enemies.source: must be a string');
  if (!Array.isArray(raw.enemies)) throw new TypeError('enemies.enemies: must be an array');
  const enemies = raw.enemies.map((e, i) => parseEnemy(e, `enemies[${i}]`));
  const ids = new Set<string>();
  for (const e of enemies) {
    if (ids.has(e.id)) throw new TypeError(`enemies: duplicate id ${e.id}`);
    ids.add(e.id);
  }
  return { formatVersion: 1, source: raw.source, enemies };
}

/** プリセットの計算の入力 */
export function enemyInputOf(preset: EnemyPreset): EnemyInput {
  return { defence: preset.defence, element: preset.element, hasCore: preset.hasCore };
}

/** 入力と同じ値のプリセット（calc の選択欄の表示用。上書きして一致しなければ undefined = カスタム） */
export function matchingEnemyPreset(presets: readonly EnemyPreset[], enemy: EnemyInput): EnemyPreset | undefined {
  return presets.find((p) => p.defence === enemy.defence && p.element === enemy.element && p.hasCore === enemy.hasCore);
}
