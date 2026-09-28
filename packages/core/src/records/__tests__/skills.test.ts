// スキル定義の根拠（plan/skills-guide.md 3 節）: 定義の claims と結論の突き合わせと、plan/skills.md が最新であること。
// 件数や ID の一覧は直書きしない（plan/design-stage20.md 3.6 節）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SKILLS_DOC_PATH, loadClaims, loadSkillDefinitions } from '../../../scripts/records-data.ts';
import { parseSkillDefinition, type SkillDefinition } from '../../skills/types.ts';
import type { Claim } from '../claims.ts';
import {
  claimCitations,
  definitionPlacesByClaim,
  definitionPlacesInModel,
  formatPlace,
  renderSkills,
  validateSkillClaims,
  type DefinedCharacter,
} from '../skills.ts';

const characters = loadSkillDefinitions();
const claims = loadClaims();

describe('スキル定義の claims（実データ）', () => {
  it('points only to existing claims that are not 棄却, and agrees with the places in the claims’ model', () => {
    expect(validateSkillClaims(characters, claims)).toEqual([]);
  });

  it('matches plan/skills.md (npm run records:check)', () => {
    expect(readFileSync(SKILLS_DOC_PATH, 'utf8')).toBe(renderSkills(characters, claims));
  });
});

const definition = (): Record<string, unknown> => ({
  formatVersion: 1,
  resourceId: 9001,
  checkedAt: '2026-09-28',
  skills: {
    skill1: {
      support: 'supported',
      effects: [
        { kind: 'passive', target: 'self', stat: 'attack', ref: 1, claims: ['C-0001'] },
        { kind: 'dot', trigger: 'burstUse', ref: 2, intervalSeconds: 1, durationSeconds: 10 },
      ],
    },
    skill2: {
      support: 'unsupported',
      effects: [],
      notes: [
        { ja: 'a', en: 'a' },
        { ja: 'b', en: 'b', claims: ['C-0002', 'C-0003'] },
      ],
    },
    burst: { support: 'supported', effects: [{ kind: 'burstDamage', ref: 1, damageType: 'skill' }] },
  },
});

const claim = (patch: Partial<Claim> & { id: string }): Claim => ({
  text: 't',
  state: '確定',
  topic: 'スキル・キャラ固有',
  grade: '厳密一致',
  basis: 'b',
  model: 'm',
  replaces: [],
  updated: '2026-09-28',
  observations: [],
  ...patch,
});

function defined(raw: Record<string, unknown>): DefinedCharacter {
  return { definition: parseSkillDefinition(raw), name: { ja: '試し', en: 'Test' } };
}

describe('定義の claims の読み込み', () => {
  it('keeps the claims of effects and notes', () => {
    const def: SkillDefinition = parseSkillDefinition(definition());
    expect(def.skills.skill1.effects[0]!.claims).toEqual(['C-0001']);
    expect(def.skills.skill1.effects[1]!.claims).toBeUndefined();
    expect(def.skills.skill2.notes?.[1]).toEqual({ ja: 'b', en: 'b', claims: ['C-0002', 'C-0003'] });
    expect(claimCitations(def).map((c) => [formatPlace(c.place), c.claims])).toEqual([
      ['`data/skills/9001.json` の skill1 の effects[0]', ['C-0001']],
      ['`data/skills/9001.json` の skill2 の notes[1]', ['C-0002', 'C-0003']],
    ]);
  });

  it('rejects malformed claims', () => {
    const cases: [unknown, RegExp][] = [
      [[], /non-empty/],
      ['C-0001', /non-empty/],
      [['C-12'], /C-<4\+ digits>/],
      [['C-0001', 'C-0001'], /duplicate/],
    ];
    for (const [value, message] of cases) {
      const raw = definition();
      (raw.skills as Record<string, { effects: Record<string, unknown>[] }>).skill1!.effects[1]!.claims = value;
      expect(() => parseSkillDefinition(raw), JSON.stringify(value)).toThrow(message);
      const note = definition();
      (note.skills as Record<string, { notes: Record<string, unknown>[] }>).skill2!.notes[0]!.claims = value;
      expect(() => parseSkillDefinition(note), JSON.stringify(value)).toThrow(message);
    }
  });
});

describe('結論の model の文から定義の場所を拾う', () => {
  it('reads files, slots, effects and notes', () => {
    const read = (model: string) =>
      [...definitionPlacesInModel(model)].map(([rid, places]) => [rid, places.map((p) => formatPlace(p))]);
    expect(
      read(
        '`data/skills/830.json` の burst の effects[0]（timed・attackDamage）と effects[2]（timed・hitRate）。`skills/heals.ts` の `createHealWindow`',
      ),
    ).toEqual([
      [830, ['`data/skills/830.json` の burst の effects[0]', '`data/skills/830.json` の burst の effects[2]']],
    ]);
    expect(
      read(
        '`data/skills/352.json` の treasureSkills.skill1 の effects[1]（burstGauge）と skills.skill2 の effects[0]（skills.skill1 は C-0097）',
      ),
    ).toEqual([
      [
        352,
        [
          '`data/skills/352.json` の treasureSkills.skill1 の effects[1]',
          '`data/skills/352.json` の skill2 の effects[0]',
        ],
      ],
    ]);
    expect(read('`data/skills/20.json` の全スロットの notes（効果なし）')).toEqual([
      [
        20,
        [
          '`data/skills/20.json` の skill1 の notes',
          '`data/skills/20.json` の skill2 の notes',
          '`data/skills/20.json` の burst の notes',
        ],
      ],
    ]);
    // 場所の読めない書き方はファイルだけ。ファイルが 2 つなら、それぞれの後ろを読む
    expect(
      read('`data/skills/225.json` の S1 の段の `gaugeHits`。`data/skills/160.json` の skill2 の effects[1]'),
    ).toEqual([
      [225, []],
      [160, ['`data/skills/160.json` の skill2 の effects[1]']],
    ]);
    expect(read('`frame/plan.ts` の `dotTickFrames`')).toEqual([]);
  });
});

describe('定義の claims と結論の突き合わせ', () => {
  it('reports missing and rejected claims, and model places that do not point back', () => {
    const errors = validateSkillClaims(
      [defined(definition())],
      [
        claim({ id: 'C-0001', model: '`data/skills/9001.json` の skill1 の effects[0]' }),
        claim({ id: 'C-0002', state: '棄却', model: '`data/skills/9001.json` の skill1 の effects[1]' }),
        claim({ id: 'C-0004', replaces: ['C-0002'], model: '`data/skills/9001.json` の skill1 の effects[1]' }),
        claim({ id: 'C-0005', model: '`data/skills/9001.json` の skill1 の effects[5]・burst の notes' }),
        claim({ id: 'C-0006', model: '`data/skills/9001.json` の S2' }),
        claim({ id: 'C-0007', model: '`data/skills/9002.json`' }),
        claim({ id: 'C-0008', model: '`data/skills/9001.json` の skill2 の notes' }),
      ],
    );
    expect(errors).toEqual([
      '`data/skills/9001.json` の skill2 の notes[1]: 結論 C-0002 は棄却（置き換えた C-0004 を指す）',
      '`data/skills/9001.json` の skill2 の notes[1]: 結論 C-0003 が無い',
      'C-0004: モデル側の `data/skills/9001.json` の skill1 の effects[1] の claims がこの結論を指していない',
      'C-0005: モデル側の `data/skills/9001.json` の skill1 の effects[5] が定義に無い',
      'C-0005: モデル側の `data/skills/9001.json` の burst の notes が定義に無い',
      'C-0006: モデル側に data/skills/9001.json があるが、定義のどの claims もこの結論を指していない',
      'C-0007: モデル側の data/skills/9002.json が定義に無い',
      'C-0008: モデル側の `data/skills/9001.json` の skill2 の notes の claims がこの結論を指していない',
    ]);
  });

  it('renders the places back into claims.md and lists every slot in skills.md', () => {
    const chars = [defined(definition())];
    expect(definitionPlacesByClaim(chars).get('C-0002')).toEqual(['`data/skills/9001.json` の skill2 の notes[1]']);
    const doc = renderSkills(chars, [claim({ id: 'C-0001', state: '仮説' })]);
    expect(doc).toContain('## 9001 試し');
    expect(doc).toContain('  - effects[0] passive・attack: C-0001（仮説）');
    expect(doc).toContain('  - effects[1] dot・burstUse: 根拠なし');
    expect(doc).toContain('  - notes[1] b: C-0002（不明）、C-0003（不明）');
    expect(doc).toContain('- **burst**: supported');
  });
});
