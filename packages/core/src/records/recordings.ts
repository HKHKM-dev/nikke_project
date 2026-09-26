// Stage 19-A: 録画の台帳（records/recordings.json）の型・検証・台帳の表の生成（plan/design-stage19.md 2.2 節）。
// 台帳（plan/captures/index.md）の表はここから生成する。手で書かない。
import type { CharacterData, Element } from '../types.ts';

/** 録画を置く種別フォルダ（台帳の「置き場所」の語彙） */
export const RECORDING_FOLDERS = ['range', 'interception', 'raid', 'skill', 'burst', 'ui'] as const;
export type RecordingFolder = (typeof RECORDING_FOLDERS)[number];

/** 撮ったモード。null は台帳に書かれていない */
export const RECORDING_MODES = ['range-3min', 'interception-special'] as const;
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
};

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

/** このプロジェクトが採用した録画（E:/nikke_project_captures/<folder>/） */
export type ProjectRecording = RecordingConditions & {
  /** 3 桁の通し番号 */
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
};

/** 旧プロジェクトの録画（置き場所は旧のまま。番号は L-<旧のタグ>） */
export type LegacyRecording = RecordingConditions & {
  id: string;
  legacy: true;
  path: string;
};

export type RecordingEntry = ProjectRecording | LegacyRecording;

export type RecordingsFile = {
  version: 1;
  recordings: RecordingEntry[];
};

export function isLegacy(entry: RecordingEntry): entry is LegacyRecording {
  return 'legacy' in entry && entry.legacy === true;
}

/** 検証。問題があれば 1 件 1 行で返す（空なら問題なし） */
export function validateRecordings(file: RecordingsFile, knownRids: ReadonlySet<number>): string[] {
  const errors: string[] = [];
  if (file.version !== 1) errors.push(`version が 1 でない: ${String(file.version)}`);
  const seen = new Set<string>();
  let lastNumber = 0;
  for (const entry of file.recordings) {
    const at = entry.id;
    if (seen.has(entry.id)) errors.push(`${at}: id が重複している`);
    seen.add(entry.id);
    if (isLegacy(entry)) {
      if (!/^L-[A-Z]{1,3}$/.test(entry.id)) errors.push(`${at}: 旧の録画の id は L-<旧のタグ>`);
    } else {
      // Stage 20-A: 桁は 3 桁以上。抜けは許し、番号順だけを見る（plan/design-stage20.md 3.5・3.6 節）
      if (!/^\d{3,}$/.test(entry.id)) errors.push(`${at}: id は 3 桁以上の数字`);
      const number = Number(entry.id);
      if (number <= lastNumber) errors.push(`${at}: id は番号順に並べる（前は ${lastNumber}）`);
      lastNumber = Math.max(lastNumber, number);
      if (!RECORDING_FOLDERS.includes(entry.folder)) errors.push(`${at}: folder が語彙に無い: ${entry.folder}`);
      const m = /^(\d{4})(\d{2})(\d{2})-(\d{2,})_/.exec(entry.file);
      if (!m) errors.push(`${at}: file が命名規約に合わない: ${entry.file}`);
      else {
        if (`${m[1]}-${m[2]}-${m[3]}` !== entry.date) errors.push(`${at}: file の日付と date が違う`);
        if (Number(m[4]) !== number) errors.push(`${at}: file の番号と id が違う`);
      }
      if (!/^[0-9a-f]{12}$/.test(entry.sha256)) errors.push(`${at}: sha256 は先頭 12 桁の 16 進`);
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
    .filter((e) => !isLegacy(e))
    .map((e) => [
      e.id,
      `\`${(e as ProjectRecording).file}\``,
      teamText(e, characters),
      targetText(e),
      e.mode === null ? '—' : MODE_JA[e.mode],
      flag(e.fixedSpec, 'ON', 'OFF'),
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

/** 素性（probe.ts の出力） */
export function renderProvenanceTable(file: RecordingsFile): string {
  const rows = file.recordings
    .filter((e): e is ProjectRecording => !isLegacy(e))
    .map((e) => [
      e.id,
      `\`${e.folder}/${e.file}\``,
      `\`${e.original}\``,
      `${e.durationSec.toFixed(1)} s`,
      e.frames === null ? '—' : String(e.frames),
      e.fps.toFixed(2),
      `${e.sizeMB.toFixed(1)} MB`,
      `\`${e.sha256}\``,
    ]);
  return table(['#', 'ファイル', '元ファイル名', '尺', 'フレーム数', '平均 fps', 'サイズ', 'sha256（先頭 12）'], rows);
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

/** 表の比較用に、整形（列の幅そろえ・区切り行）の違いを落とす */
export function normalizeTable(markdown: string): string[] {
  return markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && !/^\|[\s|:-]+\|$/.test(line))
    .map((line) =>
      line
        .slice(1, -1)
        .split(/(?<!\\)\|/)
        .map((cell) => cell.trim())
        .join('|'),
    );
}

export const GENERATED_SECTIONS = ['recordings', 'provenance', 'legacy'] as const;

export function renderSection(
  name: (typeof GENERATED_SECTIONS)[number],
  file: RecordingsFile,
  characters: ReadonlyMap<number, CharacterData>,
): string {
  if (name === 'recordings') return renderRecordingTable(file, characters);
  if (name === 'provenance') return renderProvenanceTable(file);
  return renderLegacyTable(file, characters);
}
