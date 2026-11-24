import type { ReactElement, ReactNode } from "react";
import { HubMark } from "./HubMark";

export type ViewName = "tree" | "backlog" | "kanban";

export interface AppBarProps {
  place: ReactNode;
  view: ViewName;
  links: { tree: string; backlog: string; kanban: string | null };
  actions?: ReactNode;
  refresh: { onClick: () => void; busy: boolean; disabled: boolean; caption: string };
}

const VIEWS: readonly { view: ViewName; label: string }[] = [
  { view: "tree", label: "Tree" },
  { view: "backlog", label: "Backlog" },
  { view: "kanban", label: "Kanban" },
];

function RefreshIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.6-5.9" strokeLinecap="round" />
      <path d="M20 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The header shared by the tree, backlog and kanban pages. */
export function AppBar({ place, view, links, actions, refresh }: AppBarProps): ReactElement {
  return (
    <header className="bar">
      <a className="brand" href={links.tree}>
        <HubMark />
        <span className="wordmark">Spokes view</span>
      </a>
      <div className="bar-strip">
        <div className="bar-place">{place}</div>
        {actions && <div className="bar-actions">{actions}</div>}
      </div>
      <nav className="view-switch" aria-label="View">
        {VIEWS.map(({ view: v, label }) => {
          const href = links[v];
          if (href === null) return null;
          return (
            <a key={v} href={href} aria-current={v === view ? "page" : undefined}>
              {label}
            </a>
          );
        })}
      </nav>
      <div className="bar-refresh">
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
        <span className="updated" aria-live="polite">
          {refresh.caption}
        </span>
      </div>
    </header>
  );
}
