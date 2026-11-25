import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { findNodes, parseSpokeId } from "./find";
import { spokeId, STATUS_LABEL } from "./format";
import type { ViewNode } from "./types";

export interface FindBoxProps {
  /** The loaded nodes to search; called on each keystroke. */
  nodes: () => Iterable<ViewNode>;
  onJump: (id: number) => void;
  /** Focus the input on mount (the phone find overlay). */
  autoFocus?: boolean;
}

type Hit = { kind: "node"; node: ViewNode } | { kind: "jump"; id: number };

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

function SearchIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" strokeLinecap="round" />
    </svg>
  );
}

/** Typing targets where `/` is text, not the find shortcut. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Whether the input is on screen; a hidden copy (closed drawer) must not take the shortcut. */
function isShown(el: HTMLElement): boolean {
  return el.checkVisibility({ checkVisibilityCSS: true });
}

/** The hits for a query: loaded matches, led by "Jump to SPOKE-N" when that id is not loaded. */
function hitsFor(query: string, nodes: () => Iterable<ViewNode>): Hit[] {
  if (query.trim() === "") return [];
  const found: Hit[] = findNodes(query, nodes()).map((node) => ({ kind: "node", node }));
  const id = parseSpokeId(query);
  const loaded = found[0]?.kind === "node" && found[0].node.id === id;
  return id !== null && !loaded ? [{ kind: "jump", id }, ...found] : found;
}

/** Find a loaded item by title or id, or jump to any SPOKE-N. ⌘K / Ctrl+K and `/` focus it. */
export function FindBox({ nodes, onJump, autoFocus }: FindBoxProps): ReactElement {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const hits = hitsFor(query, nodes);
  const open = focused && query.trim() !== "";
  const current = Math.min(active, hits.length - 1);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const el = input.current;
      if (!el || e.defaultPrevented) return;
      const chord = (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k";
      const slash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditable(e.target);
      if (!(chord || slash) || !isShown(el)) return;
      e.preventDefault();
      el.focus();
      el.select();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const choose = (hit: Hit) => {
    onJump(hit.kind === "jump" ? hit.id : hit.node.id);
    setQuery("");
    setActive(0);
    input.current?.blur();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (hits.length === 0) return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((Math.max(current, 0) + step + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      const hit = hits[current];
      if (!hit) return;
      e.preventDefault();
      choose(hit);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (query !== "") {
        setQuery("");
        setActive(0);
      } else {
        input.current?.blur();
      }
    }
  };

  const optionId = (i: number) => `${listId}-${i}`;

  return (
    <div className={`find ${open ? "open" : ""}`}>
      <label className="find-field">
        <SearchIcon />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-label="Find"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && current >= 0 ? optionId(current) : undefined}
          placeholder="Find or jump to SPOKE-N"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
          }}
        />
        <kbd className="find-key" aria-hidden="true">
          {IS_MAC ? "⌘K" : "Ctrl K"}
        </kbd>
      </label>
      <div className="find-pop" hidden={!open}>
        <ul id={listId} role="listbox" aria-label="Matches">
          {hits.map((hit, i) => (
            <li
              key={hit.kind === "jump" ? "jump" : hit.node.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === current}
              className="find-hit"
              // keep focus in the input so the list stays open through the click
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onMouseMove={() => {
                if (i !== current) setActive(i);
              }}
              onClick={() => {
                choose(hit);
              }}
            >
              {hit.kind === "jump" ? (
                <>
                  <span className="find-hit-title">Jump to {spokeId(hit.id)}</span>
                  <span className="find-hit-id">not loaded</span>
                </>
              ) : (
                <>
                  <span
                    className="find-dot"
                    style={{ background: `var(--${hit.node.status.replace("_", "-")})` }}
                    title={STATUS_LABEL[hit.node.status]}
                  />
                  <span className="find-hit-title">{hit.node.title}</span>
                  <span className="find-hit-id">{spokeId(hit.node.id)}</span>
                </>
              )}
            </li>
          ))}
        </ul>
        {hits.length === 0 && <p className="find-empty">No loaded item matches.</p>}
        <p className="find-note">Searches loaded items</p>
      </div>
    </div>
  );
}
