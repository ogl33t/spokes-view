import type { ReactElement } from "react";
import { TypeIcon } from "./TypeIcon";
import { STAGE_LABEL, TYPE_LABEL, stageOf, typeOf } from "./format";
import type { NodeType, Stage, ViewNode } from "./types";

export function TypeChip({ type }: { type: NodeType }): ReactElement {
  return (
    <span className={`chip type-chip t-${type}`} title={`Type: ${TYPE_LABEL[type]}`}>
      <TypeIcon type={type} />
      {TYPE_LABEL[type]}
    </span>
  );
}

export function StageChip({ stage }: { stage: Stage }): ReactElement {
  return (
    <span className={`chip stage-chip st-${stage}`} title={`Stage: ${STAGE_LABEL[stage]}`}>
      {STAGE_LABEL[stage]}
    </span>
  );
}

/** The node's type and stage as chips; nothing when neither is set. */
export function TypeStageChips({ node }: { node: ViewNode }): ReactElement | null {
  const type = typeOf(node);
  const stage = stageOf(node);
  if (type === null && stage === null) return null;
  return (
    <>
      {type !== null && <TypeChip type={type} />}
      {stage !== null && <StageChip stage={stage} />}
    </>
  );
}
