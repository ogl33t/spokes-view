import type { ReactElement } from "react";

/** The Spokes mark: a hub with a ring of eight short spokes. Decorative. */
export function HubMark(): ReactElement {
  const nubs = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <svg className="hub-mark" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      {nubs.map((deg) => (
        <rect
          key={deg}
          x="9"
          y="0.5"
          width="2"
          height="3.5"
          rx="1"
          fill="var(--accent)"
          transform={`rotate(${deg} 10 10)`}
        />
      ))}
      <circle cx="10" cy="10" r="4.5" fill="var(--accent)" />
    </svg>
  );
}
