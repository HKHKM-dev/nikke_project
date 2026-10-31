// クラウドの往復（cloud-sync.ts）が Drive の nikke_sync を読む道（plan/design-workflow-simplification-7.md 5 節）。
// サービスアカウントの鍵（NIKKE_DRIVE_SA_KEY）があれば Drive API で読み、無ければ受け口で読む。受け口は中身を 1 件ずつ約 1 秒で
// 読むので、始めの取得が打ち切りに掛かりやすかった。書くのはどちらでも受け口（サービスアカウントは容量が 0 でファイルを作れない。
// plan/design-cloud-environment.md 2.1 節）。
// nikke_sync のフォルダは NIKKE_DRIVE_SYNC_FOLDER_ID、無ければサービスアカウントから見える nikke_sync という名前のフォルダ（1 つだけのとき）。
// サービスアカウントの 1 回の呼び出しは CALL_MS で打ち切る（受け口は呼ぶたびに渡された長さ）。
import { Drive, driveQueryString, FOLDER_MIME } from '../captures/drive.ts';
import { CALL_MS, md5, reason } from './cloud-lib.ts';
import { get, snapshot, type SnapshotFile } from './gateway.ts';

export type SyncReader = {
  /** nikke_sync の直下のフォルダ top の下の一覧（パスは nikke_sync からの相対。中身は付けない） */
  list(top: string, timeoutMs: number): Promise<SnapshotFile[]>;
  /** 1 ファイルの中身と md5。無ければ null */
  get(path: string, timeoutMs: number): Promise<{ md5: string; buf: Buffer } | null>;
};

const SHARE_HINT = 'Drive で nikke_sync をサービスアカウントに閲覧者で共有しているかと、NIKKE_DRIVE_SA_KEY を確かめる';

const gatewayReader: SyncReader = {
  list: async (top, timeoutMs) => (await snapshot('sync', top, timeoutMs)).files,
  get: (path, timeoutMs) => get('sync', path, timeoutMs),
};

function serviceAccountReader(): SyncReader {
  /** 一覧で見たファイルの ID（パス → ID） */
  const ids = new Map<string, string>();
  let ready: Promise<{ drive: Drive; root: string }> | undefined;
  /** つなぐのは 1 回だけ（失敗したら、次に読むときにつなぎ直す） */
  const connect = () =>
    (ready ??= (async () => {
      const drive = await Drive.connect(CALL_MS);
      return { drive, root: process.env['NIKKE_DRIVE_SYNC_FOLDER_ID'] || (await findRoot(drive)) };
    })().catch((e: unknown) => {
      ready = undefined;
      throw e;
    }));
  const guarded = <T>(f: () => Promise<T>) =>
    f().catch((e: unknown) => {
      throw new Error(`サービスアカウントで読めなかった: ${reason(e)}。${SHARE_HINT}`, { cause: e });
    });
  return {
    list: (top) =>
      guarded(async () => {
        const { drive, root } = await connect();
        const hits = (await drive.children(root, top)).filter((k) => drive.isFolder(k));
        if (hits.length > 1) throw new Error(`nikke_sync に ${top} が ${hits.length} 個ある（手で整理する）`);
        const files = hits.length === 0 ? [] : await drive.tree(hits[0]!.id, `${top}/`);
        for (const f of files) ids.set(f.path, f.id);
        return files.map((f) => ({ path: f.path, size: Number(f.size ?? 0), modified: f.modifiedTime ?? '' }));
      }),
    get: (path) =>
      guarded(async () => {
        const { drive, root } = await connect();
        const id =
          ids.get(path) ??
          (await drive.resolve(root, path).then(
            (f) => f.id,
            () => null,
          ));
        const buf = id === null ? null : await drive.bytes(id);
        return buf === null ? null : { md5: md5(buf), buf };
      }),
  };
}

async function findRoot(drive: Drive): Promise<string> {
  const hits = await drive.search(
    `name = ${driveQueryString('nikke_sync')} and mimeType = ${driveQueryString(FOLDER_MIME)} and trashed = false`,
  );
  if (hits.length === 1) return hits[0]!.id;
  throw new Error(
    hits.length === 0
      ? 'nikke_sync のフォルダが見えない'
      : `nikke_sync のフォルダが ${hits.length} 個見える（NIKKE_DRIVE_SYNC_FOLDER_ID で指す）`,
  );
}

/** サービスアカウントの鍵があればサービスアカウント、無ければ受け口 */
export const syncReader = (): SyncReader =>
  process.env['NIKKE_DRIVE_SA_KEY']?.trim() ? serviceAccountReader() : gatewayReader;
