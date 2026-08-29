import { createElement, useCallback, useMemo, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";

export interface Location {
  pathname: string;
  search: URLSearchParams;
}

const listeners = new Set<() => void>();

function currentHref(): string {
  return window.location.pathname + window.location.search;
}

let snapshot = typeof window === "undefined" ? "/" : currentHref();

function notify(): void {
  snapshot = currentHref();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("popstate", notify);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("popstate", notify);
  };
}

/**
 * 스냅샷은 반드시 **문자열**이다. useSyncExternalStore 는 참조 동일성으로 비교하므로
 * 매번 새 객체를 돌려주면 무한 렌더가 된다. 객체 변환은 useLocation 의 useMemo 가 한다.
 */
function getSnapshot(): string {
  return snapshot;
}

export function useLocation(): Location {
  const href = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => {
    const questionMark = href.indexOf("?");
    return questionMark === -1
      ? { pathname: href, search: new URLSearchParams() }
      : { pathname: href.slice(0, questionMark), search: new URLSearchParams(href.slice(questionMark)) };
  }, [href]);
}

/** pushState 는 popstate 를 발생시키지 않으므로 직접 알린다. */
export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (to === currentHref()) return;
  if (options.replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  notify();
}

/**
 * 여러 쿼리 파라미터를 한 번에 바꾼다. 나머지는 유지하고, 값이 null 이면 제거한다.
 * 한 번에 바꿔야 하는 이유: 필터를 켜면서 페이지 오프셋을 0으로 되돌리는 것 같은 조합은
 * 두 번에 나눠 갱신하면 중간 상태로 한 번 더 요청이 나간다.
 */
export function setParams(
  updates: Record<string, string | null>,
  options: { replace?: boolean } = {},
): void {
  const search = new URLSearchParams(window.location.search);
  for (const [name, value] of Object.entries(updates)) {
    if (value === null) search.delete(name);
    else search.set(name, value);
  }
  const encoded = search.toString();
  navigate(window.location.pathname + (encoded ? `?${encoded}` : ""), options);
}

/** 현재 쿼리 파라미터 하나만 바꾼다. 나머지는 유지한다. value 가 null 이면 제거. */
export function setParam(name: string, value: string | null, options: { replace?: boolean } = {}): void {
  setParams({ [name]: value }, options);
}

export function Link({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  const onClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      // 새 탭/새 창 열기는 브라우저에 맡긴다.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      navigate(to);
    },
    [to],
  );
  return createElement("a", { href: to, className, onClick }, children);
}
