import { useCallback, useEffect, useRef, useState } from "react";
import type { FsFile } from "../../domain/types";
import { ApiError, api } from "../lib/api";

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; error: unknown }
  | { kind: "conflict"; currentVersion: string | null };

export interface EditorFile {
  /** 마지막으로 서버에서 읽은(또는 저장한) 상태. */
  file: FsFile | null;
  /** 편집 중인 본문. 읽기 전용 파일에서도 원문·미리보기의 원본으로 쓴다. */
  draft: string;
  dirty: boolean;
  loading: boolean;
  loadError: unknown;
  status: SaveStatus;
  /** localStorage 에 남아 있고 디스크와 다른 초안. 없으면 null. */
  restorable: string | null;
  setDraft: (value: string) => void;
  save: () => Promise<void>;
  /** 디스크 내용으로 되돌린다. draft 를 버린다. */
  reload: () => Promise<void>;
  /** 충돌 해소: 최신 version 을 다시 받아 그 baseVersion 으로 draft 를 저장한다. */
  overwrite: () => Promise<void>;
  restoreDraft: () => void;
  discardDraft: () => void;
  dismissStatus: () => void;
}

const DRAFT_PREFIX = "ct:draft:";

function draftKey(root: string, path: string): string {
  return `${DRAFT_PREFIX}${root}:${path}`;
}

/** 사생활 보호 모드 등에서 storage 접근이 통째로 막힐 수 있다. 앱을 죽이지 않는다. */
function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 용량 초과·접근 거부. 초안 보존은 부가 기능이므로 조용히 포기한다.
  }
}

function removeStored(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // 위와 같다.
  }
}

/**
 * 파일 하나의 로드·편집·저장을 한 곳에서 관리한다.
 *
 * 자동 저장하지 않는다. 낙관적 잠금 아래에서 자동 저장은 사용자가 인지하지 못하는 409 를
 * 만들고, 에이전트가 같은 파일을 쓰는 환경에서 위험하다. 대신 초안을 localStorage 에
 * 남겨 새로고침·파일 전환에도 편집 내용을 잃지 않게 한다.
 */
export function useEditorFile(root: string | null, path: string | null): EditorFile {
  const [file, setFile] = useState<FsFile | null>(null);
  const [draft, setDraftState] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [restorable, setRestorable] = useState<string | null>(null);

  // 저장·충돌 해소가 await 뒤에 읽어야 하는 최신값들. 상태 클로저에 기대지 않는다.
  const fileRef = useRef<FsFile | null>(null);
  fileRef.current = file;
  const draftRef = useRef("");
  draftRef.current = draft;
  const savingRef = useRef(false);

  const key = root && path ? draftKey(root, path) : null;

  /**
   * 지금 열려 있는 파일. 저장·재읽기는 await 뒤에 이 값과 자신의 대상을 비교해,
   * 그 사이 다른 파일로 옮겨 갔으면 결과를 버린다. 늦게 온 응답이 새 파일의 상태를
   * 덮어쓰지 않게 하기 위해서다.
   */
  const openRef = useRef<string | null>(null);
  openRef.current = key;

  // 디바운스된 초안 쓰기. 타이머가 아직 안 터졌어도 파일 전환·언마운트·저장 시점에 flush 한다.
  const pendingRef = useRef<{ key: string; text: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushDraft = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    writeStored(pending.key, pending.text);
  }, []);

  const cancelDraft = useCallback((storageKey: string) => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
    removeStored(storageKey);
  }, []);

  const setDraft = useCallback(
    (value: string) => {
      setDraftState(value);
      if (!key) return;
      if (fileRef.current !== null && value === fileRef.current.content) {
        cancelDraft(key);
        return;
      }
      pendingRef.current = { key, text: value };
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flushDraft, 500);
    },
    [key, cancelDraft, flushDraft],
  );

  // 로드. root/path 가 바뀌면 이전 요청의 늦은 응답은 버린다.
  useEffect(() => {
    if (!root || !path) {
      setFile(null);
      setDraftState("");
      setLoadError(null);
      setLoading(false);
      setRestorable(null);
      setStatus({ kind: "idle" });
      return;
    }

    let cancelled = false;
    const storageKey = draftKey(root, path);

    setLoading(true);
    setLoadError(null);
    setStatus({ kind: "idle" });

    api
      .fsFile(root, path)
      .then((loaded) => {
        if (cancelled) return;
        const content = loaded.content ?? "";
        setFile(loaded);
        setDraftState(content);
        setLoading(false);
        const stored = readStored(storageKey);
        if (stored === null || stored === content) {
          if (stored !== null) removeStored(storageKey);
          setRestorable(null);
        } else {
          setRestorable(stored);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFile(null);
        setDraftState("");
        setRestorable(null);
        setLoadError(error);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      // 다른 파일로 넘어가기 전에 남은 초안을 확정한다. 디바운스 중이던 편집을 잃지 않는다.
      flushDraft();
    };
  }, [root, path, flushDraft]);

  // 언마운트 시에도 남은 초안을 확정한다.
  useEffect(() => () => flushDraft(), [flushDraft]);

  const dirty = file !== null && draft !== (file.content ?? "");

  // 탭을 닫으려 하면 브라우저가 경고한다. 초안이 남아 있어도 사용자는 그 사실을 모른다.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      flushDraft();
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, flushDraft]);

  /** 저장 성공 뒤 file 을 갱신한다. content 를 함께 맞추지 않으면 dirty 가 true 로 남는다. */
  const applySaved = useCallback(
    (base: FsFile, snapshot: string, result: { size: number; modifiedAt: number; version: string }) => {
      setFile({
        ...base,
        content: snapshot,
        size: result.size,
        modifiedAt: result.modifiedAt,
        version: result.version,
      });
      setStatus({ kind: "saved", at: Date.now() });
    },
    [],
  );

  const save = useCallback(async () => {
    const current = fileRef.current;
    if (!root || !path || !current || !current.editable || savingRef.current) return;

    // 저장 중에도 타이핑은 계속된다. 이 시점의 본문을 스냅샷으로 잡아 그것만 저장·반영한다.
    const snapshot = draftRef.current;
    const target = draftKey(root, path);
    savingRef.current = true;
    setStatus({ kind: "saving" });
    try {
      const result = await api.fsSave({
        root,
        path,
        content: snapshot,
        baseVersion: current.version,
      });
      if (openRef.current !== target) {
        // 저장은 끝났지만 화면은 다른 파일로 옮겨 갔다. 초안만 지우고 상태는 건드리지 않는다.
        removeStored(target);
        return;
      }
      cancelDraft(target);
      applySaved(current, snapshot, result);
      setRestorable(null);
    } catch (error) {
      if (openRef.current !== target) return;
      if (error instanceof ApiError && error.status === 409) {
        const version = error.detail.currentVersion;
        setStatus({ kind: "conflict", currentVersion: typeof version === "string" ? version : null });
      } else {
        setStatus({ kind: "error", error });
      }
      // 어느 경우에도 draft 는 건드리지 않는다.
      flushDraft();
    } finally {
      savingRef.current = false;
    }
  }, [root, path, applySaved, cancelDraft, flushDraft]);

  const reload = useCallback(async () => {
    if (!root || !path) return;
    const target = draftKey(root, path);
    setLoading(true);
    try {
      const loaded = await api.fsFile(root, path);
      if (openRef.current !== target) return;
      setFile(loaded);
      setDraftState(loaded.content ?? "");
      setLoadError(null);
      setStatus({ kind: "idle" });
      cancelDraft(target);
      setRestorable(null);
    } catch (error) {
      if (openRef.current === target) setLoadError(error);
    } finally {
      if (openRef.current === target) setLoading(false);
    }
  }, [root, path, cancelDraft]);

  const overwrite = useCallback(async () => {
    if (!root || !path || savingRef.current) return;
    const snapshot = draftRef.current;
    const target = draftKey(root, path);
    savingRef.current = true;
    setStatus({ kind: "saving" });
    try {
      // 서버에 강제 플래그를 두지 않는다. 최신 version 을 받아 그것으로 다시 저장한다.
      const fresh = await api.fsFile(root, path);
      const result = await api.fsSave({
        root,
        path,
        content: snapshot,
        baseVersion: fresh.version,
      });
      if (openRef.current !== target) {
        removeStored(target);
        return;
      }
      cancelDraft(target);
      applySaved(fresh, snapshot, result);
      setRestorable(null);
    } catch (error) {
      if (openRef.current === target) setStatus({ kind: "error", error });
    } finally {
      savingRef.current = false;
    }
  }, [root, path, applySaved, cancelDraft]);

  const restoreDraft = useCallback(() => {
    if (restorable === null) return;
    setDraft(restorable);
    setRestorable(null);
  }, [restorable, setDraft]);

  const discardDraft = useCallback(() => {
    if (key) cancelDraft(key);
    setRestorable(null);
  }, [key, cancelDraft]);

  const dismissStatus = useCallback(() => setStatus({ kind: "idle" }), []);

  return {
    file,
    draft,
    dirty,
    loading,
    loadError,
    status,
    restorable,
    setDraft,
    save,
    reload,
    overwrite,
    restoreDraft,
    discardDraft,
    dismissStatus,
  };
}
