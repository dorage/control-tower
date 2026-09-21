import { useEffect, useRef } from "react";

/**
 * 일정 간격으로 callback 을 부른다. `intervalMs` 가 null 이면 멈춘다.
 *
 * 탭이 숨겨지면 타이머를 끄고, 돌아오면 즉시 한 번 부른 뒤 다시 건다. SSE 연결을 끊는 것과
 * 같은 이유다 — 보이지도 않는 화면 때문에 서버가 /proc 를 훑고 있을 이유가 없다.
 *
 * callback 은 ref 로만 읽으므로 렌더마다 새 함수를 넣어도 타이머를 다시 걸지 않는다.
 *
 * **진행 중인 요청을 앞지르지 않는 것은 호출자 몫이다.** 응답이 주기보다 느릴 때 그냥 다시
 * 부르면 `useQuery` 가 매번 `error` 를 지워, 실패가 화면에 영영 드러나지 않고 스피너만 돈다.
 * `if (!state.loading) refresh()` 로 감싼다.
 */
export function usePoll(callback: () => void, intervalMs: number | null): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (intervalMs === null) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      if (timer === null) timer = setInterval(() => callbackRef.current(), intervalMs);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stop();
        return;
      }
      callbackRef.current();
      start();
    };

    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs]);
}
