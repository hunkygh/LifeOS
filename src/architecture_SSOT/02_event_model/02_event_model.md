# LifeOS Event Model (Calendar-First)

## Core events
- `ChatMessageReceived`
- `PlanNormalized`
- `PlanStaged`
- `PlanModified`
- `PlanApproved`
- `CalendarCreateRequested`
- `CalendarCreateSucceeded`
- `CalendarCreateFailed`
- `ClickUpTaskRequested` (explicit mode only)
- `ClickUpTaskSucceeded`
- `ClickUpTaskFailed`
- `ReceiptPublished`

## Event payload requirements
- Every event carries `userId`, `proposalId`, `timestamp`.
- Execution events additionally carry deterministic `stage` and `reason` on failure.
- Approval event must include `idempotencyKey`.

## Ordering constraints
- `CalendarCreateRequested` is the first mutating event.
- `ClickUpTaskRequested` cannot fire before `CalendarCreateSucceeded`.
- `ReceiptPublished` fires exactly once per approved proposal.
