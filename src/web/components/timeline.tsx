import { memo, useState, type ReactNode } from "react";
import type { TimelineBlock, TimelineEntry } from "../../domain/types";
import { compactNumber, dateTime } from "../lib/format";
import { Badge } from "./ui";
import { MarkdownPreview } from "./markdown-preview";

/**
 * 접기 블록. 펼치기 전에는 내용을 **만들지도 않는다** - 200개 엔트리에 붙은 툴 입출력을
 * 모두 렌더하면 DOM 노드가 수천 개가 된다. children 을 함수로 받는 이유다.
 */
function Collapsible({
  summary,
  defaultOpen = false,
  className,
  children,
}: {
  summary: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: () => ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className={["block", className ?? ""].filter(Boolean).join(" ")}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="block__summary">{summary}</summary>
      {open ? <div className="block__body">{children()}</div> : null}
    </details>
  );
}

function Truncated({ shown }: { shown: boolean }) {
  if (!shown) return null;
  return <p className="block__truncated">서버에서 잘림 (MAX_BLOCK_CHARS)</p>;
}

/** 접힌 상태에서도 무슨 툴이었는지 보이도록 뽑는 필드. 없는 툴은 이름만 보여준다. */
const TOOL_SUMMARY_FIELDS: Record<string, string[]> = {
  Read: ["file_path"],
  Write: ["file_path"],
  Edit: ["file_path"],
  NotebookEdit: ["notebook_path"],
  Bash: ["command"],
  Grep: ["pattern"],
  Glob: ["pattern"],
  Task: ["description"],
  Agent: ["description"],
  WebFetch: ["url"],
  WebSearch: ["query"],
  Skill: ["skill"],
};

function firstLine(value: string): string {
  const line = value.split("\n", 1)[0] ?? "";
  return line.length > 140 ? `${line.slice(0, 140)}…` : line;
}

/**
 * 서버가 MAX_BLOCK_CHARS 에서 잘랐으면 input 은 깨진 JSON 이다.
 * 파싱 실패는 정상 경로로 취급하고 요약 없이 넘어간다.
 */
export function toolSummary(name: string, input: string): string | null {
  const fields = TOOL_SUMMARY_FIELDS[name];
  if (!fields) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const record = parsed as Record<string, unknown>;
  for (const field of fields) {
    const value = record[field];
    if (typeof value === "string" && value.trim()) return firstLine(value.trim());
  }
  return null;
}

function BlockView({ block }: { block: TimelineBlock }) {
  switch (block.type) {
    case "text":
      return (
        <div className="block block--text">
          <MarkdownPreview text={block.text} />
          <Truncated shown={block.truncated} />
        </div>
      );

    case "thinking":
      return (
        <Collapsible
          className="block--thinking"
          summary={<span>사고 과정 ({compactNumber(block.text.length)}자)</span>}
        >
          {() => (
            <>
              <pre className="block__pre">{block.text}</pre>
              <Truncated shown={block.truncated} />
            </>
          )}
        </Collapsible>
      );

    case "tool_use": {
      const summary = toolSummary(block.name, block.input);
      return (
        <Collapsible
          className="block--tool"
          summary={
            <span className="block__tool-head">
              <Badge tone="accent">{block.name}</Badge>
              {summary ? <code className="block__tool-summary">{summary}</code> : null}
            </span>
          }
        >
          {() => (
            <>
              <pre className="block__pre">{block.input}</pre>
              <Truncated shown={block.truncated} />
            </>
          )}
        </Collapsible>
      );
    }

    case "tool_result":
      return (
        <Collapsible
          className={block.isError ? "block--result block--error" : "block--result"}
          // 오류는 펼쳐 둔다. 접힌 오류는 못 보고 지나친다.
          defaultOpen={block.isError}
          summary={
            <span>
              {block.isError ? "툴 오류" : "툴 결과"} ({compactNumber(block.text.length)}자)
            </span>
          }
        >
          {() => (
            <>
              <pre className="block__pre">{block.text}</pre>
              <Truncated shown={block.truncated} />
            </>
          )}
        </Collapsible>
      );

    case "image":
      // 트랜스크립트에는 이미지 바이트가 없다. 자리만 남긴다.
      return <div className="block block--image">이미지 {block.text ? `· ${block.text}` : ""}</div>;
  }
}

const ROLE_LABEL: Record<string, string> = {
  user: "사용자",
  assistant: "어시스턴트",
  system: "시스템",
  attachment: "첨부",
  event: "이벤트",
};

/**
 * 엔트리 하나. 목록이 길어 memo 로 감싼다.
 *
 * 어떤 블록을 보낼지는 서버가 정한다(`thinking`/`tools` 쿼리). 클라이언트에서 걸러 내면
 * `total` 과 페이지 경계가 화면과 어긋나기 때문이다. 여기서는 받은 것을 그대로 그린다.
 */
export const TimelineEntryView = memo(function TimelineEntryView({ entry }: { entry: TimelineEntry }) {
  const blocks = entry.blocks;
  // 서버가 빈 엔트리를 보내지 않지만, 빈 껍데기를 그리는 것보다는 지나가는 쪽이 낫다.
  if (blocks.length === 0) return null;

  const classes = ["entry", `entry--${entry.kind}`];
  if (entry.isSidechain) classes.push("entry--sidechain");
  if (entry.isError) classes.push("entry--error");

  return (
    <article id={`entry-${entry.index}`} className={classes.join(" ")}>
      <header className="entry__head">
        <span className="entry__role">{ROLE_LABEL[entry.role ?? entry.kind] ?? entry.kind}</span>
        {entry.model ? <span className="entry__model">{entry.model}</span> : null}
        {entry.isSidechain ? <Badge tone="accent">서브에이전트</Badge> : null}
        {entry.isError ? <Badge tone="danger">오류</Badge> : null}
        <span className="entry__time" title={dateTime(entry.timestamp)}>
          {dateTime(entry.timestamp)}
        </span>
        {entry.usage ? <span className="entry__usage">{compactNumber(entry.usage.total)} 토큰</span> : null}
        {/* 원본 JSONL 줄 번호. 누르면 주소창에 앵커가 남아 그대로 공유할 수 있다. */}
        <a className="entry__index" href={`#entry-${entry.index}`} title="이 엔트리로 가는 링크">
          #{entry.index}
        </a>
      </header>

      <div className="entry__body">
        {blocks.map((block, index) => (
          <BlockView key={index} block={block} />
        ))}
      </div>
    </article>
  );
});

export function TimelineView({ entries }: { entries: TimelineEntry[] }) {
  return (
    <div className="timeline">
      {entries.map((entry) => (
        <TimelineEntryView key={entry.uuid ?? entry.index} entry={entry} />
      ))}
    </div>
  );
}
