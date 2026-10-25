// 録画の台帳と観測値のファイルの読み書き（read.ts と result-screen.ts が使う）。
// - 録画の実体は records/recordings/<録画 id>.json から引く（このリポジトリの録画は置き場所の <folder>/<file>、旧の録画は path）。
// - 観測値の id は次の空き番号。どれかのブランチ（手元か origin。main を含む）がこの録画に足したことのある番号を避ける
//   （並行する読み取りが同じ番号を取らない。plan/design-investigation-review.md 4.3 節）。
// - 同じ道具・同じ kind・同じ説明の観測値が既にあれば、同じ値なら足さず、違えば差を出して止まる（人が invalid を付けるか、版を上げる）。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { observationIdsInBranches } from '../../packages/core/scripts/records-data.ts';
import type { Observation } from '../../packages/core/src/records/observations.ts';
import { isLegacy, type RecordingEntry } from '../../packages/core/src/records/recordings.ts';
import { capturesDir, legacyVideoPath } from './dirs.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RECORDINGS_DIR = `${ROOT}records/recordings/`;
const OBSERVATIONS_DIR = `${ROOT}records/observations/`;

/** 観測値の下書き（id・recording・source・readAt は書く側が埋める） */
export type DraftObservation = Omit<Observation, 'id' | 'recording' | 'source' | 'readAt'>;

export function loadRecording(recordingId: string): RecordingEntry {
  const path = `${RECORDINGS_DIR}${recordingId}.json`;
  if (!existsSync(path)) throw new Error(`records/recordings/${recordingId}.json が無い`);
  return JSON.parse(readFileSync(path, 'utf8')) as RecordingEntry;
}

export function videoOf(entry: RecordingEntry): string {
  return isLegacy(entry) ? legacyVideoPath(entry.path) : join(capturesDir(), entry.folder, entry.file);
}

/** 録画の実体のパス。無ければ止まる */
export function existingVideoOf(entry: RecordingEntry): string {
  const video = videoOf(entry);
  if (!existsSync(video))
    throw new Error(`録画の実体が無い: ${video}（クラウド環境では tools/captures/fetch.ts で取り寄せる）`);
  return video;
}

export function loadObservations(recordingId: string): Observation[] {
  const path = `${OBSERVATIONS_DIR}${recordingId}.json`;
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Observation[]) : [];
}

function nextId(recordingId: string, existing: readonly Observation[], taken: ReadonlySet<string>): string {
  const used = new Set([...existing.map((o) => o.id), ...taken]);
  for (let n = 1; ; n++) {
    const candidate = `${recordingId}-${String(n).padStart(2, '0')}`;
    if (!used.has(candidate)) return candidate;
  }
}

function sameValue(a: number | number[], b: number | number[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 下書きに id・recording・source・readAt を付ける。既にある同じ道具の値は足さない（違えば process.exitCode = 2）。
 * tool は既存の観測値の method.tool と比べる名前
 */
export function prepareObservations(
  recordingId: string,
  produced: readonly DraftObservation[],
  opts: { tool: string; source: string; readAt: string },
): { existing: Observation[]; finished: Observation[] } {
  const existing = loadObservations(recordingId);
  const branches = observationIdsInBranches(recordingId);
  if (branches.note !== '') console.error(`注意: ${branches.note}`);
  const taken = new Set(branches.ids);
  const finished: Observation[] = [];
  for (const p of produced) {
    const prior = existing.find(
      (o) => o.method?.tool === opts.tool && o.kind === p.kind && o.description === p.description,
    );
    if (prior) {
      if (sameValue(prior.value, p.value)) {
        console.error(`${prior.id}: 同じ道具の同じ値がある（足さない）`);
        continue;
      }
      console.error(
        `${prior.id}: 同じ道具の値が違う。前 ${JSON.stringify(prior.value)} → 今 ${JSON.stringify(p.value)}`,
      );
      process.exitCode = 2;
      continue;
    }
    finished.push({
      id: nextId(recordingId, [...existing, ...finished], taken),
      recording: recordingId,
      ...p,
      source: opts.source,
      readAt: opts.readAt,
    } as Observation);
  }
  const ownFirst = nextId(recordingId, existing, new Set());
  if (finished.length > 0 && finished[0]!.id !== ownFirst)
    console.error(`${ownFirst} はほかのブランチ（か main）が使ったので、${finished[0]!.id} から振った`);
  return { existing, finished };
}

/** records/observations/<録画 id>.json に足して prettier で整える */
export function writeObservations(
  recordingId: string,
  existing: readonly Observation[],
  finished: readonly Observation[],
): void {
  if (finished.length === 0) return;
  const path = `${OBSERVATIONS_DIR}${recordingId}.json`;
  writeFileSync(path, `${JSON.stringify([...existing, ...finished], null, 2)}\n`);
  spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prettier', '--write', path], { stdio: 'inherit' });
  console.error(`${path} に ${finished.length} 件を足した（${finished.map((o) => o.id).join('・')}）`);
}
