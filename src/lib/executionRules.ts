import { randomUUID } from "crypto"
import { Intent, ExecutionPlan, validateExecutionPlan, validateIntent, validateArtifact, Artifact } from "./dataContracts"

export interface ResolutionPoint {
  workspaceId: string
  spaceId: string
  listId: string
  targetId: string
}

export function createExecutionPlan(
  intent: Intent,
  resolution: ResolutionPoint,
  actions: Array<Record<string, unknown>>
): ExecutionPlan {
  validateIntent(intent)
  if (!resolution.targetId || !resolution.workspaceId) {
    throw new Error("Resolution must include workspace and target IDs")
  }
  const plan: ExecutionPlan = {
    planId: `plan_${randomUUID()}`,
    intentId: intent.userId ? `${intent.userId}_${Date.now()}` : `intent_${Date.now()}`,
    targetId: resolution.targetId,
    approved: false,
    actions,
  }
  return validateExecutionPlan(plan)
}

export function approvePlan(plan: ExecutionPlan): ExecutionPlan {
  if (plan.approved) {
    return plan
  }
  const approvedPlan: ExecutionPlan = { ...plan, approved: true }
  return validateExecutionPlan(approvedPlan)
}

export function executePlan(plan: ExecutionPlan, clickupResponse: unknown): Artifact {
  if (!plan.approved) {
    throw new Error("Plan must be approved before execution")
  }
  const artifact: Artifact = {
    artifactId: `artifact_${randomUUID()}`,
    intentId: plan.intentId,
    planId: plan.planId,
    executionPayload: plan,
    clickupResponse,
    timestamp: new Date().toISOString(),
    status: clickupResponse ? "success" : "failure",
  }
  return validateArtifact(artifact)
}

export function structureMissingPlan(resolution: ResolutionPoint): ExecutionPlan {
  const proposal: ExecutionPlan = {
    planId: `plan_missing_${randomUUID()}`,
    intentId: `intent_missing_${Date.now()}`,
    targetId: resolution.targetId,
    approved: false,
    actions: [
      {
        type: "create_structure",
        target: {
          workspaceId: resolution.workspaceId,
          spaceId: resolution.spaceId,
          listId: resolution.listId,
        },
      },
    ],
  }
  return validateExecutionPlan(proposal)
}
