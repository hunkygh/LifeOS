import { describe, expect, it } from "vitest";
import { coerceV2NoteSchema } from "../v2NoteSchema";
import { fallbackV2ExtractedNote, validateV2ExtractedNote } from "../v2ExtractedNote";

describe("v2 extracted note", () => {
  it("extracts neutral facts and intents for a meeting note", () => {
    const rawNote =
      "Meeting with La Tienda today at 2pm. Will be talking to them about the main store as well as the shuttle business.";
    const note = coerceV2NoteSchema({ raw_note: rawNote });
    const extracted = fallbackV2ExtractedNote(rawNote, note);
    const validation = validateV2ExtractedNote(extracted);

    expect(extracted.facts.candidate_business_name).toBe("La Tienda");
    expect(extracted.facts.interaction_type).toBe("meeting");
    expect(extracted.facts.suggested_task_title).toBeTruthy();
    expect(extracted.intents.map((intent) => intent.type)).toContain("append_activity_log");
    expect(extracted.intents.map((intent) => intent.type)).toContain("create_lead");
    expect(extracted.intents.map((intent) => intent.type)).toContain("create_linked_task");
    expect(validation.valid).toBe(true);
  });

  it("marks multiple phone numbers for review", () => {
    const rawNote =
      "Spoke with Jim at Acme. Use 303-555-0101 for the store and 720-555-0199 for his cell. Maybe Clover.";
    const note = coerceV2NoteSchema({ raw_note: rawNote });
    const extracted = fallbackV2ExtractedNote(rawNote, note);

    expect(extracted.facts.candidate_phone_numbers).toEqual(["303-555-0101", "720-555-0199"]);
    expect(extracted.uncertainty.needs_review).toContain("multiple_phone_numbers");
    expect(extracted.uncertainty.tentative_fields).toContain("pos_system");
  });

  it("only extracts owner name from explicit ownership language", () => {
    const ambiguousRawNote = "Spoke with Todd at Mike's Pizza.";
    const ambiguousNote = coerceV2NoteSchema({ raw_note: ambiguousRawNote });
    const ambiguousExtracted = fallbackV2ExtractedNote(ambiguousRawNote, ambiguousNote);

    expect(ambiguousExtracted.facts.candidate_business_name).toBe("Mike's Pizza");
    expect(ambiguousExtracted.facts.candidate_contact_name).toBe("Todd");
    expect(ambiguousExtracted.facts.candidate_owner_name).toBeNull();

    const explicitRawNote = "Spoke with owner Mike at Mike's Pizza.";
    const explicitNote = coerceV2NoteSchema({ raw_note: explicitRawNote });
    const explicitExtracted = fallbackV2ExtractedNote(explicitRawNote, explicitNote);

    expect(explicitExtracted.facts.candidate_owner_name).toBe("Mike");
  });

  it("treats tentative timing as scheduling uncertainty, not a clarifying question", () => {
    const rawNote =
      "Called Lola's Street Kitchen today to try and reach David Medina (owner), they said he'd be in tomorrow. Call back around noon, probably like 10am?";
    const note = coerceV2NoteSchema({ raw_note: rawNote, note_type: "callback" });
    const extracted = fallbackV2ExtractedNote(rawNote, note);

    expect(extracted.intents.map((intent) => intent.type)).toContain("create_linked_task");
    expect(extracted.intents.map((intent) => intent.type)).not.toContain("ask_clarifying_question");
    expect(extracted.uncertainty.tentative_fields).toContain("timing");
  });

  it("extracts explicit multi-word owner names without turning them into lead identity", () => {
    const rawNote =
      "Called Lola's Street Kitchen today to try and reach David Medina (owner), they said he'd be in tomorrow.";
    const note = coerceV2NoteSchema({ raw_note: rawNote, note_type: "callback" });
    const extracted = fallbackV2ExtractedNote(rawNote, note);

    expect(extracted.facts.candidate_business_name).toBe("Lola's Street Kitchen");
    expect(extracted.facts.candidate_owner_name).toBe("David Medina");
  });

  it("trims scheduling words off the extracted business name", () => {
    const rawNote =
      "I need to swing by Parcerita Parillo Columbiana today to follow up at like 2pm";
    const note = coerceV2NoteSchema({ raw_note: rawNote, note_type: "follow_up" });
    const extracted = fallbackV2ExtractedNote(rawNote, note);

    expect(extracted.facts.candidate_business_name).toBe("Parcerita Parillo Columbiana");
    expect(extracted.facts.suggested_task_title).toContain("Parcerita Parillo Columbiana");
    expect(extracted.facts.suggested_task_title).not.toContain("today to follow");
  });

  it("treats add-as-lead phrasing as a contact lead instead of junk identity", () => {
    const rawNote =
      "I need to add Ryan Fritzche as a lead for Partnerships list. We had a call today with him.";
    const note = coerceV2NoteSchema({ raw_note: rawNote, note_type: "follow_up" });
    const extracted = fallbackV2ExtractedNote(rawNote, note);

    expect(extracted.facts.candidate_contact_name).toBe("Ryan Fritzche");
    expect(extracted.facts.candidate_business_name).toBeNull();
    expect(extracted.facts.suggested_task_title).toContain("Ryan Fritzche");
  });

  it("preserves plain-hour daytime timing instead of collapsing to day-only", () => {
    const rawNote =
      "I need to go and visit Side of Aloha today and see what system they're using, and try to find the right person. I'd say run it at around 3 today.";
    const note = coerceV2NoteSchema({ raw_note: rawNote, note_type: "follow_up" });
    const extracted = fallbackV2ExtractedNote(rawNote, note);

    expect(extracted.facts.candidate_business_name).toBe("Side of Aloha");
    expect(extracted.facts.timing).toBe("today at 3:00 PM");
    expect(extracted.facts.suggested_task_title).toContain("3:00 PM");
  });
});
