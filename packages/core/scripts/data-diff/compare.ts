// CDN から取り直したデータ（data/characters・data/masters）と、前の版との差分を分けて出す（plan/design-cdn-refresh.md 3 節）。
// 2026-10-08 の取り込み（PR #461）で手で確かめたこと（キャラの増減・説明文を除いた値の変化・定義済みキャラの説明文の変化）を機械で出す。
// 読むのは差分の分類だけで、判断（定義済みキャラの ref の意味が変わったか・新しいマスタの対応）は人がする
import type { CharacterData } from '../../src/types.ts';

/** 1 か所の違い。added / removed は id で突き合わせた配列の要素（キューブなど）の増減 */
export type Change = { path: string; before: unknown; after: unknown; kind?: 'added' | 'removed' };

/** 説明文・スキル名の違い。whitespace = 改行と空白を除くと同じ */
export type TextChange = { path: string; before: string; after: string; whitespaceOnly: boolean };

export type CharacterChange = {
  resourceId: number;
  name: string;
  defined: boolean;
  /** 説明文とスキル名を除いた違い（数値・stat・射撃のパラメータ・スキルの values など） */
  values: Change[];
  texts: TextChange[];
};

export type CharacterDiff = {
  added: CharacterData[];
  removed: CharacterData[];
  changed: CharacterChange[];
};

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isPrimitive = (v: unknown): boolean => v === null || typeof v !== 'object';
const hasId = (v: unknown): v is { id: number } => isRecord(v) && typeof v.id === 'number';

/**
 * 2 つの JSON の違いを葉ごとに返す。プリミティブだけの配列（レベル曲線・values）は配列ごと 1 件にし、
 * 全要素が id を持つオブジェクトの配列（キューブ・コレクション）は id で突き合わせる（途中に増えても後ろがずれない）
 */
export function diffJson(before: unknown, after: unknown, at = ''): Change[] {
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.every(isPrimitive) && after.every(isPrimitive)) {
      const same = before.length === after.length && before.every((v, i) => v === after[i]);
      return same ? [] : [{ path: at, before, after }];
    }
    if (before.every(hasId) && after.every(hasId)) {
      const byId = new Map(before.map((v) => [v.id, v]));
      const afterIds = new Set(after.map((v) => v.id));
      const changes: Change[] = [];
      for (const v of after) {
        const old = byId.get(v.id);
        const path = `${at}[id=${v.id}]`;
        if (old === undefined) changes.push({ path, before: undefined, after: v, kind: 'added' });
        else changes.push(...diffJson(old, v, path));
      }
      for (const v of before) {
        if (!afterIds.has(v.id))
          changes.push({ path: `${at}[id=${v.id}]`, before: v, after: undefined, kind: 'removed' });
      }
      return changes;
    }
    const changes: Change[] = [];
    for (let i = 0; i < Math.max(before.length, after.length); i++)
      changes.push(...diffJson(before[i], after[i], `${at}[${i}]`));
    return changes;
  }
  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return keys.flatMap((key) => diffJson(before[key], after[key], at === '' ? key : `${at}.${key}`));
  }
  return Object.is(before, after) ? [] : [{ path: at, before, after }];
}

/** 説明文とスキル名（基礎版と宝物版の skill1 / skill2 / burst の description・name の ja / en） */
const TEXT_PATH = /(^|\.)skills\.(skill1|skill2|burst)\.(description|name)\.(ja|en)$/;

const stripSpace = (text: string): string => text.replace(/\s+/g, '');

export function diffCharacters(
  before: ReadonlyMap<number, CharacterData>,
  after: ReadonlyMap<number, CharacterData>,
  defined: ReadonlySet<number>,
): CharacterDiff {
  const byId = (a: CharacterData, b: CharacterData) => a.resourceId - b.resourceId;
  const added = [...after.values()].filter((c) => !before.has(c.resourceId)).sort(byId);
  const removed = [...before.values()].filter((c) => !after.has(c.resourceId)).sort(byId);
  const changed: CharacterChange[] = [];
  for (const id of [...after.keys()].filter((k) => before.has(k)).sort((a, b) => a - b)) {
    const now = after.get(id)!;
    const changes = diffJson(before.get(id), now);
    if (changes.length === 0) continue;
    const values: Change[] = [];
    const texts: TextChange[] = [];
    for (const c of changes) {
      if (TEXT_PATH.test(c.path) && typeof c.before === 'string' && typeof c.after === 'string') {
        texts.push({
          path: c.path,
          before: c.before,
          after: c.after,
          whitespaceOnly: stripSpace(c.before) === stripSpace(c.after),
        });
      } else values.push(c);
    }
    changed.push({ resourceId: id, name: now.name.ja, defined: defined.has(id), values, texts });
  }
  return { added, removed, changed };
}

// ---- 書き出し（Markdown。PR の本文に貼れる形） ----

const BURST_STEP_LABEL: Record<string, string> = { Step1: 'I', Step2: 'II', Step3: 'III', AllStep: 'A' };

function characterLabel(c: CharacterData): string {
  const step = BURST_STEP_LABEL[c.burstStep] ?? c.burstStep;
  return `${c.resourceId} ${c.name.ja}（${c.rarity}・${c.class}・${c.element}・${c.weaponType}・バースト ${step}）`;
}

const PRIMITIVE_ARRAY_SHOWN = 8;

function show(value: unknown): string {
  if (value === undefined) return '（無し）';
  if (Array.isArray(value) && value.every(isPrimitive) && value.length > PRIMITIVE_ARRAY_SHOWN) {
    return `[${value
      .slice(0, PRIMITIVE_ARRAY_SHOWN)
      .map((v) => JSON.stringify(v))
      .join(', ')}, …（${value.length} 要素）]`;
  }
  return JSON.stringify(value);
}

function changeLine(c: Change): string {
  if (c.kind === 'added') return `\`${c.path}\`: 追加（${nameOf(c.after)}）`;
  if (c.kind === 'removed') return `\`${c.path}\`: 削除（${nameOf(c.before)}）`;
  const before = c.before;
  const after = c.after;
  if (Array.isArray(before) && Array.isArray(after) && before.every(isPrimitive) && after.every(isPrimitive)) {
    const differ = after.map((v, i) => i).filter((i) => before[i] !== after[i]);
    if (before.length === after.length && differ.length <= 3) {
      return differ.map((i) => `\`${c.path}[${i}]\`: ${show(before[i])} → ${show(after[i])}`).join('、');
    }
    return `\`${c.path}\`: ${show(before)} → ${show(after)}（違う要素 ${differ.length} 個）`;
  }
  return `\`${c.path}\`: ${show(before)} → ${show(after)}`;
}

function nameOf(value: unknown): string {
  if (isRecord(value) && isRecord(value.name) && typeof value.name.ja === 'string') return value.name.ja;
  return show(value);
}

/** テキストの違いを、ja の文言・en の文言・改行と空白だけに分けた 1 行（例「ja の文言: skill1.description」） */
function textSummary(texts: readonly TextChange[]): string {
  const groups: [string, (t: TextChange) => boolean][] = [
    ['ja の文言', (t) => !t.whitespaceOnly && t.path.endsWith('.ja')],
    ['en の文言', (t) => !t.whitespaceOnly && t.path.endsWith('.en')],
    ['改行・空白だけ', (t) => t.whitespaceOnly],
  ];
  return groups
    .map(([label, pick]) => {
      const paths = [...new Set(texts.filter(pick).map((t) => t.path.replace(/\.(ja|en)$/, '')))];
      return paths.length === 0 ? null : `${label}: ${paths.map((p) => `\`${p}\``).join('・')}`;
    })
    .filter((s) => s !== null)
    .join('。');
}

/** 対応表（src/buildEffects.ts の CUBE_SKILL_EFFECTS / COLLECTION_SKILL_EFFECTS）に無いキューブ・コレクションのスキル */
export type UnmappedSkill = { owner: string; id: number; description: string };

export function renderReport(input: {
  base: string;
  characters: CharacterDiff;
  masters: { file: string; changes: Change[] }[];
  unmapped: UnmappedSkill[];
}): string {
  const { added, removed, changed } = input.characters;
  const out: string[] = [`# CDN のデータの差分（${input.base} → 作業ツリー）`, '', '## キャラの増減', ''];
  if (added.length === 0 && removed.length === 0) out.push('- なし');
  for (const c of added) out.push(`- 追加: ${characterLabel(c)}`);
  for (const c of removed) out.push(`- **削除**: ${characterLabel(c)}`);

  const mark = (c: CharacterChange) => `${c.defined ? '**定義済み** ' : ''}${c.resourceId} ${c.name}`;
  const withValues = changed.filter((c) => c.values.length > 0);
  out.push('', '## 値の変化（説明文とスキル名を除く）', '');
  if (withValues.length === 0) out.push('- なし');
  for (const c of withValues) {
    out.push(`- ${mark(c)}`);
    for (const v of c.values) out.push(`  - ${changeLine(v)}`);
  }

  const withTexts = changed.filter((c) => c.texts.length > 0);
  const toRead = withTexts.filter((c) => c.defined && c.texts.some((t) => !t.whitespaceOnly && t.path.endsWith('.ja')));
  out.push('', '## 説明文・スキル名の変化', '');
  if (withTexts.length === 0) out.push('- なし');
  if (toRead.length > 0) {
    out.push('定義済みキャラの ja の文言の変化（スキル定義の ref が指す値の意味が変わっていないかを読む）:', '');
    for (const c of toRead) {
      for (const t of c.texts.filter((x) => !x.whitespaceOnly && x.path.endsWith('.ja'))) {
        out.push(
          `### ${c.resourceId} ${c.name} \`${t.path}\``,
          '',
          '前:',
          '',
          '```',
          t.before,
          '```',
          '',
          '後:',
          '',
          '```',
          t.after,
          '```',
          '',
        );
      }
    }
    out.push('一覧:', '');
  }
  for (const c of withTexts) out.push(`- ${mark(c)}: ${textSummary(c.texts)}`);

  out.push('', '## マスタ（data/masters）', '');
  const masters = input.masters.filter((m) => m.changes.length > 0);
  if (masters.length === 0) out.push('- なし');
  for (const m of masters) {
    out.push(`- ${m.file}`);
    for (const v of m.changes) out.push(`  - ${changeLine(v)}`);
  }
  if (input.unmapped.length > 0) {
    out.push('', '対応表（src/buildEffects.ts）に無いキューブ・コレクションのスキル（説明文から対応を足す）:', '');
    for (const s of input.unmapped) out.push(`- ${s.owner} ${s.id}: ${s.description.replace(/\n/g, ' ')}`);
  }
  return `${out.join('\n')}\n`;
}
