// Stage 19-C・20-B: 結論の台帳。plan/design-stage19.md 2.4 節・plan/design-stage20.md 3.3 節。
// 結論は records/claims/C-NNNN.json に 1 件 1 ファイルで置き、plan/claims.md は話題ごとの一覧として生成する。
// 根拠の観測値は「根拠」の文にバッククォートで書いた ID から拾う（書くのは 1 か所だけ）。
// Stage 20-A: ID の桁を決め打ちしない（録画 3 桁以上・連番 2 桁以上・結論 4 桁以上）。通し番号の抜けは許す。
import { ELEMENTS } from '../element.ts';
import { BUFF_STATS, type BuffStat } from '../skills/types.ts';
import type { BurstStep, Element, WeaponType } from '../types.ts';
import { WEAPON_TYPES } from '../weapons.ts';

export const CLAIM_STATES = ['確定', '仮説', '棄却', '範囲外'] as const;
export type ClaimState = (typeof CLAIM_STATES)[number];

/** 話題の語彙（claims.md の節の順）。1 件に 1 つ。足すときは設計書か検証記録で決める */
export const CLAIM_TOPICS = [
  '射撃（間隔・リロード・チャージ）',
  'バーストゲージ',
  'バーストの段階とフルバースト',
  '1 発の式・バフの掛かり方',
  '育成・ステータス',
  '命中率・距離',
  'スキル・キャラ固有',
  '敵・的・場面',
  '読み取り（HUD・画面）',
] as const;
export type ClaimTopic = (typeof CLAIM_TOPICS)[number];

/**
 * 根拠の等級（覆りにくさの順）。上から順に問い、最初に当てはまったものにする（plan/design-stage20.md 3.3 節）。
 * 新しく確定にするのは上の 3 つのとき（テストでは見ない。PR でオーナーが確かめる）。
 */
export const CLAIM_GRADES = ['厳密一致', '反復実測', 'データ明記', '単独実測', '推論'] as const;
export type ClaimGrade = (typeof CLAIM_GRADES)[number];
/** 確定にできる等級（plan/claims.md 冒頭の規則。plan/design-records-automation.md 3.6 節で検査にした） */
export const CONFIRMABLE_GRADES: readonly ClaimGrade[] = ['厳密一致', '反復実測', 'データ明記'];

/** records/claims/C-NNNN.json の中身 */
export type ClaimFile = {
  id: string;
  /** 結論の文 */
  text: string;
  state: ClaimState;
  topic: ClaimTopic;
  /** 棄却の結論は省いてよい */
  grade?: ClaimGrade;
  /**
   * 等級を機械の候補より上にした人の判断の理由（1 本の録画の中の反復で反復実測にするなど。plan/design-minimal-relevance.md 11.7 節）。
   * 書けば records:close の等級の検査が注意にとどまり、claims.md の等級の候補の行に出る
   */
  gradeReason?: string;
  /** 根拠。観測値はバッククォートで囲んだ ID で書く（`012-01`〜`012-04` のような範囲も可） */
  basis: string;
  /** モデル側（どのコード・データに入っているか。未実装・未反映ならそう書く） */
  model: string;
  /** 置き換えた（棄却した）結論の ID */
  replaces: string[];
  /** 更新日（YYYY-MM-DD） */
  updated: string;
  /** 最小構成の検査編: 結論の対象（plan/design-minimal-relevance.md 3.2 節） */
  subject?: ClaimSubject;
  /** 最小構成の検査編: 仮説の効く条件（同 3.5 節）。仮説の結論にだけ書ける */
  when?: ClaimWhen;
  /** 最小構成の検査編: 人の判断の印（同 4.3 節）。印のある要素は、その組の警告から外す */
  minimal?: MinimalMark[];
  /**
   * 仮説・値・読み方を決めるのに使った録画（plan/design-investigation-review.md 1.3 節）。等級の候補は、反復実測の再現にこれらの
   * 録画を数えず、厳密一致に値か読み方を合わせた録画を数えない。仮説を立てた録画が無ければ空の並び。書いていない結論は除かずに数える
   */
  decidedOn?: DecidedOn[];
};

/** 録画を何を決めるのに使ったか（plan/design-investigation-review.md 1.3 節） */
export const DECIDED_ROLES = ['仮説の出どころ', '値を合わせた', '読み方を合わせた'] as const;
export type DecidedRole = (typeof DECIDED_ROLES)[number];
export type DecidedOn = { recording: string; role: DecidedRole };

/**
 * 定義に結び付かない結論の機構の名前（plan/design-minimal-relevance.md 3.2 節）。観測量の出どころ（records/observations.ts の
 * OBSERVATION_SOURCES）の firing・gauge・burstChain・clock・target に、damageFormula（1 ヒットの式）・targetTable（的の表のコア命中率・
 * 弾丸命中率）を足したもの
 */
export const CLAIM_MECHANISMS = [
  'firing',
  'gauge',
  'burstChain',
  'clock',
  'target',
  'damageFormula',
  'targetTable',
] as const;
export type ClaimMechanism = (typeof CLAIM_MECHANISMS)[number];

/**
 * 結論の対象。places は定義の場所（`data/skills/17.json` の skill2 の effects[0] の形。バッククォートは省いてよい）で、2 体の組の結論は
 * 2 つ以上書く。書いた場所の claims がこの結論を含むことを records/skills.ts の validateClaimSubjects で見る。mechanism は定義に結び付かない結論
 */
export type ClaimSubject = { places: string[] } | { mechanism: ClaimMechanism };

/**
 * 仮説の効く条件（plan/design-minimal-relevance.md 3.5 節）。書いた条件が全部その録画で成り立つときだけ、仮説を未確定の要素に数える。
 * teamHas = 編成にこの〈バースト段階・武器種・部隊（CDN の squad）・キャラ（rid）〉のキャラがいる、sameStatSources = 同じ stat の効果の
 * 出どころが atLeast 以上、enemyElement = 的の属性
 */
export type ClaimWhen = {
  teamHas?: { burstStage?: BurstStep; weaponType?: WeaponType; squad?: string; rid?: number };
  sameStatSources?: { stat: BuffStat; atLeast: number };
  enemyElement?: Element;
};

/**
 * 人の判断の印（plan/design-minimal-relevance.md 4.3 節）。observations はこの結論の根拠の観測値の ID（'*' は全部の組）、
 * element は判定の要素の名前（「イサベル skill2.notes[0]」など）、reason は効かないとみなした理由、decided はオーナーが決めた日
 */
export type MinimalMark = { observations: string[] | '*'; element: string; reason: string; decided: string };

const BURST_STAGES: readonly BurstStep[] = ['Step1', 'Step2', 'Step3', 'AllStep'];
const isDate = (d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const unknownKeys = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).filter((k) => !keys.includes(k));

/** subject・when・minimal の形の検査（plan/design-minimal-relevance.md 3.2・3.5・4.3 節）。subject の場所の実在は validateClaimSubjects */
export function validateMinimalFields(c: Claim): string[] {
  const errors: string[] = [];
  const at = c.id;
  if (c.subject !== undefined) {
    const s: unknown = c.subject;
    if (!isRecord(s) || unknownKeys(s, ['places', 'mechanism']).length > 0 || 'places' in s === 'mechanism' in s)
      errors.push(`${at}: subject は { places } か { mechanism } のどちらか 1 つ`);
    else if ('places' in s) {
      const places = s.places;
      if (
        !Array.isArray(places) ||
        places.length === 0 ||
        !places.every((p) => typeof p === 'string' && p.trim() !== '')
      )
        errors.push(`${at}: subject.places は定義の場所の文字列の並び（1 つ以上）`);
      else if (new Set(places).size !== places.length) errors.push(`${at}: subject.places に同じ場所が 2 回ある`);
    } else if (!(CLAIM_MECHANISMS as readonly unknown[]).includes(s.mechanism))
      errors.push(`${at}: subject.mechanism が語彙に無い: ${String(s.mechanism)}`);
  }
  if (c.when !== undefined) {
    const w: unknown = c.when;
    if (c.state !== '仮説') errors.push(`${at}: when は仮説の結論にだけ書ける（${c.state}）`);
    if (!isRecord(w) || Object.keys(w).length === 0)
      errors.push(`${at}: when は teamHas・sameStatSources・enemyElement の 1 つ以上`);
    else {
      for (const k of unknownKeys(w, ['teamHas', 'sameStatSources', 'enemyElement']))
        errors.push(`${at}: when に知らない欄がある: ${k}`);
      if (w.teamHas !== undefined) {
        const t = w.teamHas;
        if (
          !isRecord(t) ||
          Object.keys(t).length === 0 ||
          unknownKeys(t, ['burstStage', 'weaponType', 'squad', 'rid']).length > 0
        )
          errors.push(`${at}: when.teamHas は burstStage・weaponType・squad・rid の 1 つ以上`);
        else {
          if (t.burstStage !== undefined && !(BURST_STAGES as readonly unknown[]).includes(t.burstStage))
            errors.push(`${at}: when.teamHas.burstStage が語彙に無い: ${String(t.burstStage)}`);
          if (t.weaponType !== undefined && !(WEAPON_TYPES as readonly unknown[]).includes(t.weaponType))
            errors.push(`${at}: when.teamHas.weaponType が語彙に無い: ${String(t.weaponType)}`);
          if (t.squad !== undefined && (typeof t.squad !== 'string' || t.squad.trim() === ''))
            errors.push(`${at}: when.teamHas.squad は部隊の ID（CDN の squad）`);
          if (t.rid !== undefined && !(Number.isInteger(t.rid) && (t.rid as number) > 0))
            errors.push(`${at}: when.teamHas.rid は正の整数`);
        }
      }
      if (w.sameStatSources !== undefined) {
        const s = w.sameStatSources;
        if (
          !isRecord(s) ||
          unknownKeys(s, ['stat', 'atLeast']).length > 0 ||
          !(BUFF_STATS as readonly unknown[]).includes(s.stat) ||
          !(Number.isInteger(s.atLeast) && (s.atLeast as number) >= 2)
        )
          errors.push(`${at}: when.sameStatSources は { stat: 効果の stat, atLeast: 2 以上の整数 }`);
      }
      if (w.enemyElement !== undefined && !(ELEMENTS as readonly unknown[]).includes(w.enemyElement))
        errors.push(`${at}: when.enemyElement が語彙に無い: ${String(w.enemyElement)}`);
    }
  }
  if (c.minimal !== undefined) {
    if (!Array.isArray(c.minimal) || c.minimal.length === 0) errors.push(`${at}: minimal は印の並び（1 つ以上）`);
    else
      c.minimal.forEach((m: unknown, i) => {
        const p = `${at}: minimal[${i}]`;
        if (!isRecord(m) || unknownKeys(m, ['observations', 'element', 'reason', 'decided']).length > 0) {
          errors.push(`${p} は { observations, element, reason, decided }`);
          return;
        }
        if (m.observations !== '*') {
          if (!Array.isArray(m.observations) || m.observations.length === 0)
            errors.push(`${p}.observations は観測値の ID の並びか '*'`);
          else
            for (const o of m.observations)
              if (!c.observations.includes(o as string))
                errors.push(`${p}.observations の ${String(o)} はこの結論の根拠に無い`);
        }
        if (typeof m.element !== 'string' || m.element.trim() === '') errors.push(`${p}.element が空`);
        if (typeof m.reason !== 'string' || m.reason.trim() === '') errors.push(`${p}.reason が空`);
        if (!isDate(m.decided)) errors.push(`${p}.decided は YYYY-MM-DD`);
      });
  }
  return errors;
}

const RECORDING_ID = /^(?:\d{3,}|L-[A-Z]{1,3})$/;

/** decidedOn の形の検査（plan/design-investigation-review.md 1.3 節）。録画の実在は見ない（根拠に無い録画で仮説を立ててもよい） */
export function validateDecidedOn(c: Pick<ClaimFile, 'id' | 'decidedOn'>): string[] {
  if (c.decidedOn === undefined) return [];
  const at = `${c.id}: decidedOn`;
  if (!Array.isArray(c.decidedOn)) return [`${at} は { recording, role } の並び（無ければ []）`];
  const errors: string[] = [];
  const recordings = new Set<string>();
  c.decidedOn.forEach((d: unknown, i) => {
    if (!isRecord(d) || unknownKeys(d, ['recording', 'role']).length > 0) {
      errors.push(`${at}[${i}] は { recording, role }`);
      return;
    }
    if (typeof d.recording !== 'string' || !RECORDING_ID.test(d.recording))
      errors.push(`${at}[${i}].recording は録画の id（3 桁以上の数字か L-…）: ${String(d.recording)}`);
    else if (recordings.has(d.recording)) errors.push(`${at} に録画 ${d.recording} が 2 回ある`);
    else recordings.add(d.recording);
    if (!(DECIDED_ROLES as readonly unknown[]).includes(d.role))
      errors.push(`${at}[${i}].role が語彙（${DECIDED_ROLES.join('・')}）に無い: ${String(d.role)}`);
  });
  return errors;
}

export type Claim = ClaimFile & {
  /** 根拠の文から拾った観測値の ID */
  observations: string[];
};

const OBSERVATION_ID = /`((?:\d{3,}|L-[A-Z]{1,3})-\d{2,})`/g;
const OBSERVATION_RANGE = /`((?:\d{3,}|L-[A-Z]{1,3}))-(\d{2,})`\s*〜\s*`\1-(\d{2,})`/g;
const CLAIM_ID = /^C-(\d{4,})$/;

/** 根拠の文から、バッククォートで囲んだ観測値の ID を拾う。「`012-01`〜`012-04`」は 012-01〜012-04 に展開する */
export function observationIdsIn(text: string): string[] {
  const ids: string[] = [];
  let rest = text;
  for (const m of text.matchAll(OBSERVATION_RANGE)) {
    const width = m[2]!.length;
    for (let n = Number(m[2]); n <= Number(m[3]); n++) ids.push(`${m[1]}-${String(n).padStart(width, '0')}`);
    rest = rest.replace(m[0], ' ');
  }
  for (const m of rest.matchAll(OBSERVATION_ID)) ids.push(m[1]!);
  return [...new Set(ids)].sort();
}

/** 結論の番号（C-0012 → 12）。形が違えば NaN */
export function claimNumber(id: string): number {
  const m = CLAIM_ID.exec(id);
  return m === null ? Number.NaN : Number(m[1]);
}

/** ファイルの中身から結論を作り、番号順に並べる */
export function toClaims(files: readonly ClaimFile[]): Claim[] {
  return files
    .map((f) => ({ ...f, observations: observationIdsIn(f.basis) }))
    .sort((a, b) => claimNumber(a.id) - claimNumber(b.id) || a.id.localeCompare(b.id));
}

/**
 * invalidIds は失効した観測値（Stage 20-E）。確定の結論は、根拠の観測値があるのに有効なものが 1 件も残らないときだけ落とす。
 * 失効した根拠は消さずに残す（claims.md に印を付けて出す）。棄却の結論は問わない
 */
export function validateClaims(
  claims: readonly Claim[],
  observationIds: ReadonlySet<string>,
  invalidIds: ReadonlySet<string> = new Set(),
): string[] {
  const errors: string[] = [];
  const byId = new Map(claims.map((c) => [c.id, c]));
  const seen = new Set<string>();
  for (const c of claims) {
    if (!CLAIM_ID.test(c.id)) errors.push(`${c.id}: ID は C-<4 桁以上の数字>`);
    else if (seen.has(c.id)) errors.push(`${c.id}: ID が重複している`);
    seen.add(c.id);
    if (!CLAIM_STATES.includes(c.state)) errors.push(`${c.id}: 状態が語彙に無い: ${c.state}`);
    if (!CLAIM_TOPICS.includes(c.topic)) errors.push(`${c.id}: 話題が語彙に無い: ${c.topic}`);
    if (c.grade === undefined) {
      if (c.state !== '棄却') errors.push(`${c.id}: 根拠の等級が無い（省けるのは棄却だけ）`);
    } else if (!CLAIM_GRADES.includes(c.grade)) errors.push(`${c.id}: 根拠の等級が語彙に無い: ${c.grade}`);
    else if (c.state === '確定' && !CONFIRMABLE_GRADES.includes(c.grade)) {
      errors.push(`${c.id}: 確定にできるのは等級が厳密一致・反復実測・データ明記のときだけ（${c.grade}）`);
    }
    if (c.gradeReason !== undefined && (typeof c.gradeReason !== 'string' || c.gradeReason.trim() === ''))
      errors.push(`${c.id}: gradeReason は空でない文`);
    if (c.text.trim() === '') errors.push(`${c.id}: 結論が空`);
    if (c.basis.trim() === '') errors.push(`${c.id}: 根拠が空`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.updated)) errors.push(`${c.id}: 更新日は YYYY-MM-DD`);
    for (const o of c.observations) if (!observationIds.has(o)) errors.push(`${c.id}: 観測値 ${o} が無い`);
    if (c.state === '確定' && c.observations.length > 0 && c.observations.every((o) => invalidIds.has(o)))
      errors.push(`${c.id}: 確定の結論の根拠の観測値が、すべて失効している`);
    errors.push(...validateMinimalFields(c));
    errors.push(...validateDecidedOn(c));
    for (const r of c.replaces) {
      const old = byId.get(r);
      if (old === undefined) errors.push(`${c.id}: 置き換えた結論 ${r} が無い`);
      else if (old.state !== '棄却') errors.push(`${c.id}: 置き換えた結論 ${r} の状態が棄却でない（${old.state}）`);
    }
  }
  return errors;
}

/** 観測値 ID → それを根拠にした結論の ID */
export function claimsByObservation(claims: readonly Claim[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const c of claims) {
    for (const o of c.observations) map.set(o, [...(map.get(o) ?? []), c.id]);
  }
  return map;
}

/** 結論に結び付いた観測値（状態が確定か仮説の結論の根拠）。手入力の条件で比べる観測値は、どれかに結び付ける（Stage 20-A） */
export function supportedObservations(claims: readonly Claim[]): Set<string> {
  return new Set(claims.filter((c) => c.state === '確定' || c.state === '仮説').flatMap((c) => c.observations));
}

/** テストで許容幅を守らせる観測値（状態が確定の結論の根拠。失効したものは外す。Stage 20-E） */
export function gatedObservations(claims: readonly Claim[], invalidIds: ReadonlySet<string> = new Set()): Set<string> {
  return new Set(
    claims
      .filter((c) => c.state === '確定')
      .flatMap((c) => c.observations)
      .filter((o) => !invalidIds.has(o)),
  );
}

/**
 * 根拠の等級の候補（plan/design-records-automation.md 3.5 節）。結論の根拠の観測値のうち、モデルと比べたもの（residuals）から
 * 機械で出す。上から順に当てはめる。根拠にモデルと比べた観測値が無い（記録だけの観測値や、旧の文書を指す根拠）ときは
 * 機械では決められないので undefined。データ明記は人が決めるので機械では出さない。
 *   厳密一致: 整数の観測値で、許容内かつ差が 0 のものがある（値か読み方を合わせた録画（decidedOn）のものは数えない）
 *   反復実測: 許容内の観測値が 2 本以上の録画にあり、そのうち 1 本以上が仮説・値・読み方を決めるのに使っていない録画（decidedOn に無い）
 *   単独実測: 上のどちらでもない
 * decidedOn は plan/design-investigation-review.md 1.3 節（2026-10-10 のオーナーの決定。仮説を立てるのに使った録画は再現に数えない）
 */
/**
 * 1 ヒットの値の指標。モデルは端数を持ち、ゲームは途中の丸めで整数を出す（丸め方は四捨五入でも切り捨てでも揃わない）ので、
 * 差の絶対値が 1 未満を厳密一致とする（plan/design-records-automation.md 3.5 節。2026-10-02 にオーナーの決定で足した）
 */
export const HIT_VALUE_METRICS: ReadonlySet<string> = new Set([
  'hitDamage',
  'burstHitDamage',
  'dotHitDamage',
  'dotStackTickDamage',
  'skillHitDamage',
  'perShotHitDamage',
]);

export function gradeCandidate(
  claim: Claim,
  residuals: ReadonlyMap<string, { status: string; diff: number | null; value: number | number[]; metric?: string }>,
  invalidIds: ReadonlySet<string> = new Set(),
): ClaimGrade | undefined {
  const valid = claim.observations.filter((o) => !invalidIds.has(o));
  const compared = valid.flatMap((o) => {
    const r = residuals.get(o);
    return r === undefined || r.status === 'invalid' ? [] : [{ id: o, ...r }];
  });
  if (compared.length === 0) return undefined;
  const ok = compared.filter((r) => r.status === 'ok');
  const isInteger = (v: number | number[]) => (Array.isArray(v) ? v.every(Number.isInteger) : Number.isInteger(v));
  const exact = (r: (typeof ok)[number]): boolean =>
    isInteger(r.value) &&
    r.diff !== null &&
    (r.diff === 0 || (r.metric !== undefined && HIT_VALUE_METRICS.has(r.metric) && Math.abs(r.diff) < 1));
  const recordingOf = (id: string) => id.replace(/-\d+$/, '');
  const decided = new Map((claim.decidedOn ?? []).map((d) => [d.recording, d.role]));
  const fitted = (id: string) => {
    const role = decided.get(recordingOf(id));
    return role === '値を合わせた' || role === '読み方を合わせた';
  };
  if (ok.some((r) => exact(r) && !fitted(r.id))) return '厳密一致';
  const recordings = new Set(ok.map((r) => recordingOf(r.id)));
  if (recordings.size >= 2 && [...recordings].some((r) => !decided.has(r))) return '反復実測';
  return '単独実測';
}

const GRADE_RANK: Record<ClaimGrade, number> = { 厳密一致: 1, 反復実測: 2, データ明記: 3, 単独実測: 4, 推論: 5 };

/** 人が書いた等級が、機械の候補より上（覆りにくい側）か。データ明記は人の判断なので問わない */
export function gradeAboveCandidate(grade: ClaimGrade, candidate: ClaimGrade): boolean {
  return grade !== 'データ明記' && GRADE_RANK[grade] < GRADE_RANK[candidate];
}

// ---- plan/claims.md（生成） ----

const CLAIMS_HEADER = `# 結論の台帳

- **このファイルは生成する（手で書かない）**。結論は \`records/claims/C-NNNN.json\` に 1 件 1 ファイルで置き、\`npm run records:check\` で作り直す（[design-stage20.md](design-stage20.md) 3.3 節）。
- 問い（機構・定数）からいまの結論を引くときは、ここを見る。話題ごとの節に、番号順に並べてある。
- 状態は \`確定\`・\`仮説\`・\`棄却\`・\`範囲外\` のどれか。\`範囲外\` は、モデルで扱わないものと、観測できないモデルの約束（単位など）。\`確定\` の結論の根拠の観測値は、\`npm test\` でモデルと比べ、許容幅の外なら落ちる。
- 根拠の等級は、上から順に問い、最初に当てはまったもの（[design-stage20.md](design-stage20.md) 3.3 節）。新しく \`確定\` にするのは 1〜3 のとき。
  1. \`厳密一致\`: 合わせ込みの定数を持たない式やデータから計算した値と、実測が端数まで一致した
  2. \`反復実測\`: 値を決めるのに使っていない実測でも再現した（仮説・値・読み方を決めるのに使った録画のほかに、別の録画で 1 回以上）
  3. \`データ明記\`: ゲームのデータ（CDN の数値・説明文）に、解釈の余地なく一意に書かれている
  4. \`単独実測\`: 実測はあるが、1 回だけか、値をその実測に合わせて決めただけ
  5. \`推論\`: 上のどれでもない（解釈の余地のある読み・推論・推定・外部資料・観測できない約束）
- 撮る前の予測は確定の条件にしない。過去の録画の読み直しでも確定にできる（[design-investigation-review.md](design-investigation-review.md) 1 節。2026-10-10 のオーナーの決定）。「決めるのに使った録画」は、仮説・値・読み方を決めるのに使った録画（結論の \`decidedOn\`）。機械の等級の候補は、反復実測の再現にこれらの録画を数えない。
- 訂正は、古い結論を消さずに状態を \`棄却\` にし、新しい結論の「置き換え」に古い ID を書く。ID は変えない・使い回さない。
- 根拠の \`010-01\` などは観測値の ID（\`records/observations/<録画 id>.json\`）。モデル側が「未反映」のものは、結論は確かだがモデルの既定などにまだ入れていない。
- 関連: [design-stage19.md](design-stage19.md) 2.4 節、[verification.md](verification.md)（2026-09-26 までの根拠の記録）、[residuals.md](residuals.md)（残差の一覧）`;

/**
 * plan/claims.md の全文。話題の語彙の順に節を作り、節の中は番号順。
 * verificationsOf は結論 ID → それを「結論」に書いた検証記録（Stage 20-D。検証記録の側から逆に引く）
 */
export function renderClaims(
  claims: readonly Claim[],
  verificationsOf: ReadonlyMap<string, readonly string[]> = new Map(),
  /** 失効した観測値 → 失効の理由（Stage 20-E。根拠に失効したものがあれば印を付ける） */
  invalidReasons: ReadonlyMap<string, string> = new Map(),
  /** 結論 ID → それを claims に書いたスキル定義の場所（plan/skills-guide.md 3 節。定義の側から逆に引く） */
  definitionPlaces: ReadonlyMap<string, readonly string[]> = new Map(),
  /** 結論 ID → 機械が出した等級の候補（plan/design-records-automation.md 3.5 節。書いた等級と違うときだけ出す） */
  gradeCandidates: ReadonlyMap<string, ClaimGrade> = new Map(),
  /** 結論 ID → 最小構成の検査の警告のある組の数と組の数（plan/design-minimal-relevance.md 5 節。警告のあるものだけ出す） */
  minimalCounts: ReadonlyMap<string, { warned: number; pairs: number }> = new Map(),
): string {
  const replacedBy = new Map<string, string[]>();
  for (const c of claims) for (const r of c.replaces) replacedBy.set(r, [...(replacedBy.get(r) ?? []), c.id]);
  const count = (state: ClaimState) => claims.filter((c) => c.state === state).length;
  const lines = [
    CLAIMS_HEADER,
    '',
    `件数: ${CLAIM_STATES.map((s) => `${s} ${count(s)}`).join('・')}（計 ${claims.length}）`,
  ];
  for (const topic of CLAIM_TOPICS) {
    const inTopic = claims.filter((c) => c.topic === topic);
    if (inTopic.length === 0) continue;
    lines.push('', `## ${topic}`, '');
    for (const c of inTopic) {
      const meta = [`状態: ${c.state}`, ...(c.grade ? [`等級: ${c.grade}`] : []), `更新日: ${c.updated}`];
      lines.push(
        `- **${c.id}** ${c.text}`,
        `  - ${meta.join('・')}`,
        `  - 根拠: ${c.basis}`,
        `  - モデル側: ${c.model}`,
      );
      if (c.decidedOn !== undefined)
        lines.push(
          `  - 決めるのに使った録画: ${c.decidedOn.length === 0 ? 'なし' : c.decidedOn.map((d) => `${d.recording}（${d.role}）`).join('、')}`,
        );
      if (c.replaces.length > 0) lines.push(`  - 置き換え: ${c.replaces.join('、')}`);
      const by = replacedBy.get(c.id);
      if (by !== undefined) lines.push(`  - 置き換えた結論: ${by.join('、')}`);
      const vs = verificationsOf.get(c.id);
      if (vs !== undefined && vs.length > 0) lines.push(`  - 検証記録: ${vs.join('、')}`);
      const places = definitionPlaces.get(c.id);
      if (places !== undefined && places.length > 0) lines.push(`  - 定義: ${places.join('、')}`);
      const invalid = c.observations.filter((o) => invalidReasons.has(o));
      if (invalid.length > 0)
        lines.push(`  - **失効した根拠**: ${invalid.map((o) => `${o}（${invalidReasons.get(o)}）`).join('、')}`);
      const candidate = gradeCandidates.get(c.id);
      if (candidate !== undefined && c.grade !== undefined && candidate !== c.grade && c.state !== '棄却') {
        const above = gradeAboveCandidate(c.grade, candidate);
        const reason = above && c.gradeReason !== undefined ? `。理由: ${c.gradeReason}` : '';
        lines.push(`  - 等級の候補（機械）: ${candidate}${above ? `（書いた等級のほうが上${reason}）` : ''}`);
      }
      const minimal = minimalCounts.get(c.id);
      if (minimal !== undefined && minimal.warned > 0)
        lines.push(`  - 最小構成の警告: ${minimal.warned} / ${minimal.pairs} 組（[minimal.md](minimal.md)）`);
    }
  }
  return `${lines.join('\n')}\n`;
}
