import { useMemo } from "react";
import { highlight, type Token } from "../lib/highlight";

/**
 * 토큰을 span 으로 그린다. `plain` 토큰은 span 없이 문자열로 내보낸다 -
 * 본문의 절반 이상이 plain 이라 이것만으로 DOM 노드가 크게 줄어든다.
 *
 * `dangerouslySetInnerHTML` 을 쓰지 않는다. 하이라이터가 HTML 문자열이 아니라 토큰 배열을
 * 돌려주는 이유가 그것이다(마크다운 파서와 같은 규칙, CONVENTIONS 10).
 */
function renderToken(token: Token, key: number) {
  if (token.kind === "plain") return token.value;
  return (
    <span key={key} className={`tok tok--${token.kind}`}>
      {token.value}
    </span>
  );
}

export function CodeBlock({ text, language }: { text: string; language?: string | null }) {
  const tokens = useMemo(() => highlight(text, language), [text, language]);
  return (
    <code className="code" data-language={language ?? undefined}>
      {tokens.map(renderToken)}
    </code>
  );
}
