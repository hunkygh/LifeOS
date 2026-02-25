import { describe, expect, it } from "vitest"
import {
  buildSingleClarificationPrompt,
  computePlanConfidence,
  needsSingleClarification,
} from "../plannerConfidence"

describe("planner confidence fixtures", () => {
  it("accepts Chandler lead-style message shape without clarification", () => {
    const result = computePlanConfidence({
      decision: "create",
      structuredIntent: {
        entity_type: "lead",
        intent_actions: ["create", "follow_up"],
        primary_title: "Lead - Chandler Salisbury",
      },
      extracted: {
        dateRange: {},
      },
      targetListId: "list_pipeline_1",
    })

    expect(result.score).toBeGreaterThanOrEqual(0.65)
    expect(needsSingleClarification(result)).toBe(false)
  })

  it("requires clarification when event has no schedule", () => {
    const result = computePlanConfidence({
      decision: "create",
      structuredIntent: {
        entity_type: "event",
        intent_actions: ["create", "schedule"],
        primary_title: "Work - Training",
      },
      extracted: {
        dateRange: {},
      },
      targetListId: "list_calendar_1",
    })

    expect(needsSingleClarification(result)).toBe(true)
    expect(result.signals).toContain("missing_schedule")
    expect(buildSingleClarificationPrompt(result)).toContain("date and time")
  })

  it("requires clarification when target list is missing", () => {
    const result = computePlanConfidence({
      decision: "create",
      structuredIntent: {
        entity_type: "task",
        intent_actions: ["create"],
        primary_title: "Work - Follow up",
      },
      extracted: {
        dateRange: {},
      },
      targetListId: null,
    })

    expect(needsSingleClarification(result)).toBe(true)
    expect(result.signals).toContain("missing_target")
    expect(buildSingleClarificationPrompt(result)).toContain("Which list")
  })

  it("flags weak confirmation-only titles", () => {
    const result = computePlanConfidence({
      decision: "create",
      structuredIntent: {
        entity_type: "task",
        intent_actions: ["create"],
        primary_title: "yes add him",
      },
      extracted: {
        dateRange: {},
      },
      targetListId: "list_123",
    })

    expect(result.signals).toContain("unclear_title")
  })
})
