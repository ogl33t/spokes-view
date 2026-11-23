// Shapes of the Spokes read-only API (spokes `src/store/view.rs`, passed through by the
// spokes-view backend unchanged) and of the backend's own server list and errors.

export type Status = "open" | "in_progress" | "waiting" | "done" | "dropped";
export type Kind = "area" | "task";
export type NodeType = "bug" | "feature" | "chore" | "idea" | "epic";
export type Stage =
  | "idea"
  | "backlog"
  | "brainstormed"
  | "understood"
  | "planned"
  | "in_progress"
  | "in_review"
  | "done";

export interface Crumb {
  id: number;
  title: string;
}

export interface ViewNode {
  id: number;
  parent: number | null;
  kind: Kind;
  ordered: boolean;
  title: string;
  status: Status;
  /** Absent on servers older than Spokes 0.4.0. */
  type?: NodeType | null;
  stage?: Stage | null;
  priority: number | null;
  effective_priority: number | null;
  focus: number | null;
  due: string | null;
  defer_until: string | null;
  deferred: boolean;
  claimed_by: string | null;
  claim_expires: string | null;
  stalled: boolean;
  waiting_on: string | null;
  answered: boolean;
  repeat: string | null;
  has_notes: boolean;
  unplanned: boolean;
  is_step: boolean;
  is_next: boolean;
  progress: { done: number; total: number } | null;
  created_at: string;
  updated_at: string;
  touched_at: string;
  child_count: number;
  descendant_count: number;
  closed_child_count: number;
  children_loaded: boolean;
}

export interface Meta {
  rev: number;
  version: string;
  time_zone: string;
  today: string;
}

export interface TreeResponse extends Meta {
  root: number;
  depth: number;
  include_closed: boolean;
  node_limit: number;
  path: Crumb[];
  truncated: boolean;
  nodes: ViewNode[];
}

export interface SpokeEvent {
  id: number;
  at: string;
  agent: string | null;
  type: string;
  detail: string | null;
}

export interface NodeResponse extends Meta {
  path: Crumb[];
  node: ViewNode & { notes: string | null };
  events: SpokeEvent[];
}

export type ServerStatus = "ok" | "unreachable" | "too_old" | "error";

export interface ServerEntry {
  name: string;
  status: ServerStatus;
  version: string | null;
  message: string | null;
}

export type ErrorCode =
  | "bad_request"
  | "unknown_server"
  | "not_found"
  | "unreachable"
  | "too_old"
  | "upstream_error"
  | "network";
