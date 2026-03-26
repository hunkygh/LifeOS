import { describe, expect, it } from "vitest";
import { fallbackV2ExtractedNote } from "../v2ExtractedNote";
import { mapExtractedNoteToV2ActionPlan } from "../v2IntentMapper";
import { coerceV2NoteSchema } from "../v2NoteSchema";
import { V2_FROZEN_MANIFEST } from "../v2Manifest";

describe("v2 intent mapper", () => {
  it("maps a meeting note into comment + linked task actions", () => {
    const rawNote =
      "Meeting with La Tienda today at 2pm. Will be talking to them about the main store as well as the shuttle business.";
    const structured = coerceV2NoteSchema({ raw_note: rawNote });
    const extracted = fallbackV2ExtractedNote(rawNote, structured);
    const plan = mapExtractedNoteToV2ActionPlan(extracted, structured);

    expect(plan.actions.map((action) => action.type)).toEqual([
      "write_comment",
      "create_follow_up_task",
    ]);
    const taskAction = plan.actions[1];
    expect(taskAction.type).toBe("create_follow_up_task");
    if (taskAction.type === "create_follow_up_task") {
      expect(taskAction.payload.list_id).toBe(V2_FROZEN_MANIFEST.execution_list_id);
      expect(taskAction.payload.title).toContain("La Tienda");
    }
  });

  it("maps a question note into comment + assigned comment when no task should be created", () => {
    const rawNote = "Not sure if Acme is on Clover or Toast. Need to ask Grant before I follow up?";
    const structured = coerceV2NoteSchema({ raw_note: rawNote, note_type: "unknown" });
    const extracted = fallbackV2ExtractedNote(rawNote, structured);
    const plan = mapExtractedNoteToV2ActionPlan(extracted, structured);

    expect(plan.actions.map((action) => action.type)).toEqual([
      "write_comment",
      "write_assigned_comment",
    ]);
  });

  it("does not turn tentative timing into an assigned-comment action", () => {
    const rawNote =
      "Called Lola's Street Kitchen today to try and reach David Medina (owner), they said he'd be in tomorrow. Call back around noon, probably like 10am?";
    const structured = coerceV2NoteSchema({ raw_note: rawNote, note_type: "callback" });
    const extracted = fallbackV2ExtractedNote(rawNote, structured);
    const plan = mapExtractedNoteToV2ActionPlan(extracted, structured);

    expect(plan.actions.map((action) => action.type)).toEqual([
      "write_comment",
      "create_follow_up_task",
    ]);
  });
});
