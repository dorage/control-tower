import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner" role="status" aria-live="polite">
      <span className="spinner__dot" aria-hidden="true" />
      <span>{label ?? "불러오는 중…"}</span>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <div className="empty__title">{title}</div>
      {hint ? <div className="empty__hint">{hint}</div> : null}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="error-box" role="alert">
      <span className="error-box__message">{message}</span>
      {onRetry ? (
        <Button variant="ghost" onClick={onRetry}>
          다시 시도
        </Button>
      ) : null}
    </div>
  );
}

export type BadgeTone = "neutral" | "accent" | "danger" | "success" | "warning";

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={tone === "neutral" ? "badge" : `badge badge--${tone}`}>{children}</span>;
}

export function Button({
  variant,
  className,
  type,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const classes = ["button", variant ? `button--${variant}` : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return <button type={type ?? "button"} className={classes} {...rest} />;
}
