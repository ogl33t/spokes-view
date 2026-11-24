import type { ReactElement } from "react";
import { backlogUrl } from "./backlog";
import { kanbanUrl } from "./kanban";
import type { ViewNode } from "./types";

/**
 * Plain links to the backlog and kanban pages of a node with children. A click navigates
 * in the same tab; Cmd/middle-click or the browser's menu opens a new one.
 */
export function ViewLinks({
  server,
  node,
  children,
}: {
  server: string;
  node: ViewNode;
  children?: ReactElement | false;
}): ReactElement | null {
  if (node.child_count === 0 && !children) return null;
  return (
    <p className="actions">
      {children}
      {node.child_count > 0 && (
        <>
          <a className="btn" href={backlogUrl(server, node.id)}>
            Backlog
          </a>
          <a className="btn" href={kanbanUrl(server, node.id)}>
            Kanban
          </a>
        </>
      )}
    </p>
  );
}
