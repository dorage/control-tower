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

/** 뿌리 자신은 제외한다 — 뿌리보다 위쪽은 이 트리가 보여주는 범위가 아니다. */
function isBelow(basePath: string, path: string): boolean {
  if (basePath === "") return path !== "";
  return path.startsWith(`${basePath}/`);
}

export function FileTree({
  root,
  basePath = "",
  selectedPath,
  hidden,
  refreshToken,
  onSelect,
}: {
  root: string;
  /**
   * 트리의 뿌리. 루트 기준 상대경로이며 기본값 `""` 은 루트 자신이다.
   * 워크스페이스 화면이 체크아웃 디렉터리 하나만 보여주려고 쓴다.
   */
  basePath?: string;
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

  /**
   * 트리가 보여주는 범위. 이것이 바뀌면 펼침 집합을 버린다 — 다른 체크아웃의 펼침을
   * 끌고 가면 있지도 않은 경로를 읽으러 간다.
   */
  const scope = `${root}\u0000${basePath}`;

  // 뿌리가 바뀌거나 숨김 토글/새로고침이 일어나면 캐시를 버리고 다시 읽는다.
  useEffect(() => {
    setCache(new Map());
    // 뿌리보다 위쪽 디렉터리는 읽지 않는다.
    const paths = [basePath, ...[...expanded].filter((path) => isBelow(basePath, path))];
    for (const path of paths) void load(path);
    // expanded 를 deps 에 넣으면 펼칠 때마다 전체를 다시 읽는다. 의도적으로 제외한다.
  }, [root, basePath, hidden, refreshToken, load]);

  // 범위가 바뀌면 펼침을 비운다. 바로 아래 효과가 새 selectedPath 의 조상을 다시 펼친다.
  useEffect(() => {
    setExpanded((previous) => (previous.size === 0 ? previous : new Set()));
  }, [scope]);

  // URL 에 path 가 있으면 그 조상들을 펼친 상태로 시작한다.
  useEffect(() => {
    if (!selectedPath) return;
    const ancestors = ancestorsOf(selectedPath).filter((path) => isBelow(basePath, path));
    if (ancestors.length === 0) return;
    setExpanded((previous) => {
      const next = new Set(previous);
      let added = false;
      for (const ancestor of ancestors) if (!next.has(ancestor)) (next.add(ancestor), (added = true));
      return added ? next : previous;
    });
  }, [selectedPath, scope, basePath]);

  // 펼쳐졌는데 아직 읽지 않은 디렉터리를 채운다. 접었다 펼치면 캐시를 쓴다.
  useEffect(() => {
    for (const path of expanded) {
      if (!isBelow(basePath, path)) continue;
      if (!cacheRef.current.has(keyOf(root, path))) void load(path);
    }
  }, [expanded, root, basePath, load]);

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
    walk(basePath, 0);
    return rows;
  }, [cache, expanded, root, basePath]);

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
      // 뿌리 자신은 행이 아니므로 포커스를 옮길 곳이 없다.
      if (parent && parent !== basePath) setFocused(parent);
    },
    [visible, focused, selectedPath, expanded, toggle, basePath],
  );

  const rootNode = cache.get(keyOf(root, basePath));

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
