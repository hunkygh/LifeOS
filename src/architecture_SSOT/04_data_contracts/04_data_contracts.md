# LifeOS Data Contracts (Calendar-First)

## CalendarEventPlanSchema
```ts
{
  version: 'v1',
  mode: 'calendar_description' | 'clickup_task',
  event: {
    title: string,
    description: string,
    start: string, // ISO
    end: string,   // ISO
    recurrence: string | null,
    timezone: string,
  },
  clickup?: {
    spaceId: string | null,
    listId: string | null,
    title: string,
    description: string,
    start: string,
    end: string,
    recurrence: string | null,
  },
  metadata: {
    confidence: number,
    requiresClarification: boolean,
    sourceIntent: string,
  }
}
```

## TaskModeSchema
```ts
{
  enabled: boolean,
  explicit: boolean,
  listId: string | null,
  spaceId: string | null
}
```

## ExecutionResultSchema
```ts
{
  executionMode: 'calendar_description' | 'clickup_task',
  calendarEventId: string,
  clickupTaskId?: string | null,
  partialSuccess: boolean,
  stage?: string,
  reason?: string
}
```

## Backward compatibility
- `POST /functions/v1/chat` request shape remains unchanged.
- Response keeps `message`, `metaResponse`, and `actionNeeded`.
- New fields are additive only.
