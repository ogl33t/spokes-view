import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react";

/** An action run on pick, or a link to another page (so it can open in a new tab too). */
export type MenuItem = { label: string; onPick: () => void } | { label: string; href: string };

interface Props {
  /** Where the menu opens, in viewport pixels. */
  x: number;
  y: number;
  heading: string;
  items: MenuItem[];
  onClose: () => void;
}

/**
 * A small menu at the pointer. Escape, a press elsewhere, scrolling, resizing or leaving
 * the window closes it; it moves left or up when it would run off the screen.
 */
export function ContextMenu({ x, y, heading, items, onClose }: Props): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = Math.max(4, Math.min(x, window.innerWidth - r.width - 4));
    const ny = Math.max(4, Math.min(y, window.innerHeight - r.height - 4));
    setPos({ x: nx, y: ny });
    el.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Close the menu only, not the detail panel behind it.
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const buttons = [...(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
        const i = buttons.indexOf(document.activeElement as HTMLElement);
        const step = e.key === "ArrowDown" ? 1 : -1;
        buttons[(i + step + buttons.length) % buttons.length]?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("wheel", onClose, { capture: true, passive: true });
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("wheel", onClose, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      aria-label={heading}
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="menu-head">{heading}</div>
      {items.map((item) =>
        "href" in item ? (
          <a key={item.label} role="menuitem" href={item.href} onClick={onClose}>
            {item.label}
          </a>
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              item.onPick();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
