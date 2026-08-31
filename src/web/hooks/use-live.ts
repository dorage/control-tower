import { useEffect, useRef, useSyncExternalStore } from "react";
import type { ChangeEvent } from "../../domain/types";

export type ConnectionState = "connecting" | "open" | "closed";

/**
 * One EventSource for the whole app.
 *
 * Per-screen connections would stack up subscribers on the server, and each subscriber
 * keeps the watch poller running - so five open screens would mean five pollers over the
 * same directory. Module scope, reference counted.
 */
let source: EventSource | null = null;
let state: ConnectionState = "closed";
/** null = 연결이 끊겼다 돌아왔다. 무엇이 바뀌었는지 알 수 없으니 각자 갱신하라는 뜻. */
type ChangeListener = (event: ChangeEvent | null) => void;
const changeListeners = new Set<ChangeListener>();
const stateListeners = new Set<() => void>();

function setState(next: ConnectionState): void {
  if (state === next) return;
  state = next;
  for (const listener of stateListeners) listener();
}

function ensureConnected(): void {
  if (source || typeof EventSource === "undefined") return;
  setState("connecting");
  const opened = new EventSource("/api/events");
  source = opened;

  opened.addEventListener("ready", () => setState("open"));
  opened.addEventListener("change", (event) => {
    let parsed: ChangeEvent;
    try {
      parsed = JSON.parse((event as MessageEvent<string>).data) as ChangeEvent;
    } catch {
      return; // truncated frame; the next one will be whole
    }
    for (const listener of changeListeners) listener(parsed);
  });
  // EventSource reconnects on its own. Do not build a retry loop on top of it.
  opened.onerror = () => {
    if (source === opened) setState("connecting");
  };
}

function disconnect(): void {
  source?.close();
  source = null;
  setState("closed");
}

function refresh(): void {
  disconnect();
  if (changeListeners.size > 0) ensureConnected();
}

/** Nothing to watch while the tab is hidden - do not hold a server-side poller open. */
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (source) disconnect();
      return;
    }
    if (changeListeners.size > 0) {
      ensureConnected();
      // While hidden we received nothing, so the screen is stale by an unknown amount.
      // Say exactly that (null) rather than inventing an event with empty deltas - a
      // screen filtering on `changedSessions` would read those as "nothing to do".
      for (const listener of changeListeners) listener(null);
    }
  });
}

function subscribeState(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

/** Header indicator. */
export function useLiveState(): ConnectionState {
  return useSyncExternalStore(
    subscribeState,
    () => state,
    () => "closed" as const,
  );
}

/** Manual retry from the indicator. */
export function reconnectLive(): void {
  refresh();
}

/**
 * Calls `handler` on every change event while mounted.
 *
 * `handler` is deliberately not a dependency: a screen that passes an inline arrow
 * function would otherwise resubscribe on every render, and each resubscribe would
 * churn the shared connection.
 */
export function useLiveChange(handler: ChangeListener, enabled = true): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const listener: ChangeListener = (event) => handlerRef.current(event);
    changeListeners.add(listener);
    ensureConnected();
    return () => {
      changeListeners.delete(listener);
      if (changeListeners.size === 0) disconnect();
    };
  }, [enabled]);
}

/** Test/debug seam. */
export function liveSubscriberCount(): number {
  return changeListeners.size;
}
