/**
 * 문서 작업에 실제로 쓰이는 문법만 다루는 작은 마크다운 파서.
 *
 * HTML 문자열을 만들지 않는다. 결과는 AST 이고 렌더러가 React 엘리먼트로 바꾼다.
 * 그래서 `dangerouslySetInnerHTML` 도, sanitizer 의존성도 필요 없다.
 * 지원하지 않는 문법은 원문 그대로 텍스트로 남긴다 - 깨뜨리지 않는다.
 */

export type MdBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: MdInline[] }
  | { type: "paragraph"; children: MdInline[] }
  | { type: "code"; lang: string | null; text: string }
  | { type: "quote"; blocks: MdBlock[] }
  | { type: "list"; ordered: boolean; start: number; items: MdListItem[] }
  | {
      type: "table";
      header: MdInline[][];
      align: Array<"left" | "center" | "right" | null>;
      rows: MdInline[][][];
    }
  | { type: "hr" };

export interface MdListItem {
  checked: boolean | null;
  blocks: MdBlock[];
}

export type MdInline =
  | { type: "text"; value: string }
  | { type: "strong"; children: MdInline[] }
  | { type: "em"; children: MdInline[] }
  | { type: "del"; children: MdInline[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: MdInline[] }
  | { type: "image"; src: string; alt: string }
  | { type: "break" };

const FENCE = /^(\s{0,3})(`{3,}|~{3,})\s*([^\s`]*)/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^(\s{0,3})([-*_])(\s*\2){2,}\s*$/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const CHECKBOX = /^\[([ xX])\]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function isBlank(line: string): boolean {
  return line.trim() === "";
}

/**
 * 표 한 줄을 셀로 자른다. 양끝의 파이프는 버린다.
 * 정렬 배열의 `null` 은 "정렬 행에 대응하는 칸이 아예 없다"는 뜻으로만 남는다.
 */
function splitRow(line: string): string[] {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
  return text.split("|").map((cell) => cell.trim());
}

function alignmentsOf(divider: string): Array<"left" | "center" | "right" | null> {
  return splitRow(divider).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    // 콜론이 없으면 GFM 기본 정렬(LTR 에서 왼쪽)이다.
    return "left";
  });
}

export function parseMarkdown(text: string): MdBlock[] {
  return parseBlocks(text.replace(/\r\n?/g, "\n").split("\n"));
}

function parseBlocks(lines: string[]): MdBlock[] {
  const blocks: MdBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;

    if (isBlank(line)) {
      index++;
      continue;
    }

    // 코드 펜스를 가장 먼저 본다. 그 안에서는 어떤 규칙도 적용하지 않는다.
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[2]!;
      const lang = fence[3] ? fence[3] : null;
      const body: string[] = [];
      index++;
      while (index < lines.length) {
        const current = lines[index]!;
        // 닫는 펜스는 여는 것과 같은 문자로 같은 길이 이상이어야 한다.
        if (new RegExp(`^\\s{0,3}${marker[0]}{${marker.length},}\\s*$`).test(current)) {
          index++;
          break;
        }
        body.push(current);
        index++;
      }
      // 닫히지 않은 펜스는 파일 끝까지 코드다.
      blocks.push({ type: "code", lang, text: body.join("\n") });
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ type: "hr" });
      index++;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min(6, heading[1]!.length) as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({ type: "heading", level, children: parseInline(heading[2]!.replace(/\s+#+\s*$/, "")) });
      index++;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (index < lines.length) {
        const quoted = QUOTE.exec(lines[index]!);
        if (!quoted) break;
        inner.push(quoted[1]!);
        index++;
      }
      blocks.push({ type: "quote", blocks: parseBlocks(inner) });
      continue;
    }

    const table = tryTable(lines, index);
    if (table) {
      blocks.push(table.block);
      index = table.next;
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const list = parseList(lines, index);
      blocks.push(list.block);
      index = list.next;
      continue;
    }

    // 문단: 빈 줄이나 다른 블록이 시작될 때까지.
    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index]!;
      if (
        isBlank(current) ||
        FENCE.test(current) ||
        HEADING.test(current) ||
        HR.test(current) ||
        QUOTE.test(current) ||
        BULLET.test(current) ||
        ORDERED.test(current)
      ) {
        break;
      }
      paragraph.push(current);
      index++;
    }
    blocks.push({ type: "paragraph", children: parseInline(paragraph.join("\n")) });
  }

  return blocks;
}

/** 헤더 줄 다음 줄이 정렬 행일 때만 표로 인정한다. 아니면 그냥 문단이다. */
function tryTable(lines: string[], start: number): { block: MdBlock; next: number } | null {
  const header = lines[start]!;
  const divider = lines[start + 1];
  if (!header.includes("|") || divider === undefined || !TABLE_DIVIDER.test(divider)) return null;
  if (!divider.includes("-")) return null;

  const align = alignmentsOf(divider);
  const headerCells = splitRow(header).map((cell) => parseInline(cell));
  const rows: MdInline[][][] = [];

  let index = start + 2;
  while (index < lines.length && !isBlank(lines[index]!) && lines[index]!.includes("|")) {
    rows.push(splitRow(lines[index]!).map((cell) => parseInline(cell)));
    index++;
  }

  return { block: { type: "table", header: headerCells, align, rows }, next: index };
}

/** 들여쓰기로 중첩을 판정한다. 3단계 이상은 2단계로 접는다. */
function depthOf(indent: string): number {
  return Math.min(1, Math.floor(indent.replace(/\t/g, "  ").length / 2));
}

function parseList(lines: string[], start: number): { block: MdBlock; next: number } {
  const first = BULLET.exec(lines[start]!) ?? ORDERED.exec(lines[start]!)!;
  const ordered = ORDERED.test(lines[start]!) && !BULLET.test(lines[start]!);
  const baseDepth = depthOf(first[1]!);
  const startNumber = ordered ? Number.parseInt(first[2]!, 10) : 1;

  const items: MdListItem[] = [];
  let pending: string[] | null = null;
  let nested: string[] = [];
  let index = start;

  const flush = () => {
    if (pending === null) return;
    const text = pending.join("\n");
    const checkbox = CHECKBOX.exec(text);
    const body = checkbox ? checkbox[2]! : text;
    const blocks: MdBlock[] = [{ type: "paragraph", children: parseInline(body) }];
    if (nested.length > 0) blocks.push(...parseBlocks(nested));
    items.push({ checked: checkbox ? checkbox[1]!.toLowerCase() === "x" : null, blocks });
    pending = null;
    nested = [];
  };

  while (index < lines.length) {
    const line = lines[index]!;
    if (isBlank(line)) {
      // 목록 뒤에 빈 줄이 오고 다음 줄이 항목이 아니면 목록이 끝난다.
      const next = lines[index + 1];
      if (next === undefined || !(BULLET.test(next) || ORDERED.test(next))) break;
      index++;
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = ORDERED.exec(line);
    const match = bullet ?? numbered;

    if (match) {
      const depth = depthOf(match[1]!);
      if (depth <= baseDepth) {
        flush();
        pending = [bullet ? match[3]! : match[3]!];
        index++;
        continue;
      }
      // 더 깊은 항목은 현재 항목의 하위 목록으로 모아 재귀 파싱한다.
      nested.push(line.slice(Math.min(match[1]!.length, 2)));
      index++;
      continue;
    }

    if (pending === null) break;
    // 이어지는 줄(lazy continuation).
    pending.push(line.trim());
    index++;
  }
  flush();

  return { block: { type: "list", ordered, start: startNumber, items }, next: index };
}

/** javascript:, data:, vbscript: 를 막는다. */
const SAFE_SCHEME = /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i;

export function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (!SAFE_SCHEME.test(trimmed)) return null;
  return trimmed;
}

function pushText(out: MdInline[], value: string): void {
  if (!value) return;
  const last = out.at(-1);
  if (last && last.type === "text") last.value += value;
  else out.push({ type: "text", value });
}

export function parseInline(text: string): MdInline[] {
  const out: MdInline[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index]!;

    // 인라인 코드가 가장 강하다. 그 안의 * 나 [ 는 전부 리터럴이다.
    if (char === "`") {
      let ticks = 0;
      while (text[index + ticks] === "`") ticks++;
      const marker = "`".repeat(ticks);
      const end = text.indexOf(marker, index + ticks);
      if (end !== -1) {
        out.push({ type: "code", value: text.slice(index + ticks, end).trim() });
        index = end + ticks;
        continue;
      }
      pushText(out, marker);
      index += ticks;
      continue;
    }

    if (char === "!" && text[index + 1] === "[") {
      const parsed = parseLinkLike(text, index + 1);
      if (parsed) {
        const src = safeHref(parsed.href);
        // 통과하지 못한 이미지는 alt 텍스트만 남긴다.
        if (src) out.push({ type: "image", src, alt: parsed.label });
        else pushText(out, parsed.label);
        index = parsed.next;
        continue;
      }
    }

    if (char === "[") {
      const parsed = parseLinkLike(text, index);
      if (parsed) {
        const href = safeHref(parsed.href);
        if (href) out.push({ type: "link", href, children: parseInline(parsed.label) });
        else pushText(out, text.slice(index, parsed.next));
        index = parsed.next;
        continue;
      }
    }

    if (char === "<") {
      // 자동 링크만 인정한다. 그 밖의 태그는 원문 텍스트로 남는다.
      const end = text.indexOf(">", index);
      const inner = end === -1 ? "" : text.slice(index + 1, end);
      if (end !== -1 && /^(https?:\/\/|mailto:)\S+$/i.test(inner)) {
        out.push({ type: "link", href: inner, children: [{ type: "text", value: inner }] });
        index = end + 1;
        continue;
      }
    }

    const emphasis = tryEmphasis(text, index);
    if (emphasis) {
      out.push(emphasis.node);
      index = emphasis.next;
      continue;
    }

    // 줄 끝의 스페이스 2개는 줄바꿈.
    if (char === "\n") {
      const previous = out.at(-1);
      if (previous && previous.type === "text" && /  $/.test(previous.value)) {
        previous.value = previous.value.replace(/ +$/, "");
        out.push({ type: "break" });
      } else {
        pushText(out, "\n");
      }
      index++;
      continue;
    }

    pushText(out, char);
    index++;
  }

  return out;
}

/** `[label](href)` 를 읽는다. 대괄호 중첩과 괄호 중첩을 센다. */
function parseLinkLike(
  text: string,
  start: number,
): { label: string; href: string; next: number } | null {
  let depth = 0;
  let close = -1;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (char === "\\") {
      i++;
      continue;
    }
    if (char === "[") depth++;
    else if (char === "]") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1 || text[close + 1] !== "(") return null;

  let parens = 0;
  let end = -1;
  for (let i = close + 1; i < text.length; i++) {
    const char = text[i];
    if (char === "(") parens++;
    else if (char === ")") {
      parens--;
      if (parens === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;

  const target = text.slice(close + 2, end).trim();
  // 링크 뒤 제목(`[a](b "제목")`)은 버린다.
  const href = target.split(/\s+/)[0] ?? "";
  return { label: text.slice(start + 1, close), href, next: end + 1 };
}

const EMPHASIS: Array<{ marker: string; type: "strong" | "em" | "del" }> = [
  { marker: "**", type: "strong" },
  { marker: "__", type: "strong" },
  { marker: "~~", type: "del" },
  { marker: "*", type: "em" },
  { marker: "_", type: "em" },
];

/** 짝이 맞지 않는 표식은 리터럴로 남긴다(null 을 돌려주면 호출자가 문자로 밀어 넣는다). */
function tryEmphasis(text: string, index: number): { node: MdInline; next: number } | null {
  for (const { marker, type } of EMPHASIS) {
    if (!text.startsWith(marker, index)) continue;
    const from = index + marker.length;
    if (text[from] === " " || from >= text.length) continue;
    const end = text.indexOf(marker, from);
    if (end === -1 || end === from) continue;
    return { node: { type, children: parseInline(text.slice(from, end)) }, next: end + marker.length };
  }
  return null;
}
