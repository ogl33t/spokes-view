import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError, fetchNode, fetchTree, type TreeQuery } from "./api";
import type { DetailState } from "./DetailPanel";
import type { TreeResponse } from "./types";

/** The API's deepest slice: a page shows this many levels beneath its root. */
const SUBTREE_DEPTH = 10;
const REFRESH_MS = 30_000;

export function errorOf(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError("upstream_error", 0, String(e));
}

export interface Subtree {
  includeClosed: boolean;
  toggleClosed: () => void;
  /** The latest slice beneath the root, or null before the first load. */
  data: TreeResponse | null;
  error: ApiError | null;
  refreshError: string | null;
  refreshing: boolean;
  checkedAt: Date | null;
  refresh: () => Promise<void>;
  /** The node open in the details modal. */
  detail: DetailState | null;
  openDetail: (id: number) => void;
  closeDetail: () => void;
}

/**
 * Everything beneath `rootId` on `server` in one slice, kept fresh with a cheap ETag
 * refresh every 30 seconds while the tab is visible, plus one node's details on demand.
 * Shared by the kanban board and the backlog list.
 */
export function useSubtree(server: string | null, rootId: number): Subtree {
  const [includeClosed, setIncludeClosed] = useState(false);
  const [slice, setSlice] = useState<{ etag: string | null; data: TreeResponse } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);

  const sliceRef = useRef(slice);
  const detailRef = useRef(detail);
  useLayoutEffect(() => {
    sliceRef.current = slice;
    detailRef.current = detail;
  }, [slice, detail]);
  /** Bumped when the closed toggle changes; stale responses are dropped. */
  const generation = useRef(0);

  const query = useCallback(
    (closed: boolean): TreeQuery => ({ root: rootId, depth: SUBTREE_DEPTH, includeClosed: closed }),
    [rootId],
  );

  // First load, and again when the closed toggle changes.
  useEffect(() => {
    if (!server) return;
    const gen = ++generation.current;
    const ctl = new AbortController();
    fetchTree(server, query(includeClosed), null, ctl.signal)
      .then((r) => {
        if (gen !== generation.current || !r.data) return;
        setError(null);
        setSlice({ etag: r.etag, data: r.data });
        setCheckedAt(new Date());
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (gen === generation.current) setError(errorOf(e));
      });
    return () => ctl.abort();
  }, [server, includeClosed, query]);

  const loadDetail = useCallback(
    async (id: number, etag: string | null) => {
      if (!server) return;
      try {
        const r = await fetchNode(server, id, includeClosed, etag);
        if (detailRef.current?.id !== id) return;
        if (r.data) setDetail({ id, data: r.data, etag: r.etag, error: null, loading: false });
      } catch (e) {
        if (detailRef.current?.id !== id) return;
        const err = errorOf(e);
        setDetail((d) =>
          d && d.id === id
            ? {
                ...d,
                loading: false,
                error:
                  err.code === "not_found" ? "This node is no longer in the tree." : err.message,
              }
            : d,
        );
      }
    },
    [server, includeClosed],
  );

  const openDetail = useCallback(
    (id: number) => {
      setDetail({ id, data: null, etag: null, error: null, loading: true });
      void loadDetail(id, null);
    },
    [loadDetail],
  );
  const closeDetail = useCallback(() => setDetail(null), []);
  const toggleClosed = useCallback(() => setIncludeClosed((c) => !c), []);

  // Refresh with the slice's tag: an unchanged slice costs a 304.
  const refresh = useCallback(async () => {
    const cur = sliceRef.current;
    if (!server || !cur || refreshing) return;
    const gen = generation.current;
    setRefreshing(true);
    try {
      const r = await fetchTree(server, query(includeClosed), cur.etag);
      if (gen !== generation.current) return;
      if (r.data) setSlice({ etag: r.etag, data: r.data });
      setRefreshError(null);
      const d = detailRef.current;
      if (d) void loadDetail(d.id, d.etag);
    } catch (e) {
      if (gen === generation.current) setRefreshError(`Refresh failed: ${errorOf(e).message}`);
    } finally {
      setCheckedAt(new Date());
      setRefreshing(false);
    }
  }, [server, refreshing, query, includeClosed, loadDetail]);

  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [refresh]);

  return {
    includeClosed,
    toggleClosed,
    data: slice?.data ?? null,
    error,
    refreshError,
    refreshing,
    checkedAt,
    refresh,
    detail,
    openDetail,
    closeDetail,
  };
}
