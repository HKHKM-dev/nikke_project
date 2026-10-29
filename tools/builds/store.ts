// 育成データの取り込み（名前・写す・差・所持の一覧）。import.ts と fetch.ts から使う
// （plan/design-build-snapshot.md 2〜5・8 節。写し方は packages/core/src/shiftypad.ts）。
// 書くもの（メインのチェックアウトの private/。追跡しない）:
//   private/builds/<名前>.raw.json  アカウントを特定できる欄を除いた生のデータ
//   private/builds/<名前>.json      スナップショット（sim-run.ts の --build にそのまま渡せる）
//   private/builds/<名前>.diff.md   直前のスナップショットとの差
//   private/roster.md               所持の一覧（いちばん新しいスナップショットから）
// <名前> は取得の日（日本時間）。同じ日に別の取得があれば <日付>-2、-3 …（import-lib.ts）。
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeCombatAttack, validateBuild } from '../../packages/core/src/build.ts';
import { MASTER_FILES } from '../../packages/core/src/load.ts';
import {
  diffSnapshots,
  rosterMarkdown,
  stripAccountFields,
  toBuildSnapshot,
  type BuildSnapshot,
  type ShiftyPadRaw,
  type SnapshotCharacter,
  type SnapshotLabels,
} from '../../packages/core/src/shiftypad.ts';
import type { BuildMasters, CharacterData, CharacterIndex, CubeMaster } from '../../packages/core/src/types.ts';
import { previousName, SNAPSHOT_NAME, snapshotName, sortNames } from './import-lib.ts';

const ROOT = join(import.meta.dirname, '../..');
const DATA = join(ROOT, 'packages/core/data');

/** メインのチェックアウト（git worktree list の先頭）。private/ はここにだけある */
function mainCheckout(): string {
  const r = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  return /^worktree (.+)$/m.exec(r.stdout ?? '')?.[1] ?? ROOT;
}
export const PRIVATE = join(mainCheckout(), 'private');
const DIR = join(PRIVATE, 'builds');

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const index = readJson<CharacterIndex>(join(DATA, 'characters/index.json')).characters;
const masters = Object.fromEntries(
  Object.entries(MASTER_FILES).map(([k, f]) => [k, readJson(join(DATA, 'masters', f))]),
) as BuildMasters;
const cubes = (masters.cubes as CubeMaster).cubes;
const labels: SnapshotLabels = {
  nameOf: (id) => index.find((c) => c.resourceId === id)?.name.ja ?? '（データに無い）',
  cubeName: (id) => cubes.find((c) => c.id === id)?.name.ja,
};
const characterCache = new Map<number, CharacterData>();
function characterOf(id: number): CharacterData {
  let c = characterCache.get(id);
  if (c === undefined) {
    c = readJson<CharacterData>(join(DATA, `characters/${id}.json`));
    characterCache.set(id, c);
  }
  return c;
}
/** 戦闘中の攻撃力（バフ前）。宝物は段階 1〜3 で攻撃力が同じ（plan/design-stage12.md 11.1 節）なので、段階 1 で出す */
function attackOf(id: number, c: SnapshotCharacter): number | null {
  try {
    const character = characterOf(id);
    const treasurePhase = c.treasure !== null && character.treasure !== null ? 1 : 0;
    return computeCombatAttack(character, c.growth, c, masters, { treasurePhase }).attack;
  } catch {
    return null;
  }
}

/** 既存の生のデータ（名前 → fetchedAt） */
function existingRaws(): Map<string, string> {
  mkdirSync(DIR, { recursive: true });
  const out = new Map<string, string>();
  for (const f of readdirSync(DIR)) {
    const m = /^(.+)\.raw\.json$/.exec(f);
    if (m !== null && SNAPSHOT_NAME.test(m[1]!)) out.set(m[1]!, readJson<ShiftyPadRaw>(join(DIR, f)).fetchedAt);
  }
  return out;
}

/** 1 回分を写して書く。写せなかった値と、育成入力として通らない値を返す */
function convert(name: string): string[] {
  const raw = readJson<ShiftyPadRaw>(join(DIR, `${name}.raw.json`));
  const snap = toBuildSnapshot(raw, index);
  const problems = [...snap.unmapped];
  for (const [id, c] of Object.entries(snap.characters)) {
    try {
      validateBuild(characterOf(Number(id)), c, masters);
    } catch (e) {
      problems.push(`${id} ${labels.nameOf(Number(id))}: ${(e as Error).message}`);
    }
  }
  writeFileSync(join(DIR, `${name}.json`), `${JSON.stringify(snap, null, 1)}\n`);
  return problems;
}

function writeDiff(name: string, names: Iterable<string>, by: string): string[] {
  const prev = previousName(names, name);
  const next = readJson<BuildSnapshot>(join(DIR, `${name}.json`));
  const lines =
    prev === null
      ? ['- 前のスナップショットが無い（最初の取り込み）']
      : diffSnapshots(readJson<BuildSnapshot>(join(DIR, `${prev}.json`)), next, labels, attackOf);
  const doc = [
    `# 育成データの差（${prev ?? '—'} → ${name}）`,
    '',
    `- 生成: ${by}（plan/design-build-snapshot.md 4 節）。取得 ${next.fetchedAt}`,
    '',
    ...lines,
  ];
  writeFileSync(join(DIR, `${name}.diff.md`), `${doc.join('\n')}\n`);
  return doc;
}

function writeRoster(name: string, by: string): void {
  const snap = readJson<BuildSnapshot>(join(DIR, `${name}.json`));
  const doc = [
    '# 所持の一覧',
    '',
    `- 生成: ${by}（plan/design-build-snapshot.md 8 節）。手で直さない。元は private/builds/${name}.json（取得 ${snap.fetchedAt}・シンクロ Lv ${snap.synchroLevel}）`,
    '- 列: 凸（0〜3）・コア（0〜7）・スキル（スキル 1 / スキル 2 / バースト の Lv）・キューブ・コレクション（R / SR / 宝物 と Lv。宝物の Lv と段階の対応は未確定）',
    '',
    ...rosterMarkdown(snap, labels),
  ];
  writeFileSync(join(PRIVATE, 'roster.md'), `${doc.join('\n')}\n`);
}

function report(name: string, problems: string[]): void {
  if (problems.length === 0) return;
  console.log(`\n${name}: 写せなかった値・育成入力として通らない値（${problems.length}）`);
  for (const p of problems) console.log(`  ${p}`);
}

/**
 * 生のデータを 1 回分取り込む（アカウントの欄を除いて書き、写して差と所持の一覧を出す）。by は生成元のコマンド。
 * 写せなかった値・育成入力として通らない値の数を返す。
 */
export function importRaw(input: ShiftyPadRaw, by: string): number {
  const raw = stripAccountFields(input);
  const existing = existingRaws();
  const name = snapshotName(raw.fetchedAt, existing);
  writeFileSync(join(DIR, `${name}.raw.json`), `${JSON.stringify(raw)}\n`);
  const problems = convert(name);
  const names = sortNames(new Set([...existing.keys(), name]));
  const doc = writeDiff(name, names, by);
  writeRoster(names.at(-1)!, by);
  console.log(doc.join('\n'));
  report(name, problems);
  console.log(
    `\n書いた: ${join(DIR, name)}.{raw.json,json,diff.md}、${join(PRIVATE, 'roster.md')}（${names.at(-1)} から）`,
  );
  console.log(`使う: npm run sim -- --ids <resourceId,…> --build ${join(DIR, `${name}.json`)}`);
  return problems.length;
}

/** private/builds/ の生のデータを全部写し直す。生のデータが無ければ false */
export function rebuildAll(by: string): boolean {
  const names = sortNames(existingRaws().keys());
  if (names.length === 0) {
    console.error(`${DIR} に生のデータ（<名前>.raw.json）が無い`);
    return false;
  }
  for (const name of names) report(name, convert(name));
  for (const name of names) writeDiff(name, names, by);
  writeRoster(names.at(-1)!, by);
  console.log(`写し直した: ${names.join(', ')}（${DIR}）`);
  return true;
}
