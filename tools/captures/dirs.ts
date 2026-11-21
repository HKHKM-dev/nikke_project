// 録画の置き場所（plan/captures/storage.md「置き場所」「クラウド環境での取り寄せ」）。
// 環境変数があればそれ。無ければ Windows（オーナーの手元）は E:、それ以外（クラウド環境）はホームの下にする。
// リポジトリの中には置かない（録画は公開しない）。
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function dir(envName: string, name: string): string {
  const fromEnv = process.env[envName];
  if (fromEnv) return fromEnv;
  return process.platform === 'win32' ? `E:/${name}` : join(homedir(), name);
}

/** このプロジェクトが採用した録画（NIKKE_CAPTURES_DIR） */
export function capturesDir(): string {
  return dir('NIKKE_CAPTURES_DIR', 'nikke_project_captures');
}

/** 旧プロジェクトのアーカイブ（NIKKE_LEGACY_DIR）。台帳の L- の録画の path はこの下 */
export function legacyDir(): string {
  return dir('NIKKE_LEGACY_DIR', 'old_nikkecalc');
}

/**
 * 撮った録画の取り込み元（NIKKE_RECORD_DIR。plan/captures/storage.md「置き場所」）。無ければ Windows（オーナーの手元）は F:/record、
 * それ以外（クラウド環境）は null。Drive for desktop が「マイ コンピュータ/record」として同期している
 * （plan/design-cloud-environment.md 2.9 節）。capturesDir() と Drive の同期は tools/drive/sync.ts
 */
export function recordDir(): string | null {
  const fromEnv = process.env['NIKKE_RECORD_DIR'];
  if (fromEnv) return fromEnv;
  return process.platform === 'win32' ? 'F:/record' : null;
}

/** 取り込む前の録画を下見のために落とす先（NIKKE_RECORD_FETCH_DIR。fetch.ts の drive:）。recordDir() の無い環境で使う */
export function recordFetchDir(): string {
  return dir('NIKKE_RECORD_FETCH_DIR', 'record');
}

/**
 * 下見で落とした取り込み前の録画（recordFetchDir() の下の rel）が、Drive の大きさ size（バイト）と同じならそのパス。
 * 無い・大きさが違う・Drive の大きさが分からないときは null（Drive for desktop が上げ終える前に落とした途中の版を使わない）
 */
export function fetchedRecord(rel: string, size: string | undefined): string | null {
  if (size === undefined) return null;
  const path = join(recordFetchDir(), rel);
  const stat = statSync(path, { throwIfNoEntry: false });
  return stat?.isFile() && stat.size === Number(size) ? path : null;
}

/** drive:<record の中の相対パス>（intake.ts・fetch.ts の指し方）なら相対パス（\ は / に、前後の / は外す）、違えば null */
export function driveRecordPath(arg: string): string | null {
  return arg.startsWith('drive:') ? relPath(arg.slice('drive:'.length)) : null;
}

/** 相対パスの書き方をそろえる（\ は / に、前後の / は外す） */
export const relPath = (arg: string): string => arg.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

/** 台帳の L- の録画の path の頭（オーナーの手元の置き場所。この下が legacyDir() と Drive の old_nikkecalc の下と同じ構成） */
export const LEGACY_PREFIX = 'E:/old_nikkecalc/';

/** 台帳の L- の録画の path を、この環境の legacyDir() の下に読み替える */
export function legacyVideoPath(ledgerPath: string): string {
  if (!ledgerPath.startsWith(LEGACY_PREFIX)) throw new Error(`path が ${LEGACY_PREFIX} の下にない（${ledgerPath}）`);
  return join(legacyDir(), ledgerPath.slice(LEGACY_PREFIX.length));
}
