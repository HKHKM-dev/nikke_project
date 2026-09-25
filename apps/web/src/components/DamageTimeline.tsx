// Stage 16-B: sim のタイムライン（plan/design-stage16.md 9.4 節）。1 秒ごとの編成のダメージの棒に、
// 敵の出来事とフルバーストの区間を帯で重ねる。図のライブラリは使わず SVG を手で描く。
import { ENEMY_EVENT_KIND_LABEL, type DamagePerSecond, type EnemyEvent, type EnemyEventKind } from '@nikke/core';
import { formatNumber } from '../format.ts';

type Props = {
  perSecond: DamagePerSecond;
  events: readonly EnemyEvent[];
  /** フルバーストの区間（フレーム） */
  fullBursts: readonly { start: number; end: number }[];
};

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

export function DamageTimeline({ perSecond, events, fullBursts }: Props) {
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
      </figcaption>
    </figure>
  );
}
