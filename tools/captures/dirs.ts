// 録画の置き場所（plan/captures/index.md「置き場所」「クラウド環境での取り寄せ」）。
// 環境変数 NIKKE_CAPTURES_DIR があればそれ。無ければ Windows（オーナーの手元）は E:、それ以外（クラウド環境）は
// ホームの下にする。リポジトリの中には置かない（録画は公開しない）。
import { homedir } from 'node:os';
import { join } from 'node:path';

export function capturesDir(): string {
  const fromEnv = process.env.NIKKE_CAPTURES_DIR;
  if (fromEnv) return fromEnv;
  return process.platform === 'win32' ? 'E:/nikke_project_captures' : join(homedir(), 'nikke_project_captures');
}
