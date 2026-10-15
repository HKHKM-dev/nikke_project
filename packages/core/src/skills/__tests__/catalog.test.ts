// スキルの効果の分類（plan/design-skill-catalog.md の論点 2・11 節）: 読み違いの直し（説明文の書き損じ・句の読み方）と、
// plan/skill-catalog.md が最新であること。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SKILL_CATALOG_PATH, loadCatalogInput } from '../../../scripts/records-data.ts';
import { classifyCharacters, classifyQuote, cleanDescription } from '../catalog.ts';
import { renderSkillCatalog } from '../catalogDoc.ts';

const { characters, defined } = loadCatalogInput();
const { lines, effects } = classifyCharacters(characters, defined);

describe('skill catalog', () => {
  it('matches plan/skill-catalog.md (npm run skills:catalog)', () => {
    expect(readFileSync(SKILL_CATALOG_PATH, 'utf8')).toBe(renderSkillCatalog(lines, effects));
  });

  it('fixes the misprints in the descriptions', () => {
    // ロザンナ：シックオーシャンの閉じ括弧の欠け
    expect(
      cleanDescription(
        '「最終攻撃力の{description_value_03}％の持続ダメージ」「1秒間隔「{description_value_04}秒間維持」',
      ),
    ).toBe('「最終攻撃力のX％の持続ダメージ」「1秒間隔」「X秒間維持」');
    // ギルティ：マイティバニーの 1 か所だけ「：」の無い名前
    expect(cleanDescription('「<word_group=10110>バニーモードスタンス」')).toBe('「バニーモード：スタンス」');
    const dot = effects.find((e) => e.rid === 283 && e.slot === 'skill2' && e.kind === 'damage:dot');
    expect(dot?.mods).toEqual(['meta:interval', 'dur:seconds']);
  });

  it('reads a value written before the stat name', () => {
    // マルチャーナのバースト
    expect(classifyQuote('スキル発動者の防御力に比例してX％防御力▲')).toEqual({
      kind: 'stat',
      stat: { name: '防御力', canon: 'defense', dir: 'up', scaling: 'casterDefense' },
    });
  });

  it('skips the headings inside a weapon change', () => {
    // マクスウェル：オーディナリーメカニックのバーストの「チャージ時間」
    expect(classifyQuote('チャージ時間').kind).toBe('meta:weaponProp');
  });

  it('reads a cap after the colon as a modifier, and a counter is not a state', () => {
    expect(classifyQuote('勇者レベルアップ：最大11レベルまで成長')).toEqual({
      kind: 'resource',
      counter: '勇者レベルアップ',
      text: '勇者レベルアップ：最大11レベルまで成長',
      mods: ['stack:cap'],
    });
    expect(classifyQuote('乗車券1枚発券：最大2枚まで')).toMatchObject({ kind: 'resource', counter: '乗車券' });
    expect(classifyQuote('ペインロード：最大3段階')).toEqual({
      kind: 'state:grant',
      state: 'ペインロード',
      mods: ['stack:cap'],
    });
  });

  it('tells removal (解除) from cancellation (消去), including names with a colon', () => {
    expect(classifyQuote('マターシグマ解除')).toEqual({ kind: 'state:remove', state: 'マターシグマ' });
    expect(classifyQuote('みんなの星消去')).toEqual({ kind: 'state:cancel', state: 'みんなの星' });
    // ミントの S2
    expect(classifyQuote('ステージパート：ボーカル消去')).toEqual({
      kind: 'state:cancel',
      state: 'ステージパート：ボーカル',
    });
    // 被弾で外れる効果は消去・解除の行ではない
    expect(classifyQuote('愛嬌：単一攻撃対象から除外直接攻撃を受けると解除').kind).toBe('shield:untargetable');
  });

  it('reads "debuffed allies, N at random" as a target, not a condition', () => {
    // ココアの S1
    const dispel = effects.find((e) => e.rid === 311 && e.slot === 'skill1' && e.kind === 'buffOp:dispel');
    expect(dispel?.targets).toEqual(['ally:debuffed']);
    expect(dispel?.conditions).toEqual([]);
  });

  it('keeps every line and effect of every character', () => {
    expect(new Set(lines.map((l) => l.rid)).size).toBe(characters.length);
    expect(effects.every((e) => !e.kind.startsWith('meta:'))).toBe(true);
  });
});
