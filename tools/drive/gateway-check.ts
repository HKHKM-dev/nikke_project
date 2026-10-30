// Apps Script の受け口の動作確認（plan/design-cloud-environment.md 9 節の段 ②）。公開した後に 1 回回す。
//   npm run drive:gateway-check    （NIKKE_DRIVE_GATEWAY_URL・NIKKE_DRIVE_GATEWAY_KEY を入れて）
// nikke_sync/scratch/_gateway-check/ と nikke_project_captures/frames/ に試しのファイルを作り、読み出し・衝突・大きさ・移動・ごみ箱を
// 確かめて片付ける（フォルダは空で残る）。一覧はそのフォルダだけを取る（scratch/ 全体の中身は 5 分で読み切れない。plan/cloud-guide.md「困ったとき」）。
import { createHash, randomBytes } from 'node:crypto';
import { gateway, move, put, snapshot, trash } from './gateway.ts';

const DIR = 'scratch/_gateway-check';

const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');
let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK ' : 'NG '} ${name}${detail ? `（${detail}）` : ''}`);
  if (!ok) failed++;
};

const small = Buffer.from(`gateway check ${new Date().toISOString()}\n`);
const p1 = await put('sync', `${DIR}/check.txt`, small, null);
check('書き込み（nikke_sync）', p1.md5 === md5(small));
const snap = await snapshot('sync', DIR, 1_000_000);
const hit = snap.files.find((f) => f.path === `${DIR}/check.txt`);
check('一覧と中身', hit?.md5 === md5(small) && hit?.content === small.toString('base64'));
const changed = Buffer.from('changed elsewhere\n');
const c = await put('sync', `${DIR}/check.txt`, changed, 'not-the-current-md5');
check('衝突は別名で置く', c.conflict === true, c.path);
const same = await put('sync', `${DIR}/check.txt`, small, p1.md5);
check('同じ中身は何もしない', same.unchanged === true);
const big = randomBytes(3_000_000);
const b = await put('sync', `${DIR}/3mb.bin`, big, null);
check('3MB を書ける', b.md5 === md5(big));
const f = await put('captures', 'frames/_gateway-check.png', small, null);
check('証拠フレームの下に書ける', f.md5 === md5(small));
const m = await move('captures', 'frames/_gateway-check.png', 'frames/_gateway-check-moved.png');
check('移動・改名', m.how === 'move' || m.how === 'copy', m.how);
let denied = false;
try {
  await put('captures', 'range/_gateway-check.mp4', small, null);
} catch {
  denied = true;
}
check('録画の上には書けない', denied);
let wrongKey = false;
try {
  await gateway('snapshot', { key: 'wrong', root: 'sync', prefix: DIR, maxBytes: 0 });
} catch {
  wrongKey = true;
}
check(
  '合言葉が違えば断る',
  wrongKey || process.env['NIKKE_DRIVE_GATEWAY_KEY'] === undefined,
  wrongKey ? '' : '合言葉はプロキシが付けている',
);
// 片付け（ごみ箱へ）
await trash('sync', `${DIR}/check.txt`, md5(small));
if (c.path) await trash('sync', c.path, md5(changed));
await trash('sync', `${DIR}/3mb.bin`, md5(big));
await trash('captures', 'frames/_gateway-check-moved.png', md5(small));
console.log(failed === 0 ? '受け口は動いている（試しのファイルはごみ箱へ移した）' : `${failed} 件が NG`);
process.exit(failed === 0 ? 0 : 1);
