import { useState, type ReactElement } from "react";
import { MARKER_LEGEND, NODE_TYPES, STAGES, STAGE_LABEL, STATUS_LABEL, TYPE_LABEL } from "./format";
import { TypeIcon } from "./TypeIcon";
import type { Status } from "./types";

const STATUSES: Status[] = ["open", "in_progress", "waiting", "done", "dropped"];

export function Legend(): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <div className={`legend ${open ? "open" : ""}`}>
      <button
        type="button"
        className="btn legend-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Hide legend" : "Legend"}
      </button>
      {open && (
        <div className="legend-body">
          <h4>Status</h4>
          <ul>
            {STATUSES.map((s) => (
              <li key={s}>
                <svg width="16" height="16" aria-hidden="true">
                  <circle className={`legend-shape s-${s}`} cx="8" cy="8" r="6" />
                </svg>
                {STATUS_LABEL[s]}
              </li>
            ))}
          </ul>
          <h4>Type</h4>
          <ul>
            {NODE_TYPES.map((t) => (
              <li key={t}>
                <span className="legend-glyph" style={{ color: `var(--t-${t})` }}>
                  <TypeIcon type={t} />
                </span>
                {TYPE_LABEL[t]}
              </li>
            ))}
          </ul>
          <h4>Stage</h4>
          <ul>
            {STAGES.map((s) => (
              <li key={s}>
                <span className={`stage-dot st-${s}`} aria-hidden="true" />
                {STAGE_LABEL[s]}
              </li>
            ))}
          </ul>
          <h4>Shapes</h4>
          <ul>
            <li>
              <svg width="16" height="16" aria-hidden="true">
                <rect className="legend-shape s-open" x="2" y="2" width="12" height="12" rx="3" />
              </svg>
              area (never finishes)
            </li>
            <li>
              <svg width="16" height="16" aria-hidden="true">
                <circle className="legend-shape s-open" cx="8" cy="8" r="5" />
              </svg>
              task
            </li>
            <li>
              <svg width="16" height="16" aria-hidden="true">
                <circle className="legend-shape s-open" cx="8" cy="8" r="4" />
                <circle className="legend-halo" cx="8" cy="8" r="7" />
              </svg>
              collapsed, with <b>+N</b> hidden beneath
            </li>
            <li>
              <svg width="16" height="16" aria-hidden="true">
                <circle className="legend-shape s-open deferred" cx="8" cy="8" r="5" />
              </svg>
              faded: deferred
            </li>
          </ul>
          <h4>Priority ring</h4>
          <ul>
            {[1, 2, 3, 4].map((p) => (
              <li key={p}>
                <svg width="16" height="16" aria-hidden="true">
                  <circle className={`prio p${p} own`} cx="8" cy="8" r="6" />
                </svg>
                level {p}
              </li>
            ))}
            <li>
              <svg width="16" height="16" aria-hidden="true">
                <circle className="prio p2 inherited" cx="8" cy="8" r="6" />
              </svg>
              dashed: inherited
            </li>
          </ul>
          <h4>Markers</h4>
          <ul>
            {MARKER_LEGEND.map((m) => (
              <li key={m.key}>
                <span className={`marker ${m.cls} legend-glyph`}>{m.glyph}</span>
                {m.title}
              </li>
            ))}
            <li>
              <svg width="16" height="16" aria-hidden="true">
                <circle className="alert-dot" cx="8" cy="8" r="4" />
              </svg>
              red dot: needs you (question, stalled, overdue)
            </li>
          </ul>
          <p className="small muted">
            Click a node for details. Click its +/− badge, double-click, or press Space to expand or
            collapse.
          </p>
        </div>
      )}
    </div>
  );
}
