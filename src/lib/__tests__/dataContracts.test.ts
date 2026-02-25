import { describe, it, expect } from 'vitest'
import {
  exampleIntent,
  edgeCaseIntent,
  sampleExecutionPlan,
  sampleArtifact,
  validateIntent,
  validateExecutionPlan,
  validateArtifact,
} from '../dataContracts'

describe('data contract validators', () => {
  it('accepts the example intent', () => {
    expect(() => validateIntent(exampleIntent)).not.toThrow()
  })

  it('accepts the edge case intent', () => {
    expect(() => validateIntent(edgeCaseIntent)).not.toThrow()
  })

  it('rejects missing intent fields', () => {
    expect(() => validateIntent({ ...exampleIntent, userId: undefined })).toThrow()
  })

  it('accepts execution plan schema', () => {
    expect(() => validateExecutionPlan(sampleExecutionPlan)).not.toThrow()
  })

  it('rejects plan without actions', () => {
    expect(() => validateExecutionPlan({ ...sampleExecutionPlan, actions: undefined })).toThrow()
  })

  it('accepts artifact schema and ensures timestamp formatting', () => {
    expect(() => validateArtifact(sampleArtifact)).not.toThrow()
  })

  it('rejects artifact missing status', () => {
    expect(() => validateArtifact({ ...sampleArtifact, status: undefined })).toThrow()
  })
})
