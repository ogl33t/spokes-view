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
        Legend
        <svg className="chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M2.5 7.5 6 4l3.5 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
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
              <svg width="28" height="16" aria-hidden="true">
                <rect
                  className="legend-pill"
                  x="1"
                  y="2"
                  width="26"
                  height="12"
                  rx="6"
                  style={{ fill: "var(--area-1)" }}
                />
              </svg>
              area, in its colour (never finishes)
            </li>
            <li>
              <svg width="16" height="16" aria-hidden="true">
                <circle className="legend-track" cx="8" cy="8" r="5.5" />
                <circle
                  className="legend-arc"
                  cx="8"
                  cy="8"
                  r="5.5"
                  transform="rotate(-90 8 8)"
                  strokeDasharray="13 35"
                />
              </svg>
              has steps: the green arc is the share done
            </li>
            <li>
              <svg width="16" height="16" aria-hidden="true">
                <circle className="legend-shape s-open" cx="8" cy="8" r="4.5" />
              </svg>
              task, coloured by status
            </li>
            <li>
              <svg width="16" height="16" aria-hidden="true">
                <circle className="prio p1 own" cx="8" cy="8" r="6.5" />
                <circle className="legend-shape s-open" cx="8" cy="8" r="3.5" />
              </svg>
              priority ring (levels below)
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
                <circle className="legend-shape s-open deferred" cx="8" cy="8" r="4.5" />
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
