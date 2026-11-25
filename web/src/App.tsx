import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ApiError, fetchNode, fetchTree, listServers, type TreeQuery } from "./api";
import { areaOf, areaSlots } from "./areas";
import { ContextMenu } from "./ContextMenu";
import { DetailPanel, type DetailState } from "./DetailPanel";
import { FindBox } from "./FindBox";
import { clock, spokeId } from "./format";
import { Graph } from "./Graph";
import { backlogUrl } from "./backlog";
import { kanbanUrl } from "./kanban";
import { layoutRadial } from "./layout";
import { Legend } from "./Legend";
import { nextOnlyKeep } from "./nextOnly";
import { loadPrefs, savePrefs } from "./prefs";
import { Shell } from "./Shell";
import type { SidebarArea } from "./Sidebar";
import {
  ancestors,
  buildStore,
  closeOthers,
  fullExpansion,
  initialBudget,
  initialExpansion,
  knownChildren,
  needsFetch,
  ROOT_ID,
  type Store,
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

const COMPACT_QUERY = "(max-width: 599px)";

function subscribeCompact(onChange: () => void): () => void {
  const mq = window.matchMedia(COMPACT_QUERY);
  mq.addEventListener("change", onChange);
  return () => {
    mq.removeEventListener("change", onChange);
  };
}

/** A viewport under 600px: the graph labels only areas and parents at the first fit. */
function useCompact(): boolean {
  return useSyncExternalStore(
    subscribeCompact,
    () => window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  );
}

const CAPPED_NOTE =
  "Large tree: the node limit cut the full load short, so some next steps may be missing.";

/** Every loaded node that has loaded children: all of them open. */
function allBranches(store: Store): Set<number> {
  const out = new Set<number>();
  for (const id of store.nodes.keys()) if (knownChildren(store, id).length > 0) out.add(id);
  return out;
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
  const [includeClosed, setIncludeClosed] = useState(() => loadPrefs().includeClosed);
  const [nextOnly, setNextOnly] = useState(() => loadPrefs().nextOnly);
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
  const [focusRequest, setFocusRequest] = useState<{ id: number; seq: number } | null>(null);
  const [activeArea, setActiveArea] = useState<number | null>(null);
  const focusSeq = useRef(0);
  const compact = useCompact();

  // The latest values, for async work that outlives a render.
  const slicesRef = useRef(slices);
  const detailRef = useRef(detail);
  const includeClosedRef = useRef(includeClosed);
  const nextOnlyRef = useRef(nextOnly);
  useLayoutEffect(() => {
    slicesRef.current = slices;
    detailRef.current = detail;
    includeClosedRef.current = includeClosed;
    nextOnlyRef.current = nextOnly;
  }, [slices, detail, includeClosed, nextOnly]);

  useEffect(() => {
    savePrefs({ includeClosed, nextOnly });
  }, [includeClosed, nextOnly]);
  /** Bumped on every server or closed-toggle switch; stale responses are dropped. */
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const refreshBusy = useRef(false);

  const store = useMemo(() => buildStore(slices.map((s) => s.data)), [slices]);

  // Load (or reload) a server. `keep` keeps expansion and selection (the closed toggle).
  // `whole` loads the full tree (depth EXPAND_ALL_DEPTH, under the node cap) for "Only what's next".
  const load = useCallback(async (name: string, closed: boolean, keep: boolean, whole: boolean) => {
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
      const rootQuery: TreeQuery = {
        root: ROOT_ID,
        depth: whole ? EXPAND_ALL_DEPTH : FIRST_DEPTH,
        includeClosed: closed,
      };
      const first = await fetchTree(name, rootQuery, null, ctl.signal);
      if (gen !== generation.current || !first.data) return;
      const loaded: Slice[] = [{ q: rootQuery, etag: first.etag, data: first.data }];
      // Reload the branches that were open, with the new closed setting.
      // The whole tree already holds them.
      const branches = whole
        ? []
        : previous.slice(1).map((s) => ({ ...s.q, includeClosed: closed }));
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
      const loadedStore = buildStore(loaded.map((s) => s.data));
      if (whole) {
        setExpanded(allBranches(loadedStore));
        setFitKey((k) => k + 1);
        if (loadedStore.truncated) setExpandNote(CAPPED_NOTE);
      } else if (!keep) {
        setExpanded(initialExpansion(loadedStore, initialBudget(window.innerWidth)));
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

  // Picking a server loads it from scratch, with the saved closed setting.
  const choose = useCallback(
    (name: string) => {
      rememberServer(name);
      setServer(name);
      setActiveArea(null);
      setFocusRequest(null);
      void load(name, includeClosedRef.current, false, nextOnlyRef.current);
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
    if (server) void load(server, next, true, nextOnly);
  };

  const toggleNextOnly = () => {
    const next = !nextOnly;
    setNextOnly(next);
    setExpandNote(null);
    const whole = slices[0]?.q.depth === EXPAND_ALL_DEPTH && slices[0].q.root === ROOT_ID;
    if (next && server && !whole) {
      // Next steps sit deep: load the whole tree first; the fit follows the load.
      void load(server, includeClosed, true, true);
      return;
    }
    if (next) {
      setExpanded(allBranches(store));
      if (store.truncated) setExpandNote(CAPPED_NOTE);
    } else if (whole) {
      // Keep the loaded data, but go back to a first-view opening.
      setExpanded(initialExpansion(store, initialBudget(window.innerWidth)));
    }
    setFitKey((k) => k + 1);
  };

  /** Glides the graph to `id` once it is drawn. */
  const requestFocus = useCallback((id: number) => {
    focusSeq.current += 1;
    setFocusRequest({ id, seq: focusSeq.current });
  }, []);

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

  // Find: select and glide to a node, loading the branches down to it when it is not loaded.
  const jump = useCallback(
    async (id: number) => {
      if (!server) return;
      if (store.nodes.has(id)) {
        select(id);
        requestFocus(id);
        return;
      }
      const gen = generation.current;
      setRefreshError(null);
      try {
        const found = await fetchNode(server, id, includeClosed, null);
        if (gen !== generation.current || !found.data) return;
        const path = found.data.path.map((c) => c.id);
        let work = slicesRef.current;
        let have = buildStore(work.map((s) => s.data));
        // Fetch from the deepest loaded ancestor until the node arrives.
        while (!have.nodes.has(id)) {
          const from = [...path].reverse().find((a) => have.nodes.has(a));
          if (from === undefined) throw new Error("its branch is not in this tree");
          const q = { root: from, depth: BRANCH_DEPTH, includeClosed };
          const r = await fetchTree(server, q, null);
          if (gen !== generation.current) return;
          if (!r.data) throw new Error(`${spokeId(from)} did not load`);
          const data = r.data;
          const next = [...work.filter((x) => x.q.root !== from), { q, etag: r.etag, data }];
          const after = buildStore(next.map((s) => s.data));
          const deeper = [...path, id].reverse().find((a) => after.nodes.has(a));
          // A branch over the node cap may leave the path out: stop rather than loop.
          if (deeper === from) throw new Error(`${spokeId(from)} is too large to open`);
          work = next;
          have = after;
        }
        setSlices(work);
        setExpanded((ex) => {
          const n = new Set(ex);
          for (const a of path) n.add(a);
          return n;
        });
        setSelected(id);
        setDetail({ id, data: found.data, etag: found.etag, error: null, loading: false });
        requestFocus(id);
      } catch (e) {
        if (gen === generation.current)
          setRefreshError(`Could not find ${spokeId(id)}: ${errorOf(e).message}`);
      }
    },
    [server, store, includeClosed, select, requestFocus],
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
      void load(server, includeClosed, false, nextOnly);
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
  }, [server, tree.kind, includeClosed, nextOnly, load, loadDetail]);

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

  const layout = useMemo(() => {
    const keep = nextOnly ? nextOnlyKeep(store.nodes.values(), ROOT_ID) : null;
    return layoutRadial(
      ROOT_ID,
      (id) => {
        if (!expanded.has(id)) return [];
        const kids = knownChildren(store, id);
        return keep ? kids.filter((k) => keep.has(k)) : kids;
      },
      undefined,
    );
  }, [store, expanded, nextOnly]);

  const slots = useMemo(() => areaSlots(store), [store]);
  const areaSlotOf = useCallback((id: number) => slots.get(id) ?? null, [slots]);
  const areas: SidebarArea[] = [...slots].flatMap(([id, slot]) => {
    const n = store.nodes.get(id);
    if (!n) return [];
    const active = activeArea === id;
    return [
      {
        id,
        title: n.title,
        slot,
        count: n.descendant_count,
        active,
        onPick: () => {
          if (active) {
            setActiveArea(null);
            setFocusRequest(null);
          } else {
            setActiveArea(id);
            requestFocus(id);
          }
        },
      },
    ];
  });

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
        onRetry={() => server && void load(server, includeClosed, false, nextOnly)}
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
        areaSlotOf={areaSlotOf}
        focusRequest={focusRequest}
        dimOutside={activeArea}
        compact={compact}
      />
    );
  } else {
    body = <Message title="Loading…" />;
  }

  const detailArea = detail ? areaOf(store, detail.id) : null;
  const panel =
    detail && server ? (
      <DetailPanel
        detail={detail}
        fromTree={store.nodes.get(detail.id)}
        children={knownChildren(store, detail.id).flatMap((c) => store.nodes.get(c) ?? [])}
        areaSlot={detailArea === null ? null : (slots.get(detailArea) ?? null)}
        timeZone={store.meta?.time_zone ?? "UTC"}
        today={store.meta?.today ?? ""}
        expanded={expanded.has(detail.id)}
        onClose={() => {
          setSelected(null);
          setDetail(null);
        }}
        onSelect={select}
        onFocus={requestFocus}
        onToggle={(id) => void toggle(id)}
        server={server}
      />
    ) : null;

  const main = (
    <>
      <div className="tree-bar">
        <span className="tree-crumb">{root?.title ?? "To do"}</span>
        <span className="tree-bar-gap" />
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
      </div>
      {(refreshError ?? expandNote ?? (store.truncated && tree.kind === "ready")) && (
        <div className={`notice ${refreshError ? "warn" : ""}`} role="status">
          {refreshError ??
            expandNote ??
            "Large tree: only the first levels are loaded. Branches load when you open them."}
        </div>
      )}
      <div className="main tree-main">
        {body}
        {tree.kind === "ready" && root && <Legend />}
        {current && current.status !== "ok" && tree.kind !== "error" && (
          <div className="notice warn floating">{current.message}</div>
        )}
      </div>
    </>
  );

  return (
    <>
      <Shell
        phoneTitle={root?.title ?? "To do"}
        main={main}
        panel={panel}
        sidebar={{
          view: "tree",
          links: {
            tree: server ? `/?server=${encodeURIComponent(server)}` : "/",
            backlog: server ? backlogUrl(server, ROOT_ID) : "/",
            kanban: server ? kanbanUrl(server, ROOT_ID) : null,
          },
          find: <FindBox nodes={() => store.nodes.values()} onJump={(id) => void jump(id)} />,
          areas,
          includeClosed,
          onToggleClosed: toggleClosed,
          nextOnly,
          onToggleNext: toggleNextOnly,
          serverName: server,
          server: (
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
          ),
          refresh: {
            onClick: () => void refresh(),
            busy: refreshing,
            disabled: refreshing || tree.kind === "loading",
            caption:
              (changedAt ? `Updated ${clock(changedAt)}` : "") +
              (checkedAt && changedAt && checkedAt.getTime() !== changedAt.getTime()
                ? ` · checked ${clock(checkedAt)}`
                : ""),
          },
        }}
      />
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
            ...(menuNode.id !== ROOT_ID
              ? [
                  {
                    label: "Close others",
                    onPick: () => {
                      setExpanded(closeOthers(store, expanded, menuNode.id));
                      setExpandNote(null);
                      setFitKey((k) => k + 1);
                    },
                  },
                ]
              : []),
          ]}
        />
      )}
    </>
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
