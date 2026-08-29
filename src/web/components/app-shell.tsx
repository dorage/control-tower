import type { ReactNode } from "react";
import { Link, useLocation } from "../lib/router";

const NAV = [
  { to: "/", segment: "", label: "대시보드" },
  { to: "/files", segment: "files", label: "파일" },
  { to: "/sessions", segment: "sessions", label: "세션" },
] as const;

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
        <div className="header__status" />
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
