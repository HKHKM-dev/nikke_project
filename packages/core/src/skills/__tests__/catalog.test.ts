// スキルの効果の分類（plan/design-skill-catalog.md の論点 2・11 節）: 読み違いの直し（説明文の書き損じ・
// 句の読み方）。
import { describe, expect, it } from 'vitest';
import { loadCatalogInput } from '../../../scripts/records-data.ts';
import { classifyCharacters, classifyQuote, cleanDescription } from '../catalog.ts';

const { characters, defined } = loadCatalogInput();
const { lines, effects } = classifyCharacters(characters, defined);

describe('skill catalog', () => {
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

  it('does not read the name of a state inside a condition as an effect (トーブ S2)', () => {
    const tove = effects.filter((e) => e.name === 'トーブ' && e.slot === 'skill2');
    expect(tove.map((e) => [e.li, e.quote])).toEqual([
      [0, 'クリティカル確率X％▲'],
      [1, '攻撃速度X％▲'],
    ]);
    // 頭は条件の節の後ろまで延び、宝物版（「」の無い書き方）と同じく条件を読む
    expect(tove.map((e) => e.head)).toEqual([
      '自分が「応急改造」のフルスタック状態の時のみ、味方全体に',
      '自分が「応急改造」のフルスタック状態の時のみ、ショットガンを所持する味方全体に',
    ]);
    expect(tove.every((e) => e.conditions.includes('selfState:fullStack'))).toBe(true);
  });

  it('skips a quote that a condition clause encloses, and keeps a quote that ends before a new clause', () => {
    const base = characters[0]!;
    const quotesOf = (text: string) => {
      const skill = { ...base.skills.skill1, description: { ...base.skills.skill1.description, ja: text } };
      const c = { ...base, treasure: null, skills: { ...base.skills, skill1: skill } };
      return classifyCharacters([c], new Set())
        .effects.filter((e) => e.slot === 'skill1')
        .map((e) => [e.quote, e.targets, e.mods ?? []]);
    };
    expect(quotesOf('■自分が「甲」のフルスタック状態の時のみ、味方全体に「攻撃力X％▲」「持続」')).toEqual([
      ['攻撃力X％▲', ['ally:allies'], ['dur:permanent']],
    ]);
    expect(quotesOf('■自分が「甲」状態なら、自分に「乙」')).toEqual([['乙', ['self'], []]]);
    // 行の途中の条件の節
    expect(quotesOf('■自分に「乙」自分が「甲」状態なら、敵全体に「丙」')).toEqual([
      ['乙', ['self'], []],
      ['丙', ['enemy:all'], []],
    ]);
    // 句の後ろで別の文が始まり、その文が条件の節で終わる形は、句を節の外とみる
    expect(quotesOf('■自分に「攻撃力X％▲」「持続」「解除不可」敵がX機以上の場合、自分に「乙」')).toEqual([
      ['攻撃力X％▲', ['self'], ['dur:permanent', 'meta:undispellable']],
      ['乙', ['self'], []],
    ]);
    // 「：機能：〜時、」の説明が続く句は効果
    expect(quotesOf('■敵全体に「丙」：機能：丙が終了した時、追加でダメージ').map(([q]) => q)).toEqual(['丙']);
  });

  it('tells an ally Burst use from her own Burst use', () => {
    const triggersOf = (rid: number, slot: string, li: number) =>
      lines.find((l) => l.rid === rid && l.slot === slot && l.li === li)?.triggers;
    // ルピー：ウィンターショッパーの S2「味方がバーストスキルを使用した時」（plan/design-rupee-ws.md 2.1 節）
    expect(triggersOf(203, 'skill2', 0)).toEqual(['allyBurstUse']);
    // デルタの S2「バーストスキルを使用した時、自分に」は自分のバースト
    expect(triggersOf(20, 'skill2', 0)).toEqual(['burstUse']);
  });

  it('reads the targets of a line head and a sub-item head after the condition clause', () => {
    const targetsOf = (name: string, slot: string, li: number) =>
      effects.filter((e) => e.name === name && e.slot === slot && e.li === li).map((e) => e.targets);
    // 「自分の両隣の味方のうち1機が…になった時、味方全体に」の両隣は条件の節
    expect(targetsOf('フローラ', 'skill2', 0)).toEqual([['ally:allies']]);
    expect(lines.find((l) => l.name === 'フローラ' && l.slot === 'skill2' && l.li === 0)?.targets).toEqual([
      'ally:allies',
    ]);
    // 「遮蔽物が攻撃を受けた時、自分に」の遮蔽物はきっかけの節
    expect(targetsOf('シュガー', 'treasure.skill1', 0)).toEqual([['self'], ['self'], ['self']]);
    // 「〜なら、対象に」の対象は、条件の節に書かれた味方
    expect(targetsOf('ビスケット', 'skill2', 0)).toEqual([['ally:alliesFiltered'], ['ally:alliesFiltered']]);
    expect(targetsOf('トリナ', 'skill1', 1)).toEqual([['ally:lowestHpRatio']]);
    // 条件の節でない「遮蔽物が破壊された〜味方」は変わらない（「〜味方のうち、」は上のココアのテスト）
    expect(targetsOf('リリー', 'burst', 0)).toEqual([
      ['ally:random', 'cover'],
      ['ally:random', 'cover'],
    ]);
  });

  it('reads the targets after the condition clause, past a listing comma and a note in parentheses', () => {
    const base = characters[0]!;
    const targetsOf = (text: string) => {
      const skill = { ...base.skills.skill1, description: { ...base.skills.skill1.description, ja: text } };
      const c = { ...base, treasure: null, skills: { ...base.skills, skill1: skill } };
      return classifyCharacters([c], new Set())
        .effects.filter((e) => e.slot === 'skill1')
        .map((e) => [e.quote, e.targets]);
    };
    expect(targetsOf('■遮蔽物が攻撃を受けた時、自分に「乙」')).toEqual([['乙', ['self']]]);
    expect(targetsOf('■戦闘不能状態の味方がX機以上の場合、敵全体に「乙」')).toEqual([['乙', ['enemy:all']]]);
    // 小項目の頭
    expect(targetsOf('■自分に「甲」効果2：防御型の味方がいる場合、敵全体に「乙」')).toEqual([
      ['甲', ['self']],
      ['乙', ['enemy:all']],
    ]);
    // 「対象に」は条件の節の対象を指す。条件の節に対象が無ければ、命中した敵
    expect(targetsOf('■防御型の味方のHPがX％以下なら、対象に「乙」')).toEqual([['乙', ['ally:alliesFiltered']]]);
    expect(targetsOf('■フルチャージ攻撃が命中した時、対象に「乙」')).toEqual([['乙', ['enemy:hit']]]);
    expect(targetsOf('■自分に「甲」効果2：自分に丙が適用中の場合、対象に「乙」')).toEqual([
      ['甲', ['self']],
      ['乙', ['enemy:hit']],
    ]);
    // 条件の節の後ろで「、」で並べた対象と、括弧（全角・半角）の中の「、」
    expect(
      targetsOf('■遮蔽物が攻撃を受けた時、自分を除く味方全体に(対象が足りない場合、自分も対象となる)「乙」'),
    ).toEqual([['乙', ['ally:alliesExceptSelf']]]);
    expect(targetsOf('■遮蔽物が攻撃を受けた時、敵全体、及び対象に「乙」')).toEqual([
      ['乙', ['enemy:all', 'enemy:hit']],
    ]);
    expect(
      targetsOf('■遮蔽物が攻撃を受けた時、自分を除く味方全体に（対象が足りない場合、自分も対象となる）「乙」'),
    ).toEqual([['乙', ['ally:alliesExceptSelf']]]);
  });

  it('keeps every line and effect of every character', () => {
    expect(new Set(lines.map((l) => l.rid)).size).toBe(characters.length);
    expect(effects.every((e) => !e.kind.startsWith('meta:'))).toBe(true);
  });
});
