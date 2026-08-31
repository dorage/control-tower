import { useMemo } from "react";

export interface StackedSeries {
  key: string;
  values: number[];
}

/**
 * Stacked bars as inline SVG. No chart library - see CONVENTIONS §10.
 *
 * Colours come from the bar palette by index, so a series keeps its colour across
 * re-renders and reloads. Generating colours from a hash of the key would be stable too,
 * but it produces muddy neighbours; six fixed slots that cycle read better.
 */
export function StackedTimeline({
  buckets,
  series,
  height = 120,
  formatValue = (value: number) => value.toLocaleString(),
  formatBucket = (ms: number) => new Date(ms).toLocaleDateString(),
}: {
  /** Bucket start times, epoch ms, ascending. */
  buckets: number[];
  series: StackedSeries[];
  height?: number;
  formatValue?: (value: number) => string;
  formatBucket?: (ms: number) => string;
}) {
  const { totals, max } = useMemo(() => {
    const sums = buckets.map((_, index) =>
      series.reduce((acc, entry) => acc + (entry.values[index] ?? 0), 0),
    );
    return { totals: sums, max: Math.max(...sums, 0) };
  }, [buckets, series]);

  if (buckets.length === 0 || max <= 0) {
    return <p className="bar-breakdown__empty">이 기간에 데이터가 없습니다.</p>;
  }

  const gap = buckets.length > 60 ? 0 : 2;
  const slot = 100 / buckets.length;

  return (
    <div className="stacked">
      <svg
        className="stacked__svg"
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="시계열 누적 막대"
      >
        {buckets.map((bucket, index) => {
          let offset = 0;
          return (
            <g key={bucket}>
              {series.map((entry, seriesIndex) => {
                const value = entry.values[index] ?? 0;
                if (value <= 0) return null;
                const barHeight = (value / max) * height;
                offset += barHeight;
                return (
                  <rect
                    key={entry.key}
                    className={`stacked__bar stacked__bar--c${seriesIndex % 6}`}
                    x={index * slot + gap / 2}
                    width={Math.max(slot - gap, 0.4)}
                    y={height - offset}
                    height={barHeight}
                  />
                );
              })}
              <title>
                {`${formatBucket(bucket)} · ${formatValue(totals[index] ?? 0)}`}
              </title>
            </g>
          );
        })}
      </svg>

      <div className="stacked__axis">
        <span>{formatBucket(buckets[0]!)}</span>
        {buckets.length > 1 ? <span>{formatBucket(buckets[buckets.length - 1]!)}</span> : null}
      </div>

      <div className="stacked__legend">
        {series.map((entry, index) => (
          <span key={entry.key} className="stacked__legend-item">
            <span className={`stacked__swatch stacked__swatch--c${index % 6}`} aria-hidden="true" />
            {entry.key}
          </span>
        ))}
      </div>
    </div>
  );
}
