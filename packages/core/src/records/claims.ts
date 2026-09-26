// Stage 19-C: 結論の台帳（plan/claims.md）の読み取りと検証。plan/design-stage19.md 2.4 節。
// 人が読む Markdown の表を正とし、機械は ID・状態・根拠の観測値・置き換えだけを読む。
// Stage 20-A: ID の桁を決め打ちしない（録画 3 桁以上・連番 2 桁以上・結論 4 桁以上）。通し番号の抜けは許し、
// 重複と逆順だけを落とす（plan/design-stage20.md 3.6 節）。

export const CLAIM_STATES = ['確定', '仮説', '棄却', '範囲外'] as const;
export type ClaimState = (typeof CLAIM_STATES)[number];

export type Claim = {
  id: string;
  text: string;
  state: ClaimState;
  /** 根拠の列にバッククォートで書いた観測値の ID（`010-01` など。`012-01`〜`012-04` のような範囲は展開する） */
  observations: string[];
  /** 置き換えた（棄却した）結論の ID */
  replaces: string[];
};

const OBSERVATION_ID = /`((?:\d{3,}|L-[A-Z]{1,3})-\d{2,})`/g;
const OBSERVATION_RANGE = /`((?:\d{3,}|L-[A-Z]{1,3}))-(\d{2,})`\s*〜\s*`\1-(\d{2,})`/g;
const CLAIM_ID = /^C-(\d{4,})$/;

/** 根拠の列から、バッククォートで囲んだ観測値の ID を拾う。「`012-01`〜`012-04`」は 012-01〜012-04 に展開する */
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

function cells(line: string): string[] {
  return line
    .trim()
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());
}

/** 表の行（`| C-0001 | … |`）を読む。列は ID・結論・状態・根拠・モデル側・置き換え・更新日 */
export function parseClaims(markdown: string): Claim[] {
  return markdown
    .split('\n')
    .filter((line) => /^\|\s*C-\d{4,}\s*\|/.test(line))
    .map((line) => {
      const [id = '', text = '', state = '', basis = '', , replaces = ''] = cells(line);
      return {
        id,
        text,
        state: state as ClaimState,
        observations: observationIdsIn(basis),
        replaces: replaces.match(/C-\d{4,}/g) ?? [],
      };
    });
}

export function validateClaims(claims: readonly Claim[], observationIds: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  const byId = new Map(claims.map((c) => [c.id, c]));
  const seen = new Set<string>();
  let last: { id: string; number: number } | undefined;
  for (const c of claims) {
    const m = CLAIM_ID.exec(c.id);
    if (m === null) errors.push(`${c.id}: ID は C-<4 桁以上の数字>`);
    else if (seen.has(c.id)) errors.push(`${c.id}: ID が重複している`);
    else {
      const number = Number(m[1]);
      if (last !== undefined && number <= last.number) errors.push(`${c.id}: ID は番号順に並べる（前は ${last.id}）`);
      last = { id: c.id, number };
    }
    seen.add(c.id);
    if (!CLAIM_STATES.includes(c.state)) errors.push(`${c.id}: 状態が語彙に無い: ${c.state}`);
    if (c.text === '') errors.push(`${c.id}: 結論が空`);
    for (const o of c.observations) if (!observationIds.has(o)) errors.push(`${c.id}: 観測値 ${o} が無い`);
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

/** テストで許容幅を守らせる観測値（状態が確定の結論の根拠） */
export function gatedObservations(claims: readonly Claim[]): Set<string> {
  return new Set(claims.filter((c) => c.state === '確定').flatMap((c) => c.observations));
}
