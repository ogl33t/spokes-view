import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  backlogUrl,
  buildOutline,
  isFiltering,
  NO_FILTER,
  visibleRows,
  type Row,
  type RowFilter,
} from "./backlog";
import { branchProgress, DetailPanel } from "./DetailPanel";
import {
  dueText,
  markers,
  NODE_TYPES,
  spokeId,
  STAGE_LABEL,
  STAGES,
  STATUS_LABEL,
  TYPE_LABEL,
  clock,
} from "./format";
import { FindBox } from "./FindBox";
import { kanbanUrl } from "./kanban";
import { nextOnlyKeep } from "./nextOnly";
import { Shell } from "./Shell";
import type { SidebarArea } from "./Sidebar";
import { ROOT_ID } from "./treeStore";
import type { ViewNode } from "./types";
import { TypeStageChips } from "./TypeStageChips";
import { useAreas } from "./useAreas";
import { useSubtree } from "./useSubtree";

interface Props {
  server: string | null;
  rootId: number;
}

const RING_RADIUS = 6;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** Every node beneath `rootId` as an indented list, with collapsible branches and a filter. */
export function BacklogApp({ server, rootId }: Props): ReactElement {
  const {
    includeClosed,
    toggleClosed,
    nextOnly,
    toggleNextOnly,
    data,
    error,
    refreshError,
    refreshing,
    checkedAt,
    refresh,
    detail,
    openDetail,
    closeDetail,
  } = useSubtree(server, rootId);
  const areas = useAreas(server);
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(new Set());
  const [filter, setFilter] = useState<RowFilter>(NO_FILTER);
  const scrollTo = useRef<number | null>(null);

  const outline = useMemo(() => (data ? buildOutline(data) : []), [data]);
  const keep = useMemo(
    () => (data && nextOnly ? nextOnlyKeep(data.nodes, rootId) : null),
    [data, nextOnly, rootId],
  );
  const rows = useMemo(
    () => visibleRows(outline, collapsed, filter).filter((r) => !keep || keep.has(r.node.id)),
    [outline, collapsed, filter, keep],
  );
  const total = keep ? outline.filter((r) => keep.has(r.node.id)).length : outline.length;
  const nodesById = useMemo(() => new Map(data?.nodes.map((n) => [n.id, n])), [data]);
  const childrenOf = useMemo(() => {
    const m = new Map<number, ViewNode[]>();
    for (const n of data?.nodes ?? []) {
      if (n.parent === null || n.id === rootId) continue;
      const list = m.get(n.parent);
      if (list) list.push(n);
      else m.set(n.parent, [n]);
    }
    return m;
  }, [data, rootId]);
  const rootNode = nodesById.get(rootId);
  const today = data?.today ?? "";
  const filtering = isFiltering(filter);

  const toggle = useCallback((id: number) => {
    setCollapsed((c) => {
      const next = new Set(c);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const collapseAll = useCallback(
    () => setCollapsed(new Set(outline.filter((r) => r.hasRows).map((r) => r.node.id))),
    [outline],
  );

  useEffect(() => {
    const title = rootNode ? `${rootNode.title} · Backlog` : "Backlog";
    document.title = `${title} · Spokes view`;
  }, [rootNode]);

  // After a jump, scroll the row into view once it has rendered.
  const selectedId = detail?.id;
  useEffect(() => {
    const id = scrollTo.current;
    if (id === null) return;
    scrollTo.current = null;
    document.querySelector(`[data-row-id="${String(id)}"]`)?.scrollIntoView({ block: "center" });
  }, [selectedId, rows]);

  const treeLink = server ? `/?server=${encodeURIComponent(server)}` : "/";
  const jump = useCallback(
    (id: number) => {
      const row = outline.find((r) => r.node.id === id);
      if (!row) {
        window.location.assign(treeLink);
        return;
      }
      setCollapsed((c) => (row.ancestors.some((a) => c.has(a)) ? new Set() : c));
      openDetail(id);
      scrollTo.current = id;
    },
    [outline, openDetail, treeLink],
  );

  const sidebarAreas: SidebarArea[] = areas.map((a) => ({
    ...a,
    href: server ? backlogUrl(server, a.id) : undefined,
    active: a.id === rootId,
  }));

  /** The colour slot of the area the selected node sits under. */
  const areaSlot = useMemo(() => {
    if (!detail || !data) return null;
    const slotOf = new Map(areas.map((a) => [a.id, a.slot]));
    let cur: ViewNode | undefined = nodesById.get(detail.id);
    while (cur) {
      if (cur.parent === ROOT_ID || cur.id === ROOT_ID) return slotOf.get(cur.id) ?? null;
      const up: ViewNode | undefined = cur.parent === null ? undefined : nodesById.get(cur.parent);
      if (!up) break;
      cur = up;
    }
    const top = data.path.find((c) => slotOf.has(c.id));
    return top ? (slotOf.get(top.id) ?? null) : null;
  }, [detail, data, areas, nodesById]);

  let body: ReactElement;
  if (!server) {
    body = <Message title="No server named">Open the backlog from the graph view.</Message>;
  } else if (error) {
    body = (
      <Message title={`Cannot show ${spokeId(rootId)} on ${server}`} error>
        {error.message}
      </Message>
    );
  } else if (!data) {
    body = <Message title="Loading…" />;
  } else if (outline.length === 0) {
    body = (
      <Message title="Nothing beneath this node">
        {!includeClosed && rootNode && rootNode.closed_child_count > 0
          ? 'Its children are all closed; turn on "Closed items" to see them.'
          : "It has no children yet."}
      </Message>
    );
  } else if (rows.length === 0) {
    body = (
      <Message title="No matches">
        Nothing here matches the current filters.
        <button type="button" className="btn" onClick={() => setFilter(NO_FILTER)}>
          Clear filter
        </button>
      </Message>
    );
  } else {
    body = (
      <ol className="backlog" aria-label="Backlog">
        {rows.map((r) => (
          <li key={r.node.id}>
            <BacklogRow
              row={r}
              today={today}
              open={filtering || !collapsed.has(r.node.id)}
              canToggle={r.hasRows && !filtering}
              selected={detail?.id === r.node.id}
              kids={childrenOf.get(r.node.id) ?? []}
              onToggle={toggle}
              onOpen={openDetail}
            />
          </li>
        ))}
      </ol>
    );
  }

  const crumbs = data?.path ?? [];
  const main = (
    <>
      <div className="bl-crumbs">
        <span className="bl-path">
          {crumbs.map((c) => c.title).join(" / ")}
          {crumbs.length > 0 ? " /" : ""}
        </span>
        <strong>{rootNode?.title ?? spokeId(rootId)}</strong>
        {data && (
          <span className="bl-count mono">
            {filtering
              ? `${String(rows.length)} of ${String(total)} items`
              : `${String(total)} items`}
          </span>
        )}
      </div>
      <div className="toolbar">
        <label className="filter filter-text">
          <span className="sr-only">Filter</span>
          <input
            type="search"
            placeholder="Filter by title or SPOKE-N"
            value={filter.text}
            onChange={(e) => setFilter((f) => ({ ...f, text: e.target.value }))}
          />
        </label>
        <div className="toolbar-rest">
          <label className="filter">
            <span className="sr-only">Type</span>
            <select
              value={filter.type}
              onChange={(e) =>
                setFilter((f) => ({ ...f, type: e.target.value as RowFilter["type"] }))
              }
            >
              <option value="any">Any type</option>
              {NODE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
              <option value="none">No type</option>
            </select>
          </label>
          <label className="filter">
            <span className="sr-only">Stage</span>
            <select
              value={filter.stage}
              onChange={(e) =>
                setFilter((f) => ({ ...f, stage: e.target.value as RowFilter["stage"] }))
              }
            >
              <option value="any">Any stage</option>
              {STAGES.map((st) => (
                <option key={st} value={st}>
                  {STAGE_LABEL[st]}
                </option>
              ))}
              <option value="none">No stage</option>
            </select>
          </label>
          <span className="toolbar-gap" />
          <button
            type="button"
            className="btn"
            onClick={() => setCollapsed(new Set())}
            disabled={collapsed.size === 0 || filtering}
          >
            Expand all
          </button>
          <button type="button" className="btn" onClick={collapseAll} disabled={filtering || !data}>
            Collapse all
          </button>
        </div>
      </div>
      {(refreshError ?? data?.truncated) && (
        <div className={`notice ${refreshError ? "warn" : ""}`} role="status">
          {refreshError ??
            "Large branch: the list shows only the nodes Spokes would return in one slice."}
        </div>
      )}
      <div className="bl-scroll">{body}</div>
    </>
  );

  const selected = detail ? nodesById.get(detail.id) : undefined;
  const panel =
    detail && server ? (
      <DetailPanel
        detail={detail}
        fromTree={selected}
        children={childrenOf.get(detail.id) ?? []}
        areaSlot={areaSlot}
        timeZone={data?.time_zone ?? "UTC"}
        today={today}
        server={server}
        treeHref={treeLink}
        expanded={!collapsed.has(detail.id)}
        onToggle={toggle}
        onClose={closeDetail}
        onSelect={openDetail}
      />
    ) : null;

  return (
    <Shell
      sidebar={{
        view: "backlog",
        links: {
          tree: treeLink,
          backlog: server ? backlogUrl(server, rootId) : "/",
          kanban: server ? kanbanUrl(server, rootId) : null,
        },
        find: <FindBox nodes={() => data?.nodes ?? []} onJump={jump} />,
        areas: sidebarAreas,
        includeClosed,
        onToggleClosed: toggleClosed,
        nextOnly,
        onToggleNext: toggleNextOnly,
        server: server ? <span className="chip">{server}</span> : null,
        serverName: server,
        refresh: {
          onClick: () => void refresh(),
          busy: refreshing,
          disabled: refreshing || !data,
          caption: checkedAt ? `Updated ${clock(checkedAt)}` : "",
        },
      }}
      main={main}
      panel={panel}
      phoneTitle={rootNode?.title ?? "Backlog"}
    />
  );
}

function BacklogRow({
  row,
  today,
  open,
  canToggle,
  selected,
  kids,
  onToggle,
  onOpen,
}: {
  row: Row;
  today: string;
  open: boolean;
  canToggle: boolean;
  selected: boolean;
  kids: ViewNode[];
  onToggle: (id: number) => void;
  onOpen: (id: number) => void;
}): ReactElement {
  const n = row.node;
  const ms = markers(n, today);
  const prio = n.effective_priority;
  const due = dueText(n, today);
  const progress = branchProgress(n, kids);
  return (
    <div
      className={`row ${n.deferred ? "deferred" : ""} ${selected ? "selected" : ""}`}
      data-row-id={n.id}
      data-status={n.status}
      style={{ paddingLeft: `${row.depth * 1.25 + 0.4}rem`, "--depth": row.depth } as CSSProperties}
    >
      {canToggle ? (
        <button
          type="button"
          className="twisty"
          aria-expanded={open}
          aria-label={open ? `Collapse ${n.title}` : `Expand ${n.title}`}
          onClick={() => onToggle(n.id)}
        >
          {open ? "▾" : "▸"}
        </button>
      ) : (
        <span className="twisty" aria-hidden="true" />
      )}
      <button type="button" className="row-main" onClick={() => onOpen(n.id)}>
        {progress ? (
          <ProgressRing done={progress.done} total={progress.total} />
        ) : (
          <span
            className={`status-dot s-${n.status}`}
            title={STATUS_LABEL[n.status]}
            aria-label={STATUS_LABEL[n.status]}
          />
        )}
        <span className="row-title">{n.title}</span>
        <span className="row-meta">
          <span className="mono">{spokeId(n.id)}</span>
          {n.kind === "area" && <span className="chip">area</span>}
          <TypeStageChips node={n} />
          {prio !== null && (
            <span className={`chip prio-chip p${prio}`} title={`Priority ${prio}`}>
              P{prio}
            </span>
          )}
          {due && <span className="muted">{due}</span>}
          {n.progress && (
            <span className="muted" title="Steps done">
              {n.progress.done}/{n.progress.total}
            </span>
          )}
          {ms.map((m) => (
            <span key={m.key} className={`marker ${m.cls}`} title={m.title}>
              {m.glyph}
            </span>
          ))}
        </span>
      </button>
    </div>
  );
}

function ProgressRing({ done, total }: { done: number; total: number }): ReactElement {
  const frac = total > 0 ? Math.min(done / total, 1) : 0;
  return (
    <svg
      className="bl-ring"
      width="16"
      height="16"
      viewBox="-8 -8 16 16"
      role="img"
      aria-label={`${String(done)} of ${String(total)} done`}
    >
      <circle className="bl-ring-track" r={RING_RADIUS} />
      <circle
        className="bl-ring-arc"
        r={RING_RADIUS}
        transform="rotate(-90)"
        strokeDasharray={`${String(frac * RING_LENGTH)} ${String(RING_LENGTH)}`}
      />
    </svg>
  );
}

function Message({
  title,
  children,
  error,
}: {
  title: string;
  children?: ReactNode;
  error?: boolean;
}): ReactElement {
  return (
    <div className={`message ${error ? "error" : ""}`} role={error ? "alert" : "status"}>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}
