import { describe, expect, it } from "vitest";
import {
  buildListConfigFromForm,
  goalsToText,
  parseGoalsText,
} from "../listConfig";

describe("listConfig contract", () => {
  it("parses typed goals from text", () => {
    const parsed = parseGoalsText("protein|170|daily\ncalls|25|weekly");
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ metric: "protein", target: 170, period: "daily" });
  });

  it("builds config from form payload", () => {
    const result = buildListConfigFromForm(
      "protein|170|daily",
      JSON.stringify({
        execution: { due_date_policy: "required" },
        naming: { max_words: 7, max_chars: 28 },
        description: { mode: "detailed", include_source: false },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.execution.due_date_policy).toBe("required");
    expect(result.value.naming.max_words).toBe(7);
    expect(result.value.description.mode).toBe("detailed");
    expect(result.value.goals[0].metric).toBe("protein");
  });

  it("rejects invalid preferences json", () => {
    const result = buildListConfigFromForm("protein|170|daily", "{invalid");
    expect(result.ok).toBe(false);
  });

  it("formats goals back to editable text", () => {
    const output = goalsToText([{ metric: "revenue", target: 10000, period: "monthly" }]);
    expect(output).toContain("revenue|10000|monthly");
  });
});
