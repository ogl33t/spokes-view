import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { AreaItem, Sidebar, VIEWS, ViewIcon, type SidebarProps } from "./Sidebar";

export interface ShellProps {
  /** The sidebar; on phones its fields also drive the top bar, area chips and tab bar. */
  sidebar: SidebarProps;
  /** The page's own view; Shell wraps it in `<main>`, so do not render another. */
  main: ReactNode;
  /** The details panel, or null when nothing is selected. */
  panel: ReactNode | null;
  /** The page title in the phone top bar ("To do", an area or a project). */
  phoneTitle: string;
}

const PHONE_QUERY = "(max-width: 760px)";

function subscribePhone(onChange: () => void): () => void {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", onChange);
  return () => {
    mq.removeEventListener("change", onChange);
  };
}

function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The focusable elements inside `root` that are actually on screen. */
function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) =>
    el.checkVisibility({ checkVisibilityCSS: true }),
  );
}

/** "Home · updated 4:12 PM" from the server name and the refresh caption. */
function phoneCaption(server: string | null | undefined, caption: string): string {
  const updated = caption.charAt(0).toLowerCase() + caption.slice(1);
  return [server, updated].filter((s) => s).join(" · ");
}

function MenuIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

/** The phone tab bar: the same views and links as the sidebar. */
function TabBar({
  view,
  links,
  inert,
}: Pick<SidebarProps, "view" | "links"> & { inert: boolean }): ReactElement {
  return (
    <nav className="shell-tabs" aria-label="View" inert={inert}>
      {VIEWS.map(({ view: v, label }) => {
        const href = links[v];
        if (href === null) {
          return (
            <span key={v} className="shell-tab" aria-disabled="true">
              <ViewIcon view={v} />
              {label}
            </span>
          );
        }
        return (
          <a
            key={v}
            className={`shell-tab ${v === view ? "on" : ""}`}
            href={href}
            aria-current={v === view ? "page" : undefined}
          >
            <ViewIcon view={v} />
            {label}
          </a>
        );
      })}
    </nav>
  );
}

/**
 * The page frame. Desktop: sidebar | main | docked panel. Phone (≤ 760px): top bar,
 * area chips, main, the panel as a bottom sheet and a tab bar; the sidebar becomes a
 * drawer and find opens as an overlay.
 */
export function Shell({ sidebar, main, panel, phoneTitle }: ShellProps): ReactElement {
  const phone = useIsPhone();
  const [drawerWanted, setDrawerWanted] = useState(false);
  const [findWanted, setFindWanted] = useState(false);
  const drawerOpen = phone && drawerWanted;
  const findOpen = phone && findWanted;
  const covered = drawerOpen || findOpen;

  const drawer = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const findButton = useRef<HTMLButtonElement>(null);
  const findLayer = useRef<HTMLDivElement>(null);

  // Opening the drawer moves focus into it; closing it returns focus to the menu button.
  useEffect(() => {
    if (!drawerOpen) return;
    const root = drawer.current;
    if (root) focusables(root)[0]?.focus();
    const opener = menuButton.current;
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [drawerOpen]);

  // The find overlay focuses its input; closing it returns focus to the find button.
  useEffect(() => {
    if (!findOpen) return;
    findLayer.current?.querySelector<HTMLInputElement>("input")?.focus();
    const opener = findButton.current;
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [findOpen]);

  const closeDrawer = () => {
    setDrawerWanted(false);
  };
  const closeFind = () => {
    setFindWanted(false);
  };

  // Keep Tab inside the open drawer; Escape closes it.
  const onDrawerKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!drawerOpen || !drawer.current) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeDrawer();
      return;
    }
    if (e.key !== "Tab") return;
    const items = focusables(drawer.current);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const at = document.activeElement;
    if (e.shiftKey && (at === first || !drawer.current.contains(at))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Following a link or picking an area in the drawer is done with the drawer.
  const onDrawerClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!drawerOpen) return;
    if (e.target instanceof Element && e.target.closest("a[href], .side-area")) closeDrawer();
  };

  const classes = [
    "shell",
    panel ? "has-panel" : "",
    drawerOpen ? "drawer-open" : "",
    findOpen ? "find-open" : "",
  ].join(" ");

  return (
    <div className={classes}>
      <header className="shell-top" inert={covered}>
        <button
          ref={menuButton}
          type="button"
          className="shell-icon"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          aria-controls="shell-drawer"
          onClick={() => {
            setDrawerWanted(true);
          }}
        >
          <MenuIcon />
        </button>
        <div className="shell-title">
          <span className="shell-title-text">{phoneTitle}</span>
          <span className="shell-caption">
            {phoneCaption(sidebar.serverName, sidebar.refresh.caption)}
          </span>
        </div>
        <button
          ref={findButton}
          type="button"
          className="shell-icon"
          aria-label="Find"
          onClick={() => {
            setFindWanted(true);
          }}
        >
          <SearchIcon />
        </button>
      </header>

      {sidebar.areas.length > 0 && (
        <div className="shell-chips" role="group" aria-label="Areas" inert={covered}>
          {sidebar.areas.map((area) => (
            <AreaItem key={area.id} area={area} className="shell-chip" />
          ))}
        </div>
      )}

      <div
        id="shell-drawer"
        ref={drawer}
        className="shell-side"
        role={drawerOpen ? "dialog" : undefined}
        aria-modal={drawerOpen ? true : undefined}
        aria-label={drawerOpen ? "Menu" : undefined}
        inert={findOpen}
        onKeyDown={onDrawerKey}
        onClick={onDrawerClick}
      >
        <button
          type="button"
          className="shell-icon shell-drawer-close"
          aria-label="Close menu"
          onClick={closeDrawer}
        >
          <CloseIcon />
        </button>
        <Sidebar {...sidebar} />
      </div>
      <div className="shell-backdrop" hidden={!drawerOpen} onClick={closeDrawer} />

      <main className="shell-main" inert={covered}>
        {main}
      </main>

      {panel && (
        <div className="shell-panel" inert={covered}>
          {panel}
        </div>
      )}

      <TabBar view={sidebar.view} links={sidebar.links} inert={covered} />

      {findOpen && (
        <div
          className="shell-find"
          onKeyDown={(e) => {
            // the find box handles (and marks) its own Escape; this covers the Cancel button
            if (e.key === "Escape" && !e.defaultPrevented) closeFind();
          }}
        >
          <div className="shell-find-backdrop" onClick={closeFind} />
          <div
            ref={findLayer}
            className="shell-find-bar"
            role="dialog"
            aria-label="Find"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) closeFind();
            }}
          >
            {sidebar.find}
            <button type="button" className="btn shell-find-cancel" onClick={closeFind}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
