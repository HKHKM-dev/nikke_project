// Stage 15: 敵のプリセット（data/enemies.json）の検証と、計算の入力（EnemyInput）への変換（plan/design-stage12.md 5.2 節）。
// calc の敵フォームで選び、値はそのあと上書きできる。
// Stage 16-B（plan/design-stage16.md 9.2 節）: 敵の出来事のセット（eventSets）を周期で書き、戦闘時間ぶんの EnemyEvent に展開する。
// Stage 18-C（plan/design-stage18.md 12.2 節）: 的の条件の表（targetProfiles）と、出来事のセットの区間ごとの着地点（landings）。
import type { EnemyEvent, EnemyEventKind, EnemyInput, LandingSpan } from './damage.ts';
import { ELEMENTS } from './element.ts';
import type {
  EnemyContent,
  EnemyEventSet,
  EnemyEventSpec,
  EnemyPreset,
  EnemyPresetMaster,
  LandingBand,
  LandingPoint,
  TargetProfile,
  TargetRateTable,
  WeaponType,
} from './types.ts';

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
  const targetProfile = v.targetProfile;
  if (targetProfile !== undefined && (typeof targetProfile !== 'string' || targetProfile === '')) {
    throw new TypeError(`${path}.targetProfile: must be a non-empty string`);
  }
  const preset: EnemyPreset = {
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
  if (targetProfile !== undefined) preset.targetProfile = targetProfile;
  return preset;
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
  const set: EnemyEventSet = {
    id: v.id,
    name: { ja: name.ja, en: name.en },
    events: v.events.map((e, i) => parseEventSpec(e, `${path}.events[${i}]`)),
    source: v.source,
  };
  if (v.landings !== undefined) {
    const landings = v.landings;
    if (
      !Array.isArray(landings) ||
      landings.length === 0 ||
      !landings.every((id) => typeof id === 'string' && id !== '')
    ) {
      throw new TypeError(`${path}.landings: must be a non-empty array of ids`);
    }
    set.landings = landings as string[];
  }
  return set;
}

export const LANDING_BANDS = ['near', 'midNear', 'midFar', 'far'] as const satisfies readonly LandingBand[];

export const LANDING_BAND_LABEL: Record<LandingBand, { ja: string; en: string }> = {
  near: { ja: '近', en: 'Near' },
  midNear: { ja: '中近', en: 'Mid-near' },
  midFar: { ja: '中遠', en: 'Mid-far' },
  far: { ja: '遠', en: 'Far' },
};

const WEAPON_TYPES = ['AR', 'SMG', 'SR', 'RL', 'SG', 'MG'] as const satisfies readonly WeaponType[];

/** 表の値 0..1 */
function isRate(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

function parseLanding(v: unknown, path: string): LandingPoint {
  if (!isRecord(v)) throw new TypeError(`${path}: must be an object`);
  if (typeof v.id !== 'string' || v.id === '') throw new TypeError(`${path}.id: must be a non-empty string`);
  if (!(LANDING_BANDS as readonly unknown[]).includes(v.band)) {
    throw new TypeError(`${path}.band: unknown ${String(v.band)}`);
  }
  const range: unknown = v.range;
  if (
    !Array.isArray(range) ||
    range.length !== 2 ||
    !range.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0) ||
    range[0] >= range[1]
  ) {
    throw new TypeError(`${path}.range: must be [min, max] (m, min < max)`);
  }
  return { id: v.id, band: v.band as LandingBand, range: [range[0] as number, range[1] as number] };
}

/** 表のキー（着地点の id・帯・all）と値（0..1 か、行ごと null）を確かめる */
function parseRateTable(v: unknown, path: string, keys: ReadonlySet<string>): TargetRateTable {
  if (!isRecord(v)) throw new TypeError(`${path}: must be an object`);
  const table: TargetRateTable = {};
  for (const [weapon, row] of Object.entries(v)) {
    if (!(WEAPON_TYPES as readonly string[]).includes(weapon)) {
      throw new TypeError(`${path}.${weapon}: unknown weapon type`);
    }
    if (row === null) {
      table[weapon as WeaponType] = null;
      continue;
    }
    if (!isRecord(row) || Object.keys(row).length === 0) {
      throw new TypeError(`${path}.${weapon}: must be a non-empty object or null`);
    }
    for (const [key, value] of Object.entries(row)) {
      if (!keys.has(key)) throw new TypeError(`${path}.${weapon}.${key}: not a landing, band or all`);
      if (!isRate(value)) throw new TypeError(`${path}.${weapon}.${key}: must be in [0, 1]`);
    }
    table[weapon as WeaponType] = { ...(row as Record<string, number>) };
  }
  return table;
}

/** 配分の重みの和の許容誤差 */
const MIX_WEIGHT_EPSILON = 1e-9;

function parseMixes(v: unknown, path: string, landingIds: ReadonlySet<string>): Record<string, [string, number][]> {
  if (!isRecord(v)) throw new TypeError(`${path}: must be an object`);
  const mixes: Record<string, [string, number][]> = {};
  for (const [id, parts] of Object.entries(v)) {
    const at = `${path}.${id}`;
    if (landingIds.has(id)) throw new TypeError(`${at}: the id is also a landing id`);
    if (!Array.isArray(parts) || parts.length === 0) throw new TypeError(`${at}: must be a non-empty array`);
    const list = parts.map((p: unknown, i): [string, number] => {
      if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'string' || !landingIds.has(p[0]) || !positive(p[1])) {
        throw new TypeError(`${at}[${i}]: must be [landing id, positive weight]`);
      }
      return [p[0], p[1]];
    });
    const sum = list.reduce((a, [, w]) => a + w, 0);
    if (Math.abs(sum - 1) > MIX_WEIGHT_EPSILON) throw new TypeError(`${at}: weights must sum to 1, got ${sum}`);
    mixes[id] = list;
  }
  return mixes;
}

function parseTargetProfile(v: unknown, path: string): TargetProfile {
  if (!isRecord(v)) throw new TypeError(`${path}: must be an object`);
  const name = v.name;
  if (typeof v.id !== 'string' || v.id === '') throw new TypeError(`${path}.id: must be a non-empty string`);
  if (!isRecord(name) || typeof name.ja !== 'string' || typeof name.en !== 'string') {
    throw new TypeError(`${path}.name: must be { ja, en }`);
  }
  if (!Array.isArray(v.landings) || v.landings.length === 0) {
    throw new TypeError(`${path}.landings: must be a non-empty array`);
  }
  const landings = v.landings.map((x, i) => parseLanding(x, `${path}.landings[${i}]`));
  const landingIds = new Set<string>();
  for (const l of landings) {
    if (landingIds.has(l.id)) throw new TypeError(`${path}: duplicate landing id ${l.id}`);
    landingIds.add(l.id);
  }
  const mixes = parseMixes(v.mixes ?? {}, `${path}.mixes`, landingIds);
  const initialLanding = v.initialLanding;
  if (typeof initialLanding !== 'string' || !(landingIds.has(initialLanding) || initialLanding in mixes)) {
    throw new TypeError(`${path}.initialLanding: must be a landing or mix id`);
  }
  if (typeof v.source !== 'string' || v.source === '') {
    throw new TypeError(`${path}.source: must be a non-empty string`);
  }
  const keys = new Set<string>([...landingIds, ...LANDING_BANDS, 'all']);
  return {
    id: v.id,
    name: { ja: name.ja, en: name.en },
    initialLanding,
    landings,
    mixes,
    coreHitRate: parseRateTable(v.coreHitRate, `${path}.coreHitRate`, keys),
    bulletHitRate: parseRateTable(v.bulletHitRate, `${path}.bulletHitRate`, keys),
    source: v.source,
  };
}

/** Stage 18-C: 着地点か配分の id が、その表にあるか */
export function isLandingOf(profile: Pick<TargetProfile, 'landings' | 'mixes'>, id: string): boolean {
  return profile.landings.some((l) => l.id === id) || id in profile.mixes;
}

/** data/enemies.json を検証する。形が合わない・id の重複は TypeError */
export function parseEnemyPresets(raw: unknown): EnemyPresetMaster {
  if (!isRecord(raw) || raw.formatVersion !== 1) throw new TypeError('enemies: formatVersion must be 1');
  if (typeof raw.source !== 'string') throw new TypeError('enemies.source: must be a string');
  if (!Array.isArray(raw.enemies)) throw new TypeError('enemies.enemies: must be an array');
  const rawSets = raw.eventSets ?? [];
  if (!Array.isArray(rawSets)) throw new TypeError('enemies.eventSets: must be an array');
  const eventSets = rawSets.map((e, i) => parseEventSet(e, `eventSets[${i}]`));
  const rawProfiles = raw.targetProfiles ?? [];
  if (!Array.isArray(rawProfiles)) throw new TypeError('enemies.targetProfiles: must be an array');
  const targetProfiles = rawProfiles.map((p, i) => parseTargetProfile(p, `targetProfiles[${i}]`));
  const profileIds = new Set<string>();
  for (const p of targetProfiles) {
    if (profileIds.has(p.id)) throw new TypeError(`enemies: duplicate target profile id ${p.id}`);
    profileIds.add(p.id);
  }
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
    if (e.targetProfile === undefined) continue;
    const profile = targetProfiles.find((p) => p.id === e.targetProfile);
    if (profile === undefined) {
      throw new TypeError(`enemies: ${e.id} refers to unknown target profile ${e.targetProfile}`);
    }
    // 出来事のセットの着地点は、その敵の表にあるものだけ
    for (const set of eventSets.filter((s) => e.eventSets.includes(s.id))) {
      for (const id of set.landings ?? []) {
        if (!isLandingOf(profile, id)) {
          throw new TypeError(`enemies: event set ${set.id} lands on ${id}, which ${profile.id} does not have`);
        }
      }
    }
  }
  return { formatVersion: 1, source: raw.source, eventSets, targetProfiles, enemies };
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

/**
 * Stage 18-C: 着地点の時間割り（秒。plan/design-stage18.md 12.2・12.3 節）。選んだ出来事のセットのうち、着地点の並び（landings）を
 * 持つ最初のものについて、その狙えない窓（untargetable）の終わり = 着地で区間を切り、k 番目の区間に並びの k 番目を当てる
 * （1 つ目は最初の窓より前 = 初期位置。窓の間は誰も撃たないので、窓はその前の区間に入れる）。並びより区間が多ければ、残りは null
 * （着地点が未測定）。並びを持つセットを選んでいなければ、戦闘時間全体を初期位置にする。
 * fixed は配分の id → 着地点の id（中遠を 1 か所に固定する。録画と比べるとき用）
 */
export function enemyLandingsOf(
  master: Pick<EnemyPresetMaster, 'eventSets'>,
  setIds: readonly string[],
  durationSeconds: number,
  profile: Pick<TargetProfile, 'initialLanding' | 'landings' | 'mixes'>,
  fixed: Readonly<Record<string, string>> = {},
): LandingSpan[] {
  for (const [id, to] of Object.entries(fixed)) {
    if (!profile.mixes[id]?.some(([landing]) => landing === to)) {
      throw new RangeError(`landing ${to} is not part of mix ${id}`);
    }
  }
  const resolve = (id: string | null): string | null => (id === null ? null : (fixed[id] ?? id));
  if (durationSeconds <= 0) return [];
  const set = master.eventSets.find((s) => setIds.includes(s.id) && s.landings !== undefined);
  if (set === undefined) return [{ start: 0, end: durationSeconds, landing: resolve(profile.initialLanding) }];
  const order = set.landings!;
  const cuts = expandEnemyEvents(
    set.events.filter((e) => e.kind === 'untargetable'),
    durationSeconds,
  ).map((e) => e.end);
  const spans: LandingSpan[] = [];
  let start = 0;
  for (const [k, end] of [...cuts, durationSeconds].entries()) {
    if (end <= start) continue;
    spans.push({ start, end, landing: resolve(order[k] ?? null) });
    start = end;
  }
  return spans;
}

/** Stage 18-C: プリセットの的の条件の表（無ければ undefined） */
export function targetProfileOf(
  master: Pick<EnemyPresetMaster, 'targetProfiles'>,
  preset: Pick<EnemyPreset, 'targetProfile'>,
): TargetProfile | undefined {
  if (preset.targetProfile === undefined) return undefined;
  return master.targetProfiles.find((p) => p.id === preset.targetProfile);
}

/**
 * Stage 18-C2: 敵の値（EnemyInput）から的の条件の表を引く（plan/design-stage18.md 12.9 節の 5）。
 * 値がプリセットと一致すればそのプリセットの表。一致しなくても、属性だけを外した射撃場の的（属性なし・防御力とコアの有無が
 * 射撃場のプリセットと同じ。画面の既定の敵）なら、射撃場のプリセットの表。それ以外（ボス・手入力の敵）は undefined
 */
export function targetProfileForEnemy(
  master: Pick<EnemyPresetMaster, 'enemies' | 'targetProfiles'>,
  enemy: EnemyInput,
): TargetProfile | undefined {
  const preset = matchingEnemyPreset(master.enemies, enemy);
  if (preset !== undefined) return targetProfileOf(master, preset);
  if (enemy.element !== null) return undefined;
  const range = master.enemies.find(
    (p) =>
      p.content === 'range' &&
      p.targetProfile !== undefined &&
      p.defence === enemy.defence &&
      p.hasCore === enemy.hasCore,
  );
  return range === undefined ? undefined : targetProfileOf(master, range);
}

/** プリセットの計算の入力 */
export function enemyInputOf(preset: EnemyPreset): EnemyInput {
  return { defence: preset.defence, element: preset.element, hasCore: preset.hasCore };
}

/** 入力と同じ値のプリセット（calc の選択欄の表示用。上書きして一致しなければ undefined = カスタム） */
export function matchingEnemyPreset(presets: readonly EnemyPreset[], enemy: EnemyInput): EnemyPreset | undefined {
  return presets.find((p) => p.defence === enemy.defence && p.element === enemy.element && p.hasCore === enemy.hasCore);
}
