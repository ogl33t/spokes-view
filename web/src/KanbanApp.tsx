import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { AppBar } from "./AppBar";
import { backlogUrl } from "./backlog";
import { clock, markers, spokeId } from "./format";
import {
  buildBoard,
  GROUP_PARAM,
  groupingFrom,
  kanbanUrl,
  type Card,
  type Grouping,
} from "./kanban";
import { NodeModal } from "./NodeModal";
import { TypeStageChips } from "./TypeStageChips";
import { useSubtree } from "./useSubtree";
import { ViewLinks } from "./ViewLinks";

interface Props {
  server: string | null;
  rootId: number;
}

/** A kanban board of every node beneath `rootId`, one column per status or stage. */
export function KanbanApp({ server, rootId }: Props): ReactElement {
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
    openDetail: open,
    closeDetail,
  } = useSubtree(server, rootId);

  const [group, setGroup] = useState<Grouping>(() => groupingFrom(window.location.search));
  const changeGroup = (next: Grouping): void => {
    setGroup(next);
    const url = new URL(window.location.href);
    if (next === "stage") url.searchParams.set(GROUP_PARAM, "stage");
    else url.searchParams.delete(GROUP_PARAM);
    window.history.replaceState(window.history.state, "", url);
  };

  const board = useMemo(
    () => (data ? buildBoard(data, includeClosed, group) : []),
    [data, includeClosed, group],
  );
  const rootNode = data?.nodes.find((n) => n.id === rootId);
  const nodesById = useMemo(() => new Map(data?.nodes.map((n) => [n.id, n])), [data]);
  const total = board.reduce((sum, c) => sum + c.cards.length, 0);
  const today = data?.today ?? "";

  useEffect(() => {
    const title = rootNode ? `${rootNode.title} · Kanban` : "Kanban";
    document.title = `${title} · Spokes view`;
  }, [rootNode]);

  let body: ReactElement;
  if (!server) {
    body = <Message title="No server named">Open this board from the graph view.</Message>;
  } else if (error) {
    body = (
      <Message title={`Cannot show ${spokeId(rootId)} on ${server}`} error>
        {error.message}
      </Message>
    );
  } else if (!data) {
    body = <Message title="Loading…" />;
  } else if (total === 0) {
    body = (
      <Message title="Nothing beneath this node">
        {!includeClosed && rootNode && rootNode.closed_child_count > 0
          ? 'Its children are all closed; turn on "Show closed" to see them.'
          : "It has no children yet."}
      </Message>
    );
  } else {
    body = (
      <div className="board">
        {board.map((col) => (
          <section
            key={col.key}
            className="column"
            data-group={group}
            data-key={col.key}
            aria-label={col.label}
          >
            <h2>
              {group === "status" && (
                <span className={`status-dot s-${col.key}`} aria-hidden="true" />
              )}
              {group === "stage" && col.key !== "none" && (
                <span className={`stage-dot st-${col.key}`} aria-hidden="true" />
              )}
              {col.label}
              <span className="count mono">{col.cards.length}</span>
            </h2>
            {col.cards.length === 0 ? (
              <div className="empty-slot">Nothing here</div>
            ) : (
              <ol className="cards">
                {col.cards.map((c) => (
                  <li key={c.node.id}>
                    <KanbanCard card={c} today={today} onOpen={open} />
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="app kanban-app">
      <AppBar
        view="kanban"
        links={{
          tree: server ? `/?server=${encodeURIComponent(server)}` : "/",
          backlog: server ? backlogUrl(server, rootId) : "/",
          kanban: server ? kanbanUrl(server, rootId) : null,
        }}
        place={
          <>
            <span className="board-title">
              {data?.path.map((c) => c.title).join(" / ")}
              {data && data.path.length > 0 ? " / " : ""}
              <strong>{rootNode?.title ?? spokeId(rootId)}</strong>
            </span>
            {server && <span className="chip">{server}</span>}
          </>
        }
        actions={
          <>
            <label>
              <span className="sr-only">Group by</span>
              <select
                value={group}
                onChange={(e) => changeGroup(groupingFrom(`?group=${e.target.value}`))}
              >
                <option value="status">Group by status</option>
                <option value="stage">Group by stage</option>
              </select>
            </label>
            <label className="switch-label">
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={includeClosed}
                onChange={toggleClosed}
              />
              Show closed
            </label>
          </>
        }
        refresh={{
          onClick: () => void refresh(),
          busy: refreshing,
          disabled: refreshing || !data,
          caption:
            (data ? `${total} items` : "") + (checkedAt ? ` · checked ${clock(checkedAt)}` : ""),
        }}
      />
      {(refreshError ?? data?.truncated) && (
        <div className={`notice ${refreshError ? "warn" : ""}`} role="status">
          {refreshError ??
            "Large branch: the board shows only the nodes Spokes would return in one slice."}
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
          onSelect={open}
          actions={(n) => <ViewLinks server={server} node={n} />}
        />
      )}
    </div>
  );
}

function KanbanCard({
  card,
  today,
  onOpen,
}: {
  card: Card;
  today: string;
  onOpen: (id: number) => void;
}): ReactElement {
  const n = card.node;
  const ms = markers(n, today);
  const prio = n.effective_priority;
  return (
    <button
      type="button"
      className={`card ${n.deferred ? "deferred" : ""}`}
      data-status={n.status}
      onClick={() => onOpen(n.id)}
    >
      {card.path.length > 0 && (
        <span className="card-path">{card.path.map((p) => p.title).join(" / ")}</span>
      )}
      <span className="card-title">{n.title}</span>
      <span className="card-meta">
        <span className="mono">{spokeId(n.id)}</span>
        {n.kind === "area" && <span className="chip">area</span>}
        <TypeStageChips node={n} />
        {prio !== null && (
          <span className={`chip prio-chip p${prio}`} title={`Priority ${prio}`}>
            P{prio}
          </span>
        )}
        {n.progress && (
          <span className="muted" title="Steps done">
            {n.progress.done}/{n.progress.total}
          </span>
        )}
        {n.child_count > 0 && !n.progress && (
          <span className="muted" title="Children">
            {n.child_count} beneath
          </span>
        )}
        {ms.map((m) => (
          <span key={m.key} className={`marker ${m.cls}`} title={m.title}>
            {m.glyph}
          </span>
        ))}
      </span>
    </button>
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
