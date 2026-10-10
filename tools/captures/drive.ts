// Google Drive API（v3）の薄いラッパ。fetch.ts が使う。依存パッケージは足さず、Node の fetch と crypto だけで書く。
// 認証はサービスアカウント（読み取り専用のスコープ）。鍵は環境変数 NIKKE_DRIVE_SA_KEY に、鍵の JSON をそのままか
// base64 にして入れる（plan/captures/storage.md「クラウド環境での取り寄せ」）。鍵とアクセストークンは出力しない。
import { createSign } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const API = 'https://www.googleapis.com/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

type ServiceAccountKey = { client_email: string; private_key: string; token_uri?: string };

export type DriveFile = { id: string; name: string; mimeType: string; size?: string };

function loadKey(): ServiceAccountKey {
  const raw = process.env.NIKKE_DRIVE_SA_KEY?.trim();
  if (!raw) throw new Error('環境変数 NIKKE_DRIVE_SA_KEY（サービスアカウントの鍵）がありません');
  const text = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  let key: Partial<ServiceAccountKey>;
  try {
    key = JSON.parse(text) as Partial<ServiceAccountKey>;
  } catch {
    throw new Error('NIKKE_DRIVE_SA_KEY を JSON として読めません（鍵の JSON そのものか、その base64 を入れる）');
  }
  if (!key.client_email || !key.private_key) {
    throw new Error(
      'NIKKE_DRIVE_SA_KEY に client_email か private_key がありません（サービスアカウントの鍵か確かめる）',
    );
  }
  return { client_email: key.client_email, private_key: key.private_key, token_uri: key.token_uri };
}

const base64url = (data: Buffer | string) => Buffer.from(data).toString('base64url');

async function accessToken(): Promise<string> {
  const key = loadKey();
  const tokenUri = key.token_uri ?? 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600 }),
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(key.private_key);
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${base64url(signature)}`,
    }),
  });
  if (!res.ok) throw new Error(`アクセストークンを取れません（${res.status}）: ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Drive の検索式の文字列リテラル（\ と ' をエスケープする） */
export function driveQueryString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export class Drive {
  // node の型の除去だけで動かすので、パラメータプロパティは使わない。
  private readonly token: string;

  private constructor(token: string) {
    this.token = token;
  }

  static async connect(): Promise<Drive> {
    return new Drive(await accessToken());
  }

  private async get(path: string, params: Record<string, string>): Promise<Response> {
    const url = `${API}${path}?${new URLSearchParams({ supportsAllDrives: 'true', ...params })}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${this.token}` } });
    if (!res.ok) throw new Error(`Drive API ${path} が失敗（${res.status}）: ${await res.text()}`);
    return res;
  }

  /** フォルダの直下（ゴミ箱は除く）。name を渡すとその名前のものだけ */
  async children(folderId: string, name?: string): Promise<DriveFile[]> {
    let q = `${driveQueryString(folderId)} in parents and trashed = false`;
    if (name !== undefined) q += ` and name = ${driveQueryString(name)}`;
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const res = await this.get('/files', {
        q,
        fields: 'nextPageToken, files(id, name, mimeType, size)',
        pageSize: '1000',
        includeItemsFromAllDrives: 'true',
        orderBy: 'name',
        ...(pageToken ? { pageToken } : {}),
      });
      const page = (await res.json()) as { files: DriveFile[]; nextPageToken?: string };
      files.push(...page.files);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return files;
  }

  /** 根のフォルダから / 区切りの相対パスをたどる。無い・同名が複数あるときは例外 */
  async resolve(rootId: string, relPath: string): Promise<DriveFile> {
    let current: DriveFile = { id: rootId, name: '', mimeType: FOLDER_MIME };
    for (const part of relPath.split('/').filter((p) => p !== '')) {
      if (current.mimeType !== FOLDER_MIME) throw new Error(`${relPath}: ${current.name} はフォルダではありません`);
      const hits = await this.children(current.id, part);
      if (hits.length === 0) throw new Error(`${relPath}: Drive に ${part} がありません`);
      if (hits.length > 1) throw new Error(`${relPath}: Drive に ${part} が ${hits.length} 個あります（手で整理する）`);
      current = hits[0]!;
    }
    return current;
  }

  isFolder(file: DriveFile): boolean {
    return file.mimeType === FOLDER_MIME;
  }

  /** ファイルの中身を out に書く */
  async download(fileId: string, out: string): Promise<void> {
    const res = await this.get(`/files/${encodeURIComponent(fileId)}`, { alt: 'media' });
    if (!res.body) throw new Error(`${fileId}: 中身が空です`);
    await pipeline(Readable.fromWeb(res.body as NodeReadableStream), createWriteStream(out));
  }
}
