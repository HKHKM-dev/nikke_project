// Stage 19: records/ と packages/core/data を Node で読む（records-table.ts・records-check.ts・テストで共有）。
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnemyPresets } from '../src/enemies.ts';
import { toClaims, type Claim, type ClaimFile } from '../src/records/claims.ts';
import type { Observation, RecordsData } from '../src/records/observations.ts';
import type { RecordingEntry, RecordingsFile } from '../src/records/recordings.ts';
import { parseSkillDefinition, parseSkillIndex, type SkillDefinition } from '../src/skills/types.ts';
import type { CharacterData } from '../src/types.ts';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DATA = `${ROOT}packages/core/data/`;
const OBSERVATIONS_DIR = `${ROOT}records/observations/`;
const CLAIMS_DIR = `${ROOT}records/claims/`;
export const LEDGER_PATH = `${ROOT}plan/captures/index.md`;
export const RESIDUALS_PATH = `${ROOT}plan/residuals.md`;
/** 結論の一覧（生成物。Stage 20-B） */
export const CLAIMS_PATH = `${ROOT}plan/claims.md`;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function loadRecordingsFile(): RecordingsFile {
  return readJson<RecordingsFile>(`${ROOT}records/recordings.json`);
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

/** 録画に出てくるキャラと、その定義・敵のプリセット */
export function loadRecordsData(file: RecordingsFile): RecordsData {
  const known = knownRids();
  const defined = new Set(parseSkillIndex(readJson<unknown>(`${DATA}skills/index.json`)).resourceIds);
  const characters = new Map<number, CharacterData>();
  const skills = new Map<number, SkillDefinition>();
  for (const entry of file.recordings) {
    for (const { rid } of entry.team) {
      if (!known.has(rid) || characters.has(rid)) continue;
      characters.set(rid, readJson<CharacterData>(`${DATA}characters/${rid}.json`));
      if (defined.has(rid)) skills.set(rid, parseSkillDefinition(readJson<unknown>(`${DATA}skills/${rid}.json`)));
    }
  }
  return { characters, skills, enemies: parseEnemyPresets(readJson<unknown>(`${DATA}enemies.json`)) };
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
