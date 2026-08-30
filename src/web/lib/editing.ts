/**
 * textarea 편집 보조의 순수 부분. DOM 을 모르므로 그대로 테스트할 수 있다.
 * DOM 조작(선택 영역·실행 취소)은 `components/markdown-editor.tsx` 가 맡는다.
 */

/** 들여쓰기 한 단위. 마크다운 목록 중첩이 2칸이므로 탭을 쓰지 않는다. */
export const INDENT = "  ";

export interface ListMarker {
  /** 다음 줄에 이어 쓸 표식. 순서 목록이면 번호가 하나 올라간다. */
  next: string;
  /** 표식만 있고 내용이 비었는가. 이 상태의 Enter 는 목록을 끝낸다. */
  empty: boolean;
}

/**
 * 줄 앞의 목록 표식을 읽는다. `- `, `* `, `+ `, `1. `, `1) `, `- [ ] `, `- [x] `.
 *
 * 인용(`> `)이나 제목은 다루지 않는다. 이어 쓰기가 도움이 되는 것은 목록뿐이고,
 * 나머지까지 흉내 내면 의도치 않은 삽입이 늘어난다.
 */
export function listMarkerOf(line: string): ListMarker | null {
  const match = /^([ \t]*)(?:([-*+])|(\d+)([.)]))([ \t]+)(\[[ xX]\][ \t]+)?/.exec(line);
  if (!match) return null;

  const [whole, indent = "", bullet, digits, delimiter = "", space = " ", task] = match;
  const marker = bullet
    ? `${indent}${bullet}${space}`
    : `${indent}${Number(digits) + 1}${delimiter}${space}`;

  return {
    // 이어지는 항목은 언제나 체크 해제 상태로 시작한다.
    next: task ? `${marker}[ ] ` : marker,
    empty: line.length === whole.length,
  };
}

/** 블록의 모든 줄 앞에 한 단위를 붙인다. 빈 줄은 건드리지 않는다. */
export function indentLines(block: string, unit: string = INDENT): string {
  return block
    .split("\n")
    .map((line) => (line === "" ? line : unit + line))
    .join("\n");
}

/** 블록의 모든 줄에서 한 단위만큼 앞 공백을 걷어낸다. 탭 하나도 한 단위로 본다. */
export function outdentLines(block: string, unit: string = INDENT): string {
  return block
    .split("\n")
    .map((line) => {
      if (line.startsWith(unit)) return line.slice(unit.length);
      if (line.startsWith("\t")) return line.slice(1);
      // 단위보다 짧게 들여쓴 줄은 남은 공백만 걷어낸다.
      const spaces = /^[ ]+/.exec(line);
      return spaces ? line.slice(spaces[0].length) : line;
    })
    .join("\n");
}
