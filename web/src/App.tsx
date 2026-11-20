import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { ApiError, fetchNode, fetchTree, listServers, type TreeQuery } from "./api";
import { ContextMenu } from "./ContextMenu";
import { DetailPanel, type DetailState } from "./DetailPanel";
import { clock, spokeId } from "./format";
import { Graph } from "./Graph";
import { backlogUrl } from "./backlog";
import { kanbanUrl } from "./kanban";
import { layoutRadial } from "./layout";
import { Legend } from "./Legend";
import {
  ancestors,
  buildStore,
  fullExpansion,
  initialExpansion,
  knownChildren,
  needsFetch,
  ROOT_ID,
} from "./treeStore";
import type { ServerEntry, TreeResponse } from "./types";

/** Levels loaded on a server's first load, and per branch opened later. */
const FIRST_DEPTH = 3;
const BRANCH_DEPTH = 2;
const REFRESH_MS = 30_000;
/** "Expand all": levels fetched per unloaded branch, and the most nodes it will draw. */
const EXPAND_ALL_DEPTH = 10;
const EXPAND_ALL_LIMIT = 3000;
const STORAGE_KEY = "spokes-view.server";

/** One loaded slice: the query that fetched it, its tag and its body. */
interface Slice {
  q: TreeQuery;
  etag: string | null;
  data: TreeResponse;
}

type TreeState =
  { kind: "idle" } | { kind: "loading" } | { kind: "ready" } | { kind: "error"; error: ApiError };

function errorOf(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError("upstream_error", 0, String(e));
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

function serverFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("server");
}

function rememberServer(name: string) {
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Storage may be disabled; the URL still carries the choice.
  }
  const url = new URL(window.location.href);
  if (url.searchParams.get("server") !== name) {
    url.searchParams.set("server", name);
    window.history.replaceState(null, "", url);
  }
}

function storedServer(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Runs `tasks` with at most `limit` in flight; results in order. */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out = new Array<T>(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      const task = tasks[i];
      if (task) out[i] = await task();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return out;
}

export function App(): ReactElement {
  const [servers, setServers] = useState<ServerEntry[] | null>(null);
  const [serversError, setServersError] = useState<string | null>(null);
  const [server, setServer] = useState<string | null>(null);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [slices, setSlices] = useState<Slice[]>([]);
  const [tree, setTree] = useState<TreeState>({ kind: "idle" });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [changedAt, setChangedAt] = useState<Date | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandingAll, setExpandingAll] = useState(false);
  const [expandNote, setExpandNote] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: number; x: number; y: number } | null>(null);

  // The latest values, for async work that outlives a render.
  const slicesRef = useRef(slices);
  const detailRef = useRef(detail);
  useLayoutEffect(() => {
    slicesRef.current = slices;
    detailRef.current = detail;
  }, [slices, detail]);
  /** Bumped on every server or closed-toggle switch; stale responses are dropped. */
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const refreshBusy = useRef(false);

  const store = useMemo(() => buildStore(slices.map((s) => s.data)), [slices]);

  // Load (or reload) a server. `keep` keeps expansion and selection (the closed toggle).
  const load = useCallback(async (name: string, closed: boolean, keep: boolean) => {
    const gen = ++generation.current;
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    const previous = keep ? slicesRef.current : [];
    setTree({ kind: "loading" });
    setRefreshError(null);
    setExpandNote(null);
    if (!keep) {
      setSlices([]);
      setExpanded(new Set());
      setSelected(null);
      setDetail(null);
    }
    try {
      const first = await fetchTree(
        name,
        { root: ROOT_ID, depth: FIRST_DEPTH, includeClosed: closed },
        null,
        ctl.signal,
      );
      if (gen !== generation.current || !first.data) return;
      const loaded: Slice[] = [
        {
          q: { root: ROOT_ID, depth: FIRST_DEPTH, includeClosed: closed },
          etag: first.etag,
          data: first.data,
        },
      ];
      // Reload the branches that were open, with the new closed setting.
      const branches = previous.slice(1).map((s) => ({ ...s.q, includeClosed: closed }));
      const got = await pool(
        branches.map((q) => async () => {
          try {
            const r = await fetchTree(name, q, null, ctl.signal);
            return r.data ? { q, etag: r.etag, data: r.data } : null;
          } catch (e) {
            if (isAbort(e)) throw e;
            return null;
          }
        }),
        4,
      );
      if (gen !== generation.current) return;
      for (const s of got) if (s) loaded.push(s);
      setSlices(loaded);
      if (!keep) {
        setExpanded(initialExpansion(buildStore(loaded.map((s) => s.data))));
        setFitKey((k) => k + 1);
      }
      setTree({ kind: "ready" });
      const now = new Date();
      setChangedAt(now);
      setCheckedAt(now);
    } catch (e) {
      if (isAbort(e) || gen !== generation.current) return;
      setTree({ kind: "error", error: errorOf(e) });
    }
  }, []);

  // Picking a server loads it from scratch (closed nodes hidden again).
  const choose = useCallback(
    (name: string) => {
      rememberServer(name);
      setServer(name);
      setIncludeClosed(false);
      void load(name, false, false);
    },
    [load],
  );

  // Server list, then the initial choice: URL, then the last one used, then the first.
  useEffect(() => {
    listServers()
      .then((list) => {
        setServers(list);
        const names = list.map((s) => s.name);
        const pick = (n: string | null) =>
          n ? names.find((x) => x.toLowerCase() === n.toLowerCase()) : undefined;
        const choice = pick(serverFromUrl()) ?? pick(storedServer()) ?? names[0];
        if (choice) choose(choice);
      })
      .catch((e: unknown) => {
        setServersError(errorOf(e).message);
      });
  }, [choose]);

  const toggleClosed = () => {
    const next = !includeClosed;
    setIncludeClosed(next);
    if (server) void load(server, next, true);
  };

  // Detail: fetched on click, and again on refresh with its tag.
  const loadDetail = useCallback(
    async (name: string, id: number, closed: boolean, etag: string | null) => {
      const gen = generation.current;
      try {
        const r = await fetchNode(name, id, closed, etag);
        if (gen !== generation.current || detailRef.current?.id !== id) return;
        if (r.data) setDetail({ id, data: r.data, etag: r.etag, error: null, loading: false });
      } catch (e) {
        if (gen !== generation.current || detailRef.current?.id !== id) return;
        const err = errorOf(e);
        setDetail((d) =>
          d && d.id === id
            ? {
                ...d,
                loading: false,
                error:
                  err.code === "not_found"
                    ? "This node is no longer in the tree (closed, or moved out of view)."
                    : err.message,
              }
            : d,
        );
      }
    },
    [],
  );

  const select = useCallback(
    (id: number) => {
      if (!server) return;
      setSelected(id);
      setDetail({ id, data: null, etag: null, error: null, loading: true });
      // Open every ancestor so the node is drawn.
      const up = ancestors(store, id);
      if (up.length > 0) {
        setExpanded((ex) => {
          if (up.every((a) => ex.has(a))) return ex;
          const n = new Set(ex);
          for (const a of up) n.add(a);
          return n;
        });
      }
      void loadDetail(server, id, includeClosed, null);
    },
    [server, store, includeClosed, loadDetail],
  );

  const toggle = useCallback(
    async (id: number) => {
      if (!server) return;
      if (expanded.has(id) && knownChildren(store, id).length > 0) {
        setExpanded((ex) => {
          const n = new Set(ex);
          n.delete(id);
          return n;
        });
        return;
      }
      if (!needsFetch(store, id)) {
        setExpanded((ex) => new Set(ex).add(id));
        return;
      }
      if (loading.has(id)) return;
      const gen = generation.current;
      setLoading((l) => new Set(l).add(id));
      const q = { root: id, depth: BRANCH_DEPTH, includeClosed };
      try {
        const r = await fetchTree(server, q, null);
        if (gen !== generation.current || !r.data) return;
        const data = r.data;
        setSlices((s) => [...s.filter((x) => x.q.root !== id), { q, etag: r.etag, data }]);
        setExpanded((ex) => new Set(ex).add(id));
      } catch (e) {
        if (gen === generation.current)
          setRefreshError(`Could not open SPOKE-${id}: ${errorOf(e).message}`);
      } finally {
        setLoading((l) => {
          const n = new Set(l);
          n.delete(id);
          return n;
        });
      }
    },
    [server, store, expanded, loading, includeClosed],
  );

  // Open every branch, fetching the ones not loaded yet, up to EXPAND_ALL_LIMIT drawn nodes.
  const expandAll = useCallback(async () => {
    if (!server || expandingAll || tree.kind !== "ready") return;
    const gen = generation.current;
    setExpandingAll(true);
    setExpandNote(null);
    let work = slicesRef.current;
    try {
      let plan = fullExpansion(buildStore(work.map((s) => s.data)), EXPAND_ALL_LIMIT);
      while (plan.pending.length > 0) {
        const batch = plan.pending.slice(0, 8);
        const got = await pool(
          batch.map((id) => async () => {
            const q = { root: id, depth: EXPAND_ALL_DEPTH, includeClosed };
            const r = await fetchTree(server, q, null);
            return r.data ? { q, etag: r.etag, data: r.data } : null;
          }),
          4,
        );
        if (gen !== generation.current) return;
        const fetched = got.filter((s): s is Slice => s !== null);
        // A branch that returned nothing would be asked for again forever.
        if (fetched.length < batch.length) throw new Error("a branch did not load");
        work = [...work.filter((s) => !batch.includes(s.q.root)), ...fetched];
        plan = fullExpansion(buildStore(work.map((s) => s.data)), EXPAND_ALL_LIMIT);
      }
      setSlices(work);
      setExpanded(plan.expanded);
      setFitKey((k) => k + 1);
      if (plan.limited)
        setExpandNote(
          `Large tree: opened the first ${String(EXPAND_ALL_LIMIT)} nodes. Open deeper branches one at a time.`,
        );
    } catch (e) {
      if (gen === generation.current)
        setRefreshError(`Could not expand everything: ${errorOf(e).message}`);
    } finally {
      setExpandingAll(false);
    }
  }, [server, expandingAll, tree.kind, includeClosed]);

  const collapseAll = () => {
    // Back to the root and its direct children.
    setExpanded(new Set([ROOT_ID]));
    setExpandNote(null);
    setFitKey((k) => k + 1);
  };

  // Refresh every loaded slice with its tag: unchanged slices cost a 304.
  const refresh = useCallback(async () => {
    if (!server || refreshBusy.current || tree.kind === "loading") return;
    const current = slicesRef.current;
    if (current.length === 0) {
      void load(server, includeClosed, false);
      return;
    }
    refreshBusy.current = true;
    setRefreshing(true);
    const gen = generation.current;
    try {
      const results = await pool(
        current.map((s) => async () => {
          try {
            const r = await fetchTree(server, s.q, s.etag);
            return r.data ? { ...s, etag: r.etag, data: r.data } : s;
          } catch (e) {
            const err = errorOf(e);
            // A branch whose root was closed or moved away is dropped.
            if (err.code === "not_found" && s.q.root !== ROOT_ID) return null;
            throw err;
          }
        }),
        4,
      );
      if (gen !== generation.current) return;
      const changed = results.some((r, i) => r !== current[i]);
      if (changed) {
        setSlices(results.filter((r): r is Slice => r !== null));
        setChangedAt(new Date());
      }
      setCheckedAt(new Date());
      setRefreshError(null);
      const d = detailRef.current;
      if (d) void loadDetail(server, d.id, includeClosed, d.etag);
    } catch (e) {
      if (gen === generation.current) {
        setRefreshError(`Refresh failed: ${errorOf(e).message}`);
        setCheckedAt(new Date());
      }
    } finally {
      refreshBusy.current = false;
      setRefreshing(false);
    }
  }, [server, tree.kind, includeClosed, load, loadDetail]);

  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [refresh]);

  // Escape closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        setDetail(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);
  const menuNode = menu ? store.nodes.get(menu.id) : undefined;

  const layout = useMemo(
    () =>
      layoutRadial(ROOT_ID, (id) => (expanded.has(id) ? knownChildren(store, id) : []), undefined),
    [store, expanded],
  );

  const root = store.nodes.get(ROOT_ID);
  const current = servers?.find((s) => s.name === server);

  let body: ReactElement;
  if (serversError) {
    body = <Message title="Cannot load the server list">{serversError}</Message>;
  } else if (!servers) {
    body = <Message title="Loading…" />;
  } else if (servers.length === 0) {
    body = <Message title="No servers configured">Set SPOKES_VIEW_SERVERS.</Message>;
  } else if (tree.kind === "error") {
    body = (
      <TreeError
        error={tree.error}
        server={server ?? ""}
        onRetry={() => server && void load(server, includeClosed, false)}
      />
    );
  } else if (tree.kind === "loading" && slices.length === 0) {
    body = <Message title={`Loading ${server ?? ""}…`} />;
  } else if (root && root.child_count === 0) {
    body = (
      <Message title="This tree is empty">
        {root.closed_child_count > 0 && !includeClosed
          ? `There are ${root.closed_child_count} closed items; turn on "Show closed" to see them.`
          : "Nothing has been added to it yet."}
      </Message>
    );
  } else if (root) {
    body = (
      <Graph
        layout={layout}
        store={store}
        expanded={expanded}
        loading={loading}
        selected={selected}
        fitKey={fitKey}
        onSelect={select}
        onToggle={(id) => void toggle(id)}
        onMenu={(id, x, y) => setMenu({ id, x, y })}
      />
    );
  } else {
    body = <Message title="Loading…" />;
  }

  return (
    <div className={`app ${detail ? "with-panel" : ""}`}>
      <header className="bar">
        <h1>
          <span className="logo" aria-hidden="true" />
          Spokes view
        </h1>
        <label className="picker">
          <span className="sr-only">Server</span>
          <select
            value={server ?? ""}
            onChange={(e) => {
              choose(e.target.value);
            }}
            disabled={!servers || servers.length === 0}
          >
            {(servers ?? []).map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
                {s.status === "ok"
                  ? s.version
                    ? ` (${s.version})`
                    : ""
                  : ` (${s.status.replace("_", " ")})`}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={includeClosed} onChange={toggleClosed} />
          Show closed
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => void refresh()}
          disabled={refreshing || tree.kind === "loading"}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void expandAll()}
          disabled={expandingAll || tree.kind !== "ready" || !root}
        >
          {expandingAll ? "Expanding…" : "Expand all"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={collapseAll}
          disabled={expandingAll || tree.kind !== "ready" || expanded.size <= 1}
        >
          Collapse all
        </button>
        {server && (
          <a className="btn" href={backlogUrl(server, ROOT_ID)}>
            Backlog
          </a>
        )}
        <span className="updated" aria-live="polite">
          {changedAt && `Updated ${clock(changedAt)}`}
          {checkedAt && changedAt && checkedAt.getTime() !== changedAt.getTime()
            ? ` · checked ${clock(checkedAt)}`
            : ""}
        </span>
      </header>
      {(refreshError ?? expandNote ?? (store.truncated && tree.kind === "ready")) && (
        <div className={`notice ${refreshError ? "warn" : ""}`} role="status">
          {refreshError ??
            expandNote ??
            "Large tree: only the first levels are loaded. Branches load when you open them."}
        </div>
      )}
      <main className="main">
        {body}
        {tree.kind === "ready" && root && <Legend />}
        {current && current.status !== "ok" && tree.kind !== "error" && (
          <div className="notice warn floating">{current.message}</div>
        )}
      </main>
      {detail && server && (
        <DetailPanel
          detail={detail}
          fromTree={store.nodes.get(detail.id)}
          timeZone={store.meta?.time_zone ?? "UTC"}
          today={store.meta?.today ?? ""}
          expanded={expanded.has(detail.id)}
          onClose={() => {
            setSelected(null);
            setDetail(null);
          }}
          onSelect={select}
          onToggle={(id) => void toggle(id)}
          server={server}
        />
      )}
      {menu && menuNode && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          heading={`${spokeId(menuNode.id)} ${menuNode.title}`}
          onClose={closeMenu}
          items={[
            ...(menuNode.child_count > 0 && server
              ? [
                  { label: "View Backlog", href: backlogUrl(server, menuNode.id) },
                  { label: "View Kanban", href: kanbanUrl(server, menuNode.id) },
                ]
              : []),
            { label: "Show details", onPick: () => select(menuNode.id) },
            ...(menuNode.child_count > 0
              ? [
                  {
                    label:
                      expanded.has(menuNode.id) && knownChildren(store, menuNode.id).length > 0
                        ? "Collapse branch"
                        : "Expand branch",
                    onPick: () => void toggle(menuNode.id),
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
}

function Message({ title, children }: { title: string; children?: ReactNode }): ReactElement {
  return (
    <div className="message" role="status">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}

function TreeError({
  error,
  server,
  onRetry,
}: {
  error: ApiError;
  server: string;
  onRetry: () => void;
}): ReactElement {
  const title =
    error.code === "too_old"
      ? `${server} is too old`
      : error.code === "unreachable"
        ? `${server} is unreachable`
        : error.code === "network"
          ? "spokes-view is unreachable"
          : `Cannot show ${server}`;
  const hint =
    error.code === "too_old"
      ? "Upgrade that Spokes server to 0.2.0 or later to view it here."
      : error.code === "unreachable"
        ? "Check that the server is running and reachable from the spokes-view host."
        : null;
  return (
    <div className="message error" role="alert">
      <h2>{title}</h2>
      <p>{error.message}</p>
      {hint && <p className="muted">{hint}</p>}
      <button type="button" className="btn" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
