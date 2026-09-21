import { useSyncExternalStore } from "react";

/**
 * 화면 설정. 지금은 코드 색 테마 하나뿐이다.
 *
 * URL 이 아니라 `localStorage` 에 둔다 - 공유할 가치가 없는 개인 취향이다(CONVENTIONS 10).
 * 값은 `document.documentElement` 의 `data-code-theme` 로 내려가고, 실제 색은 styles.css 의
 * 테마 블록이 정한다. 색을 JS 에서 계산하지 않는 이유는 CSS 토큰 규칙을 깨지 않기 위해서다.
 */

export interface CodeTheme {
  id: string;
  label: string;
  /** 설정 화면에서 밝은 테마와 어두운 테마를 나눠 보여줄 때 쓴다. */
  tone: "auto" | "light" | "dark";
}

export const CODE_THEMES = [
  { id: "auto", label: "화면 테마 따라감", tone: "auto" },
  { id: "github-light", label: "GitHub Light", tone: "light" },
  { id: "solarized-light", label: "Solarized Light", tone: "light" },
  { id: "github-dark", label: "GitHub Dark", tone: "dark" },
  { id: "solarized-dark", label: "Solarized Dark", tone: "dark" },
  { id: "dracula", label: "Dracula", tone: "dark" },
  { id: "nord", label: "Nord", tone: "dark" },
] as const satisfies readonly CodeTheme[];

export type CodeThemeId = (typeof CODE_THEMES)[number]["id"];

export const DEFAULT_CODE_THEME: CodeThemeId = "auto";

const KEY = "ct:code-theme";

export function isCodeTheme(value: unknown): value is CodeThemeId {
  return typeof value === "string" && CODE_THEMES.some((theme) => theme.id === value);
}

export function codeThemeLabel(id: string): string {
  return CODE_THEMES.find((theme) => theme.id === id)?.label ?? id;
}

function readStored(): CodeThemeId {
  try {
    const stored = window.localStorage.getItem(KEY);
    return isCodeTheme(stored) ? stored : DEFAULT_CODE_THEME;
  } catch {
    // 사생활 보호 모드 등에서 접근이 막힐 수 있다. 기본값으로 계속 동작한다.
    return DEFAULT_CODE_THEME;
  }
}

/**
 * 스냅샷은 문자열이다. `useSyncExternalStore` 는 참조 동일성으로 비교하므로 객체를 돌려주면
 * 매 렌더가 새 값이 된다(router.ts 와 같은 이유).
 */
let current: CodeThemeId = typeof window === "undefined" ? DEFAULT_CODE_THEME : readStored();

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** 다른 탭에서 바꾼 설정을 따라간다. 관제탑은 탭을 여러 개 열어 두고 쓴다. */
function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== KEY) return;
  const next = readStored();
  if (next === current) return;
  current = next;
  applyCodeTheme();
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): CodeThemeId {
  return current;
}

export function getCodeTheme(): CodeThemeId {
  return current;
}

/**
 * 문서 루트에 현재 테마를 적는다. `main.tsx` 가 첫 렌더 전에 한 번 부른다 -
 * React 상태로 들고 있으면 앱이 그려지기 전 한 프레임 동안 기본 색이 보인다.
 */
export function applyCodeTheme(): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.codeTheme = current;
}

export function setCodeTheme(next: CodeThemeId): void {
  if (next === current) return;
  current = next;
  applyCodeTheme();
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // 저장 실패는 무시한다. 이번 세션 동안은 적용된 채로 남는다.
  }
  emit();
}

export function useCodeTheme(): CodeThemeId {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
