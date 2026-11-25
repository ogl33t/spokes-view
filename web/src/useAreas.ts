import { useEffect, useState } from "react";
import { fetchTree } from "./api";
import { slotAt } from "./areas";
import { ROOT_ID } from "./treeStore";

export interface AreaEntry {
  id: number;
  title: string;
  slot: number;
  count: number;
}

/** The root's areas with their colour slot and size; empty until loaded or on failure. */
export function useAreas(server: string | null): AreaEntry[] {
  const [areas, setAreas] = useState<AreaEntry[]>([]);

  useEffect(() => {
    if (!server) return;
    const ctl = new AbortController();
    fetchTree(server, { root: ROOT_ID, depth: 1, includeClosed: false }, null, ctl.signal)
      .then((r) => {
        if (!r.data) return;
        const kids = r.data.nodes.filter((n) => n.parent === ROOT_ID && n.kind === "area");
        setAreas(
          kids.map((n, i) => ({
            id: n.id,
            title: n.title,
            slot: slotAt(i),
            count: n.descendant_count,
          })),
        );
      })
      .catch(() => {
        // The area list is decoration; leave it empty.
      });
    return () => ctl.abort();
  }, [server]);

  return server ? areas : [];
}
