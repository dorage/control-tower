/**
 * 시각 문자열. 서버 프로세스의 시간대(`TZ`)에 기대지 않고 시간대를 명시한다 —
 * systemd 유닛에는 TZ 가 없어서, 같은 코드가 셸에서는 KST 로, 서비스에서는 UTC 로 찍힐 수 있다.
 */

export const KST = "Asia/Seoul";

/** `2026-09-26 14:03:05` 꼴. `sv-SE` 로케일이 ISO 순서(년-월-일)를 24시간제로 내준다. */
export function formatTimestamp(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace("T", " ");
}
