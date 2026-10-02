// 録画の置き場所（plan/captures/index.md「置き場所」「クラウド環境での取り寄せ」）。
// 環境変数があればそれ。無ければ Windows（オーナーの手元）は E:、それ以外（クラウド環境）はホームの下にする。
// リポジトリの中には置かない（録画は公開しない）。
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

/** 台帳の L- の録画の path の頭（オーナーの手元の置き場所。この下が legacyDir() と Drive の old_nikkecalc の下と同じ構成） */
export const LEGACY_PREFIX = 'E:/old_nikkecalc/';

/** 台帳の L- の録画の path を、この環境の legacyDir() の下に読み替える */
export function legacyVideoPath(ledgerPath: string): string {
  if (!ledgerPath.startsWith(LEGACY_PREFIX)) throw new Error(`path が ${LEGACY_PREFIX} の下にない（${ledgerPath}）`);
  return join(legacyDir(), ledgerPath.slice(LEGACY_PREFIX.length));
}
