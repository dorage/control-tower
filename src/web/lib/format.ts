/**
 * 세션 데이터에는 타임스탬프가 없는 레코드가 흔하다. 모든 포맷터는 잘못된 입력에 대해
 * 던지지 않고 "-" 를 돌려준다.
 */

const MISSING = "-";

function toMillis(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const millis = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(millis) ? millis : null;
}

/** 1234567 -> "1.2M", 1234 -> "1.2K", 999 -> "999" */
export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return MISSING;
  const sign = value < 0 ? "-" : "";
  const size = Math.abs(value);
  if (size >= 1_000_000_000) return `${sign}${(size / 1_000_000_000).toFixed(1)}B`;
  if (size >= 1_000_000) return `${sign}${(size / 1_000_000).toFixed(1)}M`;
  if (size >= 1000) return `${sign}${(size / 1000).toFixed(1)}K`;
  return `${sign}${Math.round(size)}`;
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** 1000 이 아니라 1024 기준. 2048 -> "2.0 KB" */
export function bytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return MISSING;
  if (value < 1024) return `${Math.round(value)} B`;
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < BYTE_UNITS.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(1)} ${BYTE_UNITS[unit]}`;
}

/** 3_725_000 -> "1시간 2분", 45_000 -> "45초", 0 -> "0초" */
export function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return MISSING;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}일 ${restHours}시간` : `${days}일`;
}

/** "방금", "3분 전", "2시간 전", "어제", 7일이 넘으면 절대 날짜. */
export function relativeTime(value: string | number | null | undefined): string {
  const millis = toMillis(value);
  if (millis === null) return MISSING;

  const diff = Date.now() - millis;
  if (diff < 0) return dateTime(millis);

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "어제";
  if (days <= 7) return `${days}일 전`;

  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(millis);
}

/** "2026-08-29 14:03" (로컬 시간). */
export function dateTime(value: string | number | null | undefined): string {
  const millis = toMillis(value);
  if (millis === null) return MISSING;
  const at = new Date(millis);
  const pad = (part: number) => String(part).padStart(2, "0");
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ` +
    `${pad(at.getHours())}:${pad(at.getMinutes())}`
  );
}

/**
 * "/home/u/workspace/app" -> "~/workspace/app".
 * 브라우저는 HOME 을 모르므로 경로 모양으로 추정한다. 표시 전용이며 서버로 되돌려 보내지 않는다.
 */
export function tildePath(value: string | null | undefined): string {
  if (!value) return MISSING;
  return value.replace(/^\/(?:home|Users)\/[^/]+|^\/root(?=\/|$)/, "~");
}

/** 목록 구분선용 묶음 이름. "오늘" | "어제" | "이번 주" | "2026년 8월" */
export function dayGroup(value: string | number | null | undefined): string {
  const millis = toMillis(value);
  if (millis === null) return "시각 없음";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  if (millis >= today) return "오늘";
  if (millis >= today - day) return "어제";
  if (millis >= today - 7 * day) return "이번 주";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long" }).format(millis);
}
