// Stage 16-B: sim のタイムライン（plan/design-stage16.md 9.4 節）。1 秒ごとの編成のダメージの棒に、
// 敵の出来事とフルバーストの区間を帯で重ねる。図のライブラリは使わず SVG を手で描く。
// Stage 18-C2: 的の着地点（距離帯）を上端の細い帯で出す（条件が自動の枠があるときだけ）。
import {
  ENEMY_EVENT_KIND_LABEL,
  LANDING_BAND_LABEL,
  type DamagePerSecond,
  type EnemyEvent,
  type EnemyEventKind,
  type LandingFrameSpan,
} from '@nikke/core';
import { formatNumber } from '../format.ts';

type Props = {
  perSecond: DamagePerSecond;
  events: readonly EnemyEvent[];
  /** フルバーストの区間（フレーム） */
  fullBursts: readonly { start: number; end: number }[];
  /** Stage 18-C2: 着地点の区間（フレーム）。無ければ空 */
  landings: readonly LandingFrameSpan[];
};

/** 着地点の区間の呼び名（距離帯。未測定・帯の定まらない配分は「未測定」） */
export function landingLabel(span: Pick<LandingFrameSpan, 'band'>): string {
  return span.band === null ? '未測定' : LANDING_BAND_LABEL[span.band].ja;
}

const bandClass = (span: Pick<LandingFrameSpan, 'band'>) => `tl-band-${span.band ?? 'unknown'}`;
/** 着地点の帯の高さ（px） */
const BAND_HEIGHT = 6;

/** 縦軸の最大値の表示（1234万 のように短くする） */
const compact = new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 });
const WIDTH = 720;
const HEIGHT = 180;
const PAD = { left: 56, right: 8, top: 8, bottom: 22 };
const EVENT_CLASS: Record<EnemyEventKind, string> = {
  untargetable: 'tl-untargetable',
  invulnerable: 'tl-invulnerable',
  barrier: 'tl-barrier',
};

export function DamageTimeline({ perSecond, events, fullBursts, landings }: Props) {
  const seconds = perSecond.total.length;
  if (seconds === 0) return null;
  const max = Math.max(...perSecond.total, 1);
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (s: number) => PAD.left + (Math.min(s, seconds) / seconds) * plotW;
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const tickStep = seconds > 120 ? 30 : seconds > 40 ? 10 : 5;
  const ticks = Array.from({ length: Math.floor(seconds / tickStep) + 1 }, (_, i) => i * tickStep);
  const kinds = [...new Set(events.map((e) => e.kind))];
  const bands = [...new Map(landings.map((s) => [bandClass(s), s])).values()];
  return (
    <figure className="timeline">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`1 秒ごとの編成のダメージ（${seconds} 秒、最大 ${formatNumber(max)}）`}
      >
        {fullBursts.map((w, i) => (
          <rect
            key={`fb${i}`}
            className="tl-fullburst"
            x={x(w.start / 60)}
            y={PAD.top}
            width={x(w.end / 60) - x(w.start / 60)}
            height={plotH}
          />
        ))}
        {events.map((e, i) => (
          <rect
            key={`ev${i}`}
            className={EVENT_CLASS[e.kind]}
            x={x(e.start)}
            y={PAD.top}
            width={Math.max(1, x(e.end) - x(e.start))}
            height={plotH}
          >
            <title>
              {ENEMY_EVENT_KIND_LABEL[e.kind].ja} {formatNumber(e.start, 1)}–{formatNumber(e.end, 1)} 秒
            </title>
          </rect>
        ))}
        {perSecond.total.map((v, s) => (
          <rect
            key={s}
            className="tl-bar"
            x={x(s) + 0.5}
            y={y(v)}
            width={Math.max(0.5, x(s + 1) - x(s) - 1)}
            height={PAD.top + plotH - y(v)}
          >
            <title>
              {s}–{s + 1} 秒: {formatNumber(v)}
            </title>
          </rect>
        ))}
        {landings.map((s, i) => (
          <rect
            key={`ld${i}`}
            className={bandClass(s)}
            x={x(s.start / 60)}
            y={PAD.top}
            width={Math.max(1, x(s.end / 60) - x(s.start / 60))}
            height={BAND_HEIGHT}
          >
            <title>
              着地点 {landingLabel(s)} {formatNumber(s.start / 60, 1)}–{formatNumber(s.end / 60, 1)} 秒
            </title>
          </rect>
        ))}
        <line className="tl-axis" x1={PAD.left} x2={WIDTH - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} />
        {ticks.map((t) => (
          <text key={t} className="tl-label" x={x(t)} y={HEIGHT - 6} textAnchor="middle">
            {t}
          </text>
        ))}
        <text className="tl-label" x={PAD.left - 4} y={PAD.top + 10} textAnchor="end">
          {compact.format(max)}
        </text>
        <text className="tl-label" x={PAD.left - 4} y={PAD.top + plotH} textAnchor="end">
          0
        </text>
      </svg>
      <figcaption className="hint">
        1 秒ごとの編成のダメージ（横軸は秒）。
        <span className="tl-key tl-fullburst" /> フルバースト
        {kinds.map((k) => (
          <span key={k}>
            {' '}
            <span className={`tl-key ${EVENT_CLASS[k]}`} /> {ENEMY_EVENT_KIND_LABEL[k].ja}
          </span>
        ))}
        {bands.length > 0 && '。上端の帯は的の着地点:'}
        {bands.map((s) => (
          <span key={bandClass(s)}>
            {' '}
            <span className={`tl-key ${bandClass(s)}`} /> {landingLabel(s)}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
