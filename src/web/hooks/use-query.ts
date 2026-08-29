import { useCallback, useEffect, useRef, useState } from "react";

export interface QueryState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  /** 캐시된 data 를 유지한 채 다시 불러온다. */
  reload: () => void;
}

interface Snapshot<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
}

/**
 * deps 가 바뀌면 다시 실행한다. 이전 요청의 늦은 응답은 버린다.
 *
 * fetcher 는 ref 로만 읽으므로 렌더마다 새 함수를 넣어도 재실행되지 않는다.
 * 재실행 조건은 호출자가 준 deps 와 reload() 뿐이다.
 */
export function useQuery<T>(fetcher: () => Promise<T>, deps: unknown[]): QueryState<T> {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [state, setState] = useState<Snapshot<T>>({ data: null, error: null, loading: true });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // data 는 지우지 않는다 - 깜빡임 없이 갱신하기 위해서다.
    setState((previous) => ({ ...previous, loading: true, error: null }));

    fetcherRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState((previous) => ({ data: previous.data, error, loading: false }));
      });

    return () => {
      cancelled = true;
    };
    // eslint 규칙 대신 규약으로 관리한다: 재실행 조건은 deps 와 reloadToken 뿐이다.
  }, [...deps, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { data: state.data, error: state.error, loading: state.loading, reload };
}
