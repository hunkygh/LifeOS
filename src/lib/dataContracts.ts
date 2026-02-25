import { z } from "zod"

export const IntentSchema = z.object({
  operationType: z.enum(["create", "update", "delete", "move", "create_structure"]),
  targetEntity: z.enum(["task", "doc", "list", "space", "folder"]),
  userId: z.string(),
  workspaceId: z.string(),
  metadata: z.object({
    date: z.string(),
    time: z.string(),
    extraFields: z.any().optional(),
  }),
  semanticFeatures: z.object({
    keywords: z.array(z.string()),
    intentSummary: z.string(),
  }),
})

export type Intent = z.infer<typeof IntentSchema>

export const ExecutionPlanSchema = z.object({
  planId: z.string(),
  intentId: z.string(),
  targetId: z.string(),
  approved: z.boolean(),
  actions: z.array(z.any()),
})

export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>

export const ArtifactSchema = z.object({
  artifactId: z.string(),
  intentId: z.string(),
  planId: z.string(),
  executionPayload: z.any(),
  clickupResponse: z.any(),
  timestamp: z.string(),
  status: z.enum(["success", "failure"]),
})

export type Artifact = z.infer<typeof ArtifactSchema>

export const exampleIntent: Intent = {
  operationType: "update",
  targetEntity: "task",
  userId: "user_abc",
  workspaceId: "workspace_xyz",
  metadata: { date: "2026-02-19", time: "10:00", extraFields: { notes: "Reschedule" } },
  semanticFeatures: { keywords: ["meeting", "demo"], intentSummary: "Reschedule Soda Shack meeting" },
}

export const edgeCaseIntent: Intent = {
  operationType: "create_structure",
  targetEntity: "space",
  userId: "user_edge",
  workspaceId: "workspace_xyz",
  metadata: { date: "2026-02-20", time: "18:00", extraFields: { urgency: "high" } },
  semanticFeatures: { keywords: ["new space", "events"], intentSummary: "Spin up new events space" },
}

export const sampleExecutionPlan: ExecutionPlan = {
  planId: "plan_123",
  intentId: "intent_123",
  targetId: "task_abc",
  approved: true,
  actions: [{ type: "update", field: "due_date", value: "2026-02-23" }],
}

export const sampleArtifact: Artifact = {
  artifactId: "artifact_1",
  intentId: "intent_123",
  planId: "plan_123",
  executionPayload: sampleExecutionPlan,
  clickupResponse: { status: 200, data: { id: "task_abc" } },
  timestamp: new Date().toISOString(),
  status: "success",
}

export function validateIntent(payload: unknown): Intent {
  return IntentSchema.parse(payload)
}

export function validateExecutionPlan(payload: unknown): ExecutionPlan {
  return ExecutionPlanSchema.parse(payload)
}

export function validateArtifact(payload: unknown): Artifact {
  return ArtifactSchema.parse(payload)
}
