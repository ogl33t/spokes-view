import type { ReactElement, ReactNode } from "react";
import { dueState, formatDate, formatInstant, markers, spokeId, STATUS_LABEL } from "./format";
import type { NodeResponse, ViewNode } from "./types";
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
  fromTree: ViewNode | undefined;
  timeZone: string;
  today: string;
  onClose: () => void;
  onSelect: (id: number) => void;
  /** Buttons shown under the title, for the node on show. */
  actions?: (n: ViewNode) => ReactNode;
}

interface PanelProps extends Omit<DetailsProps, "actions"> {
  expanded: boolean;
  onToggle: (id: number) => void;
  /** The server shown, for the links to a node's backlog and kanban pages. */
  server: string;
}

function Row({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** The side panel beside the graph. */
export function DetailPanel(props: PanelProps): ReactElement {
  const { expanded, onToggle, server, ...rest } = props;
  return (
    <aside className="panel details" aria-label="Node details">
      <NodeDetails
        {...rest}
        actions={(n) => (
          <ViewLinks server={server} node={n}>
            {n.child_count > 0 && (
              <button type="button" className="btn" onClick={() => onToggle(n.id)}>
                {expanded ? "Collapse branch" : `Expand branch (${n.descendant_count} beneath)`}
              </button>
            )}
          </ViewLinks>
        )}
      />
    </aside>
  );
}

/** Path, fields, notes and events of one node: the body of the panel and the modal. */
export function NodeDetails(props: DetailsProps): ReactElement {
  const { detail, fromTree, timeZone, today, onClose, onSelect, actions } = props;
  const n: ViewNode | undefined = detail.data?.node ?? fromTree;
  const notes = detail.data?.node.notes ?? null;
  const path = detail.data?.path ?? [];
  const tz = detail.data?.time_zone ?? timeZone;
  const day = detail.data?.today ?? today;
  const at = (iso: string) => formatInstant(iso, tz);
  const due = n ? dueState(n, day) : null;

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
            <span className={`status-dot s-${n.status}`} aria-hidden="true" />
            {n.title}
          </h2>
          <p className="ids">
            <span className="mono">{spokeId(n.id)}</span> · {n.kind}
            {n.ordered ? " · ordered steps" : ""} ·{" "}
            <span className={`status-text s-${n.status}`}>{STATUS_LABEL[n.status]}</span>
          </p>
          {actions?.(n)}
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
            {n.effective_priority !== null && (
              <Row label="Priority">
                {n.priority !== null
                  ? `level ${n.priority}`
                  : `level ${n.effective_priority} (inherited)`}
              </Row>
            )}
            {n.focus !== null && <Row label="Focus">#{n.focus} on the focus list</Row>}
            {n.is_next && <Row label="Next step">the actionable step of its ordered parent</Row>}
            {n.is_step && !n.is_next && <Row label="Step">a step of an ordered parent</Row>}
            {n.due && (
              <Row label="Due">
                {formatDate(n.due)}
                {due === "overdue" && <span className="tag alert">overdue</span>}
                {due === "today" && <span className="tag due">today</span>}
              </Row>
            )}
            {n.defer_until && (
              <Row label="Deferred until">
                {formatDate(n.defer_until)}
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
            {n.progress && (
              <Row label="Progress">
                {n.progress.done} of {n.progress.total} steps done
              </Row>
            )}
            <Row label="Beneath">
              {n.child_count} direct, {n.descendant_count} in all
              {n.closed_child_count > 0 ? `, ${n.closed_child_count} closed children` : ""}
            </Row>
            {n.unplanned && <Row label="Unplanned">no children and no notes yet</Row>}
            <Row label="Created">{at(n.created_at)}</Row>
            <Row label="Updated">{at(n.updated_at)}</Row>
            <Row label="Touched">{at(n.touched_at)}</Row>
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
