# LifeOS State Model (Calendar-First)

## Canonical flow
1. `InputReceived`
2. `PlanStaged`
3. `PlanModified` (optional)
4. `PlanApproved`
5. `CalendarExecuted`
6. `OptionalTaskExecuted` (only in explicit task mode)
7. `ArtifactLogged`

## Transition rules
- `InputReceived -> PlanStaged`: message is normalized into a typed plan (`version=v1`).
- `PlanStaged -> PlanModified`: inline modify fields or natural-language modify request.
- `PlanStaged|PlanModified -> PlanApproved`: user approval only.
- `PlanApproved -> CalendarExecuted`: always; calendar is primary executor.
- `CalendarExecuted -> OptionalTaskExecuted`: only when `mode=clickup_task`.
- `CalendarExecuted|OptionalTaskExecuted -> ArtifactLogged`: persist receipt and IDs.

## Failure transitions
- Calendar failure: `PlanApproved -> PlanStaged` with structured error envelope.
- ClickUp failure after calendar success: state remains successful with `partialSuccess=true`.

## Non-goals in this state machine
- No implicit multi-action batching.
- No hidden fallback ontologies (no life-area routing).
