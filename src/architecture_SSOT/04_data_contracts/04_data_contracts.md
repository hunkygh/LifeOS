LifeOS Data Contracts

Overview:
Defines structured schemas for all major data objects in LifeOS.

Intent Schema:
```
import { z } from "zod";

export const IntentSchema = z.object({
  operationType: z.enum(["create","update","delete","move","create_structure"]),
  targetEntity: z.enum(["task","doc","list","space","folder"]),
  userId: z.string(),
  workspaceId: z.string(),
  metadata: z.object({
    date: z.string(),
    time: z.string(),
    extraFields: z.any(),
  }),
  semanticFeatures: z.object({
    keywords: z.array(z.string()),
    intentSummary: z.string(),
  }),
});
```

Example JSON Intent:
```
{
  "operationType": "update",
  "targetEntity": "task",
  "userId": "user_abc",
  "workspaceId": "workspace_xyz",
  "metadata": { "date": "2026-02-19", "time": "10:00", "extraFields": { "notes": "Reschedule" } },
  "semanticFeatures": { "keywords": ["meeting","demo"], "intentSummary": "Reschedule Soda Shack meeting" }
}
```

ExecutionPlan Schema:
```
export const ExecutionPlanSchema = z.object({
  planId: z.string(),
  intentId: z.string(),
  targetId: z.string(),
  approved: z.boolean(),
  actions: z.array(z.any()),
});
```

Artifact Schema:
```
export const ArtifactSchema = z.object({
  artifactId: z.string(),
  intentId: z.string(),
  planId: z.string(),
  executionPayload: z.any(),
  clickupResponse: z.any(),
  timestamp: z.string(),
  status: z.enum(["success","failure"]),
});
```

Sample Codex Prompts:
1. "Generate Zod schemas for LifeOS Intent, ExecutionPlan, and Artifact."
2. "Write sample JSON objects matching 04_data_contracts.md."
3. "Create TypeScript validators and tests for contracts."
