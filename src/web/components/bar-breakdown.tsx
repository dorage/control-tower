import { useState } from "react";

export interface BarRow {
  key: string;
  value: number;
  /** Rendered instead of the raw number. */
  display?: string;
  /** Overrides the palette slot. */
  colorIndex?: number;
}

/**
 * Horizontal bars, drawn with a div width. No chart library - see CONVENTIONS §10.
 *
 * Bar length is relative to the largest row, not to the total: with one dominant value
 * (cacheRead against input, say) a share-of-total bar makes every other row invisible.
 * The percentage, when shown, is still share-of-total because that is the number people
 * actually want to read off it.
 */
export function BarBreakdown({
  rows,
  total,
  limit = 8,
  showPercent = false,
  emptyHint = "데이터 없음",
}: {
  rows: BarRow[];
  /** Denominator for the percentage. Defaults to the sum of `rows`. */
  total?: number;
  /** Rows past this are hidden behind a toggle. */
  limit?: number;
  showPercent?: boolean;
  emptyHint?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (rows.length === 0) return <p className="bar-breakdown__empty">{emptyHint}</p>;

  const max = Math.max(...rows.map((row) => row.value), 1);
  const sum = total ?? rows.reduce((acc, row) => acc + row.value, 0);
  const visible = expanded ? rows : rows.slice(0, limit);

  return (
    <div className="bar-breakdown">
      {visible.map((row, index) => (
        <div key={row.key} className="bar-breakdown__row">
          <span className="bar-breakdown__name" title={row.key}>
            {row.key}
          </span>
          <span className="bar-breakdown__track">
            <span
              className={`bar-breakdown__fill bar-breakdown__fill--c${(row.colorIndex ?? index) % 6}`}
              style={{ width: `${Math.max((row.value / max) * 100, 1.5)}%` }}
            />
          </span>
          <span className="bar-breakdown__value">
            {row.display ?? row.value.toLocaleString()}
            {showPercent && sum > 0 ? (
              <span className="bar-breakdown__pct">{((row.value / sum) * 100).toFixed(1)}%</span>
            ) : null}
          </span>
        </div>
      ))}
      {rows.length > limit ? (
        <button
          type="button"
          className="bar-breakdown__more"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "접기" : `더 보기 (${rows.length - limit})`}
        </button>
      ) : null}
    </div>
  );
}
