import { Fragment, useMemo, type ReactNode } from "react";
import { parseMarkdown, type MdBlock, type MdInline } from "../lib/markdown";
import { navigate } from "../lib/router";

/**
 * AST 를 React 엘리먼트로 직접 만든다. `dangerouslySetInnerHTML` 을 쓰지 않는다 -
 * 이 규칙을 어기면 자체 파서를 만든 이유가 사라진다.
 */
export function MarkdownPreview({
  text,
  root,
  basePath,
}: {
  text: string;
  root: string;
  /** 상대 링크 해석 기준. 파일이 든 디렉터리. */
  basePath: string;
}) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <div className="md">{blocks.map((block, index) => renderBlock(block, index, root, basePath))}</div>;
}

function renderBlock(block: MdBlock, key: number, root: string, basePath: string): ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as "h1";
      return <Tag key={key}>{renderInlines(block.children, root, basePath)}</Tag>;
    }
    case "paragraph":
      return <p key={key}>{renderInlines(block.children, root, basePath)}</p>;
    case "code":
      return (
        <pre key={key} className="md__code">
          <code className={block.lang ? `lang-${block.lang}` : undefined}>{block.text}</code>
        </pre>
      );
    case "quote":
      return (
        <blockquote key={key}>
          {block.blocks.map((child, index) => renderBlock(child, index, root, basePath))}
        </blockquote>
      );
    case "hr":
      return <hr key={key} />;
    case "list": {
      const items = block.items.map((item, index) => (
        <li key={index} className={item.checked === null ? undefined : "md__task"}>
          {item.checked === null ? null : (
            <input type="checkbox" checked={item.checked} disabled readOnly />
          )}
          {item.blocks.map((child, childIndex) => renderBlock(child, childIndex, root, basePath))}
        </li>
      ));
      return block.ordered ? (
        <ol key={key} start={block.start}>
          {items}
        </ol>
      ) : (
        <ul key={key}>{items}</ul>
      );
    }
    case "table":
      return (
        // 넓은 표가 페이지 전체를 가로 스크롤시키지 않게 자기 안에서 스크롤한다.
        <div key={key} className="md__table-wrap">
          <table className="md__table">
            <thead>
              <tr>
                {block.header.map((cell, index) => (
                  <th key={index} style={{ textAlign: block.align[index] ?? undefined }}>
                    {renderInlines(cell, root, basePath)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    <td key={index} style={{ textAlign: block.align[index] ?? undefined }}>
                      {renderInlines(cell, root, basePath)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function renderInlines(nodes: MdInline[], root: string, basePath: string): ReactNode {
  return nodes.map((node, index) => (
    <Fragment key={index}>{renderInline(node, root, basePath)}</Fragment>
  ));
}

/** "docs/a" + "../b.md" -> "b.md". 루트 밖으로 나가면 null. */
function resolveRelative(basePath: string, href: string): string | null {
  const segments = basePath ? basePath.split("/") : [];
  for (const part of href.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(part);
  }
  return segments.join("/");
}

function renderInline(node: MdInline, root: string, basePath: string): ReactNode {
  switch (node.type) {
    case "text":
      return node.value;
    case "strong":
      return <strong>{renderInlines(node.children, root, basePath)}</strong>;
    case "em":
      return <em>{renderInlines(node.children, root, basePath)}</em>;
    case "del":
      return <del>{renderInlines(node.children, root, basePath)}</del>;
    case "code":
      return <code>{node.value}</code>;
    case "break":
      return <br />;
    case "image":
      return <img src={node.src} alt={node.alt} className="md__image" />;
    case "link": {
      const children = renderInlines(node.children, root, basePath);
      const external = /^https?:/i.test(node.href);
      if (external) {
        return (
          <a href={node.href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      }
      if (node.href.startsWith("#") || node.href.startsWith("mailto:")) {
        return <a href={node.href}>{children}</a>;
      }

      // 같은 워크스페이스의 다른 마크다운 문서는 앱 안에서 연다.
      const target = resolveRelative(basePath, node.href);
      if (target === null || !/\.(md|markdown)$/i.test(target)) {
        return <span className="md__link--inert">{children}</span>;
      }
      const query = new URLSearchParams({ root, path: target });
      const to = `/files?${query.toString()}`;
      return (
        <a
          href={to}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault();
            navigate(to);
          }}
        >
          {children}
        </a>
      );
    }
  }
}
