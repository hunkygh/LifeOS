# Edge Functions Mapping (Calendar-First Migration)

## Primary

### `supabase/functions/chat`
- **Status:** Active, primary orchestration endpoint.
- **Role:** parse message -> stage proposal card -> approve/modify -> execute.
- **Default execution:** Google Calendar create/update (`mode=calendar_description`).
- **Optional execution:** explicit ClickUp task mode (`mode=clickup_task`) after calendar success.
- **Response contract:** backward compatible (`message`, `metaResponse`, `actionNeeded`) with additive metadata (`executionMode`, IDs, `partialSuccess`).

### `supabase/functions/document-sync`
- **Status:** Active.
- **Role:** workspace-level document triage and placement.

### `supabase/functions/sync-clickup`
- **Status:** Active (metadata only).
- **Role:** sync workspace -> space -> list structure for optional task mode and settings UX.

### `supabase/functions/archive-events`
- **Status:** Active if used by artifacts/history UX.

## Deprecated (Stage A)
These functions now return `{ deprecated: true, replacement: "chat" }`:
- `multi-task`
- `comprehensive-multi-task`
- `chat-workflow`
- `chat-workflow-test`
- `clean-workflow-test`
- `cross-space-sanity-check`
- `unlimited-cross-space`
- `execute-clickup-action`

## Migration guardrails
- `CALENDAR_FIRST_ENABLED=true` enables new path.
- `CLICKUP_TASK_MODE_ENABLED=true` allows explicit task mode.
- Rollback safety: disable calendar-first and keep proposal-only responses while endpoint stays live.
