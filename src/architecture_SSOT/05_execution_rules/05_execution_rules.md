# LifeOS Execution Rules (Calendar-First)

## Default mode
1. Normalize message into `CalendarEventPlanSchema`.
2. Stage proposal card.
3. On approve, execute Google Calendar create/update.
4. Publish confirmation receipt.

## Explicit ClickUp mode
1. Execute default calendar flow first.
2. Create ClickUp task using approved list/space and timing.
3. Patch calendar description with task link.
4. If ClickUp step fails, return partial success.

## Failure semantics
- Calendar failure: retry 3x with exponential backoff; if exhausted return deterministic error envelope.
- ClickUp failure in explicit mode: never rollback calendar event.

## Idempotency
- Approval execution requires a stable idempotency key.
- Repeated approval returns existing mapping, not duplicate resources.
