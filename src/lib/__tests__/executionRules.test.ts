import { describe, it, expect } from 'vitest'
import {
  createExecutionPlan,
  approvePlan,
  executePlan,
  structureMissingPlan,
} from '../executionRules'
import { exampleIntent } from '../dataContracts'

const resolution = {
  workspaceId: 'ws1',
  spaceId: 'space1',
  listId: 'list1',
  targetId: 'task123',
}

describe('execution rules helpers', () => {
  it('creates plan from intent and resolution', () => {
    const plan = createExecutionPlan(exampleIntent, resolution, [{ type: 'updateTask' }])
    expect(plan.approved).toBe(false)
    expect(plan.targetId).toBe(resolution.targetId)
  })

  it('requires workspace and target ids', () => {
    expect(() => createExecutionPlan(exampleIntent, { ...resolution, targetId: '' }, [])).toThrow()
  })

  it('approves staging plan', () => {
    const plan = createExecutionPlan(exampleIntent, resolution, [{ type: 'updateTask' }])
    const approved = approvePlan(plan)
    expect(approved.approved).toBe(true)
  })

  it('executes approved plan creating artifact', () => {
    let plan = createExecutionPlan(exampleIntent, resolution, [{ type: 'updateTask' }])
    plan = approvePlan(plan)
    const artifact = executePlan(plan, { status: 'ok' })
    expect(artifact.planId).toBe(plan.planId)
    expect(artifact.status).toBe('success')
  })

  it('throws when executing unapproved plan', () => {
    const plan = createExecutionPlan(exampleIntent, resolution, [{ type: 'updateTask' }])
    expect(() => executePlan(plan, {})).toThrow(/approved/)
  })

  it('builds structure missing plan', () => {
    const missing = structureMissingPlan(resolution)
    expect(missing.actions[0]).toHaveProperty('type', 'create_structure')
  })
})
