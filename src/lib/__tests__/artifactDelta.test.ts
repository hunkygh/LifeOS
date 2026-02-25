import { describe, expect, it } from "vitest"
import { computeGoalDeltas } from "../artifactDelta"

describe("artifact delta reducer", () => {
  it("aggregates daily metric updates", () => {
    const now = new Date("2026-02-23T18:00:00.000Z")
    const goals = [{ metric: "protein", target: 170, period: "daily" as const }]
    const artifacts = [
      {
        created_at: "2026-02-23T08:00:00.000Z",
        response_payload: { metric_updates: [{ metric: "protein", value: 45 }] },
      },
      {
        created_at: "2026-02-23T12:30:00.000Z",
        response_payload: { metric_updates: [{ metric: "protein", value: 60 }] },
      },
      {
        created_at: "2026-02-22T23:59:59.000Z",
        response_payload: { metric_updates: [{ metric: "protein", value: 30 }] },
      },
    ]

    const [delta] = computeGoalDeltas(goals, artifacts, now)
    expect(delta.actual).toBe(105)
    expect(delta.remaining).toBe(65)
  })

  it("aggregates weekly and monthly periods independently", () => {
    const now = new Date("2026-02-23T18:00:00.000Z")
    const goals = [
      { metric: "calls", target: 20, period: "weekly" as const },
      { metric: "revenue", target: 10000, period: "monthly" as const },
    ]
    const artifacts = [
      {
        created_at: "2026-02-23T10:00:00.000Z",
        request_payload: { metric_updates: [{ metric: "calls", value: 4 }] },
      },
      {
        created_at: "2026-02-20T10:00:00.000Z",
        request_payload: { metric_updates: [{ metric: "calls", value: 6 }] },
      },
      {
        created_at: "2026-02-01T10:00:00.000Z",
        request_payload: { metric_updates: [{ metric: "revenue", value: 3500 }] },
      },
    ]

    const [calls, revenue] = computeGoalDeltas(goals, artifacts, now)
    expect(calls.actual).toBe(4)
    expect(calls.remaining).toBe(16)
    expect(revenue.actual).toBe(3500)
    expect(revenue.remaining).toBe(6500)
  })
})
