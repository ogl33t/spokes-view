import type { ReactElement } from "react";
import { STAGE_LABEL, TYPE_LABEL, stageOf, typeOf } from "./format";
import type { ViewNode } from "./types";

/** The node's type and stage as chips; nothing when neither is set. */
export function TypeStageChips({ node }: { node: ViewNode }): ReactElement | null {
  const type = typeOf(node);
  const stage = stageOf(node);
  if (type === null && stage === null) return null;
  return (
    <>
      {type !== null && (
        <span className={`chip type-chip t-${type}`} title={`Type: ${TYPE_LABEL[type]}`}>
          {TYPE_LABEL[type]}
        </span>
      )}
      {stage !== null && (
        <span className="chip stage-chip" title={`Stage: ${STAGE_LABEL[stage]}`}>
          {STAGE_LABEL[stage]}
        </span>
      )}
    </>
  );
}
