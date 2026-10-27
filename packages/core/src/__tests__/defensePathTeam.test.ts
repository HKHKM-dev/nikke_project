// 2 段目の段 7（plan/design-skill-stage7.md）: 防御力の経路。枠の防御力（バフ前。defenceOverride とスペック固定）、防御力▲（stat defense）、
// 対象の絞り込み「自分と自分より最終防御力が低い味方」（targetDefense: lowerThanSelf。アニス：スター（17）の S2 の発射体爆発ダメージ▲。
// C-0587・C-0588）。撮影の見込みの編成（2.2 節の録画 A・B）と録画 0163 の編成の対象の枠、sim と calc の整合。論点 4 の続き: 味方の
// 防御力▲ も比べに入る（デルタ（20）の S2 を間接の notes から効果にした。C-0589。録画 0486 でデルタが外れ、録画 0488 で入る）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countShotsInRanges } from '../frame/shots.ts';
import { runTeam } from './runTeam.ts';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets, targetProfileForEnemy } from '../enemies.ts';
import {
  computeFixedSpecAttack,
  computeFixedSpecDefence,
  computeFixedSpecHp,
  FIXED_SPEC_ENEMY_DEFENCE,
} from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { METRICS } from '../records/observations.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS, resolveTimed } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { battleSecondsToFrames, gameSecondsToFrames } from '../time.ts';
import type { CharacterData } from '../types.ts';
import { piecesOf } from './historyHelpers.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const ANIS_STAR = 17;
const DELTA = 20;
const ISABEL = 231;
const FLOWER = 304;
const CINDERELLA = 511;
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
const definitionOf = (id: number) => parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`));
const fixedDefence = (id: number) => computeFixedSpecDefence(character(id));

function fixedSlot(id: number, extra: Partial<TeamSlotInput> = {}): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  return {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(c),
    defenceOverride: computeFixedSpecDefence(c),
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: { definition: definitionOf(id), levels: MAX_SKILL_LEVELS },
    ...extra,
  };
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };

function team(slots: TeamSlotInput[], controlledSlot: number): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst: true, controlledSlot };
}

// 2.2 節の録画 A（同値）: フラワー（I・1 枠目）・アニス：スター（I・2 枠目）・デルタ（II）・シンデレラ（III・操作）
const TIE = team([fixedSlot(FLOWER), fixedSlot(ANIS_STAR), fixedSlot(DELTA), fixedSlot(CINDERELLA)], 3);
// 同じく録画 B（対照）: アニス：スター（I）・デルタ（II）・シンデレラ（III・操作）
const CONTROL = team([fixedSlot(ANIS_STAR), fixedSlot(DELTA), fixedSlot(CINDERELLA)], 2);
// 録画 0163 の編成: デルタ・アニス：スター（操作）・フラワー・イサベル
const REC163 = team([fixedSlot(DELTA), fixedSlot(ANIS_STAR), fixedSlot(FLOWER), fixedSlot(ISABEL)], 1);
// 録画 B の編成を、画面の既定（カスタムの敵に射撃場の的の表・条件は自動）で: II（デルタ）の CT 待ちで、アニス：スターの
// 防御力▲（10 秒）が切れた後に始まるフルバーストがある
const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
const custom: EnemyInput = { defence: 100, element: null, hasCore: true };
const profile = targetProfileForEnemy(master, custom)!;
const WAITING: TeamInput = {
  ...team(
    [ANIS_STAR, DELTA, CINDERELLA].map((id) => fixedSlot(id, { conditionMode: 'auto' })),
    2,
  ),
  enemy: { ...custom, target: profile, landings: enemyLandingsOf(master, [], 180, profile) },
};
// 同じく、射撃場の的のジャンプ（3 分モード）も入れたもの（録画 0484・0485 の比べる設定と同じ出来事）。シンデレラ S1 のチャージ速度▲
// （plan/design-cinderella-s1-charge.md）の後は、II の CT 待ちで防御力▲ が切れた後に始まる回が、こちらにだけある
const JUMPING: TeamInput = {
  ...WAITING,
  enemy: {
    ...WAITING.enemy,
    events: enemyEventsOf(master, ['range-3min-jump'], 180),
    landings: enemyLandingsOf(master, ['range-3min-jump'], 180, profile),
  },
};

/** バーストの防御力▲（説明文の値。スキル Lv10）の % を割合にしたもの */
const burstDefenceUp = Number(character(ANIS_STAR).skills.burst.values[4]![9]) / 100;

type Fire = { start: number; slots: number[]; ends: number[] };

/** 枠 anis のアニス：スターの S2 の発射体爆発ダメージ▲の、発火ごとの対象の枠（枠の順）と終わり（発火の順） */
function projectileFires(input: TeamInput, anis: number): Fire[] {
  const byStart = new Map<number, Fire>();
  for (const p of piecesOf(planTeamRun(input))) {
    if (p.sourceSlotIndex !== anis || p.effect.stat !== 'projectileExplosionDamage') continue;
    const fire = byStart.get(p.start) ?? { start: p.start, slots: [], ends: [] };
    fire.slots.push(p.slotIndex);
    fire.ends.push(p.end);
    byStart.set(p.start, fire);
  }
  const fires = [...byStart.values()].sort((a, b) => a.start - b.start);
  for (const f of fires) f.slots.sort((a, b) => a - b);
  return fires;
}

/** 防御力▲ の件の小片 */
const defenceUps = (input: TeamInput) => piecesOf(planTeamRun(input)).filter((p) => p.effect.stat === 'defense');

/** 枠 source が付けた防御力▲ の件の小片 */
const defenceUpsFrom = (input: TeamInput, source: number) =>
  defenceUps(input).filter((p) => p.sourceSlotIndex === source);

/** 小片が、発火の始まり start に効いているか */
const activeAt = (p: { start: number; end: number }, start: number) => p.start <= start && start < p.end;

/**
 * 枠 anis のアニス：スターの防御力▲（自分のバースト）が、発火の始まりに効いているか。シンデレラ S1 のチャージ速度▲（2026-10-20。
 * plan/design-cinderella-s1-charge.md）でシンデレラの発が速くなり、どの編成でもアニス：スターがバーストを撃つ回と撃たない回が混ざる
 */
const anisUpAt = (input: TeamInput, anis: number) => {
  const ups = defenceUpsFrom(input, anis).filter((p) => p.slotIndex === anis);
  return (f: Fire) => ups.some((p) => activeAt(p, f.start));
};

/** 戦闘の終わりで切れていない発火（維持の終わりを比べる） */
const notCut = (f: Fire) => f.ends.every((e) => e < battleSecondsToFrames(180));

describe('防御力▲ と targetDefense の読み込み', () => {
  const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
  const withEffect = (effect: object) =>
    parseSkillDefinition({
      formatVersion: 1,
      resourceId: 1,
      checkedAt: '2026-10-18',
      skills: { skill1: { effects: [effect] }, skill2: empty, burst: empty },
    });
  const timed = {
    kind: 'timed',
    trigger: 'fullBurstStart',
    target: 'allies',
    stat: 'attackDamage',
    ref: 1,
    durationSeconds: 10,
    targetDefense: 'lowerThanSelf',
  };

  it('accepts lowerThanSelf only in timed effects for allies, without the other narrowings', () => {
    expect(withEffect(timed).skills.skill1.effects[0]).toMatchObject({ targetDefense: 'lowerThanSelf' });
    expect(() => withEffect({ ...timed, targetDefense: 'higherThanSelf' })).toThrow(/expected one of/);
    expect(() => withEffect({ ...timed, target: 'self' })).toThrow(/only allowed with target "allies"/);
    expect(() => withEffect({ ...timed, excludeSelf: 'always' })).toThrow(/cannot be combined with excludeSelf/);
    expect(() => withEffect({ ...timed, targetBurstStep: 'Step1' })).toThrow(/cannot be combined with targetBurstStep/);
    const { trigger: _t, durationSeconds: _d, kind: _k, ...rest } = timed;
    expect(() => withEffect({ kind: 'passive', ...rest })).toThrow(/targetDefense is only allowed in timed/);
    const { ref: _r, ...withoutRef } = timed;
    expect(() => withEffect({ ...withoutRef, amplifies: { skill: 'skill2', percent: 50 } })).toThrow(
      /amplifies cannot be combined with targetDefense/,
    );
  });

  it('accepts DEF up as a ratio only', () => {
    const up = { kind: 'timed', trigger: 'burstUse', target: 'self', stat: 'defense', ref: 1, durationSeconds: 10 };
    expect(() => withEffect(up)).not.toThrow();
    expect(() => withEffect({ ...up, scaling: 'casterAttack' })).toThrow(/casterAttack is only allowed/);
    expect(() => withEffect({ ...up, scaling: 'flat' })).toThrow(/flat is only allowed/);
  });

  it('defines S2 of Anis: Star with the narrowing, and the DEF up of her burst (2.1 節)', () => {
    const def = definitionOf(ANIS_STAR);
    const s2 = def.skills.skill2.effects[1]!;
    expect(s2).toMatchObject({
      kind: 'timed',
      trigger: 'fullBurstStart',
      target: 'allies',
      stat: 'projectileExplosionDamage',
      targetDefense: 'lowerThanSelf',
      reads: ['defense'],
    });
    expect(s2).not.toHaveProperty('assumes');
    expect(def.skills.burst.effects[4]).toMatchObject({
      kind: 'timed',
      trigger: 'burstUse',
      target: 'self',
      stat: 'defense',
      ref: 5,
      durationRef: 2,
    });
  });

  it('rejects a negative defenceOverride', () => {
    expect(() => runTeam(team([fixedSlot(ANIS_STAR, { defenceOverride: -1 })], 0))).toThrow(/defenceOverride/);
  });
});

describe('自分と自分より最終防御力が低い味方（C-0586）', () => {
  it('gives Cinderella the same fixed-spec DEF as Anis: Star, and the others lower (2.2 節)', () => {
    expect(fixedDefence(CINDERELLA)).toBe(fixedDefence(ANIS_STAR));
    for (const id of [FLOWER, DELTA, ISABEL]) expect(fixedDefence(id)).toBeLessThan(fixedDefence(ANIS_STAR));
  });

  it('leaves out an ally with the same final DEF (録画 A の編成。論点 2)', () => {
    // アニス：スターの防御力▲ の無い回（フラワーだけが I を撃った回。録画 0482・0483 の 1 回目のフルバースト）
    const fires = projectileFires(TIE, 1).filter((f) => !anisUpAt(TIE, 1)(f));
    expect(fires.length).toBeGreaterThan(0);
    // フラワー（0）とアニス：スター（1）に付き、同値のシンデレラ（3）には付かない（デルタ（2）は下の C-0589）
    for (const f of fires) {
      expect(f.slots).toContain(0);
      expect(f.slots).toContain(1);
      expect(f.slots).not.toContain(3);
    }
  });

  it('adds the ally once the DEF up of the burst lifts Anis: Star above it (録画 B の編成。論点 3)', () => {
    const ups = defenceUps(CONTROL);
    const fires = projectileFires(CONTROL, 0).filter((f) => anisUpAt(CONTROL, 0)(f) && notCut(f));
    expect(fires.length).toBeGreaterThan(0);
    for (const f of fires) {
      expect(f.slots).toEqual([0, 1, 2]);
      const up = ups.find((u) => u.slotIndex === 0 && u.start <= f.start && f.start < u.end);
      expect(up?.effect.value).toBeCloseTo(burstDefenceUp, 12);
      // 対象は維持の間変えない: 防御力▲ が先に切れても、どの枠も同じ時に終わる
      expect(up!.end).toBeLessThan(f.ends[0]!);
      expect(new Set(f.ends).size).toBe(1);
    }
  });

  it('drops the ally again at a full burst that starts after the DEF up has ended (同値に戻る)', () => {
    // 録画 B の編成の 3 つの条件（射撃場の的・画面の既定・的のジャンプあり）のどれかに II の CT 待ちで防御力▲ が切れた後に始まる回がある
    const both = [CONTROL, WAITING, JUMPING].flatMap((input) =>
      projectileFires(input, 0).map((f) => ({ f, active: anisUpAt(input, 0)(f) })),
    );
    expect(both.some((x) => x.active)).toBe(true);
    expect(both.some((x) => !x.active)).toBe(true);
    for (const { f, active } of both) expect(f.slots.includes(2)).toBe(active);
  });

  it('compares the final DEF without rounding (論点 5)', () => {
    const anisFinal = fixedDefence(ANIS_STAR) * (1 + burstDefenceUp);
    expect(Number.isInteger(anisFinal)).toBe(false);
    const withCinderella = (defenceOverride: number) =>
      team([fixedSlot(ANIS_STAR), fixedSlot(DELTA), fixedSlot(CINDERELLA, { defenceOverride })], 2);
    const below = projectileFires(withCinderella(Math.floor(anisFinal)), 0);
    const above = projectileFires(withCinderella(Math.ceil(anisFinal)), 0);
    expect(below.length).toBeGreaterThan(0);
    expect(below.every((f) => f.slots.includes(2))).toBe(true);
    expect(above.length).toBe(below.length);
    expect(above.every((f) => !f.slots.includes(2))).toBe(true);
  });

  it('targets every ally of the 録画 0163 composition, as the approximation of C-0210 did (2.1 節の退化)', () => {
    const fires = projectileFires(REC163, 1);
    expect(fires.length).toBeGreaterThan(0);
    for (const f of fires) expect(f.slots).toEqual([0, 1, 2, 3]);
  });
});

// 論点 4 の続き（C-0589）: デルタ（SR）の S2 の防御力▲ を間接の notes から効果にした。デルタの最終防御力に入るので、アニス：スターの
// バーストの防御力▲ が無い録画 0486 では、デルタは自分の防御力▲ でアニス：スターのバフ前を上回って対象から外れ、アニス：スターの
// 防御力▲ が効いている間に始まる録画 0488 では入る（デルタは SR で、発射体爆発ダメージ▲ は値に効かない。付くかどうかだけが変わる）
describe('デルタの S2 の防御力▲（C-0589）', () => {
  const delta = character(DELTA);
  const deltaUp = Number(delta.skills.skill2.values[0]![9]) / 100;
  const deltaSeconds = Number(delta.skills.skill2.values[1]![9]);

  it('defines it as a timed DEF up on self at burst use, with the description values (Lv10: 51.42%, 20 s)', () => {
    const def = definitionOf(DELTA);
    expect(def.skills.skill2.effects).toHaveLength(1);
    expect(def.skills.skill2.effects[0]).toMatchObject({
      kind: 'timed',
      trigger: 'burstUse',
      target: 'self',
      stat: 'defense',
      ref: 1,
      durationRef: 2,
    });
    // 間接の notes のままではない（効果にした）
    expect((def.skills.skill2.notes ?? []).filter((n) => n.kind === 'indirect')).toEqual([]);
    const [resolved] = resolveTimed(def, delta, MAX_SKILL_LEVELS);
    expect(resolved).toMatchObject({ stat: 'defense', target: 'self', trigger: 'burstUse' });
    expect(resolved!.value).toBeCloseTo(0.5142, 12);
    expect(resolved!.value).toBeCloseTo(deltaUp, 12);
    expect(resolved!.durationFrames).toBe(gameSecondsToFrames(deltaSeconds));
    expect(deltaSeconds).toBe(20);
  });

  it('lifts the final DEF of Delta above the base DEF of Anis: Star, and not above her DEF with her burst DEF up', () => {
    const base = fixedDefence(DELTA);
    // バフ前はデルタのほうが低い（防御力▲ が無ければ、アニス：スターより低い味方として入る）
    expect(base).toBeLessThan(fixedDefence(ANIS_STAR));
    expect(base * (1 + deltaUp)).toBeGreaterThan(fixedDefence(ANIS_STAR));
    expect(base * (1 + deltaUp)).toBeLessThan(fixedDefence(ANIS_STAR) * (1 + burstDefenceUp));
  });

  it('leaves Delta out while Anis: Star has no DEF up, and Delta has hers (録画 0486 の編成)', () => {
    const ups = defenceUpsFrom(TIE, 2);
    expect(ups.length).toBeGreaterThan(0);
    expect(ups.every((p) => p.slotIndex === 2)).toBe(true);
    // アニス：スターの防御力▲ の無い回（録画 0486 の画面の回）
    const fires = projectileFires(TIE, 1).filter((f) => !anisUpAt(TIE, 1)(f));
    expect(fires.length).toBeGreaterThan(0);
    for (const f of fires) {
      // どのフルバーストの始まりにも、II のデルタのバーストの後で、デルタの防御力▲ が効いている
      expect(ups.some((p) => activeAt(p, f.start))).toBe(true);
      expect(f.slots).toEqual([0, 1]);
    }
  });

  it('is what leaves Delta out: without it the 録画 0486 composition targets her, as before (間接の notes の形)', () => {
    const without = structuredClone(
      readJson<{ skills: Record<string, { effects: unknown[]; notes?: unknown[] }> }>('../../data/skills/20.json'),
    );
    without.skills.skill2 = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
    const input = team(
      [
        fixedSlot(FLOWER),
        fixedSlot(ANIS_STAR),
        fixedSlot(DELTA, { skills: { definition: parseSkillDefinition(without), levels: MAX_SKILL_LEVELS } }),
        fixedSlot(CINDERELLA),
      ],
      3,
    );
    expect(defenceUpsFrom(input, 2)).toEqual([]);
    const fires = projectileFires(input, 1).filter((f) => !anisUpAt(input, 1)(f));
    expect(fires.length).toBeGreaterThan(0);
    for (const f of fires) expect(f.slots).toEqual([0, 1, 2]);
  });

  it('puts Delta in while the DEF up of Anis: Star lifts her above, and keeps her after it ends (録画 0488 の編成)', () => {
    const anisUps = defenceUpsFrom(CONTROL, 0);
    const deltaUps = defenceUpsFrom(CONTROL, 1);
    const fires = projectileFires(CONTROL, 0).filter((f) => anisUpAt(CONTROL, 0)(f) && notCut(f));
    expect(fires.length).toBeGreaterThan(0);
    for (const f of fires) {
      const anisUp = anisUps.find((p) => activeAt(p, f.start));
      expect(anisUp).toBeDefined();
      // 比べる時に、デルタの防御力▲ も効いている（効いていなければ、入るのは当たり前）
      expect(deltaUps.some((p) => activeAt(p, f.start))).toBe(true);
      expect(f.slots).toEqual([0, 1, 2]);
      // アニス：スターの防御力▲ が先に切れ、そのときデルタの防御力▲ はまだ効いている（比べ直せば、デルタが上回って外れる）が、
      // 対象は維持される（C-0588）
      expect(anisUp!.end).toBeLessThan(f.ends[0]!);
      expect(deltaUps.some((p) => activeAt(p, anisUp!.end))).toBe(true);
    }
  });
});

// 指標 fullBurstBuffApplied（V-0452）: n 回目のフルバーストで、枠に効果が付いたか。録画 0486・0488 の一時停止の画面の「適用中の効果」と比べる
describe('指標 fullBurstBuffApplied（録画 0486・0488 の画面との比べ）', () => {
  const applied = (input: TeamInput, slot: number, n = 0, stat = 'projectileExplosionDamage') =>
    METRICS.fullBurstBuffApplied!.sim(runSimulation(input), {
      args: { slot, skill: 'skill2', stat, n },
      input,
    } as Parameters<(typeof METRICS)[string]['sim']>[1]);

  it('marks who got the projectile explosion damage up at the first Full Burst', () => {
    // 録画 0486: フラワー・アニス：スターに付き、デルタ・シンデレラには付かない
    expect([1, 2, 3, 4].map((slot) => applied(TIE, slot))).toEqual([1, 1, 0, 0]);
    // 録画 0488: アニス：スター・デルタ・シンデレラの 3 人とも付く
    expect([1, 2, 3].map((slot) => applied(CONTROL, slot))).toEqual([1, 1, 1]);
  });

  it('is 0 for an effect the slot never gets, and rejects a Full Burst that does not exist', () => {
    expect(applied(CONTROL, 3, 0, 'defense')).toBe(0);
    expect(() => applied(CONTROL, 1, 99)).toThrow(/フルバースト/);
  });

  it('reads the DEF up of Delta with burstBuffApplied (録画 0486・0488 の画面のラストメモリー)', () => {
    const delta = (input: TeamInput, slot: number) =>
      METRICS.burstBuffApplied!.sim(runSimulation(input), {
        args: { slot, skill: 'skill2', stat: 'defense', count: 1 },
        input,
      } as Parameters<(typeof METRICS)[string]['sim']>[1]);
    expect(delta(TIE, 3)).toEqual([1]);
    expect(delta(CONTROL, 2)).toEqual([1]);
  });
});

describe.each([
  ['録画 A の編成（同値）', TIE],
  ['録画 B の編成（対照）', CONTROL],
  ['録画 0163 の編成', REC163],
  ['録画 B の編成（画面の既定の条件。防御力▲ が切れた回あり）', WAITING],
])('sim vs calc: %s', (_name, input) => {
  const sim = runSimulation(input);
  const calc = runTeam(input);
  const plan = planTeamRun(input);

  it('agree exactly on the schedule, the instants and the shot-counted groups', () => {
    expect(sim.schedule).toEqual(calc.schedule);
    expect(sim.instants).toEqual(plan.instants);
    input.slots.forEach((_, i) => {
      const s = sim.slots[i]!;
      const c = calc.slots[i]!;
      expect(s.skillHits.damage).toBe(c.skillHits.totalDamage);
      expect(s.burst.damage).toBe(c.burst.totalDamage);
      const groups = simGroupTotals(sim, i);
      c.segments.forEach((g, j) => {
        if (g.triggerSource !== 'shots') return;
        expect(g.triggers).toBe(groups[j]!.triggers);
        expect(g.damage).toBeCloseTo(groups[j]!.damage, 3);
      });
    });
  });

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });
});
