// Stage 19-A: 録画の台帳の型・検証・台帳の表の生成（plan/design-stage19.md 2.2 節）。
// Stage 20-C: 録画は records/recordings/<録画 id>.json に 1 本 1 ファイルで置き、表は plan/captures/recordings.md に
// 丸ごと生成する（前の中身は読まない。plan/design-stage20.md 3.5 節）。手で書かない。
import type { CollectionInput, CubeInput, OverloadLine } from '../build.ts';
import type { SkillLevels } from '../skills/resolve.ts';
import type { CharacterData, Element, GearPart } from '../types.ts';
import { RECORDING_ID, SNAPSHOT_NAME } from './ids.ts';

/** 録画を置く種別フォルダ（plan/captures/storage.md「置き場所」の語彙） */
export const RECORDING_FOLDERS = ['range', 'interception', 'raid', 'skill', 'burst', 'ui'] as const;
export type RecordingFolder = (typeof RECORDING_FOLDERS)[number];

/** 撮ったモード。null は台帳に書かれていない */
export const RECORDING_MODES = ['range-3min', 'range-normal', 'interception-special'] as const;
export type RecordingMode = (typeof RECORDING_MODES)[number];

const ELEMENTS: readonly Element[] = ['Fire', 'Water', 'Wind', 'Electronic', 'Iron'];

export type RecordingMember = {
  /** 枠（1 始まり、枠順） */
  slot: number;
  rid: number;
  /** 台帳での呼び名 */
  name: string;
  /** 操作した枠なら true。null は記録に無い */
  controlled: boolean | null;
  note?: string;
  /** 宝物の段階（持っている枠だけ） */
  treasurePhase?: number;
  /** キューブ（付けていた枠だけ。例: assault-7） */
  cube?: string;
  /** スペック固定 OFF の録画の育成（録画に映した値）。照合ランナーはこれでモデルの入力を組む。無ければ固定 OFF の録画は比べられない */
  build?: RecordingBuild;
  /**
   * 最小構成の検査編（plan/design-minimal-relevance.md 3.4 節）: 戦闘中に通常攻撃を 1 発でも撃ったか（戦闘履歴の与ダメージが 0 なら false）。
   * 省略は「分からない」で、撃ったとみなす
   */
  fires?: boolean;
  /** 同: バーストを 1 回でも使ったか（右のバースト欄の段の並び）。省略は「分からない」で、使ったとみなす（単騎の録画は使わないとみなす。C-0024） */
  bursts?: boolean;
};

/**
 * スペック固定 OFF の録画の育成（Stage 13 の残り）。録画に映した値を書く（オーナー決定 2026-10-06: 録画の素性に公開で書く）。
 * 攻撃力はキャラ画面の値（C-0118: OL の攻撃力増加とスキルの攻撃力▲は、これに同じ足し算の群で掛かる）。OL の行・キューブ・
 * コレクションは効果層（buildEffects.ts）に、スキルの Lv は定義の解決に渡す
 */
export type RecordingBuild = {
  /** キャラ画面の攻撃力 */
  attack: number;
  /** 部位ごとの OL の行（書かない部位は行なし） */
  overload?: Partial<Record<GearPart, OverloadLine[]>>;
  /** 省略・null はキューブなし */
  cube?: CubeInput;
  /** 省略・null はコレクションなし（宝物を持つ枠は treasurePhase で決まる） */
  collection?: CollectionInput;
  /** 省略したスロットは Lv10 */
  skillLevels?: Partial<SkillLevels>;
};

/** 育成の形の検証（値の範囲・マスタとの照合は、照合ランナーが resolveBuildEffects で行う）。問題があれば 1 件 1 行 */
export function validateRecordingBuild(build: RecordingBuild, at: string): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(build.attack) || build.attack <= 0) errors.push(`${at}: build.attack は正の整数`);
  for (const [slot, level] of Object.entries(build.skillLevels ?? {})) {
    if (!['skill1', 'skill2', 'burst'].includes(slot))
      errors.push(`${at}: build.skillLevels の ${slot} はスロットでない`);
    else if (!Number.isInteger(level) || level < 1 || level > 10)
      errors.push(`${at}: build.skillLevels.${slot} は 1〜10 の整数`);
  }
  return errors;
}

export type RecordingTarget = {
  name: string;
  /** 的の属性（射撃場のタブ）。null は記録に無い */
  element: Element | null;
  level?: number;
};

type RecordingConditions = {
  team: RecordingMember[];
  target: RecordingTarget;
  mode: RecordingMode | null;
  fixedSpec: boolean | null;
  autoFire: boolean | null;
  autoBurst: boolean | null;
  /** 台帳の「的」列の原文（条件の補足） */
  conditionNote: string;
};

/** Drive に置いた経路（plan/design-workflow-simplification.md 2 節）: E: から上げた・Drive の中で record の写しからコピーした・
 * クラウドで record から移した・クラウドで record からコピーして元をごみ箱へ移した */
export const BACKUP_VIAS = ['upload', 'drive-copy', 'cloud-move', 'cloud-copy'] as const;
export type BackupVia = (typeof BACKUP_VIAS)[number];

/** intake.ts が録画を Drive に置き、ハッシュが一致した記録 */
export type RecordingBackup = {
  /** 置いた日時（日本の時刻。例: 2026-10-25T00:31+09:00） */
  at: string;
  via: BackupVia;
  /** 一致したハッシュ（Drive が SHA256 を持っていなければ md5） */
  matched: 'sha256' | 'md5';
};

/** このプロジェクトが採用した録画（E:/nikke_project_captures/<folder>/） */
export type ProjectRecording = RecordingConditions & {
  /** 4 桁の通し番号（2026-10-25 に 4 桁にそろえた。plan/design-recording-id-4digit.md） */
  id: string;
  date: string;
  folder: RecordingFolder;
  file: string;
  original: string;
  durationSec: number;
  /** ffprobe が返さない録画は null */
  frames: number | null;
  fps: number;
  sizeMB: number;
  /** sha256 の先頭 12 桁 */
  sha256: string;
  /**
   * 読むのに使う育成のスナップショット（private/builds/<名前>.json。例: 2026-10-24、2026-10-24-2）。スペック固定 OFF の実ビルドの
   * 録画にだけ書く（2026-10-29 から。それより前の録画は conditionNote の自由文のまま。plan/design-build-snapshot.md 6 節）
   */
  buildSnapshot?: string;
  /**
   * Drive に置いた記録（2026-10-25 から intake.ts が書く）。無ければ intake.ts は置けたと確かめていない（それより前の録画と手で
   * 同期した録画は plan/captures/backup-log.md・backup-log-old2.md・backup-log-old.md）
   */
  backup?: RecordingBackup;
};

/** 旧プロジェクトの録画（置き場所は旧のまま。番号は L-<旧のタグ>） */
export type LegacyRecording = RecordingConditions & {
  id: string;
  legacy: true;
  path: string;
};

export type RecordingEntry = ProjectRecording | LegacyRecording;

/** 録画の全件（records/recordings/ の全ファイルを sortRecordings の順に並べたもの） */
export type RecordingsFile = {
  recordings: RecordingEntry[];
};

export function isLegacy(entry: RecordingEntry): entry is LegacyRecording {
  return 'legacy' in entry && entry.legacy === true;
}

/** このリポジトリの録画を番号順に、その後に旧の録画を id の順に並べる */
export function sortRecordings(entries: readonly RecordingEntry[]): RecordingEntry[] {
  const project = entries.filter((e) => !isLegacy(e)).sort((a, b) => Number(a.id) - Number(b.id));
  const legacy = entries.filter(isLegacy).sort((a, b) => a.id.localeCompare(b.id));
  return [...project, ...legacy];
}

function validateBackup(backup: RecordingBackup, at: string): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\+09:00$/.test(backup.at))
    errors.push(`${at}: backup.at は日本の時刻（YYYY-MM-DDTHH:MM+09:00）`);
  if (!BACKUP_VIAS.includes(backup.via)) errors.push(`${at}: backup.via が語彙に無い: ${backup.via}`);
  if (backup.matched !== 'sha256' && backup.matched !== 'md5')
    errors.push(`${at}: backup.matched は sha256 か md5: ${backup.matched}`);
  return errors;
}

/** 検証。問題があれば 1 件 1 行で返す（空なら問題なし） */
export function validateRecordings(file: RecordingsFile, knownRids: ReadonlySet<number>): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const entry of file.recordings) {
    const at = entry.id;
    if (seen.has(entry.id)) errors.push(`${at}: id が重複している`);
    seen.add(entry.id);
    if (isLegacy(entry)) {
      if (!/^L-[A-Z]{1,3}$/.test(entry.id)) errors.push(`${at}: 旧の録画の id は L-<旧のタグ>`);
    } else {
      // Stage 20-A・20-C: 抜けは許す（plan/design-stage20.md 3.5・3.6 節）。桁は 4 桁（plan/design-recording-id-4digit.md 6 節）
      if (!RECORDING_ID.test(entry.id)) errors.push(`${at}: id は 4 桁の数字（0001〜9999）`);
      const number = Number(entry.id);
      if (!RECORDING_FOLDERS.includes(entry.folder)) errors.push(`${at}: folder が語彙に無い: ${entry.folder}`);
      const m = /^(\d{4})(\d{2})(\d{2})-(\d{2,})_/.exec(entry.file);
      if (!m) errors.push(`${at}: file が命名規約に合わない: ${entry.file}`);
      else {
        if (`${m[1]}-${m[2]}-${m[3]}` !== entry.date) errors.push(`${at}: file の日付と date が違う`);
        if (Number(m[4]) !== number) errors.push(`${at}: file の番号と id が違う`);
      }
      if (!/^[0-9a-f]{12}$/.test(entry.sha256)) errors.push(`${at}: sha256 は先頭 12 桁の 16 進`);
      if (entry.backup !== undefined) errors.push(...validateBackup(entry.backup, at));
      // 形だけ見る（実体は private/ にあり CI から見えない。plan/design-build-snapshot.md 6 節）
      if (entry.buildSnapshot !== undefined) {
        if (typeof entry.buildSnapshot !== 'string' || !SNAPSHOT_NAME.test(entry.buildSnapshot))
          errors.push(`${at}: buildSnapshot は YYYY-MM-DD か YYYY-MM-DD-<枝番>: ${entry.buildSnapshot}`);
        if (entry.fixedSpec === true) errors.push(`${at}: buildSnapshot はスペック固定 OFF の録画にだけ書く`);
      }
    }
    if (entry.mode !== null && !RECORDING_MODES.includes(entry.mode))
      errors.push(`${at}: mode が語彙に無い: ${entry.mode}`);
    if (entry.target.element !== null && !ELEMENTS.includes(entry.target.element)) {
      errors.push(`${at}: 的の属性が語彙に無い: ${entry.target.element}`);
    }
    if (entry.team.length === 0 || entry.team.length > 5) errors.push(`${at}: 編成は 1〜5 体`);
    entry.team.forEach((member, i) => {
      if (member.slot !== i + 1) errors.push(`${at}: 枠は 1 から枠順に並べる（${i + 1} 番目が ${member.slot}）`);
      if (!knownRids.has(member.rid)) errors.push(`${at}: rid ${member.rid} のキャラのデータが無い`);
      for (const key of ['fires', 'bursts'] as const)
        if (member[key] !== undefined && typeof member[key] !== 'boolean')
          errors.push(`${at}: 枠 ${member.slot} の ${key} は true か false（分からなければ書かない）`);
      if (member.build !== undefined) {
        if (entry.fixedSpec !== false) errors.push(`${at}: 育成（build）はスペック固定 OFF の録画にだけ書く`);
        errors.push(...validateRecordingBuild(member.build, `${at} 枠 ${member.slot}`));
      }
    });
    if (entry.team.filter((m) => m.controlled === true).length > 1) errors.push(`${at}: 操作した枠が 2 つ以上ある`);
  }
  return errors;
}

// ---- 台帳の表 ----

const ELEMENT_JA: Record<Element, string> = {
  Fire: '灼熱',
  Water: '水冷',
  Wind: '風圧',
  Electronic: '電撃',
  Iron: '鉄甲',
};
const MODE_JA: Record<RecordingMode, string> = {
  'range-3min': '射撃場 3 分',
  'range-normal': '射撃場 通常敵戦',
  'interception-special': '迎撃戦（特殊個体）',
};

function flag(value: boolean | null, yes: string, no: string): string {
  return value === null ? '—' : value ? yes : no;
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

function row(cells: readonly string[]): string {
  return `| ${cells.map(escapeCell).join(' | ')} |`;
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [row(header), row(header.map(() => '---')), ...rows.map(row)].join('\n');
}

function memberText(member: RecordingMember, characters: ReadonlyMap<number, CharacterData>): string {
  const c = characters.get(member.rid);
  const mark = member.controlled === true ? '◎' : member.controlled === null ? '?' : '';
  const extras = [
    c ? `${c.weaponType}・${ELEMENT_JA[c.element]}・${c.rarity}` : '',
    member.treasurePhase !== undefined ? `宝物 ${member.treasurePhase}` : '',
    member.cube ?? '',
    member.build !== undefined ? '育成あり' : '',
  ].filter((x) => x !== '');
  return `${mark}${member.name}（${member.rid}、${extras.join('、')}）`;
}

function teamText(entry: RecordingEntry, characters: ReadonlyMap<number, CharacterData>): string {
  return entry.team.map((m) => memberText(m, characters)).join(' + ');
}

function targetText(entry: RecordingEntry): string {
  const element = entry.target.element === null ? '' : `・${ELEMENT_JA[entry.target.element]}`;
  const level = entry.target.level === undefined ? '' : `・Lv.${entry.target.level}`;
  return `${entry.target.name}${element}${level}`;
}

/** 録画の一覧（条件） */
export function renderRecordingTable(file: RecordingsFile, characters: ReadonlyMap<number, CharacterData>): string {
  const rows = file.recordings
    .filter((e): e is ProjectRecording => !isLegacy(e))
    .map((e) => [
      e.id,
      `\`${e.file}\``,
      teamText(e, characters),
      targetText(e),
      e.mode === null ? '—' : MODE_JA[e.mode],
      flag(e.fixedSpec, 'ON', 'OFF') + (e.buildSnapshot === undefined ? '' : `（育成 ${e.buildSnapshot}）`),
      `${flag(e.autoFire, 'ON', 'OFF')} / ${flag(e.autoBurst, 'ON', 'OFF')}`,
      e.conditionNote,
    ]);
  return table(
    [
      '#',
      'ファイル',
      '編成（枠順。◎ 操作・? 記録なし）',
      '的',
      'モード',
      'スペック固定',
      'AUTO 射撃 / 自動バースト',
      '条件の補足（旧台帳の「的」列）',
    ],
    rows,
  );
}

/** 旧プロジェクトの録画 */
export function renderLegacyTable(file: RecordingsFile, characters: ReadonlyMap<number, CharacterData>): string {
  const rows = file.recordings
    .filter(isLegacy)
    .map((e) => [e.id, `\`${e.path}\``, teamText(e, characters), e.conditionNote]);
  return table(['#', '置き場所（旧のまま）', 'キャラ', '条件の補足'], rows);
}

// ---- 台帳への埋め込み ----

const marker = (name: string, end: boolean) => `<!-- records:${name}:${end ? 'end' : 'start'} -->`;

/** 生成した部分を差し替える。印が無ければ例外 */
export function replaceGeneratedSection(doc: string, name: string, body: string): string {
  const start = doc.indexOf(marker(name, false));
  const end = doc.indexOf(marker(name, true));
  if (start < 0 || end < start) throw new Error(`台帳に ${marker(name, false)} と ${marker(name, true)} が無い`);
  return `${doc.slice(0, start + marker(name, false).length)}\n\n${body}\n\n${doc.slice(end)}`;
}

export function extractGeneratedSection(doc: string, name: string): string {
  const start = doc.indexOf(marker(name, false));
  const end = doc.indexOf(marker(name, true));
  if (start < 0 || end < start) throw new Error(`台帳に ${marker(name, false)} と ${marker(name, true)} が無い`);
  return doc.slice(start + marker(name, false).length, end);
}

const RECORDINGS_DOC_HEADER = `# 録画の一覧

- **このファイルは生成する（手で書かない）**。録画は \`records/recordings/<録画 id>.json\` に 1 本 1 ファイルで置き、\`npm run records:check\` で作り直す（[design-stage20.md](../design-stage20.md) 3.5 節）。素性（尺・フレーム数・fps・サイズ・sha256）は録画の JSON にだけある。
- 武器・属性・レアはキャラのデータから引く。\`—\` は記録が無い値。「スペック固定」の列の（育成 YYYY-MM-DD）は、読むのに使う育成のスナップショット（\`buildSnapshot\`。[../design-build-snapshot.md](../design-build-snapshot.md) 6 節）。
- 録画ごとの条件・写っているもの・注意（的・フレーム落ちなど）は、その録画の JSON の \`conditionNote\`（下の表の「条件」の列）。命名規約は [index.md](index.md)、撮影の手順は [protocol.md](protocol.md)、置き場所は [storage.md](storage.md)。`;

/** plan/captures/recordings.md の全文（録画の一覧・旧プロジェクトの録画の 2 つの表。素性は録画の JSON にだけ置く） */
export function renderRecordingsDoc(file: RecordingsFile, characters: ReadonlyMap<number, CharacterData>): string {
  return [
    RECORDINGS_DOC_HEADER,
    '## 録画',
    renderRecordingTable(file, characters),
    '## 旧プロジェクトの録画（参照のみ。移動しない）',
    renderLegacyTable(file, characters),
  ]
    .join('\n\n')
    .concat('\n');
}
