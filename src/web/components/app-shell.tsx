import type { ReactNode } from "react";
import { Link, useLocation } from "../lib/router";
import { reconnectLive, useLiveState } from "../hooks/use-live";

const NAV = [
  { to: "/", segment: "", label: "대시보드" },
  { to: "/files", segment: "files", label: "파일" },
  { to: "/sessions", segment: "sessions", label: "세션" },
  { to: "/telemetry", segment: "telemetry", label: "텔레메트리" },
] as const;

const LIVE_LABEL = {
  open: "실시간 연결됨",
  connecting: "연결 중...",
  closed: "연결 끊김",
} as const;

/**
 * 연결 표시등. 클릭하면 수동 재연결한다.
 *
 * 구독자가 하나도 없으면(어느 화면도 실시간을 안 쓰면) `closed` 가 정상이다.
 * 그래서 이 점 자체는 구독하지 않는다 — 표시등이 연결을 만들어내면 안 된다.
 */
function LiveDot() {
  const state = useLiveState();
  return (
    <button
      type="button"
      className={`live-dot live-dot--${state}`}
      title={LIVE_LABEL[state]}
      aria-label={LIVE_LABEL[state]}
      onClick={reconnectLive}
    >
      <span className="live-dot__mark" aria-hidden="true" />
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const active = pathname.split("/").filter(Boolean)[0] ?? "";

  return (
    <div className="shell">
      <header className="header">
        <Link to="/" className="header__brand">
          control tower
        </Link>
        {/* T-018 이 SSE 연결 표시등으로 채운다. */}
        <div className="header__status">
          <LiveDot />
        </div>
      </header>

      <nav className="nav" aria-label="주요 메뉴">
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={item.segment === active ? "nav__item nav__item--active" : "nav__item"}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <main className="main">{children}</main>
    </div>
  );
}
