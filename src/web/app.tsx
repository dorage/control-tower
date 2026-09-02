import { useEffect, type ReactNode } from "react";
import { AppShell } from "./components/app-shell";
import { EmptyState } from "./components/ui";
import { useLocation } from "./lib/router";
import { DashboardPage } from "./pages/dashboard.page";
import { FilesPage } from "./pages/files.page";
import { SessionDetailPage } from "./pages/session-detail.page";
import { SessionsPage } from "./pages/sessions.page";
import { SystemPage } from "./pages/system.page";
import { TelemetryPage } from "./pages/telemetry.page";

function NotFound({ pathname }: { pathname: string }) {
  return <EmptyState title="없는 경로" hint={pathname} />;
}

/** 정규식 라우터를 만들지 않는다. 경로가 여섯 개뿐이라 세그먼트 분해로 충분하다. */
function titleFor(segments: string[]): string {
  if (segments.length === 0) return "control tower";
  if (segments[0] === "files") return "파일 · control tower";
  if (segments[0] === "sessions") {
    return segments.length === 1 ? "세션 · control tower" : `${segments[1]} · control tower`;
  }
  if (segments[0] === "telemetry") return "텔레메트리 · control tower";
  if (segments[0] === "system") return "성능 · control tower";
  return "control tower";
}

export function App() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);

  useEffect(() => {
    document.title = titleFor(segments);
  }, [pathname]);

  let content: ReactNode;
  if (segments.length === 0) content = <DashboardPage />;
  else if (segments[0] === "files" && segments.length === 1) content = <FilesPage />;
  else if (segments[0] === "sessions" && segments.length === 1) content = <SessionsPage />;
  else if (segments[0] === "sessions" && segments.length === 2)
    content = <SessionDetailPage id={segments[1]!} />;
  else if (segments[0] === "telemetry" && segments.length === 1) content = <TelemetryPage />;
  else if (segments[0] === "system" && segments.length === 1) content = <SystemPage />;
  else content = <NotFound pathname={pathname} />;

  return <AppShell>{content}</AppShell>;
}
