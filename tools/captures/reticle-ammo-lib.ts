// 照準の残弾の読み（reticle-ammo.ts）の、読んだ後の純関数: 誤読を落とす・マガジンに分ける・見本を平均する。
// 動画やファイルには触れない。

export type Reading = { frame: number; value: number; score: number; x: number; y: number };

/** 弾丸チャージとみなす増え（1 フレームの間で） */
const STEP_UP = 5;

/**
 * 前後の読みのどちらとも大きく違う 1 フレームだけの読み（誤読）を落とす。弾丸チャージの増え（STEP_UP 以上）は、
 * 次の読みも増えた値の近くなら残す。dropFlicker なら、前後が同じ値で間の 1 フレームだけ違う読みも落とす
 * （--style box: 1 桁の表示は 8 と 9 などを読み違えやすい）
 */
export function clean(readings: readonly Reading[], dropFlicker: boolean): Reading[] {
  const out: Reading[] = [];
  for (let i = 0; i < readings.length; i++) {
    const r = readings[i]!;
    const prev = out[out.length - 1];
    const next = readings[i + 1];
    if (prev !== undefined && next !== undefined && r.frame - prev.frame <= 3 && next.frame - r.frame <= 3) {
      const offPrev = Math.abs(r.value - prev.value);
      const offNext = Math.abs(r.value - next.value);
      if (offPrev > 25 && offNext > 25) continue;
      if (dropFlicker && prev.value === next.value && r.value !== prev.value) continue;
    }
    out.push(r);
  }
  return out;
}

export type Magazine = {
  /** 最大の表示（またはこの読みの区間の最初の読み）のフレーム */
  start: number;
  startValue: number;
  /** 0 の表示が最初に出たフレーム（撃ち切らなければ無し） */
  zero?: number;
  /** 0 の表示の後に増えたか（最後の弾丸と同じ発の弾丸チャージが残ったか）と、その値 */
  afterZero?: number;
  /** 減った量の合計（発数）と、増え（弾丸チャージ）のフレームと量 */
  drops: number;
  ups: { frame: number; from: number; to: number }[];
  /** 区間の中の、読みの間が 10 フレームを超えた所の数（その間の増えは数えられない） */
  gaps: number;
};

/**
 * 読みをマガジンに分ける。最大（max）の表示が、reloadBelow より小さい読みか、読めない間（60 フレーム超）の後に出たらリロードの後
 * （reloadBelow は reloadBelowOf）
 */
export function magazines(readings: readonly Reading[], max: number, reloadBelow: number): Magazine[] {
  const mags: Magazine[] = [];
  let cur: Magazine | null = null;
  let prev: Reading | null = null;
  for (const r of readings) {
    const reloaded = prev !== null && r.value === max && (prev.value < reloadBelow || r.frame - prev.frame > 60);
    if (cur === null || reloaded) {
      if (cur !== null) mags.push(cur);
      cur = { start: r.frame, startValue: r.value, drops: 0, ups: [], gaps: 0 };
      prev = r;
      continue;
    }
    if (r.frame - prev!.frame > 10) cur.gaps += 1;
    const d = r.value - prev!.value;
    if (d < 0) cur.drops += -d;
    else if (d >= STEP_UP) {
      cur.ups.push({ frame: r.frame, from: prev!.value, to: r.value });
      if (cur.zero !== undefined && cur.afterZero === undefined) cur.afterZero = r.value;
    }
    if (r.value === 0 && cur.zero === undefined) cur.zero = r.frame;
    prev = r;
  }
  if (cur !== null) mags.push(cur);
  return mags;
}

/**
 * リロードの後とみる、最大の表示の前の読みの上限。ふだんは最大より 50（max が小さければ max - 1）小さい読み（0 か、それに近い。
 * 弾丸チャージで最大に戻ったのと分ける）。box は 0 がリロード中に暗くなって読めず（前の読みは 1 以上）、弾丸チャージは増えとして
 * 出ない（V-0679）ので、最大への上がりはリロード（か満開の明けの補充）。ただし 1 つ下（8 と 9 など）からの上がりは読み違えとみる
 */
export const reloadBelowOf = (max: number, box: boolean): number => (box ? max - 1 : max - Math.min(50, max - 1));

/** --make-templates の「frame:3 桁の値,...」を、フレーム → 値にする */
export function parseTemplateSpec(spec: string): Map<number, string> {
  return new Map(
    spec.split(',').map((s) => {
      const [frame, value] = s.split(':');
      if (!frame || !value || !/^\d{3}$/.test(value)) throw new Error(`見本は frame:3 桁の値 で指定する: ${s}`);
      return [Number(frame), value] as const;
    }),
  );
}

/** 見本にするフレーム: 表示の 3 桁の値と、その 3 桁の枠（見つからなければ null） */
export type TemplateSample = { frame: number; value: string; patches: number[][] | null };

/**
 * 見本のフレームの枠を、数字ごとに平均する（小数 1 桁に丸める）。3 桁の見つからないフレーム（照準にダメージの数字が重なったなど）は
 * 飛ばして onSkip で知らせる（数字ごとの見本がそろえばよい）。そろわない数字があれば例外
 */
export function averageTemplates(
  samples: Iterable<TemplateSample>,
  onSkip: (frame: number) => void,
): { digits: Record<string, number[]>; counts: Record<string, number> } {
  const sums: Record<string, number[]> = {};
  const counts: Record<string, number> = {};
  for (const { frame, value, patches } of samples) {
    if (patches === null) {
      onSkip(frame);
      continue;
    }
    patches.forEach((p, i) => {
      const d = value[i]!;
      sums[d] ??= p.map(() => 0);
      p.forEach((v, k) => (sums[d]![k]! += v));
      counts[d] = (counts[d] ?? 0) + 1;
    });
  }
  const missing = [...'0123456789'].filter((d) => !sums[d]);
  if (missing.length > 0) throw new Error(`見本に無い数字: ${missing.join('')}`);
  const round = (v: number) => Math.round(v * 10) / 10;
  const digits = Object.fromEntries(
    Object.entries(sums)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, s]) => [d, s.map((v) => round(v / counts[d]!))]),
  );
  return { digits, counts };
}
