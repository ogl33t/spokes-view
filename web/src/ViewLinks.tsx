import type { ReactElement, ReactNode } from "react";
import { backlogUrl } from "./backlog";
import { kanbanUrl } from "./kanban";
import type { ViewNode } from "./types";

/**
 * The actions row of a node: `lead` first (Focus branch, Show in tree), then plain links
 * to the backlog and kanban pages of a node with children, then `children` (Expand). A
 * click navigates in the same tab; Cmd/middle-click or the browser's menu opens a new one.
 */
export function ViewLinks({
  server,
  node,
  lead,
  children,
}: {
  server: string;
  node: ViewNode;
  lead?: ReactNode;
  children?: ReactNode;
}): ReactElement | null {
  const hasLinks = node.child_count > 0;
  if (!hasLinks && !lead && !children) return null;
  return (
    <p className="actions">
      {lead}
      {hasLinks && (
        <>
          <a className="btn" href={backlogUrl(server, node.id)}>
            Backlog
          </a>
          <a className="btn" href={kanbanUrl(server, node.id)}>
            Kanban
          </a>
        </>
      )}
      {children}
    </p>
  );
}
