// クラウドの往復（cloud-sync.ts）が Drive の nikke_sync を読む道（plan/design-workflow-simplification-7.md 5 節）。
// サービスアカウントの鍵（NIKKE_DRIVE_SA_KEY）があれば Drive API で読み、無ければ受け口で読む。受け口は中身を 1 件ずつ約 1 秒で
// 読むので、始めの取得が打ち切りに掛かりやすかった。書くのはどちらでも受け口（サービスアカウントは容量が 0 でファイルを作れない。
// plan/design-cloud-environment.md 2.1 節）。
// nikke_sync のフォルダは NIKKE_DRIVE_SYNC_FOLDER_ID、無ければサービスアカウントから見える nikke_sync という名前のフォルダ（1 つだけのとき）。
import { createHash } from 'node:crypto';
import { Drive, driveQueryString, type DriveFile } from '../captures/drive.ts';
import { get, snapshot, type SnapshotFile } from './gateway.ts';

export type SyncReader = {
  /** 知らせに出す名前 */
  via: string;
  /** nikke_sync の直下のフォルダ top の下の一覧（パスは nikke_sync からの相対。中身は付けない） */
  list(top: string, timeoutMs: number): Promise<SnapshotFile[]>;
  /** 1 ファイルの中身と md5。無ければ null */
  get(path: string, timeoutMs: number): Promise<{ md5: string; buf: Buffer } | null>;
};

const SHARE_HINT = 'Drive で nikke_sync をサービスアカウントに閲覧者で共有しているかと、NIKKE_DRIVE_SA_KEY を確かめる';

const gatewayReader: SyncReader = {
  via: '受け口',
  list: async (top, timeoutMs) => (await snapshot('sync', top, timeoutMs)).files,
  get: (path, timeoutMs) => get('sync', path, timeoutMs),
};

function serviceAccountReader(): SyncReader {
  /** 一覧で見たファイルの ID（パス → ID） */
  const ids = new Map<string, string>();
  let ready: Promise<{ drive: Drive; root: string }> | undefined;
  const connect = (timeoutMs: number) =>
    (ready ??= (async () => {
      const drive = await Drive.connect();
      const root = process.env['NIKKE_DRIVE_SYNC_FOLDER_ID'] || (await findRoot(drive, timeoutMs));
      return { drive, root };
    })());
  const walk = async (drive: Drive, folder: DriveFile, rel: string, timeoutMs: number): Promise<SnapshotFile[]> => {
    const kids = await drive.children(folder.id, undefined, timeoutMs);
    const nested = await Promise.all(
      kids.filter((k) => drive.isFolder(k)).map((k) => walk(drive, k, `${rel}${k.name}/`, timeoutMs)),
    );
    const files = kids.flatMap((k) => {
      if (drive.isFolder(k)) return [];
      ids.set(rel + k.name, k.id);
      return [{ path: rel + k.name, size: Number(k.size ?? 0), modified: k.modifiedTime ?? '' }];
    });
    return [...files, ...nested.flat()];
  };
  const explain = (e: unknown) =>
    new Error(`サービスアカウントで読めなかった: ${reason(e)}。${SHARE_HINT}`, { cause: e });
  return {
    via: 'サービスアカウント',
    async list(top, timeoutMs) {
      try {
        const { drive, root } = await connect(timeoutMs);
        const hits = (await drive.children(root, top, timeoutMs)).filter((k) => drive.isFolder(k));
        if (hits.length > 1) throw new Error(`nikke_sync に ${top} が ${hits.length} 個ある（手で整理する）`);
        return hits.length === 0 ? [] : await walk(drive, hits[0]!, `${top}/`, timeoutMs);
      } catch (e) {
        throw explain(e);
      }
    },
    async get(path, timeoutMs) {
      try {
        const { drive, root } = await connect(timeoutMs);
        const id =
          ids.get(path) ??
          (await drive.resolve(root, path).then(
            (f) => f.id,
            () => null,
          ));
        const buf = id === null ? null : await drive.bytes(id, timeoutMs);
        return buf === null ? null : { md5: createHash('md5').update(buf).digest('hex'), buf };
      } catch (e) {
        throw explain(e);
      }
    },
  };
}

async function findRoot(drive: Drive, timeoutMs: number): Promise<string> {
  const hits = await drive.search(
    `name = ${driveQueryString('nikke_sync')} and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    timeoutMs,
  );
  if (hits.length === 1) return hits[0]!.id;
  throw new Error(
    hits.length === 0
      ? 'nikke_sync のフォルダが見えない'
      : `nikke_sync のフォルダが ${hits.length} 個見える（NIKKE_DRIVE_SYNC_FOLDER_ID で指す）`,
  );
}

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** サービスアカウントの鍵があればサービスアカウント、無ければ受け口 */
export const syncReader = (): SyncReader =>
  process.env['NIKKE_DRIVE_SA_KEY']?.trim() ? serviceAccountReader() : gatewayReader;
