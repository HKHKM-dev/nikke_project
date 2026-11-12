// スキル定義の読み込みの検査のうち、notes（未対応・前提の外などの注記）の読み込み。型は ../types.ts
import {
  INDIRECT_PATHS,
  type IndirectPath,
  NOTE_EFFECT_STATS,
  NOTE_EFFECT_TARGETS,
  NOTE_EFFECT_TRIGGERS,
  type NoteEffect,
  SKILL_EFFECT_KINDS,
  SKILL_NOTE_KINDS,
  type SkillNote,
  type Unknown,
} from '../types.ts';
import { fail, isRecord, type Json, oneOf, parseClaimRefs, parseLocalizedText, rejectUnknownKeys } from './common.ts';

export function parseNote(v: Json, path: string): SkillNote {
  const text = parseLocalizedText(v, path);
  if (!isRecord(v)) fail(path, 'expected an object');
  const note: SkillNote = { ...text, kind: oneOf(SKILL_NOTE_KINDS, v.kind, `${path}.kind`) };
  if (v.claims !== undefined) note.claims = parseClaimRefs(v.claims, `${path}.claims`);
  if (v.refers !== undefined) {
    if (note.kind !== 'modeling') fail(`${path}.refers`, `only allowed in a modeling note, found in ${note.kind}`);
    if (typeof v.refers !== 'string' || !NOTE_REFERS.test(v.refers))
      fail(`${path}.refers`, `expected "effects[<index>]", got ${JSON.stringify(v.refers)}`);
    note.refers = v.refers;
  }
  if (v.effect !== undefined) {
    if (note.kind === 'noDamage') fail(`${path}.effect`, 'not allowed in a noDamage note');
    if (note.refers !== undefined) fail(`${path}.effect`, 'a modeling note with refers takes its effect from there');
    note.effect = parseNoteEffect(v.effect, `${path}.effect`);
  }
  // 分類の設計書の論点 7（plan/design-indirect-notes.md 1.1・1.2 節）: 間接の経路と、読む側の印
  if (note.kind === 'indirect') {
    if (v.path === undefined) fail(`${path}.path`, 'required in an indirect note');
    note.path = oneOf(INDIRECT_PATHS, v.path, `${path}.path`);
  } else if (v.path !== undefined) fail(`${path}.path`, `only allowed in an indirect note, found in ${note.kind}`);
  if (v.reads !== undefined) {
    if (note.kind === 'noDamage' || note.kind === 'indirect')
      fail(`${path}.reads`, `not allowed in a ${note.kind} note (indirect paths do not chain)`);
    if (note.refers !== undefined) fail(`${path}.reads`, 'a modeling note with refers: write reads in the effect');
    note.reads = parseIndirectReads(v.reads, `${path}.reads`);
  }
  rejectUnknownKeys(v, ['ja', 'en', 'kind', 'claims', 'refers', 'effect', 'path', 'reads'], path);
  return note;
}

/** 分類の設計書の論点 7: 読む側の印（経路の id の列。空でなく、重ならない） */
export function parseIndirectReads(v: Json, path: string): IndirectPath[] {
  if (!Array.isArray(v) || v.length === 0) fail(path, 'expected a non-empty array of indirect paths');
  return v.map((x, i) => {
    const p = oneOf(INDIRECT_PATHS, x, `${path}[${i}]`);
    if (v.indexOf(x) !== i) fail(`${path}[${i}]`, `duplicate path ${p}`);
    return p;
  });
}

export const NOTE_REFERS = /^effects\[(\d+)\]$/;

/** notes の effect（plan/design-minimal-relevance.md 3.3 節）。各欄は語彙か 'unknown' */
function parseNoteEffect(v: Json, path: string): NoteEffect {
  if (!isRecord(v)) fail(path, 'expected an object');
  rejectUnknownKeys(v, ['kind', 'stat', 'target', 'trigger'], path);
  const orUnknown = <T extends string>(allowed: readonly T[], value: Json, at: string): T | Unknown =>
    value === 'unknown' ? 'unknown' : oneOf(allowed, value, at);
  const effect: NoteEffect = { kind: orUnknown(SKILL_EFFECT_KINDS, v.kind, `${path}.kind`) };
  const required = {
    stat: effect.kind === 'passive' || effect.kind === 'timed',
    target: effect.kind === 'passive' || effect.kind === 'timed',
    trigger: effect.kind === 'timed',
  };
  for (const key of ['stat', 'target', 'trigger'] as const)
    if (required[key] && v[key] === undefined) fail(`${path}.${key}`, `required for ${effect.kind} (or "unknown")`);
  if (v.stat !== undefined) effect.stat = orUnknown(NOTE_EFFECT_STATS, v.stat, `${path}.stat`);
  if (v.target !== undefined) effect.target = orUnknown(NOTE_EFFECT_TARGETS, v.target, `${path}.target`);
  if (v.trigger !== undefined) effect.trigger = orUnknown(NOTE_EFFECT_TRIGGERS, v.trigger, `${path}.trigger`);
  return effect;
}
