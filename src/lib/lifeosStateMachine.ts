import { z } from "zod"
import {
  ensurePlanApprovedBeforeMutation,
  ensurePlanStagedBeforeApproval,
  ensureEntityIdsAvailable,
  ensureWorkspaceSyncedBeforeResolver,
  InvariantViolation,
} from "./domainInvariants"
import {
  Artifact,
  ExecutionPlan,
  Intent,
  validateArtifact,
  validateExecutionPlan,
  validateIntent,
} from "./dataContracts"

enum LifeOSState {
  Idle = "Idle",
  IntentParsed = "IntentParsed",
  TargetResolved = "TargetResolved",
  PlanStaged = "PlanStaged",
  Executed = "Executed",
  ArtifactLogged = "ArtifactLogged",
}

enum LifeOSEvent {
  UserInputReceived = "UserInputReceived",
  Resolver = "Resolver",
  PlanCreated = "PlanCreated",
  PlanApproved = "PlanApproved",
  ExecutionSucceeded = "ExecutionSucceeded",
  ExecutionFailed = "ExecutionFailed",
  StructureMissing = "StructureMissing",
  ArtifactCreated = "ArtifactCreated",
}

interface ProposedCreationPlan {
  planId: string
  summary: string
  details?: string[]
  target: {
    workspaceId: string
    spaceId: string
    listId: string
  }
  decision?: LifeOSEvent
}

interface LifeOSContext {
  state: LifeOSState
  intentId?: string
  userId?: string
  workspaceId?: string
  planId?: string
  structureMissingPlan?: ProposedCreationPlan
  lastEvent?: LifeOSEvent
}

const StateSchema = z.object({
  state: z.nativeEnum(LifeOSState),
  intentId: z.string().optional(),
  userId: z.string().optional(),
  workspaceId: z.string().optional(),
  planId: z.string().optional(),
  structureMissingPlan: z
    .object({
      planId: z.string(),
      summary: z.string(),
      details: z.array(z.string()).optional(),
      target: z.object({
        workspaceId: z.string(),
        spaceId: z.string(),
        listId: z.string(),
      }),
      decision: z.nativeEnum(LifeOSEvent).optional(),
    })
    .optional(),
  lastEvent: z.nativeEnum(LifeOSEvent).optional(),
})

type LifeOSStateContext = z.infer<typeof StateSchema>

const transitions: Record<LifeOSState, Partial<Record<LifeOSEvent, LifeOSState>>> = {
  [LifeOSState.Idle]: {
    [LifeOSEvent.UserInputReceived]: LifeOSState.IntentParsed,
  },
  [LifeOSState.IntentParsed]: {
    [LifeOSEvent.Resolver]: LifeOSState.TargetResolved,
  },
  [LifeOSState.TargetResolved]: {
    [LifeOSEvent.PlanCreated]: LifeOSState.PlanStaged,
  },
  [LifeOSState.PlanStaged]: {
    [LifeOSEvent.PlanApproved]: LifeOSState.Executed,
  },
  [LifeOSState.Executed]: {
    [LifeOSEvent.ExecutionSucceeded]: LifeOSState.ArtifactLogged,
  },
  [LifeOSState.ArtifactLogged]: {
    [LifeOSEvent.ArtifactCreated]: LifeOSState.Idle,
  },
}

interface TransitionPayload {
  intentId?: string
  userId?: string
  workspaceId?: string
  planId?: string
  structurePlan?: ProposedCreationPlan
  intent?: Intent
  plan?: ExecutionPlan
  artifact?: Artifact
}

class LifeOSStateMachine {
  private context: LifeOSStateContext

  constructor(initial?: Partial<LifeOSStateContext>) {
    this.context = StateSchema.parse({
      state: LifeOSState.Idle,
      ...initial,
    })
  }

  public get stateContext(): LifeOSStateContext {
    return { ...this.context }
  }

  public applyEvent(event: LifeOSEvent, payload?: TransitionPayload) {
    ensureWorkspaceSyncedBeforeResolver(this.context, event, payload)
    ensurePlanStagedBeforeApproval(this.context, event)
    ensurePlanApprovedBeforeMutation(this.context, event)
    ensureEntityIdsAvailable(this.context, event, payload)
    this.validateContracts(event, payload)
    switch (event) {
      case LifeOSEvent.StructureMissing:
        if (!payload?.structurePlan) {
          throw new Error("StructureMissing requires a proposed creation plan")
        }
        this.context = StateSchema.parse({
          ...this.context,
          state: LifeOSState.TargetResolved,
          structureMissingPlan: payload.structurePlan,
          lastEvent: event,
        })
        return
      case LifeOSEvent.ExecutionFailed:
        this.context = StateSchema.parse({
          ...this.context,
          state: LifeOSState.PlanStaged,
          lastEvent: event,
        })
        return
      default: {
        const targetMap = transitions[this.context.state] || {}
        const nextState = targetMap[event]
        if (!nextState) {
          throw new Error(
            `Invalid transition from ${this.context.state} via ${event}`
          )
        }
        this.context = StateSchema.parse({
          ...this.context,
          state: nextState,
          intentId: payload?.intentId ?? this.context.intentId,
          userId: payload?.userId ?? this.context.userId,
          workspaceId: payload?.workspaceId ?? this.context.workspaceId,
          planId: payload?.planId ?? this.context.planId,
          structureMissingPlan: nextState === LifeOSState.TargetResolved ? undefined : this.context.structureMissingPlan,
          lastEvent: event,
        })
      }
    }
  }

  public reset() {
    this.context = StateSchema.parse({
      state: LifeOSState.Idle,
    })
  }

  private validateContracts(event: LifeOSEvent, payload?: TransitionPayload) {
    if (payload?.intent) {
      validateIntent(payload.intent)
    }
    if (event === LifeOSEvent.PlanCreated) {
      if (!payload?.plan) {
        throw new Error("Execution plan required for PlanCreated")
      }
      validateExecutionPlan(payload.plan)
    }
    if (event === LifeOSEvent.ExecutionSucceeded) {
      if (!payload?.artifact) {
        throw new Error("Artifact required after execution")
      }
      validateArtifact(payload.artifact)
    }
  }
}

export {
  LifeOSState,
  LifeOSEvent,
  LifeOSStateMachine,
  StateSchema,
  LifeOSStateContext,
  ProposedCreationPlan,
}
