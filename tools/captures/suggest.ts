// 実測した 1 ヒットのダメージから、条件の合うキャラの候補を出す（逆引き）。
//   node tools/captures/suggest.ts 14036 19435 24834 [--attack N] [--defence 100] [--advantage] [--top 10]
//
// 画面に出た数値だけが手元にあり、誰を撮ったのか自信が持てないときに使う。
// probe-result.ts で名前を裏取りするのが本筋で、これはその前の当たりを付ける道具。
//
// 数値を複数渡すと、**同じキャラが全部の数値を説明できる**組み合わせだけを残すので
// 一気に絞り込める（例: 非会心 / 会心 / コア / コア会心 の 4 系列）。
//
// 前提は射撃場のスペック固定（Lv400・装備 T9 Lv5・キューブなし）。素の攻撃力が分かって
// いる録画では --attack で上書きする。**バフが乗った数値は当然ずれる**ので、候補が出ない
// ときはバフ込みの数値を見ている可能性を先に疑うこと。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  type CharacterData,
  ELEMENT_ADVANTAGE_MULTIPLIER,
  ELEMENT_LABEL,
  FIXED_SPEC_ENEMY_DEFENCE,
  FULL_BURST_BOOST,
  computeFixedSpecAttack,
  isChargeWeapon,
} from '@nikke/core';

const DATA_DIR = 'packages/core/data/characters';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    attack: { type: 'string' },
    defence: { type: 'string', default: String(FIXED_SPEC_ENEMY_DEFENCE) },
    advantage: { type: 'boolean', default: false },
    tolerance: { type: 'string', default: '0.2' },
    top: { type: 'string', default: '10' },
    'data-dir': { type: 'string', default: DATA_DIR },
  },
});

const observed = positionals.map(Number);
if (observed.length === 0 || observed.some((v) => !Number.isFinite(v) || v <= 0)) {
  console.error('usage: node tools/captures/suggest.ts <実測値...> [--attack N] [--advantage] [--top 10]');
  process.exit(1);
}

const defence = Number(values.defence);
const tolerance = Number(values.tolerance) / 100;
const elementMultiplier = values.advantage ? ELEMENT_ADVANTAGE_MULTIPLIER : 1;

/** 1 ヒットの命中条件。会心とコアは「乗ったか乗らなかったか」の二択（期待値ではない） */
type Condition = { core: boolean; crit: boolean; distance: boolean; fullBurst: boolean; fullCharge: boolean };

function conditionLabel(c: Condition): string {
  const parts = [
    c.core ? 'コア' : null,
    c.crit ? '会心' : null,
    c.distance ? '距離' : null,
    c.fullBurst ? 'FB' : null,
    c.fullCharge ? 'フルチャージ' : null,
  ].filter((v) => v !== null);
  return parts.length === 0 ? '素' : parts.join('+');
}

function conditionsOf(character: CharacterData): Condition[] {
  const list: Condition[] = [];
  const hasDistance = character.bonusRange !== null;
  const hasCharge = isChargeWeapon(character.shot);
  for (const core of [false, true])
    for (const crit of [false, true])
      for (const distance of hasDistance ? [false, true] : [false])
        for (const fullBurst of [false, true])
          for (const fullCharge of hasCharge ? [false, true] : [false])
            list.push({ core, crit, distance, fullBurst, fullCharge });
  return list;
}

/**
 * 1 ヒットの理論値。packages/core/src/damage.ts の computeTriggerDamage と同じ式だが、
 * あちらは会心率・コア命中率を掛けた期待値を返す。逆引きでは「会心した 1 発」を
 * そのまま比べたいので、倍率グループを二択で組み立てる。
 */
function predict(character: CharacterData, attack: number, condition: Condition): number {
  const shot = character.shot;
  const baseHit = Math.max(1, attack - defence);
  const boost =
    1 +
    (condition.core ? shot.coreDamageRate - 1 : 0) +
    (condition.crit ? character.crit.damage - 1 : 0) +
    (condition.distance ? 0.3 : 0) +
    (condition.fullBurst ? FULL_BURST_BOOST : 0);
  const charge = condition.fullCharge ? shot.fullChargeDamage : 1;
  // shot.damage は 1 トリガー分（SG は全ペレット合計）なので、画面に出る 1 発の数値に
  // 合わせて shotCount で割る。SG 以外は shotCount = 1 なので影響しない。
  const perHit = shot.damage / shot.shotCount / 10000;
  return baseHit * perHit * charge * boost * elementMultiplier;
}

type Candidate = {
  character: CharacterData;
  attack: number;
  worstError: number;
  matches: { observed: number; predicted: number; condition: Condition }[];
};

const characters: CharacterData[] = readdirSync(values['data-dir'])
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => JSON.parse(readFileSync(join(values['data-dir'], f), 'utf8')) as CharacterData);

const candidates: Candidate[] = [];
for (const character of characters) {
  const attack = values.attack ? Number(values.attack) : computeFixedSpecAttack(character).attack;
  const conditions = conditionsOf(character);
  const matches: Candidate['matches'] = [];
  let worstError = 0;
  for (const value of observed) {
    let best: { predicted: number; condition: Condition; error: number } | null = null;
    for (const condition of conditions) {
      const predicted = predict(character, attack, condition);
      const error = Math.abs(predicted - value) / value;
      // 会心もフルバーストも +0.5 なので同じ数値になる。ありふれた方（会心）を先に出す。
      const better =
        best === null ||
        error < best.error ||
        (error === best.error && !condition.fullBurst && best.condition.fullBurst);
      if (better) best = { predicted, condition, error };
    }
    if (best === null || best.error > tolerance) {
      worstError = Infinity;
      break;
    }
    matches.push({ observed: value, predicted: best.predicted, condition: best.condition });
    worstError = Math.max(worstError, best.error);
  }
  if (Number.isFinite(worstError)) candidates.push({ character, attack, worstError, matches });
}

// 武器倍率・コア倍率・会心倍率が同じキャラは同じ数値になり、ダメージだけでは区別できない。
// 1 体ずつ並べると「候補 18 件」のように見えて絞り込めた気になるので、同値はまとめて
// 「ここまでしか絞れていない」ことが分かるようにする。
type Group = { worstError: number; attack: number; matches: Candidate['matches']; members: CharacterData[] };

const groups = new Map<string, Group>();
for (const c of candidates) {
  const key = `${c.attack}|${c.matches.map((m) => m.predicted.toFixed(4)).join(',')}`;
  const group = groups.get(key);
  if (group) group.members.push(c.character);
  else groups.set(key, { worstError: c.worstError, attack: c.attack, matches: c.matches, members: [c.character] });
}
const sorted = [...groups.values()].sort((a, b) => a.worstError - b.worstError);

const describe = (ch: CharacterData): string =>
  `${ch.name.ja}(${ch.resourceId}/${ch.weaponType}/${ELEMENT_LABEL[ch.element].ja}/${ch.rarity})`;

console.log(
  `実測値 ${observed.join(' / ')} / 敵防御 ${defence} / 属性有利 ${values.advantage ? 'あり' : 'なし'} / 許容誤差 ${values.tolerance}%`,
);
if (candidates.length === 0) {
  console.log('\n候補なし。バフの乗った数値を見ている、属性有利の指定が違う、攻撃力が想定と違う、のいずれかを疑う。');
  process.exit(0);
}

console.log(
  `\n候補 ${candidates.length} 体 / 同じ数値になるものをまとめて ${sorted.length} グループ（誤差の小さい順に最大 ${values.top}）:`,
);
for (const [i, g] of sorted.slice(0, Number(values.top)).entries()) {
  console.log(
    `\nグループ ${i + 1}: ${g.members.length} 体 / 攻撃力 ${g.attack} / 最大誤差 ${(g.worstError * 100).toFixed(3)}%`,
  );
  for (const m of g.matches) {
    console.log(
      `  ${String(m.observed).padStart(9)} ← 予測 ${m.predicted.toFixed(1).padStart(11)}（${conditionLabel(m.condition)}）`,
    );
  }
  console.log(`  ${g.members.map(describe).join('、')}`);
}

if (candidates.length > 1) {
  console.log('\nダメージだけでは同倍率のキャラを区別できない。probe-result.ts で名前を確認すること。');
}
