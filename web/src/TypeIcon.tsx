import type { ReactElement } from "react";
import type { NodeType } from "./types";

// Each icon is a few round-capped strokes on a 16x16 grid, so it stays legible at 12-14px.
const ICON_PATHS: Record<NodeType, ReactElement> = {
  bug: (
    <>
      <ellipse cx="8" cy="10" rx="3" ry="4" />
      <circle cx="8" cy="4.5" r="1.5" />
      <path d="M6.9 3.4 5.5 1.5M9.1 3.4l1.4-1.9" />
      <path d="M5 8 2.5 6.5M5 10.5H2M5 12.5l-2.5 1.5" />
      <path d="M11 8l2.5-1.5M11 10.5h3M11 12.5l2.5 1.5" />
    </>
  ),
  feature: <path d="M8 1.5Q8 8 14.5 8 8 8 8 14.5 8 8 1.5 8 8 8 8 1.5Z" />,
  // An open-end wrench drawn lying along the x axis, then turned to point up and right.
  chore: (
    <path
      transform="translate(10.3 5.7) rotate(-45)"
      d="M3.25-1.3H.6v2.6h2.65A3.5 3.5 0 0 1-3.21 1.4H-9a1.4 1.4 0 0 1 0-2.8h5.79A3.5 3.5 0 0 1 3.25-1.3Z"
    />
  ),
  idea: (
    <>
      <path d="M6 11v-.7C6 9.3 4 8.3 4 6a4 4 0 0 1 8 0c0 2.3-2 3.3-2 4.3v.7Z" />
      <path d="M6.5 13h3M7.25 14.75h1.5" />
    </>
  ),
  epic: (
    <>
      <path d="M1.5 14 6.5 6 9 10l1.5-2 4 6Z" />
      <path d="M6.5 6V1.5l3 1-3 1" />
    </>
  ),
};

/** A small line icon for a node's type, coloured by the surrounding text. */
export function TypeIcon({ type }: { type: NodeType }): ReactElement {
  return (
    <svg
      className={`type-icon ti-${type}`}
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICON_PATHS[type]}
    </svg>
  );
}
