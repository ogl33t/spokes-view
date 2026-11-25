import type { ReactElement, ReactNode } from "react";
import {
  dueState,
  formatDate,
  formatInstant,
  markers,
  spokeId,
  stageOf,
  STATUS_LABEL,
  typeOf,
} from "./format";
import type { NodeResponse, ViewNode } from "./types";
import { StageChip, TypeChip } from "./TypeStageChips";
import { ViewLinks } from "./ViewLinks";

/** Event details carry UTC instants (e.g. a lease end); show them in the server's zone. */
export function localizeTimes(text: string, timeZone: string): string {
  return text.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z\b/g, (m) =>
    formatInstant(m, timeZone),
  );
}

export interface DetailState {
  id: number;
  data: NodeResponse | null;
  etag: string | null;
  error: string | null;
  loading: boolean;
}

interface DetailsProps {
  detail: DetailState;
  /** The node as the tree knows it, shown until the detail arrives. */
  fromTree?: ViewNode | undefined;
  /** The children the page knows, for the progress bar, next step and children list. */
  children?: ViewNode[];
  /** Colour slot (1..6) of the area the node sits under; area nodes draw it as their dot. */
  areaSlot?: number | null;
  timeZone: string;
  today: string;
  /** The server shown, for the links to a node's backlog and kanban pages. */
  server?: string;
  onClose: () => void;
  onSelect: (id: number) => void;
  /** Set: a primary "Focus branch" button. Otherwise `treeHref` gives "Show in tree". */
  onFocus?: (id: number) => void;
  treeHref?: string;
  expanded?: boolean;
  /** Set: an Expand/Collapse button on a node with children. */
  onToggle?: (id: number) => void;
  /** Extra buttons in place of the standard actions row (the modal pages). */
  actions?: (n: ViewNode) => ReactNode;
}

type PanelProps = Omit<DetailsProps, "actions">;

const MAX_CHILDREN = 12;

function Row({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

export interface BranchProgress {
  done: number;
  active: number;
  total: number;
}

/**
 * Done / in progress / total for a node: its own `progress` when the server gives one,
 * else counted from the known children plus the closed children the tree leaves out.
 */
export function branchProgress(n: ViewNode, kids: ViewNode[]): BranchProgress | null {
  const active = kids.filter((k) => k.status === "in_progress").length;
  if (n.progress) {
    const { done, total } = n.progress;
    return { done, active: Math.min(active, Math.max(total - done, 0)), total };
  }
  if (n.child_count + n.closed_child_count === 0 && kids.length === 0) return null;
  const closedShown = kids.filter((k) => k.status === "done" || k.status === "dropped").length;
  const closed = Math.max(n.closed_child_count, closedShown);
  const doneShown = kids.filter((k) => k.status === "done").length;
  const total = Math.max(kids.length - closedShown, n.child_count) + closed;
  const done = doneShown + (closed - closedShown);
  return { done, active: Math.min(active, total - done), total };
}

function ProgressBar({ p }: { p: BranchProgress }): ReactElement {
  const pct = (v: number) => `${(v / p.total) * 100}%`;
  return (
    <div className="dp-progress">
      <div
        className="dp-bar"
        role="progressbar"
        aria-label="Progress"
        aria-valuemin={0}
        aria-valuemax={p.total}
        aria-valuenow={p.done}
      >
        <span className="dp-bar-done" style={{ width: pct(p.done) }} />
        <span className="dp-bar-active" style={{ width: pct(p.active) }} />
      </div>
      <span className="dp-progress-label mono">
        {p.done} of {p.total} done
      </span>
    </div>
  );
}

/** The side panel beside the graph; a bottom sheet on a phone (see panel.css). */
export function DetailPanel(props: PanelProps): ReactElement {
  return (
    <aside className="panel details detail-panel" aria-label="Details">
      <NodeDetails {...props} />
    </aside>
  );
}

/** Path, fields, children, notes and events of one node: the body of the panel and the modal. */
export function NodeDetails(props: DetailsProps): ReactElement {
  const { detail, fromTree, timeZone, today, onClose, onSelect, actions } = props;
  const { server, onFocus, treeHref, expanded = false, onToggle, areaSlot = null } = props;
  const kids = props.children ?? [];
  const n: ViewNode | undefined = detail.data?.node ?? fromTree;
  const notes = detail.data?.node.notes ?? null;
  const path = detail.data?.path ?? [];
  const tz = detail.data?.time_zone ?? timeZone;
  const day = detail.data?.today ?? today;
  const at = (iso: string) => formatInstant(iso, tz);
  const due = n ? dueState(n, day) : null;
  const type = n ? typeOf(n) : null;
  const stage = n ? stageOf(n) : null;
  const progress = n ? branchProgress(n, kids) : null;
  const nextKid = kids.find((k) => k.is_next);
  const shown = kids.slice(0, MAX_CHILDREN);
  const more = n ? Math.max(kids.length, n.child_count) - shown.length : 0;
  const slot = areaSlot !== null ? Math.min(Math.max(areaSlot, 1), 6) : null;
  const dotStyle =
    n?.kind === "area" && slot !== null ? { color: `var(--area-${slot})` } : undefined;

  const standardActions = (m: ViewNode): ReactElement | null => {
    const lead = onFocus ? (
      <button type="button" className="btn primary" onClick={() => onFocus(m.id)}>
        Focus branch
      </button>
    ) : treeHref ? (
      <a className="btn" href={treeHref}>
        Show in tree
      </a>
    ) : undefined;
    const toggle =
      onToggle && m.child_count > 0 ? (
        <button type="button" className="btn" onClick={() => onToggle(m.id)}>
          {expanded ? "Collapse branch" : `Expand (${m.descendant_count} beneath)`}
        </button>
      ) : undefined;
    if (server) {
      return (
        <ViewLinks server={server} node={m} lead={lead}>
          {toggle}
        </ViewLinks>
      );
    }
    return lead || toggle ? (
      <p className="actions">
        {lead}
        {toggle}
      </p>
    ) : null;
  };

  return (
    <>
      <div className="panel-head">
        <nav className="crumbs" aria-label="Path">
          {path.map((c) => (
            <span key={c.id}>
              <button type="button" className="link" onClick={() => onSelect(c.id)}>
                {c.title}
              </button>
              <span aria-hidden="true"> / </span>
            </span>
          ))}
        </nav>
        <button type="button" className="close" onClick={onClose} aria-label="Close details">
          ×
        </button>
      </div>
      {!n ? (
        <p className="muted">{detail.error ?? "Loading…"}</p>
      ) : (
        <>
          <h2>
            <span className={`status-dot s-${n.status}`} style={dotStyle} aria-hidden="true" />
            {n.title}
          </h2>
          <p className="ids">
            <span className="mono">{spokeId(n.id)}</span>
            <span className={`chip status-chip s-${n.status}`}>{STATUS_LABEL[n.status]}</span>
            {type !== null && <TypeChip type={type} />}
            {stage !== null && <StageChip stage={stage} />}
            {n.effective_priority !== null && (
              <span
                className={`chip prio-chip p${n.effective_priority}`}
                title={n.priority === null ? "Priority inherited" : "Priority"}
              >
                P{n.effective_priority}
              </span>
            )}
          </p>
          {progress && progress.total > 0 && <ProgressBar p={progress} />}
          {nextKid ? (
            <button type="button" className="dp-next" onClick={() => onSelect(nextKid.id)}>
              <span className="dp-next-label">Next step</span>
              <span className="dp-next-title">{nextKid.title}</span>
              <span className="mono dp-next-id">{spokeId(nextKid.id)}</span>
            </button>
          ) : (
            n.is_next && (
              <div className="dp-next here">
                <span className="dp-next-label">Next step</span>
                <span className="dp-next-title">This is the next step</span>
              </div>
            )
          )}
          {actions ? actions(n) : standardActions(n)}
          {detail.error && <p className="warn">{detail.error}</p>}
          {n.waiting_on !== null && (
            <div className="callout question">
              <strong>Waiting on you:</strong> {n.waiting_on}
            </div>
          )}
          {n.stalled && (
            <div className="callout alert">
              Stalled: the claim by {n.claimed_by ?? "an agent"} expired
              {n.claim_expires ? ` ${at(n.claim_expires)}` : ""}.
            </div>
          )}
          <dl className="fields">
            <Row label="Kind">
              {n.kind}
              {n.ordered ? ", ordered steps" : ""}
            </Row>
            {n.focus !== null && <Row label="Focus">#{n.focus} on the focus list</Row>}
            {n.is_step && !n.is_next && <Row label="Step">a step of an ordered parent</Row>}
            {n.due && (
              <Row label="Due">
                <span className="mono">{formatDate(n.due)}</span>
                {due === "overdue" && <span className="tag alert">overdue</span>}
                {due === "today" && <span className="tag due">today</span>}
              </Row>
            )}
            {n.defer_until && (
              <Row label="Deferred until">
                <span className="mono">{formatDate(n.defer_until)}</span>
                {!n.deferred && <span className="muted"> (no longer deferred)</span>}
              </Row>
            )}
            {n.claimed_by && (
              <Row label="Claimed by">
                {n.claimed_by}
                {n.claim_expires ? `, lease until ${at(n.claim_expires)}` : ""}
              </Row>
            )}
            {n.answered && <Row label="Answered">yes; ready for an agent to claim</Row>}
            {n.repeat && <Row label="Repeats">{n.repeat}</Row>}
            <Row label="Beneath">
              <span className="mono">{n.child_count}</span> direct,{" "}
              <span className="mono">{n.descendant_count}</span> in all
              {n.closed_child_count > 0 ? (
                <>
                  , <span className="mono">{n.closed_child_count}</span> closed children
                </>
              ) : (
                ""
              )}
            </Row>
            {n.unplanned && <Row label="Unplanned">no children and no notes yet</Row>}
            <Row label="Created">
              <span className="mono">{at(n.created_at)}</span>
            </Row>
            <Row label="Updated">
              <span className="mono">{at(n.updated_at)}</span>
            </Row>
            <Row label="Touched">
              <span className="mono">{at(n.touched_at)}</span>
            </Row>
          </dl>
          {markers(n, day).length > 0 && (
            <p className="marker-list">
              {markers(n, day).map((m) => (
                <span key={m.key} className={`chip ${m.cls}`}>
                  {m.glyph} {m.title}
                </span>
              ))}
            </p>
          )}
          {shown.length > 0 && (
            <>
              <h3>Children</h3>
              <ul className="dp-children">
                {shown.map((k) => (
                  <li key={k.id}>
                    <button type="button" onClick={() => onSelect(k.id)}>
                      <span className={`status-dot s-${k.status}`} aria-hidden="true" />
                      <span className="dp-child-title">{k.title}</span>
                      <span className={`status-text s-${k.status}`}>{STATUS_LABEL[k.status]}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {more > 0 && <p className="muted small">+{more} more</p>}
            </>
          )}
          <h3>Notes</h3>
          {detail.loading && !detail.data ? (
            <p className="muted">Loading…</p>
          ) : notes ? (
            <pre className="notes">{notes}</pre>
          ) : (
            <p className="muted">No notes.</p>
          )}
          <h3>Recent events</h3>
          {detail.data && detail.data.events.length > 0 ? (
            <ol className="events">
              {detail.data.events.map((e) => (
                <li key={e.id}>
                  <time dateTime={e.at}>{at(e.at)}</time> <span className="ev-type">{e.type}</span>
                  {e.agent ? <span className="muted"> by {e.agent}</span> : null}
                  {e.detail ? <div className="ev-detail">{localizeTimes(e.detail, tz)}</div> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">{detail.data ? "No events." : "…"}</p>
          )}
          <p className="muted small">Times in {tz}.</p>
        </>
      )}
    </>
  );
}
