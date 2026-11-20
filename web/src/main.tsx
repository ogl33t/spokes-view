import { StrictMode, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { backlogRootFrom } from "./backlog";
import { BacklogApp } from "./BacklogApp";
import { kanbanRootFrom } from "./kanban";
import { KanbanApp } from "./KanbanApp";
import "./styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("missing #root");

/** The page the query string asks for: a backlog, a kanban board, or the graph. */
function page(search: string): ReactElement {
  const server = new URLSearchParams(search).get("server");
  const backlog = backlogRootFrom(search);
  if (backlog !== null) return <BacklogApp server={server} rootId={backlog} />;
  const board = kanbanRootFrom(search);
  if (board !== null) return <KanbanApp server={server} rootId={board} />;
  return <App />;
}

createRoot(el).render(<StrictMode>{page(window.location.search)}</StrictMode>);
