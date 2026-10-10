// Stage 19: records/ と packages/core/data を Node で読む（records-table.ts・records-check.ts・テストで共有）。
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnemyPresets } from '../src/enemies.ts';
import { MASTER_FILES } from '../src/load.ts';
import { toClaims, type Claim, type ClaimFile } from '../src/records/claims.ts';
import type { Observation, RecordsData } from '../src/records/observations.ts';
import { sortRecordings, type RecordingEntry, type RecordingsFile } from '../src/records/recordings.ts';
import type { SensitivityEntry } from '../src/records/relevance.ts';
import type { DefinedCharacter } from '../src/records/skills.ts';
import type { PredictionFile } from '../src/records/predictions.ts';
import { idsInPaths } from '../src/records/drafts.ts';
import { parseVerification, sortVerifications, type Verification } from '../src/records/verifications.ts';
import { parseSkillDefinition, parseSkillIndex, type SkillDefinition } from '../src/skills/types.ts';
import type { BuildMasters, CharacterData } from '../src/types.ts';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DATA = `${ROOT}packages/core/data/`;
const OBSERVATIONS_DIR = `${ROOT}records/observations/`;
const CLAIMS_DIR = `${ROOT}records/claims/`;
const RECORDINGS_DIR = `${ROOT}records/recordings/`;
/** 録画の一覧（生成物。Stage 20-C） */
export const RECORDINGS_DOC_PATH = `${ROOT}plan/captures/recordings.md`;
export const RESIDUALS_PATH = `${ROOT}plan/residuals.md`;
/** 結論の一覧（生成物。Stage 20-B） */
export const CLAIMS_PATH = `${ROOT}plan/claims.md`;
const VERIFICATIONS_DIR = `${ROOT}records/verifications/`;
/** 予測ファイル（plan/design-records-automation.md 3.2 節） */
export const PREDICTIONS_DIR = `${ROOT}records/predictions/`;
/** 検証記録の一覧（生成物。Stage 20-D） */
export const VERIFICATIONS_PATH = `${ROOT}plan/verifications.md`;
/** スキル定義の対応状況の一覧（生成物。plan/skills-guide.md 3 節） */
export const SKILLS_DOC_PATH = `${ROOT}plan/skills.md`;
/** 最小構成の検査の一覧（生成物。plan/design-minimal-relevance.md 5 節） */
export const MINIMAL_PATH = `${ROOT}plan/minimal.md`;
/** 最小構成の検査の感度の結果（records:minimal が書く。plan/design-minimal-relevance.md 10.6 節） */
export const SENSITIVITY_PATH = `${ROOT}records/minimal/sensitivity.json`;

/** 検証記録のファイルの絶対パス */
export function verificationPath(v: Pick<Verification, 'file'>): string {
  return `${VERIFICATIONS_DIR}${v.file}`;
}

/** records/verifications/ の V- で始まる .md（ファイル名の形が違っても読み、問題として返す）。Stage 20-D */
export function loadVerifications(): Verification[] {
  return sortVerifications(
    readdirSync(VERIFICATIONS_DIR)
      .filter((name) => name.startsWith('V-') && name.endsWith('.md'))
      .map((name) => parseVerification(name, readFileSync(`${VERIFICATIONS_DIR}${name}`, 'utf8'))),
  );
}

/**
 * 手元のブランチと origin のブランチ（main と自分のブランチを含む）の歴史について git log を回す。origin を取り込み直してから見る
 * （取り込めなければ手元の参照で見る）。git が使えなければ out は空で、note に理由。main の歴史も見るのは、main より古いブランチでも、
 * main が後から足した番号を避けるため（plan/design-investigation-review.md 4.3 節）
 */
function logBranches(args: readonly string[], paths: readonly string[]): { out: string; note: string } {
  const git = (a: string[]): string =>
    execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] });
  let note = '';
  try {
    git(['fetch', '--quiet', '--prune', 'origin']);
  } catch {
    note = 'origin を取り込めなかったので、手元の参照で見た。';
  }
  try {
    return { out: git(['log', ...args, 'HEAD', '--branches', '--remotes=origin', '--', ...paths]), note };
  } catch (e) {
    return { out: '', note: `${note}ブランチの歴史を見られなかった（${(e as Error).message.split('\n')[0]}）` };
  }
}

/**
 * どれかのブランチ（手元か origin。main を含む）が足したことのある検証記録・結論の ID と、見た範囲の説明。並行する作業が同じ空き番号を
 * 取らないように、records:new の空き番号に含める（V-0378 の振り直し）
 */
export function idsInBranches(): { ids: string[]; note: string } {
  const { out, note } = logBranches(
    ['--format=', '--name-only', '--diff-filter=AR'],
    ['records/verifications', 'records/claims'],
  );
  return { ids: idsInPaths(out), note };
}

/**
 * どれかのブランチが records/observations/<録画>.json に足したことのある観測値の ID（read.ts の空き番号から除く。V-0394・V-0395 で
 * 手で避けた分。plan/design-investigation-review.md 4.3 節）
 */
export function observationIdsInBranches(recording: string): { ids: string[]; note: string } {
  const { out, note } = logBranches(['--format=', '-p'], [`records/observations/${recording}.json`]);
  const escaped = recording.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\+\\s*"id": "(${escaped}-\\d{2,})"`, 'gm');
  return { ids: [...new Set([...out.matchAll(re)].map((m) => m[1]!))], note };
}

/** どれかのブランチが足したことのある録画の id（records/recordings/<id>.json。intake.ts の --id の確かめ） */
export function recordingIdsInBranches(): { ids: string[]; note: string } {
  const { out, note } = logBranches(['--format=', '--name-only', '--diff-filter=AR'], ['records/recordings']);
  const ids = out
    .split('\n')
    .map((l) => /(?:^|\/)records\/recordings\/([^/]+)\.json$/.exec(l.trim())?.[1])
    .filter((x): x is string => x !== undefined);
  return { ids: [...new Set(ids)], note };
}

/** records/predictions/V-NNNN.json（番号順）。無ければ空 */
export function loadPredictions(): PredictionFile[] {
  if (!existsSync(PREDICTIONS_DIR)) return [];
  return readdirSync(PREDICTIONS_DIR)
    .filter((name) => /^V-\d{4,}\.json$/.test(name))
    .sort()
    .map((name) => readJson<PredictionFile>(`${PREDICTIONS_DIR}${name}`));
}

/** ファイル名（拡張子なし）と、中の verification が一致しないもの */
export function misplacedPredictions(): string[] {
  if (!existsSync(PREDICTIONS_DIR)) return [];
  return readdirSync(PREDICTIONS_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({ name, id: readJson<PredictionFile>(`${PREDICTIONS_DIR}${name}`).verification }))
    .filter(({ name, id }) => `${id}.json` !== name)
    .map(({ name, id }) => `予測 ${id}: ${name} に置かれている`);
}

/** 参照の検査の対象: plan/ と records/ の下の .md と、AGENTS.md（リポジトリの根からの相対パス）。Stage 20-D */
export function documentPaths(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(`${ROOT}${dir}`, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}${e.name}/`) : e.name.endsWith('.md') ? [`${dir}${e.name}`] : [],
    );
  return [...walk('plan/'), ...walk('records/'), 'AGENTS.md'];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function recordingFileNames(): string[] {
  return readdirSync(RECORDINGS_DIR).filter((name) => name.endsWith('.json'));
}

/** records/recordings/*.json（このリポジトリの録画は番号順、その後に旧の録画）。Stage 20-C から 1 本 1 ファイル */
export function loadRecordingsFile(): RecordingsFile {
  return {
    recordings: sortRecordings(
      recordingFileNames().map((name) => readJson<RecordingEntry>(`${RECORDINGS_DIR}${name}`)),
    ),
  };
}

/** ファイル名（拡張子なし）と、中の録画の id が一致しないもの */
export function misplacedRecordings(): string[] {
  return recordingFileNames()
    .map((name) => ({ name, id: readJson<RecordingEntry>(`${RECORDINGS_DIR}${name}`).id }))
    .filter(({ name, id }) => `${id}.json` !== name)
    .map(({ name, id }) => `${id}: ${name} に置かれている`);
}

export function recordingMap(file: RecordingsFile): Map<string, RecordingEntry> {
  return new Map(file.recordings.map((r) => [r.id, r]));
}

/** records/observations/*.json（ファイル名の順、ファイルの中は書いた順） */
export function loadObservations(): Observation[] {
  return readdirSync(OBSERVATIONS_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .flatMap((name) => readJson<Observation[]>(`${OBSERVATIONS_DIR}${name}`));
}

/** ファイル名（拡張子なし）と、中の観測値の recording が一致しないもの */
export function misplacedObservations(): string[] {
  return readdirSync(OBSERVATIONS_DIR)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) =>
      readJson<Observation[]>(`${OBSERVATIONS_DIR}${name}`)
        .filter((o) => `${o.recording}.json` !== name)
        .map((o) => `${o.id}: ${name} に置かれている`),
    );
}

export function knownRids(): Set<number> {
  return new Set(
    readdirSync(`${DATA}characters`)
      .filter((name) => /^\d+\.json$/.test(name))
      .map((name) => Number(name.replace('.json', ''))),
  );
}

/** 録画（と予測の編成）に出てくるキャラと、その定義・敵のプリセット */
export function loadRecordsData(file: RecordingsFile, extraRids: readonly number[] = []): RecordsData {
  const known = knownRids();
  const defined = new Set(parseSkillIndex(readJson<unknown>(`${DATA}skills/index.json`)).resourceIds);
  const characters = new Map<number, CharacterData>();
  const skills = new Map<number, SkillDefinition>();
  const rids = [...file.recordings.flatMap((entry) => entry.team.map((m) => m.rid)), ...extraRids];
  for (const rid of rids) {
    if (!known.has(rid) || characters.has(rid)) continue;
    characters.set(rid, readJson<CharacterData>(`${DATA}characters/${rid}.json`));
    if (defined.has(rid)) skills.set(rid, parseSkillDefinition(readJson<unknown>(`${DATA}skills/${rid}.json`)));
  }
  return {
    characters,
    skills,
    enemies: parseEnemyPresets(readJson<unknown>(`${DATA}enemies.json`)),
    observationValues: new Map(loadObservations().map((o) => [o.id, o.value])),
    buildMasters: Object.fromEntries(
      Object.entries(MASTER_FILES).map(([name, file]) => [name, readJson<unknown>(`${DATA}masters/${file}`)]),
    ) as BuildMasters,
  };
}

/** data/skills/index.json に載った定義と、キャラの名前（index.json の順） */
export function loadSkillDefinitions(): DefinedCharacter[] {
  return parseSkillIndex(readJson<unknown>(`${DATA}skills/index.json`)).resourceIds.map((rid) => ({
    definition: parseSkillDefinition(readJson<unknown>(`${DATA}skills/${rid}.json`)),
    name: readJson<CharacterData>(`${DATA}characters/${rid}.json`).name,
  }));
}

function claimFileNames(): string[] {
  return readdirSync(CLAIMS_DIR).filter((name) => name.endsWith('.json'));
}

/** records/claims/*.json（番号順）。Stage 20-B から 1 件 1 ファイル */
export function loadClaims(): Claim[] {
  return toClaims(claimFileNames().map((name) => readJson<ClaimFile>(`${CLAIMS_DIR}${name}`)));
}

/** ファイル名（拡張子なし）と、中の結論の id が一致しないもの */
export function misplacedClaims(): string[] {
  return claimFileNames()
    .map((name) => ({ name, id: readJson<ClaimFile>(`${CLAIMS_DIR}${name}`).id }))
    .filter(({ name, id }) => `${id}.json` !== name)
    .map(({ name, id }) => `${id}: ${name} に置かれている`);
}

/** 感度の結果のファイル（plan/design-minimal-relevance.md 10.6 節） */
export type SensitivityFile = { version: number; entries: SensitivityEntry[] };

/** 感度の結果（観測値 ID|要素の名前 → 結果）。ファイルが無ければ空 */
export function loadSensitivity(): Map<string, SensitivityEntry> {
  if (!existsSync(SENSITIVITY_PATH)) return new Map();
  const file = readJson<SensitivityFile>(SENSITIVITY_PATH);
  return new Map(file.entries.map((e) => [`${e.observation}|${e.element}`, e]));
}
