import type { ReactElement, ReactNode } from "react";
import { HubMark } from "./HubMark";

export type ViewName = "tree" | "backlog" | "kanban";

export interface ViewLinkSet {
  tree: string;
  backlog: string;
  /** Null when the page has no board to link to; the Kanban entry is then disabled. */
  kanban: string | null;
}

/** One area in the sidebar and the phone chip row: a link (`href`) or a filter (`onPick`). */
export interface SidebarArea {
  id: number;
  title: string;
  /** Colour slot 1..6, drawn as `var(--area-N)`. */
  slot: number;
  count: number;
  href?: string;
  onPick?: () => void;
  active: boolean;
}

export interface RefreshControl {
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
  /** "Updated h:mm", or empty before the first load. */
  caption: string;
}

export interface SidebarProps {
  view: ViewName;
  links: ViewLinkSet;
  /** The find box (a `FindBox`). */
  find: ReactNode;
  areas: SidebarArea[];
  includeClosed: boolean;
  onToggleClosed: () => void;
  nextOnly: boolean;
  onToggleNext: () => void;
  /** The server picker. */
  server: ReactNode;
  /** The current server's name, for the phone caption ("Home · updated 4:12 PM"). */
  serverName?: string | null;
  refresh: RefreshControl;
}

export const VIEWS: readonly { view: ViewName; label: string }[] = [
  { view: "tree", label: "Tree" },
  { view: "backlog", label: "Backlog" },
  { view: "kanban", label: "Kanban" },
];

/** The icon for a view, shared by the sidebar and the phone tab bar. */
export function ViewIcon({ view }: { view: ViewName }): ReactElement {
  return (
    <svg
      className="view-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {view === "tree" && (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
        </>
      )}
      {view === "backlog" && <path d="M4 6h16M8 12h12M12 18h8" />}
      {view === "kanban" && (
        <>
          <rect x="3" y="4" width="5" height="16" rx="1" />
          <rect x="10" y="4" width="5" height="10" rx="1" />
          <rect x="17" y="4" width="4" height="13" rx="1" />
        </>
      )}
    </svg>
  );
}

function RefreshIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.6-5.9" strokeLinecap="round" />
      <path d="M20 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** An area as a link or a toggle button, with its colour swatch and count. */
export function AreaItem({
  area,
  className,
}: {
  area: SidebarArea;
  className: string;
}): ReactElement {
  const body = (
    <>
      <span className="area-swatch" style={{ background: `var(--area-${area.slot})` }} />
      <span className="area-title">{area.title}</span>
      <span className="area-count">{area.count}</span>
    </>
  );
  const cls = `${className} ${area.active ? "on" : ""}`;
  if (area.href !== undefined) {
    return (
      <a className={cls} href={area.href} aria-current={area.active ? "true" : undefined}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" className={cls} aria-pressed={area.active} onClick={area.onPick}>
      {body}
    </button>
  );
}

function SwitchRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <label className="side-switch">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        onChange={onToggle}
      />
    </label>
  );
}

/** The left sidebar shared by every page: brand, find, views, areas, show switches, server. */
export function Sidebar({
  view,
  links,
  find,
  areas,
  includeClosed,
  onToggleClosed,
  nextOnly,
  onToggleNext,
  server,
  refresh,
}: SidebarProps): ReactElement {
  return (
    <nav className="side" aria-label="Spokes">
      <a className="side-brand" href={links.tree}>
        <HubMark />
        <span className="wordmark">Spokes view</span>
      </a>

      <div className="side-find">{find}</div>

      <section className="side-section" aria-labelledby="side-views">
        <h2 id="side-views" className="side-heading">
          Views
        </h2>
        {VIEWS.map(({ view: v, label }) => {
          const href = links[v];
          if (href === null) {
            return (
              <span key={v} className="side-item" aria-disabled="true">
                <ViewIcon view={v} />
                {label}
              </span>
            );
          }
          return (
            <a
              key={v}
              className={`side-item ${v === view ? "on" : ""}`}
              href={href}
              aria-current={v === view ? "page" : undefined}
            >
              <ViewIcon view={v} />
              {label}
            </a>
          );
        })}
      </section>

      {areas.length > 0 && (
        <section className="side-section" aria-labelledby="side-areas">
          <h2 id="side-areas" className="side-heading">
            Areas
          </h2>
          {areas.map((area) => (
            <AreaItem key={area.id} area={area} className="side-item side-area" />
          ))}
        </section>
      )}

      <section className="side-section side-show" aria-labelledby="side-show">
        <h2 id="side-show" className="side-heading">
          Show
        </h2>
        <SwitchRow label="Closed items" checked={includeClosed} onToggle={onToggleClosed} />
        <SwitchRow label="Only what's next" checked={nextOnly} onToggle={onToggleNext} />
      </section>

      <div className="side-foot">
        <div className="side-server">
          <div className="side-picker">{server}</div>
          <button
            type="button"
            className={`icon-btn refresh ${refresh.busy ? "busy" : ""}`}
            aria-label="Refresh"
            title="Refresh"
            onClick={refresh.onClick}
            disabled={refresh.disabled}
          >
            <RefreshIcon />
          </button>
        </div>
        <p className="side-updated" aria-live="polite">
          {refresh.caption}
        </p>
      </div>
    </nav>
  );
}
