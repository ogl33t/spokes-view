import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { branchProgress, DetailPanel } from "./DetailPanel";
import { FindBox } from "./FindBox";
import { backlogUrl } from "./backlog";
import { clock, markers, spokeId, typeOf } from "./format";
import {
  buildBoard,
  GROUP_PARAM,
  kanbanUrl,
  type Card,
  type Column,
  type Grouping,
  groupingFrom,
} from "./kanban";
import { nextOnlyKeep } from "./nextOnly";
import { Shell } from "./Shell";
import { TypeChip } from "./TypeStageChips";
import { ROOT_ID } from "./treeStore";
import type { TreeResponse, ViewNode } from "./types";
import { useAreas } from "./useAreas";
import { useSubtree } from "./useSubtree";

interface Props {
  server: string | null;
  rootId: number;
}

const GROUPS: readonly { value: Grouping; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "stage", label: "Stage" },
];

/** The depth-1 ancestor (area) of `id` in the slice, falling back on the slice's own path. */
function areaIdOf(data: TreeResponse, byId: Map<number, ViewNode>, id: number): number | null {
  const seen = new Set<number>();
  let cur = byId.get(id);
  while (cur && !seen.has(cur.id)) {
    if (cur.parent === ROOT_ID) return cur.id;
    seen.add(cur.id);
    cur = cur.parent === null ? undefined : byId.get(cur.parent);
  }
  const above = data.path.map((c) => c.id);
  const chain = above[0] === ROOT_ID ? above : [ROOT_ID, ...above];
  return [...chain, data.root][1] ?? null;
}

/** A kanban board of every node beneath `rootId`, one column per status or stage. */
export function KanbanApp({ server, rootId }: Props): ReactElement {
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
    openDetail: open,
    closeDetail,
  } = useSubtree(server, rootId);
  const areas = useAreas(server);
  const boardRef = useRef<HTMLDivElement>(null);

  const [group, setGroup] = useState<Grouping>(() => groupingFrom(window.location.search));
  const changeGroup = (next: Grouping): void => {
    setGroup(next);
    const url = new URL(window.location.href);
    if (next === "stage") url.searchParams.set(GROUP_PARAM, "stage");
    else url.searchParams.delete(GROUP_PARAM);
    window.history.replaceState(window.history.state, "", url);
  };

  const nodesById = useMemo(() => new Map(data?.nodes.map((n) => [n.id, n])), [data]);
  const kidsOf = useMemo(() => {
    const m = new Map<number, ViewNode[]>();
    for (const n of data?.nodes ?? []) {
      if (n.parent === null) continue;
      const list = m.get(n.parent);
      if (list) list.push(n);
      else m.set(n.parent, [n]);
    }
    return m;
  }, [data]);
  const board = useMemo(() => {
    if (!data) return [];
    const cols = buildBoard(data, includeClosed, group);
    if (!nextOnly) return cols;
    const keep = nextOnlyKeep(data.nodes, rootId);
    return cols.map((c) => ({ ...c, cards: c.cards.filter((k) => keep.has(k.node.id)) }));
  }, [data, includeClosed, group, nextOnly, rootId]);
  const rootNode = nodesById.get(rootId);
  const total = board.reduce((sum, c) => sum + c.cards.length, 0);
  const today = data?.today ?? "";
  const treeHref = server ? `/?server=${encodeURIComponent(server)}` : "/";

  useEffect(() => {
    const title = rootNode ? `${rootNode.title} · Kanban` : "Kanban";
    document.title = `${title} · Spokes view`;
  }, [rootNode]);

  const jump = useCallback(
    (id: number) => {
      if (!nodesById.has(id)) {
        window.location.assign(treeHref);
        return;
      }
      boardRef.current
        ?.querySelector(`[data-card-id="${id}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
      open(id);
    },
    [nodesById, treeHref, open],
  );

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
      <Message title={nextOnly ? "No next steps here" : "Nothing beneath this node"}>
        {nextOnly
          ? 'Turn off "Only what\'s next" to see every item.'
          : !includeClosed && rootNode && rootNode.closed_child_count > 0
            ? 'Its children are all closed; turn on "Show closed" to see them.'
            : "It has no children yet."}
      </Message>
    );
  } else {
    body = (
      <div className="board" ref={boardRef}>
        {board.map((col) => (
          <BoardColumn
            key={col.key}
            col={col}
            group={group}
            today={today}
            selectedId={detail?.id ?? null}
            kidsOf={kidsOf}
            onOpen={open}
          />
        ))}
      </div>
    );
  }

  const selected = detail ? nodesById.get(detail.id) : undefined;
  const areaId = data && detail ? areaIdOf(data, nodesById, detail.id) : null;
  const panel =
    detail && server ? (
      <DetailPanel
        detail={detail}
        fromTree={selected}
        children={kidsOf.get(detail.id) ?? []}
        areaSlot={areas.find((a) => a.id === areaId)?.slot ?? null}
        timeZone={data?.time_zone ?? "UTC"}
        today={today}
        server={server}
        treeHref={treeHref}
        onClose={closeDetail}
        onSelect={jump}
      />
    ) : null;

  const rootTitle = rootNode?.title ?? spokeId(rootId);
  return (
    <Shell
      phoneTitle={rootTitle}
      sidebar={{
        view: "kanban",
        links: {
          tree: treeHref,
          backlog: server ? backlogUrl(server, rootId) : "/",
          kanban: server ? kanbanUrl(server, rootId, group) : null,
        },
        find: <FindBox nodes={() => data?.nodes ?? []} onJump={jump} />,
        areas: areas.map((a) => ({
          id: a.id,
          title: a.title,
          slot: a.slot,
          count: a.count,
          ...(server ? { href: kanbanUrl(server, a.id, group) } : {}),
          active: a.id === rootId,
        })),
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
      panel={panel}
      main={
        <>
          <div className="kb-bar">
            <span className="kb-crumbs">
              {data?.path.map((c) => c.title).join(" / ")}
              {data && data.path.length > 0 ? " / " : ""}
              <strong>{rootTitle}</strong>
            </span>
            <span className="kb-group-label">Group by</span>
            <div className="seg" role="group" aria-label="Group by">
              {GROUPS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  aria-pressed={group === g.value}
                  onClick={() => changeGroup(g.value)}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          {(refreshError ?? data?.truncated) && (
            <div className={`notice ${refreshError ? "warn" : ""}`} role="status">
              {refreshError ??
                "Large branch: the board shows only the nodes Spokes would return in one slice."}
            </div>
          )}
          {body}
        </>
      }
    />
  );
}

function BoardColumn({
  col,
  group,
  today,
  selectedId,
  kidsOf,
  onOpen,
}: {
  col: Column;
  group: Grouping;
  today: string;
  selectedId: number | null;
  kidsOf: Map<number, ViewNode[]>;
  onOpen: (id: number) => void;
}): ReactElement {
  return (
    <section className="column" data-group={group} data-key={col.key} aria-label={col.label}>
      <h2>
        <span className="col-dot" aria-hidden="true" />
        {col.label}
        <span className="count mono">{col.cards.length}</span>
        <span className="col-rule" aria-hidden="true" />
      </h2>
      {col.cards.length === 0 ? (
        <div className="empty-slot">Nothing here</div>
      ) : (
        <ol className="cards">
          {col.cards.map((c) => (
            <li key={c.node.id}>
              <KanbanCard
                card={c}
                today={today}
                kids={kidsOf.get(c.node.id) ?? []}
                selected={c.node.id === selectedId}
                onOpen={onOpen}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function KanbanCard({
  card,
  today,
  kids,
  selected,
  onOpen,
}: {
  card: Card;
  today: string;
  kids: ViewNode[];
  selected: boolean;
  onOpen: (id: number) => void;
}): ReactElement {
  const n = card.node;
  const ms = markers(n, today);
  const prio = n.effective_priority;
  const type = typeOf(n);
  const progress = branchProgress(n, kids);
  return (
    <button
      type="button"
      className={`card ${n.deferred ? "deferred" : ""}`}
      data-status={n.status}
      data-card-id={n.id}
      aria-current={selected ? "true" : undefined}
      onClick={() => onOpen(n.id)}
    >
      {card.path.length > 0 && (
        <span className="card-path">{card.path.map((p) => p.title).join(" / ")}</span>
      )}
      <span className="card-title">{n.title}</span>
      <span className="card-meta">
        <span className="mono">{spokeId(n.id)}</span>
        {n.kind === "area" && <span className="chip">area</span>}
        {type !== null && <TypeChip type={type} />}
        {prio !== null && (
          <span className={`chip prio-chip p${prio}`} title={`Priority ${prio}`}>
            P{prio}
          </span>
        )}
        {ms.map((m) => (
          <span key={m.key} className={`marker ${m.cls}`} title={m.title}>
            {m.glyph}
          </span>
        ))}
        {progress && progress.total > 0 && (
          <span className="card-progress mono" title="Children done">
            <span className="card-bar" aria-hidden="true">
              <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </span>
            {progress.done}/{progress.total}
          </span>
        )}
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
