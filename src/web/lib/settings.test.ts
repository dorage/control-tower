import { expect, test } from "bun:test";
import { CODE_THEMES, DEFAULT_CODE_THEME, codeThemeLabel, isCodeTheme } from "./settings";

test("테마 목록은 id 가 겹치지 않고 기본값을 포함한다", () => {
  const ids = CODE_THEMES.map((theme) => theme.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toContain(DEFAULT_CODE_THEME);
});

test("모든 테마 id 는 CSS 속성 선택자에 그대로 들어갈 모양이다", () => {
  // styles.css 가 `[data-code-theme="<id>"]` 로 쓴다. 따옴표나 공백이 섞이면 조용히 깨진다.
  for (const theme of CODE_THEMES) {
    expect(theme.id).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(theme.label.trim()).toBe(theme.label);
  }
});

test("저장된 값이 사라지거나 망가져도 테마로 인정하지 않는다", () => {
  expect(isCodeTheme("dracula")).toBe(true);
  expect(isCodeTheme("없는테마")).toBe(false);
  expect(isCodeTheme(null)).toBe(false);
  expect(isCodeTheme(undefined)).toBe(false);
  expect(isCodeTheme(3)).toBe(false);
});

test("라벨은 모르는 id 를 받아도 던지지 않는다", () => {
  expect(codeThemeLabel("dracula")).toBe("Dracula");
  expect(codeThemeLabel("없는테마")).toBe("없는테마");
});
