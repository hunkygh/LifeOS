# LifeOS Master Spec
Version: 1.0  
Last Updated: 2026-02-21  
Status: Active SSOT (Product + Logic + Integration)

## Migration Status (2026-02-26)
- Active migration mode: **Google Calendar-first** (`chat` endpoint unchanged).
- Default approved plan execution: Google Calendar create/update.
- ClickUp task mutation: explicit mode only (`clickup_task`).
- Legacy task-staging edge functions are deprecated and mapped to `chat`.
- See `src/architecture_SSOT/*` for canonical state/event/contracts.

## 1) Product Scope
LifeOS is a single-tenant orchestration app (one operator/user) with:
- Natural-language chat UX.
- Staged action cards before any mutation.
- ClickUp as the operational system of record for tasks/lists/spaces.
- Supabase as backend runtime (DB, edge functions, secrets).
- Artifact logging for all approved mutations.

Out of scope (for now):
- Multi-tenant auth/RLS complexity.
- Autonomous agent loops.
- Auto-approval rules (future).

## 2) UX Contract
### 2.1 Core Loop
`message -> intent -> target resolution -> staged plan card -> user approval -> execute -> artifact`

### 2.2 Chat Response Modes
- `informational`: orientation, query, summary (no mutation).
- `clarification`: missing input or ambiguity.
- `staged_plan`: actionable mutation proposed, waiting for approval.
- `execution_result`: mutation executed; includes summary and result.
- `error`: deterministic error with actionable next step.

### 2.3 Action Card Types (minimal set)
- `setup`
- `configuration`
- `plan`
- `clarification`
- `error`

All mutating operations must surface a `plan` card first.

## 3) Runtime Architecture
### 3.1 Components
- Frontend (Vite/React): chat + settings + approval UI.
- Edge functions:
  - `chat`: intent, resolver, plan staging, approved execution, artifacts.
  - `sync-clickup`: workspace/space/list sync into Supabase.
- Supabase DB: life areas, clickup workspaces/spaces/lists, chat history, artifacts.
- External APIs: ClickUp + Groq.

### 3.2 Secrets Boundary
- Browser only uses `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
- ClickUp/Groq/service-role keys stay server-side only (edge secrets/env).
- No API secrets in frontend payloads.

## 4) State and Execution Rules
Canonical progression:
- `Idle`
- `IntentParsed`
- `TargetResolved`
- `PlanStaged`
- `Executed`
- `ArtifactLogged`

Required invariants:
1. No ClickUp mutation before approval.
2. Mutations use IDs, not names.
3. Successful mutation must create artifact.
4. Workspace sync required before target resolution.
5. Missing structure branches to `StructureMissing` proposal path.
6. Resolver behavior must be semantic/deterministic (no brittle hardcoded domain switches in execution paths).
7. Update vs create endpoint must match intended action.

## 5) Resolver Design (Current Implementation Target)
### 5.1 Resolver Constraints
- No scoring/ranking algorithm in this phase.
- Deterministic routing only.
- Zero behavioral expansion beyond staged-loop stability.

### 5.2 Deterministic Target Resolution Order
For life area:
1. Direct life area name mention.
2. Deterministic keyword-hint rule match.
3. Fallback to General.
4. Fallback to first configured area.

For list:
1. Explicit preferred list name from message.
2. Direct mention of list title/name.
3. First valid list with `clickup_list_id`.
4. If none: `StructureMissing`/configuration card.

## 6) Chat Logic (Detailed)
### 6.1 Input Handling
- Accept message + optional metadata.
- Normalize text.
- Build intent payload.
- Build resolution point payload (workspace/space/list/target placeholders if unresolved).

### 6.2 Plan Staging
- Build execution plan object.
- If mutation required and not yet approved:
  - Create action card `type: "plan"`.
  - Return proposed summary + target metadata.

### 6.3 Approval Gate
- Approved only via explicit UI signal (`inline_fields` approval marker or equivalent).
- If not approved, do not call ClickUp mutation endpoints.

### 6.4 Execution
- On approval:
  - Resolve target list from plan metadata.
  - Execute create/update workflow via ClickUp IDs.
  - Capture response payload.

### 6.5 Artifact Logging
- Persist artifact row with:
  - user_id
  - list_id
  - status (`success`/`failure`)
  - request_payload
  - response_payload
  - summary/error
  - task id/url when available

## 7) ClickUp Integration Contract
### 7.1 Sync Responsibilities (`sync-clickup`)
- Fetch teams/workspaces.
- Fetch spaces.
- Fetch lists.
- Upsert into:
  - `clickup_workspaces`
  - `clickup_spaces`
  - `life_areas` (mapping/metadata)
  - `clickup_lists`

### 7.2 Mutation Responsibilities (`chat`)
- Create list (if needed and approved) via space ID.
- Create task via list ID.
- Update task via task ID.
- Create subtasks via parent task ID.

### 7.3 Non-Negotiable
- Every mutating endpoint call must use canonical IDs from resolved data.
- Never mutate by text-name lookup alone.

## 8) Data Contract Summary
Core objects:
- `Intent`
- `ExecutionPlan`
- `Artifact`
- `ActionCard`

Validation:
- Runtime checks at edge boundary before execution.
- Reject malformed plan/action payloads.

## 9) Error Handling Contract
- Return structured JSON errors.
- No silent failures.
- Typical categories:
  - missing configuration
  - unresolved target
  - approval missing
  - external API failure
  - schema mismatch

Error responses must include enough context for UI to render a next-step action.

## 10) Current Build Priorities
1. Stabilize `message -> staged plan -> approve -> execute -> artifact` loop.
2. Keep resolver deterministic and minimal.
3. Harden ClickUp sync schema compatibility.
4. Expand action contracts/tests before adding advanced resolver behavior.

## 11) Traceability to Existing Docs
This master spec consolidates and supersedes overlapping guidance from:
- `LOGIC_ARCHITECTURE.md`
- `APP_LOGIC_ARCHITECTURE.md`
- `EDGE_FUNCTIONS_MAPPING.md`
- `src/architecture_SSOT/*`

Keep those files for historical context; treat this file as the operational reference for current implementation decisions.
