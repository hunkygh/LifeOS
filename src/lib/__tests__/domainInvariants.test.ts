import { describe, it, expect } from 'vitest'
import {
  ensurePlanStagedBeforeApproval,
  ensureWorkspaceSyncedBeforeResolver,
  ensureEntityIdsAvailable,
  InvariantViolation
} from '../domainInvariants'
import { LifeOSState, LifeOSEvent } from '../lifeosStateMachine'

const baseContext = {
  state: LifeOSState.PlanStaged,
  workspaceId: 'workspace_a',
  intentId: 'intent_a',
  userId: 'user_a',
}

describe('domain invariant guards', () => {
  it('requires workspace sync before resolver', () => {
    expect(() =>
      ensureWorkspaceSyncedBeforeResolver({ ...baseContext, workspaceId: undefined }, LifeOSEvent.Resolver)
    ).toThrow(InvariantViolation)
    expect(() =>
      ensureWorkspaceSyncedBeforeResolver({ ...baseContext, workspaceId: 'ws' }, LifeOSEvent.Resolver)
    ).not.toThrow()
  })

  it('requires plan staged before approval', () => {
    expect(() =>
      ensurePlanStagedBeforeApproval({ ...baseContext, state: LifeOSState.IntentParsed }, LifeOSEvent.PlanApproved)
    ).toThrow(/staged/)
    expect(() =>
      ensurePlanStagedBeforeApproval(baseContext, LifeOSEvent.PlanApproved)
    ).not.toThrow()
  })

  it('requires IDs for mutations', () => {
    const contextWithoutIds = { ...baseContext, workspaceId: undefined, planId: undefined }
    expect(() =>
      ensureEntityIdsAvailable(contextWithoutIds as any, LifeOSEvent.PlanCreated)
    ).toThrow(/Workspace ID/)
    expect(() =>
      ensureEntityIdsAvailable({ ...baseContext, planId: 'plan' }, LifeOSEvent.PlanCreated)
    ).not.toThrow()
  })
})
