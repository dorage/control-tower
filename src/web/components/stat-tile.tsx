import type { ReactNode } from "react";
import { Link } from "../lib/router";

export type StatTone = "neutral" | "accent" | "success";

/**
 * One number with a label. Wraps itself in a link when `to` is given so the whole tile
 * is the click target, not just the text.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  dot = false,
  to,
}: {
  label: string;
  value: string;
  /** Shown on hover. Use it for the breakdown behind a rolled-up number. */
  hint?: string;
  tone?: StatTone;
  /** A live indicator, e.g. sessions currently running. */
  dot?: boolean;
  to?: string;
}) {
  const body = (
    <>
      <span className="stat-tile__label">
        {dot ? <span className="stat-tile__dot" aria-hidden="true" /> : null}
        {label}
      </span>
      <span className="stat-tile__value">{value}</span>
    </>
  );

  const className = `stat-tile stat-tile--${tone}`;
  if (to) {
    return (
      <Link to={to} className={className} title={hint}>
        {body}
      </Link>
    );
  }
  return (
    <div className={className} title={hint}>
      {body}
    </div>
  );
}

export function StatTileRow({ children }: { children: ReactNode }) {
  return <div className="stat-tiles">{children}</div>;
}
