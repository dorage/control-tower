import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FsEntry } from "../../domain/types";
import { api } from "../lib/api";

interface Node {
  items: FsEntry[];
  error: unknown;
  loading: boolean;
}

/** key: `${rootId} ${path}` */
type Cache = Map<string, Node>;

function keyOf(root: string, path: string): string {
  return `${root} ${path}`;
}

/** "a/b/c.md" -> ["a", "a/b"] — 초기 경로 복원 시 펼쳐야 할 조상들. */
function ancestorsOf(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  segments.pop();
  const out: string[] = [];
  for (const segment of segments) out.push(out.length ? `${out.at(-1)}/${segment}` : segment);
  return out;
}

export function FileTree({
  root,
  selectedPath,
  hidden,
  refreshToken,
  onSelect,
}: {
  root: string;
  selectedPath: string | null;
  hidden: boolean;
  /** 값이 바뀌면 캐시를 비우고 펼친 노드를 다시 읽는다. */
  refreshToken: number;
  onSelect: (entry: FsEntry) => void;
}) {
  const [cache, setCache] = useState<Cache>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const cacheRef = useRef(cache);
  cacheRef.current = cache;

  const load = useCallback(
    async (path: string) => {
      const key = keyOf(root, path);
      setCache((previous) => {
        const next = new Map(previous);
        next.set(key, { items: previous.get(key)?.items ?? [], error: null, loading: true });
        return next;
      });
      try {
        const listing = await api.fsList(root, path, { hidden });
        setCache((previous) => new Map(previous).set(key, { items: listing.items, error: null, loading: false }));
      } catch (error) {
        // 권한 없는 디렉터리 하나가 트리 전체를 죽이지 않게 한다.
        setCache((previous) => new Map(previous).set(key, { items: [], error, loading: false }));
      }
    },
    [root, hidden],
  );

  // 루트가 바뀌거나 숨김 토글/새로고침이 일어나면 캐시를 버리고 다시 읽는다.
  useEffect(() => {
    setCache(new Map());
    const paths = ["", ...expanded];
    for (const path of paths) void load(path);
    // expanded 를 deps 에 넣으면 펼칠 때마다 전체를 다시 읽는다. 의도적으로 제외한다.
  }, [root, hidden, refreshToken, load]);

  // URL 에 path 가 있으면 그 조상들을 펼친 상태로 시작한다.
  useEffect(() => {
    if (!selectedPath) return;
    const ancestors = ancestorsOf(selectedPath);
    if (ancestors.length === 0) return;
    setExpanded((previous) => {
      const next = new Set(previous);
      let added = false;
      for (const ancestor of ancestors) if (!next.has(ancestor)) (next.add(ancestor), (added = true));
      return added ? next : previous;
    });
  }, [selectedPath]);

  // 펼쳐졌는데 아직 읽지 않은 디렉터리를 채운다. 접었다 펼치면 캐시를 쓴다.
  useEffect(() => {
    for (const path of expanded) {
      if (!cacheRef.current.has(keyOf(root, path))) void load(path);
    }
  }, [expanded, root, load]);

  const toggle = useCallback((path: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  /** 키보드 이동을 위해 현재 보이는 행을 평탄한 배열로 만든다. */
  const visible = useMemo(() => {
    const rows: Array<{ entry: FsEntry; depth: number }> = [];
    const walk = (path: string, depth: number) => {
      const node = cache.get(keyOf(root, path));
      if (!node) return;
      for (const entry of node.items) {
        rows.push({ entry, depth });
        if (entry.type === "dir" && expanded.has(entry.path)) walk(entry.path, depth + 1);
      }
    };
    walk("", 0);
    return rows;
  }, [cache, expanded, root]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const keys = ["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"];
      if (!keys.includes(event.key)) return;
      const index = visible.findIndex((row) => row.entry.path === (focused ?? selectedPath));
      const current = visible[index];
      event.preventDefault();

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next = visible[Math.min(visible.length - 1, Math.max(0, index + step))];
        if (next) setFocused(next.entry.path);
        return;
      }
      if (!current) return;
      if (event.key === "ArrowRight") {
        if (current.entry.type === "dir" && !expanded.has(current.entry.path)) toggle(current.entry.path);
        return;
      }
      if (current.entry.type === "dir" && expanded.has(current.entry.path)) {
        toggle(current.entry.path);
        return;
      }
      const parent = current.entry.path.split("/").slice(0, -1).join("/");
      if (parent) setFocused(parent);
    },
    [visible, focused, selectedPath, expanded, toggle],
  );

  const rootNode = cache.get(keyOf(root, ""));

  return (
    <div className="tree" role="tree" aria-label="파일 트리" tabIndex={0} onKeyDown={onKeyDown}>
      {rootNode?.loading && rootNode.items.length === 0 ? <div className="tree__hint">불러오는 중…</div> : null}
      {rootNode?.error ? <div className="tree__error">{String(rootNode.error)}</div> : null}
      {rootNode?.items.map((entry) => (
        <TreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          root={root}
          cache={cache}
          expanded={expanded}
          selectedPath={selectedPath}
          focused={focused}
          onToggle={toggle}
          onSelect={onSelect}
          onFocus={setFocused}
        />
      ))}
    </div>
  );
}

function TreeNode({
  entry,
  depth,
  root,
  cache,
  expanded,
  selectedPath,
  focused,
  onToggle,
  onSelect,
  onFocus,
}: {
  entry: FsEntry;
  depth: number;
  root: string;
  cache: Cache;
  expanded: Set<string>;
  selectedPath: string | null;
  focused: string | null;
  onToggle: (path: string) => void;
  onSelect: (entry: FsEntry) => void;
  onFocus: (path: string) => void;
}) {
  const isDir = entry.type === "dir";
  const isOpen = isDir && expanded.has(entry.path);
  const node = isOpen ? cache.get(keyOf(root, entry.path)) : undefined;
  const selected = entry.path === selectedPath;

  const classes = [
    "tree__row",
    selected ? "tree__row--active" : "",
    entry.path === focused ? "tree__row--focus" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <button
        type="button"
        role="treeitem"
        aria-expanded={isDir ? isOpen : undefined}
        aria-selected={selected}
        className={classes}
        style={{ paddingLeft: depth * 14 + 8 }}
        onClick={() => {
          onFocus(entry.path);
          if (isDir) onToggle(entry.path);
          else onSelect(entry);
        }}
      >
        <span className="tree__twisty" aria-hidden="true">
          {isDir ? (isOpen ? "▾" : "▸") : ""}
        </span>
        <span className="tree__icon" aria-hidden="true">
          {isDir ? "📁" : "📄"}
        </span>
        <span className="tree__name">{entry.name}</span>
        {entry.editable ? <span className="tree__dot" title="편집 가능" /> : null}
      </button>

      {isOpen && node?.loading && node.items.length === 0 ? (
        <div className="tree__hint" style={{ paddingLeft: (depth + 1) * 14 + 8 }}>
          불러오는 중…
        </div>
      ) : null}

      {isOpen && node?.error ? (
        <div className="tree__error" style={{ paddingLeft: (depth + 1) * 14 + 8 }}>
          {node.error instanceof Error ? node.error.message : String(node.error)}
        </div>
      ) : null}

      {isOpen
        ? node?.items.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              root={root}
              cache={cache}
              expanded={expanded}
              selectedPath={selectedPath}
              focused={focused}
              onToggle={onToggle}
              onSelect={onSelect}
              onFocus={onFocus}
            />
          ))
        : null}
    </>
  );
}
