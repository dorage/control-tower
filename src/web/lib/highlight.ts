/**
 * 코드 뷰어용 최소 토크나이저.
 *
 * 문법을 정확히 파싱하지 않는다. 목적은 "읽기 편한 색"이지 "옳은 구문 트리"가 아니므로,
 * 애매한 자리(정규식 리터럴과 나눗셈, HTML 본문 안의 `=`)는 색을 포기하고 원문을 남긴다.
 * 이 파일의 유일한 불변식은 **토큰 값을 이어 붙이면 입력과 글자 하나까지 같다**는 것이다.
 * 색이 틀리는 것은 버그지만 글자가 사라지는 것은 사고다.
 *
 * 라이브러리를 쓰지 않는 이유는 `lib/markdown.ts` 와 같다 - 필요한 범위가 한정돼 있고,
 * highlight.js 계열은 이 앱 전체보다 큰 번들을 들여온다(CONVENTIONS 2).
 */

export type TokenKind =
  /** 주석 */
  | "comment"
  /** 문자열·문자 리터럴 */
  | "string"
  /** 숫자와 true/false/null 같은 원시 리터럴 */
  | "number"
  /** 예약어 */
  | "keyword"
  /** 타입·클래스 이름, 앵커 */
  | "type"
  /** 호출되는 이름 */
  | "func"
  /** 객체 키, 속성 이름, 변수 참조, 플래그 */
  | "property"
  /** 태그 이름, CSS 선택자, TOML 테이블 */
  | "tag"
  /** 구두점·연산자 */
  | "punct"
  /** 위 어디에도 걸리지 않은 본문 */
  | "plain";

export interface Token {
  kind: TokenKind;
  value: string;
}

/**
 * 이보다 긴 본문은 색칠하지 않고 한 덩어리로 돌려준다.
 * 스캐너는 글자 수에 비례하지만 뒤이은 React 엘리먼트 생성은 토큰 수만큼의 DOM 노드가 되고,
 * 뷰어가 멈추는 것보다 색이 없는 편이 낫다. 2MB 상한(FS_MAX_READ_BYTES)의 파일도 여기 걸린다.
 */
export const HIGHLIGHT_MAX_CHARS = 120_000;

interface Rule {
  /** 반드시 sticky(`y`). 스캐너가 `lastIndex` 로 위치를 지정한다. */
  pattern: RegExp;
  kind?: TokenKind;
  /** 같은 모양의 낱말을 값으로 갈라야 할 때(예약어인지 아닌지). */
  classify?: (value: string) => TokenKind;
  /** 매치를 다시 잘게 쪼갠다(태그 안의 속성 등). */
  sub?: Grammar;
}

type Grammar = Rule[];

// ---------------------------------------------------------------- 스캐너

function pushPlain(out: Token[], value: string): void {
  if (value === "") return;
  const previous = out.at(-1);
  // 이어지는 plain 은 하나로 합친다. 토큰 하나가 DOM 노드 하나라서 수가 그대로 비용이다.
  if (previous && previous.kind === "plain") previous.value += value;
  else out.push({ kind: "plain", value });
}

function push(out: Token[], kind: TokenKind, value: string): void {
  if (value === "") return;
  if (kind === "plain") pushPlain(out, value);
  else out.push({ kind, value });
}

function scan(text: string, grammar: Grammar, out: Token[]): void {
  let index = 0;
  let plainFrom = 0;

  while (index < text.length) {
    let consumed = 0;

    for (const rule of grammar) {
      rule.pattern.lastIndex = index;
      const match = rule.pattern.exec(text);
      if (!match) continue;
      const value = match[0];
      // 빈 매치를 허용하면 제자리를 맴돈다.
      if (value === "") continue;

      pushPlain(out, text.slice(plainFrom, index));
      if (rule.sub) scan(value, rule.sub, out);
      else push(out, rule.classify ? rule.classify(value) : (rule.kind ?? "plain"), value);

      consumed = value.length;
      break;
    }

    // 어떤 규칙도 맞지 않으면 한 글자를 본문으로 흘려보낸다. 문법을 모르는 자리에서
    // 멈추지 않기 위한 장치이자, 토큰 합이 입력과 같다는 불변식의 근거다.
    index += consumed || 1;
    if (consumed) plainFrom = index;
  }

  pushPlain(out, text.slice(plainFrom));
}

// ---------------------------------------------------------------- 공용 조각

/** 낱말 규칙보다 먼저 두면 대부분의 문자를 한 번에 건너뛴다 - 글자 단위 반복을 줄인다. */
const SPACE: Rule = { pattern: /\s+/y, kind: "plain" };

/**
 * 줄머리(`^`)에 걸린 규칙을 쓰는 문법(YAML·TOML)은 개행과 들여쓰기를 **따로** 먹어야 한다.
 * `\s+` 로 한 번에 삼키면 들여쓰기 뒤는 더 이상 줄머리가 아니라서 `^` 가 영영 맞지 않는다.
 */
const NEWLINE: Rule = { pattern: /\n/y, kind: "plain" };
const INDENT: Rule = { pattern: /[ \t]+/y, kind: "plain" };

const C_LINE_COMMENT: Rule = { pattern: /\/\/.*/y, kind: "comment" };
const C_BLOCK_COMMENT: Rule = { pattern: /\/\*[\s\S]*?(?:\*\/|$)/y, kind: "comment" };
const HASH_COMMENT: Rule = { pattern: /#.*/y, kind: "comment" };

const DOUBLE_QUOTED: Rule = { pattern: /"(?:\\[\s\S]|[^"\\])*"?/y, kind: "string" };
const SINGLE_QUOTED: Rule = { pattern: /'(?:\\[\s\S]|[^'\\])*'?/y, kind: "string" };
const BACKTICKED: Rule = { pattern: /`(?:\\[\s\S]|[^`\\])*`?/y, kind: "string" };

const NUMBER: Rule = {
  pattern: /0[xXbBoO][0-9a-fA-F_]+n?|\b\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?n?/y,
  kind: "number",
};

const PUNCT: Rule = { pattern: /[{}()[\]<>.,;:?!=+\-*/%&|^~@#$\\]+/y, kind: "punct" };

/** `.foo` 처럼 구두점과 이름이 붙은 매치를 둘로 가른다. */
function afterDot(kind: TokenKind): Grammar {
  return [
    { pattern: /\./y, kind: "punct" },
    { pattern: /[A-Za-z_$][\w$]*/y, kind },
  ];
}

// ---------------------------------------------------------------- JavaScript · TypeScript

const JS_KEYWORDS = new Set([
  "abstract", "as", "asserts", "async", "await", "break", "case", "catch", "class", "const",
  "constructor", "continue", "debugger", "declare", "default", "delete", "do", "else", "enum",
  "export", "extends", "finally", "for", "from", "function", "get", "if", "implements", "import",
  "in", "infer", "instanceof", "interface", "is", "keyof", "let", "module", "namespace", "new",
  "of", "out", "override", "package", "private", "protected", "public", "readonly", "require",
  "return", "satisfies", "set", "static", "switch", "throw", "try", "type", "typeof", "var",
  "void", "while", "with", "yield",
]);

/** 값 자리에 오는 고정 낱말. 숫자와 같은 색으로 묶는다 - 읽을 때 같은 무게로 보인다. */
const JS_LITERALS = new Set(["true", "false", "null", "undefined", "NaN", "Infinity", "this", "super"]);

const JS_TYPES = new Set([
  "any", "bigint", "boolean", "never", "number", "object", "string", "symbol", "unknown", "unique",
]);

function classifyJs(value: string): TokenKind {
  if (JS_KEYWORDS.has(value)) return "keyword";
  if (JS_LITERALS.has(value)) return "number";
  if (JS_TYPES.has(value)) return "type";
  // 대문자로 시작하면 타입이나 생성자로 본다. 관례일 뿐이지만 이 관례는 거의 지켜진다.
  if (/^[A-Z]/.test(value)) return "type";
  return "plain";
}

function classifyJsCall(value: string): TokenKind {
  if (JS_KEYWORDS.has(value)) return "keyword";
  if (JS_LITERALS.has(value)) return "number";
  return "func";
}

const JS: Grammar = [
  SPACE,
  C_LINE_COMMENT,
  C_BLOCK_COMMENT,
  DOUBLE_QUOTED,
  SINGLE_QUOTED,
  BACKTICKED,
  NUMBER,
  { pattern: /\.[A-Za-z_$][\w$]*(?=\s*\()/y, sub: afterDot("func") },
  { pattern: /\.[A-Za-z_$][\w$]*/y, sub: afterDot("property") },
  { pattern: /[A-Za-z_$][\w$]*(?=\s*\()/y, classify: classifyJsCall },
  { pattern: /[A-Za-z_$][\w$]*(?=\s*:)/y, kind: "property" },
  { pattern: /[A-Za-z_$][\w$]*/y, classify: classifyJs },
  PUNCT,
];

// ---------------------------------------------------------------- JSON

const JSON_GRAMMAR: Grammar = [
  SPACE,
  // 주석은 JSON 규격에 없지만 jsonc·tsconfig 가 쓴다. 규격에 없다고 회색으로 안 칠할 이유는 없다.
  C_LINE_COMMENT,
  C_BLOCK_COMMENT,
  { pattern: /"(?:\\[\s\S]|[^"\\])*"(?=\s*:)/y, kind: "property" },
  DOUBLE_QUOTED,
  NUMBER,
  { pattern: /\b(?:true|false|null)\b/y, kind: "number" },
  PUNCT,
];

// ---------------------------------------------------------------- CSS

const CSS: Grammar = [
  SPACE,
  C_BLOCK_COMMENT,
  DOUBLE_QUOTED,
  SINGLE_QUOTED,
  { pattern: /@[\w-]+/y, kind: "keyword" },
  { pattern: /#[0-9a-fA-F]{3,8}\b/y, kind: "number" },
  { pattern: /--[\w-]+/y, kind: "property" },
  { pattern: /[-a-zA-Z][\w-]*(?=\s*:)/y, kind: "property" },
  { pattern: /[\w-]+(?=\()/y, kind: "func" },
  { pattern: /\.[A-Za-z_-][\w-]*|#[A-Za-z_-][\w-]*|::?[a-zA-Z-]+/y, kind: "tag" },
  { pattern: /\b\d*\.?\d+(?:[a-zA-Z%]+)?/y, kind: "number" },
  { pattern: /\b(?:from|to|important|and|not|only)\b/y, kind: "keyword" },
  { pattern: /[A-Za-z][\w-]*/y, kind: "plain" },
  PUNCT,
];

// ---------------------------------------------------------------- HTML · XML

/** 태그 안쪽. 바깥 본문과 규칙이 완전히 다르므로 태그 전체를 잡아 여기로 넘긴다. */
const TAG_INSIDE: Grammar = [
  SPACE,
  { pattern: /<\/?|\/?>/y, kind: "punct" },
  { pattern: /[A-Za-z_][\w:.-]*(?=[\s/>])/y, kind: "tag" },
  { pattern: /[A-Za-z_][\w:.-]*(?=\s*=)/y, kind: "property" },
  DOUBLE_QUOTED,
  SINGLE_QUOTED,
  { pattern: /=/y, kind: "punct" },
  { pattern: /[A-Za-z_][\w:.-]*/y, kind: "tag" },
];

const MARKUP: Grammar = [
  { pattern: /<!--[\s\S]*?(?:-->|$)/y, kind: "comment" },
  { pattern: /<!\[CDATA\[[\s\S]*?(?:\]\]>|$)/y, kind: "string" },
  { pattern: /<[!?][^>]*>?/y, kind: "comment" },
  // 속성값 안의 `>` 에 속지 않도록 따옴표 구간을 통째로 건너뛴다.
  { pattern: /<\/?[A-Za-z][\w:.-]*(?:"[^"]*"|'[^']*'|[^>"'])*\/?>?/y, sub: TAG_INSIDE },
  { pattern: /&[\w#]+;/y, kind: "number" },
  { pattern: /[^<&]+/y, kind: "plain" },
];

// ---------------------------------------------------------------- Shell

const SH_KEYWORDS = new Set([
  "if", "then", "elif", "else", "fi", "for", "while", "until", "do", "done", "case", "esac", "in",
  "function", "select", "time", "return", "break", "continue", "exit", "local", "export",
  "readonly", "declare", "typeset", "set", "unset", "shift", "source", "trap", "eval", "exec",
]);

const SH_VARIABLE = /\$\{[^}]*\}?|\$\(\(?|\$[A-Za-z_]\w*|\$[@#?*$!0-9-]/y;

/** 큰따옴표 안에서도 치환은 일어난다. `"$NAME"` 을 통째로 문자열로 칠하면 셸이 안 읽힌다. */
const SH_INTERPOLATED: Grammar = [
  { pattern: SH_VARIABLE, kind: "property" },
  { pattern: /(?:\\[\s\S]|[^$\\])+/y, kind: "string" },
  { pattern: /[\s\S]/y, kind: "string" },
];

const SHELL: Grammar = [
  SPACE,
  HASH_COMMENT,
  { pattern: /"(?:\\[\s\S]|[^"\\])*"?/y, sub: SH_INTERPOLATED },
  { pattern: /'[^']*'?/y, kind: "string" },
  { pattern: SH_VARIABLE, kind: "property" },
  { pattern: /(?<=^|[\s=(])--?[A-Za-z][\w-]*/my, kind: "property" },
  NUMBER,
  { pattern: /[A-Za-z_][\w-]*/y, classify: (value) => (SH_KEYWORDS.has(value) ? "keyword" : "plain") },
  PUNCT,
];

// ---------------------------------------------------------------- Python

const PY_KEYWORDS = new Set([
  "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif",
  "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda",
  "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield", "match",
  "case",
]);

const PY_LITERALS = new Set(["True", "False", "None", "self", "cls"]);

function classifyPython(value: string): TokenKind {
  if (PY_KEYWORDS.has(value)) return "keyword";
  if (PY_LITERALS.has(value)) return "number";
  if (/^[A-Z]/.test(value)) return "type";
  return "plain";
}

const PYTHON: Grammar = [
  SPACE,
  HASH_COMMENT,
  { pattern: /[rRbBfFuU]{0,2}"""[\s\S]*?(?:"""|$)/y, kind: "string" },
  { pattern: /[rRbBfFuU]{0,2}'''[\s\S]*?(?:'''|$)/y, kind: "string" },
  { pattern: /[rRbBfFuU]{0,2}"(?:\\[\s\S]|[^"\\])*"?/y, kind: "string" },
  { pattern: /[rRbBfFuU]{0,2}'(?:\\[\s\S]|[^'\\])*'?/y, kind: "string" },
  { pattern: /@[\w.]+/y, kind: "func" },
  NUMBER,
  { pattern: /\.[A-Za-z_]\w*/y, sub: afterDot("property") },
  {
    pattern: /[A-Za-z_]\w*(?=\s*\()/y,
    classify: (value) => (PY_KEYWORDS.has(value) ? "keyword" : "func"),
  },
  { pattern: /[A-Za-z_]\w*/y, classify: classifyPython },
  PUNCT,
];

// ---------------------------------------------------------------- YAML

/** 키 앞의 들여쓰기와 목록 표식은 키가 아니다. 한 매치로 잡아 여기서 갈라 준다. */
const YAML_KEY: Grammar = [
  { pattern: /[ \t]+/y, kind: "plain" },
  { pattern: /-/y, kind: "punct" },
  { pattern: /"(?:\\[\s\S]|[^"\\])*"|'[^']*'|[^\s]+/y, kind: "property" },
];

const YAML: Grammar = [
  // 개행 → 줄머리 규칙 → 들여쓰기 순서를 지킨다(NEWLINE 주석 참고).
  NEWLINE,
  { pattern: /^(?:---|\.\.\.)$/my, kind: "punct" },
  { pattern: /^[ \t]*(?:-[ \t]+)*(?:"(?:\\[\s\S]|[^"\\])*"|'[^']*'|[\w.$/-]+)(?=[ \t]*:(?:\s|$))/my, sub: YAML_KEY },
  { pattern: /^[ \t]*-(?=\s)/my, kind: "punct" },
  INDENT,
  HASH_COMMENT,
  DOUBLE_QUOTED,
  SINGLE_QUOTED,
  { pattern: /[&*][\w-]+/y, kind: "type" },
  { pattern: /\b(?:true|false|yes|no|on|off|null)\b|~/iy, kind: "number" },
  NUMBER,
  { pattern: /[|>][+-]?(?=\s*$)/my, kind: "keyword" },
  { pattern: /[A-Za-z_][\w-]*/y, kind: "plain" },
  PUNCT,
];

// ---------------------------------------------------------------- TOML

const TOML_KEY: Grammar = [
  { pattern: /[ \t]+/y, kind: "plain" },
  { pattern: /\./y, kind: "punct" },
  { pattern: /"(?:\\[\s\S]|[^"\\])*"|'[^']*'|[\w-]+/y, kind: "property" },
];

const TOML: Grammar = [
  // 순서가 YAML 과 같은 이유로 중요하다.
  NEWLINE,
  { pattern: /^[ \t]*\[\[?[^\]\n]*\]?\]?/my, kind: "tag" },
  { pattern: /^[ \t]*(?:"(?:\\[\s\S]|[^"\\])*"|'[^']*'|[\w-]+)(?:[ \t]*\.[ \t]*(?:"(?:\\[\s\S]|[^"\\])*"|'[^']*'|[\w-]+))*(?=[ \t]*=)/my, sub: TOML_KEY },
  INDENT,
  HASH_COMMENT,
  { pattern: /"""[\s\S]*?(?:"""|$)/y, kind: "string" },
  { pattern: /'''[\s\S]*?(?:'''|$)/y, kind: "string" },
  DOUBLE_QUOTED,
  SINGLE_QUOTED,
  { pattern: /\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?/y, kind: "number" },
  { pattern: /\b(?:true|false)\b/y, kind: "number" },
  NUMBER,
  { pattern: /[A-Za-z_][\w-]*/y, kind: "plain" },
  PUNCT,
];

// ---------------------------------------------------------------- 언어 표

const GRAMMARS: Record<string, Grammar> = {
  javascript: JS,
  typescript: JS,
  json: JSON_GRAMMAR,
  css: CSS,
  html: MARKUP,
  xml: MARKUP,
  shell: SHELL,
  python: PYTHON,
  yaml: YAML,
  toml: TOML,
};

/**
 * 코드 펜스의 언어 이름은 사람이 손으로 적는다. 서버의 `languageOf` 가 돌려주는 이름과
 * 마크다운 안의 ```ts 를 같은 표로 흡수한다.
 */
const ALIASES: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  node: "javascript",
  jsonc: "json",
  json5: "json",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  console: "shell",
  shellsession: "shell",
  py: "python",
  python3: "python",
  yml: "yaml",
  htm: "html",
  svg: "xml",
  scss: "css",
  less: "css",
};

export function normalizeLanguage(language: string | null | undefined): string {
  const name = (language ?? "").trim().toLowerCase();
  return ALIASES[name] ?? name;
}

/** 색칠할 문법을 아는 언어인가. 화면이 "원문 그대로" 와 구분해야 할 때 쓴다. */
export function hasGrammar(language: string | null | undefined): boolean {
  return normalizeLanguage(language) in GRAMMARS;
}

/**
 * 토큰 값을 순서대로 이어 붙이면 언제나 `text` 와 같다. 모르는 언어와 너무 긴 본문은
 * 통째로 `plain` 한 덩어리가 된다 - 호출부가 분기하지 않아도 되도록.
 */
export function highlight(text: string, language: string | null | undefined): Token[] {
  const grammar = GRAMMARS[normalizeLanguage(language)];
  if (!grammar || text.length > HIGHLIGHT_MAX_CHARS) {
    return text === "" ? [] : [{ kind: "plain", value: text }];
  }
  const out: Token[] = [];
  scan(text, grammar, out);
  return out;
}
