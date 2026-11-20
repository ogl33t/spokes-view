import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { buildOutline, visibleRows, type Row } from "./backlog";
import { clock, dueText, markers, spokeId, STATUS_LABEL } from "./format";
import { kanbanUrl } from "./kanban";
import { NodeModal } from "./NodeModal";
import { useSubtree } from "./useSubtree";
import { ViewLinks } from "./ViewLinks";

interface Props {
  server: string | null;
  rootId: number;
}

/** Every node beneath `rootId` as an indented list, with collapsible branches and a filter. */
export function BacklogApp({ server, rootId }: Props): ReactElement {
  const {
    includeClosed,
    toggleClosed,
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
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(new Set());
  const [filter, setFilter] = useState("");

  const outline = useMemo(() => (data ? buildOutline(data) : []), [data]);
  const rows = useMemo(() => visibleRows(outline, collapsed, filter), [outline, collapsed, filter]);
  const nodesById = useMemo(() => new Map(data?.nodes.map((n) => [n.id, n])), [data]);
  const rootNode = nodesById.get(rootId);
  const today = data?.today ?? "";
  const filtering = filter.trim() !== "";

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
          ? 'Its children are all closed; turn on "Show closed" to see them.'
          : "It has no children yet."}
      </Message>
    );
  } else if (rows.length === 0) {
    body = <Message title="No matches">Nothing here matches “{filter.trim()}”.</Message>;
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
              onToggle={toggle}
              onOpen={openDetail}
            />
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="app kanban-app backlog-app">
      <header className="bar">
        <h1>
          <span className="logo" aria-hidden="true" />
          <a className="home" href={server ? `/?server=${encodeURIComponent(server)}` : "/"}>
            Spokes view
          </a>
          <span className="muted">/</span>
          <span className="board-title">
            {data?.path.map((c) => c.title).join(" / ")}
            {data && data.path.length > 0 ? " / " : ""}
            <strong>{rootNode?.title ?? spokeId(rootId)}</strong>
          </span>
        </h1>
        {server && <span className="chip">{server}</span>}
        {server && (
          <a className="btn" href={kanbanUrl(server, rootId)}>
            Kanban
          </a>
        )}
        <label className="filter">
          <span className="sr-only">Filter</span>
          <input
            type="search"
            placeholder="Filter by title or SPOKE-N"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={includeClosed} onChange={toggleClosed} />
          Show closed
        </label>
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
        <button
          type="button"
          className="btn"
          onClick={() => void refresh()}
          disabled={refreshing || !data}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
        <span className="updated" aria-live="polite">
          {data && (filtering ? `${rows.length} of ${outline.length}` : `${outline.length} items`)}
          {checkedAt && ` · checked ${clock(checkedAt)}`}
        </span>
      </header>
      {(refreshError ?? data?.truncated) && (
        <div className={`notice ${refreshError ? "warn" : ""}`} role="status">
          {refreshError ??
            "Large branch: the list shows only the nodes Spokes would return in one slice."}
        </div>
      )}
      <main className="main kanban-main">{body}</main>
      {detail && server && (
        <NodeModal
          detail={detail}
          fromTree={nodesById.get(detail.id)}
          timeZone={data?.time_zone ?? "UTC"}
          today={today}
          onClose={closeDetail}
          onSelect={openDetail}
          actions={(n) => <ViewLinks server={server} node={n} />}
        />
      )}
    </div>
  );
}

function BacklogRow({
  row,
  today,
  open,
  canToggle,
  onToggle,
  onOpen,
}: {
  row: Row;
  today: string;
  open: boolean;
  canToggle: boolean;
  onToggle: (id: number) => void;
  onOpen: (id: number) => void;
}): ReactElement {
  const n = row.node;
  const ms = markers(n, today);
  const prio = n.effective_priority;
  const due = dueText(n, today);
  return (
    <div
      className={`row ${n.deferred ? "deferred" : ""}`}
      data-status={n.status}
      style={{ paddingLeft: `${row.depth * 1.25 + 0.4}rem` }}
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
        <span
          className={`status-dot s-${n.status}`}
          title={STATUS_LABEL[n.status]}
          aria-label={STATUS_LABEL[n.status]}
        />
        <span className="row-title">{n.title}</span>
        <span className="row-meta">
          <span className="mono">{spokeId(n.id)}</span>
          {n.kind === "area" && <span className="chip">area</span>}
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
