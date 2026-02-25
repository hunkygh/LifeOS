import { LifeOSState, LifeOSEvent, LifeOSStateContext } from "./lifeosStateMachine"

class InvariantViolation extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvariantViolation"
  }
}

export function ensureWorkspaceSyncedBeforeResolver(
  context: LifeOSStateContext,
  event: LifeOSEvent,
  payload?: { workspaceId?: string }
) {
  if (
    event === LifeOSEvent.Resolver &&
    !context.workspaceId &&
    !payload?.workspaceId
  ) {
    throw new InvariantViolation(
      "Workspace must be synced before resolving targets."
    )
  }
}

export function ensurePlanStagedBeforeApproval(
  context: LifeOSStateContext,
  event: LifeOSEvent
) {
  if (
    event === LifeOSEvent.PlanApproved &&
    context.state !== LifeOSState.PlanStaged
  ) {
    throw new InvariantViolation("Plan must be staged before approval.")
  }
}

export function ensurePlanApprovedBeforeMutation(
  context: LifeOSStateContext,
  event: LifeOSEvent
) {
  if (
    [LifeOSEvent.ExecutionSucceeded, LifeOSEvent.ArtifactCreated].includes(
      event
    ) &&
    context.state !== LifeOSState.Executed
  ) {
    throw new InvariantViolation(
      "Plan must be approved and executed before ClickUp mutations."
    )
  }
}

export function ensureEntityIdsAvailable(
  context: LifeOSStateContext,
  event: LifeOSEvent,
  payload?: { workspaceId?: string; planId?: string }
) {
  const mutationEvents = [
    LifeOSEvent.PlanCreated,
    LifeOSEvent.PlanApproved,
    LifeOSEvent.ExecutionSucceeded,
  ]
  if (mutationEvents.includes(event)) {
    const workspaceId = payload?.workspaceId ?? context.workspaceId
    const planId = payload?.planId ?? context.planId
    if (!workspaceId) {
      throw new InvariantViolation("Workspace ID is required for mutations.")
    }
    if (!planId) {
      throw new InvariantViolation("Plan ID is required for mutations.")
    }
  }
}

export function ensureArtifactLoggedAfterMutation(
  context: LifeOSStateContext,
  event: LifeOSEvent
) {
  if (
    event === LifeOSEvent.ExecutionSucceeded &&
    context.lastEvent !== LifeOSEvent.ArtifactCreated
  ) {
    throw new InvariantViolation(
      "Artifact must be created immediately after execution."
    )
  }
}

export { InvariantViolation }
