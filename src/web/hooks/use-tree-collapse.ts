import { useCallback, useEffect, useState } from "react";

/** styles.css 의 `.files` 미디어 쿼리와 같은 값. 두 곳이 어긋나면 접기가 안 보이는 화면이 생긴다. */
const NARROW_SCREEN = "(max-width: 900px)";

/**
 * 좁은 화면에서 파일 트리를 접었다 펼치는 상태.
 *
 * 900px 아래에서는 트리와 뷰어가 위아래로 갈려 뷰어가 화면의 3분의 2 도 못 가진다. 파일을
 * 고른 순간부터는 트리가 아니라 내용을 보러 온 것이므로 `path` 가 바뀌면 자동으로 접고,
 * 툴바의 버튼으로 다시 펼친다. 경로가 비면(루트를 바꿨거나 아직 고르지 않았으면) 펼친다.
 *
 * 넓은 화면에서는 `collapsed` 가 true 여도 CSS 가 무시하므로 좌우 배치가 흔들리지 않는다.
 */
export function useTreeCollapse(path: string | null): { collapsed: boolean; toggle: () => void } {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (path === null) {
      setCollapsed(false);
      return;
    }
    if (window.matchMedia(NARROW_SCREEN).matches) setCollapsed(true);
  }, [path]);

  const toggle = useCallback(() => setCollapsed((value) => !value), []);

  return { collapsed, toggle };
}
