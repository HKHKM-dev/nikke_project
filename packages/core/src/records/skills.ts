// スキル定義の根拠（plan/skills-guide.md 3 節）。定義の効果・notes に書いた結論の ID（claims）を結論の台帳と突き合わせ、
// キャラ × スロットの対応状況の一覧（plan/skills.md）を生成する。
// 効果と結論の対応は定義の claims を正にし、結論の側（plan/claims.md の「定義」の行）へは生成で逆に引く。
// 結論の model の文が定義の場所（`data/skills/830.json` の skill1 の effects[0] など）を書いているときは、その場所が
// 定義の claims でその結論を指しているかも確かめる（効果の並べ替えで文が古くなるのを止める）。
import {
  SKILL_NOTE_KINDS,
  SKILL_SLOTS,
  type SkillDefinition,
  type SkillEffect,
  type SkillEntry,
  type SkillNoteKind,
  type SkillSupport,
} from '../skills/types.ts';
import type { LocalizedText, SkillSlot } from '../types.ts';
import type { Claim, ClaimState } from './claims.ts';

export type SkillRoot = 'skills' | 'treasureSkills';
const SKILL_ROOTS: readonly SkillRoot[] = ['skills', 'treasureSkills'];

/** 定義済みのキャラ（data/skills/index.json の順） */
export type DefinedCharacter = { definition: SkillDefinition; name: LocalizedText };

/** 定義の中の場所。index が無いのは「そのスロットの notes のどれか」（結論の model の「skill1 の notes」） */
export type SkillPlace = {
  resourceId: number;
  root: SkillRoot;
  slot: SkillSlot;
  part: 'effects' | 'notes';
  index?: number;
};

/** `data/skills/352.json` の treasureSkills.skill1 の effects[1]（基礎版は skills. を省く） */
export function formatPlace(p: SkillPlace): string {
  const slot = p.root === 'skills' ? p.slot : `${p.root}.${p.slot}`;
  const part = p.index === undefined ? p.part : `${p.part}[${p.index}]`;
  return `\`data/skills/${p.resourceId}.json\` の ${slot} の ${part}`;
}

export function entriesOf(def: SkillDefinition): { root: SkillRoot; slot: SkillSlot; entry: SkillEntry }[] {
  return SKILL_ROOTS.flatMap((root) =>
    SKILL_SLOTS.flatMap((slot) => {
      const entry = root === 'skills' ? def.skills[slot] : def.treasureSkills?.[slot];
      return entry === undefined ? [] : [{ root, slot, entry }];
    }),
  );
}

/** 定義の効果・notes のうち claims を書いたもの（定義の中の順） */
export function claimCitations(def: SkillDefinition): { place: SkillPlace; claims: string[] }[] {
  const out: { place: SkillPlace; claims: string[] }[] = [];
  for (const { root, slot, entry } of entriesOf(def)) {
    const base = { resourceId: def.resourceId, root, slot };
    entry.effects.forEach((e, index) => {
      if (e.claims !== undefined) out.push({ place: { ...base, part: 'effects', index }, claims: e.claims });
    });
    entry.notes?.forEach((n, index) => {
      if (n.claims !== undefined) out.push({ place: { ...base, part: 'notes', index }, claims: n.claims });
    });
  }
  return out;
}

/** 結論 ID → それを claims に書いた定義の場所（plan/claims.md の「定義」の行） */
export function definitionPlacesByClaim(characters: readonly DefinedCharacter[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const { definition } of characters) {
    for (const { place, claims } of claimCitations(definition)) {
      for (const id of claims) map.set(id, [...(map.get(id) ?? []), formatPlace(place)]);
    }
  }
  return map;
}

const MODEL_FILE = /data\/skills\/(\d+)\.json/g;
const MODEL_TOKEN =
  /(?:\b(treasureSkills|skills)\.)?\b(skill1|skill2|burst)\b(?!\.)|\b(effects|notes)\b(?:\[(\d+)\])?|全スロット/g;

/**
 * 結論の model の文から、定義のファイルと場所を拾う。ファイル名の後から次のファイル名までを、
 * 「(treasureSkills.|skills.)skill1 の effects[0]」「burst の effects[0]（…）と effects[2]」「skill1 の notes」「全スロットの notes」の形で読む。
 * 場所の書かれていないファイル（「S1 の段の gaugeHits」など）は、場所を空で返す
 */
export function definitionPlacesInModel(model: string): Map<number, SkillPlace[]> {
  const files = [...model.matchAll(MODEL_FILE)];
  const out = new Map<number, SkillPlace[]>();
  files.forEach((m, i) => {
    const resourceId = Number(m[1]);
    const segment = model.slice(m.index + m[0].length, files[i + 1]?.index ?? model.length);
    const places = out.get(resourceId) ?? [];
    let root: SkillRoot = 'skills';
    let slots: SkillSlot[] = [];
    for (const t of segment.matchAll(MODEL_TOKEN)) {
      if (t[0] === '全スロット') {
        root = 'skills';
        slots = [...SKILL_SLOTS];
      } else if (t[2] !== undefined) {
        root = (t[1] as SkillRoot | undefined) ?? 'skills';
        slots = [t[2] as SkillSlot];
      } else if (t[3] !== undefined) {
        const part = t[3] as 'effects' | 'notes';
        // effects は番号つきだけを場所とみなす（「効果の effects」のような語は読まない）
        if (part === 'effects' && t[4] === undefined) continue;
        for (const slot of slots) {
          places.push({ resourceId, root, slot, part, ...(t[4] === undefined ? {} : { index: Number(t[4]) }) });
        }
      }
    }
    out.set(resourceId, places);
  });
  return out;
}

function citedAt(def: SkillDefinition, place: SkillPlace, claimId: string): boolean | undefined {
  const entry = place.root === 'skills' ? def.skills[place.slot] : def.treasureSkills?.[place.slot];
  if (entry === undefined) return undefined;
  const items: { claims?: string[] }[] = place.part === 'effects' ? entry.effects : (entry.notes ?? []);
  if (place.index === undefined) return items.length === 0 ? undefined : items.some((x) => x.claims?.includes(claimId));
  const item = items[place.index];
  return item === undefined ? undefined : (item.claims?.includes(claimId) ?? false);
}

/**
 * 定義の claims と結論の突き合わせ。
 * - 定義の claims が指す結論は実在し、棄却でない（棄却なら置き換えた結論を指す）
 * - 棄却でない結論の model が定義の場所を書いていれば、その場所があり、claims でその結論を指している。
 *   ファイルだけを書いていれば、そのファイルのどこかの claims がその結論を指している
 */
export function validateSkillClaims(characters: readonly DefinedCharacter[], claims: readonly Claim[]): string[] {
  const errors: string[] = [];
  const byId = new Map(claims.map((c) => [c.id, c]));
  const defs = new Map(characters.map((c) => [c.definition.resourceId, c.definition]));
  for (const { definition } of characters) {
    for (const { place, claims: ids } of claimCitations(definition)) {
      for (const id of ids) {
        const claim = byId.get(id);
        if (claim === undefined) errors.push(`${formatPlace(place)}: 結論 ${id} が無い`);
        else if (claim.state === '棄却') {
          const by = claims.filter((c) => c.replaces.includes(id)).map((c) => c.id);
          errors.push(
            `${formatPlace(place)}: 結論 ${id} は棄却（${by.length > 0 ? `置き換えた ${by.join('・')} を指す` : '置き換えた結論を指す'}）`,
          );
        }
      }
    }
  }
  for (const claim of claims) {
    if (claim.state === '棄却') continue;
    for (const [resourceId, places] of definitionPlacesInModel(claim.model)) {
      const def = defs.get(resourceId);
      if (def === undefined) {
        errors.push(`${claim.id}: モデル側の data/skills/${resourceId}.json が定義に無い`);
        continue;
      }
      if (places.length === 0) {
        const cited = claimCitations(def).some((c) => c.claims.includes(claim.id));
        if (!cited)
          errors.push(
            `${claim.id}: モデル側に data/skills/${resourceId}.json があるが、定義のどの claims もこの結論を指していない`,
          );
        continue;
      }
      for (const place of places) {
        const cited = citedAt(def, place, claim.id);
        if (cited === undefined) errors.push(`${claim.id}: モデル側の ${formatPlace(place)} が定義に無い`);
        else if (!cited)
          errors.push(`${claim.id}: モデル側の ${formatPlace(place)} の claims がこの結論を指していない`);
      }
    }
  }
  return errors;
}

// ---- plan/skills.md（生成） ----

const SKILLS_HEADER = `# スキル定義の対応状況

- **このファイルは生成する（手で書かない）**。定義は \`packages/core/data/skills/{resourceId}.json\` に置き、\`npm run records:check\` で作り直す（[skills-guide.md](skills-guide.md) 3 節）。
- キャラ × スロットごとに、対応状況と、効果・notes と、その根拠の結論（定義の \`claims\`。後ろの括弧は結論の状態）を並べる。結論の中身は [claims.md](claims.md)。
- 対応状況は効果と notes の種類から決まる（[design-skill-note-kinds.md](design-skill-note-kinds.md) 2.2 節）: \`supported\`（効果あり・未対応なし）・\`partial\`（効果あり・未対応あり）・\`unsupported\`（効果なし・未対応あり）・\`noEffect\`（前提の中でダメージに効く効果なし）。
- notes の種類（同 2.1 節）: 未対応（前提の中でダメージに効くのに定義していない）・前提の外（静止単体ボス・被弾なしなどの前提では起きない）・計算に無関係・補足。
- 「根拠なし」は、まだ結論に結び付けていない効果・notes。Stage 11 までの定義は、最小構成の録画の読み直しか新しい撮影で結論を作ったときに結び付ける（凍結の記録からは写さない。[skills-guide.md](skills-guide.md) 0 節）。`;

function triggerLabel(e: SkillEffect): string | undefined {
  if (!('trigger' in e)) return undefined;
  const t = e.trigger;
  if (typeof t === 'string') return t;
  if ('everySeconds' in t) return `${t.everySeconds} 秒ごと`;
  return t.count;
}

/** 効果の短い説明（kind・トリガー・stat か damageType） */
export function effectLabel(e: SkillEffect): string {
  const detail = 'stat' in e ? e.stat : 'damageType' in e ? e.damageType : undefined;
  return [e.kind, triggerLabel(e), detail].filter((x) => x !== undefined).join('・');
}

const NOTE_KIND_LABEL: Record<SkillNoteKind, string> = {
  unimplemented: '未対応',
  outOfScope: '前提の外',
  noDamage: '計算に無関係',
  modeling: '補足',
};
const SUPPORT_ORDER: readonly SkillSupport[] = ['supported', 'partial', 'unsupported', 'noEffect'];

function claimList(ids: readonly string[] | undefined, states: ReadonlyMap<string, ClaimState>): string {
  if (ids === undefined) return '根拠なし';
  return ids.map((id) => `${id}（${states.get(id) ?? '不明'}）`).join('、');
}

/** plan/skills.md の全文。キャラは index.json の順、スロットは基礎版 → 宝物版の順 */
export function renderSkills(characters: readonly DefinedCharacter[], claims: readonly Claim[]): string {
  const states = new Map(claims.map((c) => [c.id, c.state]));
  let effects = 0;
  let citedEffects = 0;
  let notes = 0;
  let citedNotes = 0;
  const noteKinds = new Map<SkillNoteKind, number>(SKILL_NOTE_KINDS.map((k) => [k, 0]));
  const supports = new Map<SkillSupport, number>();
  const body: string[] = [];
  for (const { definition, name } of characters) {
    body.push('', `## ${definition.resourceId} ${name.ja}`, '');
    for (const { root, slot, entry } of entriesOf(definition)) {
      body.push(`- **${root === 'skills' ? slot : `宝物版 ${slot}`}**: ${entry.support}`);
      supports.set(entry.support, (supports.get(entry.support) ?? 0) + 1);
      entry.effects.forEach((e, i) => {
        effects++;
        if (e.claims !== undefined) citedEffects++;
        body.push(`  - effects[${i}] ${effectLabel(e)}: ${claimList(e.claims, states)}`);
      });
      entry.notes?.forEach((n, i) => {
        notes++;
        if (n.claims !== undefined) citedNotes++;
        noteKinds.set(n.kind, noteKinds.get(n.kind)! + 1);
        body.push(`  - notes[${i}] ${NOTE_KIND_LABEL[n.kind]}: ${n.ja}: ${claimList(n.claims, states)}`);
      });
    }
  }
  const summary = `件数: キャラ ${characters.length}・効果 ${effects}（根拠あり ${citedEffects}）・notes ${notes}（根拠あり ${citedNotes}）`;
  const kindSummary = `notes の種類: ${SKILL_NOTE_KINDS.map((k) => `${NOTE_KIND_LABEL[k]} ${noteKinds.get(k)}`).join('・')}`;
  const supportSummary = `スロット: ${SUPPORT_ORDER.map((s) => `${s} ${supports.get(s) ?? 0}`).join('・')}`;
  return `${[SKILLS_HEADER, '', summary, '', kindSummary, '', supportSummary, ...body].join('\n')}\n`;
}
