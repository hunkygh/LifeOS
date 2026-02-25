# Edge Function Mapping to LifeOS Execution Rules

## Edge Function: `supabase/functions/chat/index.ts`
**Current Behavior:**
- Accepts chat payloads, parsers for user message, detects life area, runs task intelligence and resolver flows, creates or updates ClickUp tasks through `executeWorkoutPlan`, and stores messages/artifacts in Supabase.
- Handles configuration prompts when ClickUp credentials, spaces, or lists are missing, including inline form submissions.
- Applies heuristics for matching requests to life areas and builds inline actions.

**Required Changes for New Rules:**
- Replace heuristic plan creation with `createExecutionPlan`, `approvePlan`, and `executePlan` from `executionRules.ts`, ensuring all plans are staged (`approved = false`) before ClickUp calls and only executed after approval.
- Validate Intents/Plans/Artifacts using the new data contracts before processing and after execution to prevent malformed data in workflows.
- Introduce explicit StructureMissing handling by calling `structureMissingPlan` when resolver cannot find a target, stage that plan, and present it in the inline card for approval.
- Ensure mutations (create/update tasks) are deferred until a `PlanApproved` event is emitted, and log artifacts using `executePlan` output (with `status`, timestamps, and the clickup response structure).
- Emit semantic resolution metadata (target IDs) through the resolution point objects to feed `createExecutionPlan`, honoring the rules that mutations reference IDs only.

**Inputs / Outputs:**
- **Inputs:** chat message, optional metadata (selected life area/list IDs, inline fields, conversation_id, user override fields). Must now include enriched resolution data (target IDs, intent metadata) for creating plans.
- **Outputs:** assistant message, actionNeeded inline cards, saved chat messages, Supabase artifact records, ClickUp API mutations triggered by `executePlan`.

**Dependencies / Notes:**
- Depends on `executionRules.ts`, `dataContracts.ts`, `domainInvariants.ts`, and the existing ClickUp helper functions (e.g., `executeWorkoutPlan` needs to be refactored or wrapped to run after plan approval). 
- Inline approvals should update the plan’s `approved` flag before `executePlan` executes the ClickUp calls, and artifact logging should include plan/intent references for traceability.
- Maintain compatibility with the UI’s expectation that action cards surface plan summaries and require approval before change.

## Edge Function: `supabase/functions/sync-clickup/index.ts`
**Current Behavior:**
- Calls ClickUp API using the service role key to pull workspaces, spaces, and lists, creating/updating Supabase tables `clickup_workspaces`, `clickup_spaces`, `life_areas`, and `clickup_lists`.
- Ensures each space is linked to a `life_area` row and inherits instructions/context, then stores metadata for later use in chat flows.
- Triggered manually from the settings panel and runs on-demand with CORS support.

**Required Changes for New Rules:**
- After syncing, emit a resolved state flag (e.g., set `workspace_synced = true`) so that `ensureWorkspaceSyncedBeforeResolver` sees it and prevents target resolution before sync.
- Populate the data contracts (Intent/ExecutionPlan targets) by saving canonical IDs (workspaces/spaces/lists) to the sync tables so the chat edge function can build resolution points without heuristics.
- Record any missing lists/spaces detected during sync to allow the `StructureMissing` flow to propose them for creation.
- Provide metadata describing which targets were refreshed, so artifacts reference the latest IDs and help audit `PlanStaged` transitions.

**Inputs / Outputs:**
- **Inputs:** HTTP request (no body required), ClickUp API key (CLICKUP_API_KEY env), Supabase service key, optional workspace filter.
- **Outputs:** JSON success/failure, updated Supabase tables with workspace/space/list metadata, flagging for downstream resolution logic.

**Dependencies / Notes:**
- Depends on `supabase/functions/lib/clickup-sync.ts`, which must remain aligned with new data contracts (IDs only) and the execution state machine’s requirement that resolution occurs only after sync.
- Consider extending the response to include summary metadata (counts per space) so the front-end can display sync freshness, enabling the invariant that workspace sync precedes target resolution.
