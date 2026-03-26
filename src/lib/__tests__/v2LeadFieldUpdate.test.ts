import { describe, expect, it } from "vitest";
import { fallbackV2ExtractedNote } from "../v2ExtractedNote";
import { prepareLeadFieldUpdates } from "../v2LeadFieldUpdate";
import { coerceV2NoteSchema } from "../v2NoteSchema";

describe("v2 lead field update preparation", () => {
  it("skips unconfigured but safe lead fields deterministically", () => {
    const rawNote = "Spoke with Jim at Acme. He uses Clover and has 3 locations. Call 303-555-0101.";
    const note = coerceV2NoteSchema({ raw_note: rawNote });
    const extracted = fallbackV2ExtractedNote(rawNote, note);
    const prepared = prepareLeadFieldUpdates(extracted);

    expect(prepared.skipped).toContain("pos_system_needs_review");
    expect(prepared.updates.some((update) => update.field === "phone")).toBe(true);
    expect(prepared.updates.some((update) => update.field === "owner_names")).toBe(false);
  });

  it("writes owner name only from explicit owner evidence", () => {
    const explicitRawNote = "Spoke with owner Mike at Mike's Pizza.";
    const explicitNote = coerceV2NoteSchema({ raw_note: explicitRawNote });
    const explicitExtracted = fallbackV2ExtractedNote(explicitRawNote, explicitNote);
    const explicitPrepared = prepareLeadFieldUpdates(explicitExtracted);

    expect(explicitPrepared.updates.some((update) => update.field === "owner_names")).toBe(true);

    const ambiguousRawNote = "Spoke with Todd at Mike's Pizza.";
    const ambiguousNote = coerceV2NoteSchema({ raw_note: ambiguousRawNote });
    const ambiguousExtracted = fallbackV2ExtractedNote(ambiguousRawNote, ambiguousNote);
    const ambiguousPrepared = prepareLeadFieldUpdates(ambiguousExtracted);

    expect(ambiguousPrepared.updates.some((update) => update.field === "owner_names")).toBe(false);
  });

  it("blocks ambiguous phone and tentative pos updates", () => {
    const rawNote = "Spoke with Jim at Acme. Maybe Clover. Use 303-555-0101 or 720-555-0199.";
    const note = coerceV2NoteSchema({ raw_note: rawNote });
    const extracted = fallbackV2ExtractedNote(rawNote, note);
    const prepared = prepareLeadFieldUpdates(extracted);

    expect(prepared.updates).toEqual([]);
    expect(prepared.skipped).toContain("phone_needs_review");
    expect(prepared.skipped).toContain("pos_system_needs_review");
  });

  it("only writes best time to contact when the note states it explicitly", () => {
    const rawNote = "Spoke with Jim at Acme. Best time to reach him is after 4pm.";
    const note = coerceV2NoteSchema({ raw_note: rawNote });
    const extracted = fallbackV2ExtractedNote(rawNote, note);
    const prepared = prepareLeadFieldUpdates(extracted);

    expect(prepared.updates.some((update) => update.field === "best_time_to_contact")).toBe(true);
  });
});
