// 録画の取り込み（intake.ts）の純粋な部分: 番号の割り当てと、引数の検査。intake.ts が使い、intake-lib.test.ts でテストする。
// ファイルも git も読まない（使った番号の一覧とキャラの宝物の有無は呼ぶ側が渡す）。不正な引数は Error（intake.ts が使い方と一緒に出す）。
import { RECORDING_ID } from '../../packages/core/src/records/ids.ts';

/**
 * 使った番号（手元の録画の JSON とどのブランチの番号。3 桁の古い番号も数として比べる）の最大の次から n 個。数字でない番号
 * （L-AN など）は数えない
 */
export function nextRecordingIds(n: number, used: readonly string[]): string[] {
  const max = Math.max(0, ...used.filter((x) => /^\d+$/.test(x)).map(Number));
  return Array.from({ length: n }, (_, i) => String(max + 1 + i).padStart(4, '0'));
}

/** --id から順に n 個（4 桁の番号。最後が 9999 を超えるなら Error） */
export function sequentialRecordingIds(start: string, n: number): string[] {
  if (!RECORDING_ID.test(start)) throw new Error('--id は 4 桁の数字（0001〜9999）');
  const ids = Array.from({ length: n }, (_, i) => String(Number(start) + i).padStart(4, '0'));
  if (ids.some((id) => !RECORDING_ID.test(id))) throw new Error(`--id ${start} から ${n} 本では 9999 を超える`);
  return ids;
}

/**
 * まとめて取り込むときの、録画ごとの識別子と注記。--name は元ファイルと同じ数を , で並べ、--note は無いか、1 つ（全部に同じ）か、
 * 元ファイルと同じ数
 */
export function batchNamesAndNotes(
  count: number,
  name: string,
  notes: readonly string[],
): { names: string[]; notes: (string | undefined)[] } {
  const names = name.split(',').map((s) => s.trim());
  if (names.length !== count)
    throw new Error(`--name は元ファイルと同じ数（${count}）を , で並べる（${names.length} 個あった）`);
  if (notes.length > 1 && notes.length !== count)
    throw new Error(`--note は 1 つか、元ファイルと同じ数（${count}）を繰り返す（${notes.length} 個あった）`);
  return { names, notes: names.map((_, i) => (notes.length === 1 ? notes[0] : notes[i])) };
}

/** 識別子（命名規約。英小文字・数字・-・_・+、頭は英小文字か数字）か */
export function isRecordingName(name: string): boolean {
  return /^[a-z0-9][a-z0-9_+-]*$/.test(name);
}

/** on・off の引数（無ければ null） */
export function parseOnOff(value: string | undefined, flag: string): boolean | null {
  if (value === undefined) return null;
  if (value === 'on') return true;
  if (value === 'off') return false;
  throw new Error(`${flag} は on か off`);
}

/**
 * --treasure <枠>:<段階>,...（段階は 0〜3。0 は宝物なし）を、枠（1 始まり）→ 段階にする。枠は --rid の中で、そのキャラが宝物を持つこと
 * （hasTreasure は rid で引く）
 */
export function parseTreasureArg(
  arg: string | undefined,
  rids: readonly number[],
  hasTreasure: (rid: number) => boolean,
): Map<number, number> {
  const phases = new Map<number, number>();
  for (const t of arg?.split(',') ?? []) {
    const m = /^(\d+):([0-3])$/.exec(t.trim());
    if (!m) throw new Error(`--treasure は <枠>:<段階（0〜3。0 は宝物なし）> を , で並べる（${t}）`);
    const slot = Number(m[1]);
    if (slot < 1 || slot > rids.length) throw new Error(`--treasure の枠 ${slot} が --rid に無い`);
    if (!hasTreasure(rids[slot - 1]!))
      throw new Error(`--treasure の枠 ${slot}（rid ${rids[slot - 1]}）のキャラは宝物を持たない`);
    phases.set(slot, Number(m[2]));
  }
  return phases;
}

/** 押さえた番号の並びの名前（commit の題名。「録画 0640」「録画 0640〜0644」） */
export function reservedLabel(ids: readonly string[]): string {
  return `録画 ${ids[0]}${ids.length > 1 ? `〜${ids[ids.length - 1]}` : ''}`;
}
