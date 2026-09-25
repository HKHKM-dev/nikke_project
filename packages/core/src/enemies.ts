// Stage 15: 敵のプリセット（data/enemies.json）の検証と、計算の入力（EnemyInput）への変換（plan/design-stage12.md 5.2 節）。
// calc の敵フォームで選び、値はそのあと上書きできる。
// Stage 16-B（plan/design-stage16.md 9.2 節）: 敵の出来事のセット（eventSets）を周期で書き、戦闘時間ぶんの EnemyEvent に展開する。
import type { EnemyEvent, EnemyEventKind, EnemyInput } from './damage.ts';
import { ELEMENTS } from './element.ts';
import type { EnemyContent, EnemyEventSet, EnemyEventSpec, EnemyPreset, EnemyPresetMaster } from './types.ts';

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

export const ENEMY_EVENT_KINDS = [
  'untargetable',
  'invulnerable',
  'barrier',
] as const satisfies readonly EnemyEventKind[];

export const ENEMY_EVENT_KIND_LABEL: Record<EnemyEventKind, { ja: string; en: string }> = {
  untargetable: { ja: '狙えない', en: 'Untargetable' },
  invulnerable: { ja: '無敵', en: 'Invulnerable' },
  barrier: { ja: 'バリア', en: 'Barrier' },
};

/** Stage 16-B: 数値に効かせる出来事の種類（それ以外は型と表示だけ。plan/design-stage16.md 9.2 節） */
export const IMPLEMENTED_ENEMY_EVENT_KINDS: readonly EnemyEventKind[] = ['untargetable'];

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
  const eventSets = v.eventSets ?? [];
  if (!Array.isArray(eventSets) || !eventSets.every((id) => typeof id === 'string' && id !== '')) {
    throw new TypeError(`${path}.eventSets: must be an array of ids`);
  }
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
    eventSets: eventSets as string[],
  };
}

function positive(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function parseEventSpec(v: unknown, path: string): EnemyEventSpec {
  if (!isRecord(v)) throw new TypeError(`${path}: must be an object`);
  if (!(ENEMY_EVENT_KINDS as readonly unknown[]).includes(v.kind)) {
    throw new TypeError(`${path}.kind: unknown ${String(v.kind)}`);
  }
  if (typeof v.first !== 'number' || !Number.isFinite(v.first) || v.first < 0) {
    throw new TypeError(`${path}.first: must be a non-negative number (seconds)`);
  }
  if (!positive(v.duration)) throw new TypeError(`${path}.duration: must be a positive number (seconds)`);
  const spec: EnemyEventSpec = { kind: v.kind as EnemyEventKind, first: v.first, duration: v.duration };
  if (v.every !== undefined) {
    if (!positive(v.every) || v.every <= v.duration) {
      throw new TypeError(`${path}.every: must be longer than duration (seconds)`);
    }
    spec.every = v.every;
  }
  return spec;
}

function parseEventSet(v: unknown, path: string): EnemyEventSet {
  if (!isRecord(v)) throw new TypeError(`${path}: must be an object`);
  const name = v.name;
  if (typeof v.id !== 'string' || v.id === '') throw new TypeError(`${path}.id: must be a non-empty string`);
  if (!isRecord(name) || typeof name.ja !== 'string' || typeof name.en !== 'string') {
    throw new TypeError(`${path}.name: must be { ja, en }`);
  }
  if (!Array.isArray(v.events) || v.events.length === 0)
    throw new TypeError(`${path}.events: must be a non-empty array`);
  if (typeof v.source !== 'string' || v.source === '')
    throw new TypeError(`${path}.source: must be a non-empty string`);
  return {
    id: v.id,
    name: { ja: name.ja, en: name.en },
    events: v.events.map((e, i) => parseEventSpec(e, `${path}.events[${i}]`)),
    source: v.source,
  };
}

/** data/enemies.json を検証する。形が合わない・id の重複は TypeError */
export function parseEnemyPresets(raw: unknown): EnemyPresetMaster {
  if (!isRecord(raw) || raw.formatVersion !== 1) throw new TypeError('enemies: formatVersion must be 1');
  if (typeof raw.source !== 'string') throw new TypeError('enemies.source: must be a string');
  if (!Array.isArray(raw.enemies)) throw new TypeError('enemies.enemies: must be an array');
  const rawSets = raw.eventSets ?? [];
  if (!Array.isArray(rawSets)) throw new TypeError('enemies.eventSets: must be an array');
  const eventSets = rawSets.map((e, i) => parseEventSet(e, `eventSets[${i}]`));
  const setIds = new Set<string>();
  for (const set of eventSets) {
    if (setIds.has(set.id)) throw new TypeError(`enemies: duplicate event set id ${set.id}`);
    setIds.add(set.id);
  }
  const enemies = raw.enemies.map((e, i) => parseEnemy(e, `enemies[${i}]`));
  const ids = new Set<string>();
  for (const e of enemies) {
    if (ids.has(e.id)) throw new TypeError(`enemies: duplicate id ${e.id}`);
    ids.add(e.id);
  }
  for (const e of enemies) {
    for (const id of e.eventSets) {
      if (!setIds.has(id)) throw new TypeError(`enemies: ${e.id} refers to unknown event set ${id}`);
    }
  }
  return { formatVersion: 1, source: raw.source, eventSets, enemies };
}

/**
 * Stage 16-B: 周期で書いた出来事を、戦闘時間 durationSeconds ぶんの EnemyEvent（開始順）に展開する。
 * 戦闘時間より後に始まるものは出さず、終わりは戦闘時間で切る
 */
export function expandEnemyEvents(specs: readonly EnemyEventSpec[], durationSeconds: number): EnemyEvent[] {
  const events: EnemyEvent[] = [];
  for (const spec of specs) {
    for (let k = 0; ; k++) {
      const start = spec.first + k * (spec.every ?? 0);
      if (start >= durationSeconds || (k > 0 && spec.every === undefined)) break;
      events.push({ kind: spec.kind, start, end: Math.min(start + spec.duration, durationSeconds) });
    }
  }
  return events.sort((a, b) => a.start - b.start);
}

/** Stage 16-B: 選んだ出来事のセット（id）を展開した出来事。master に無い id は無視する */
export function enemyEventsOf(
  master: Pick<EnemyPresetMaster, 'eventSets'>,
  setIds: readonly string[],
  durationSeconds: number,
): EnemyEvent[] {
  const specs = master.eventSets.filter((set) => setIds.includes(set.id)).flatMap((set) => set.events);
  return expandEnemyEvents(specs, durationSeconds);
}

/** プリセットの計算の入力 */
export function enemyInputOf(preset: EnemyPreset): EnemyInput {
  return { defence: preset.defence, element: preset.element, hasCore: preset.hasCore };
}

/** 入力と同じ値のプリセット（calc の選択欄の表示用。上書きして一致しなければ undefined = カスタム） */
export function matchingEnemyPreset(presets: readonly EnemyPreset[], enemy: EnemyInput): EnemyPreset | undefined {
  return presets.find((p) => p.defence === enemy.defence && p.element === enemy.element && p.hasCore === enemy.hasCore);
}
