import { describe, expect, it } from "vitest";
import {
  coerceV2NoteSchema,
  fallbackV2NoteFromRawNote,
  formatCommentBody,
  prepareCommentWrite,
  validateV2NoteSchema,
} from "../v2NoteSchema";
import { V2_FROZEN_MANIFEST } from "../v2Manifest";

const UGLY_REAL_NOTES = [
  "spoke w mike @ acme. likes it but needs to check w ops. call me thurs after 3. 7205550199",
  "vm left for jen. budget froze till april. ping friday 11ish if she doesn't text back. 303 555 8821",
  "met dan in parking lot lol not ready. ask in 2 wks. use cell 8015551212 not office",
  "sara / bluepeak - gatekeeper said call back after 4:30, owner traveling, maybe monday. 9705554433",
  "tony no answer x2. texted 'call tomorrow'. think his number is 602-555-1009. wants 2 trucks maybe",
];

describe("v2 note schema", () => {
  it("uses the frozen manifest default target", () => {
    const note = fallbackV2NoteFromRawNote("left vm for a prospect");
    expect(note.target_id).toBe(V2_FROZEN_MANIFEST.default_target_task_id);
  });

  it("runs 5 ugly real notes through the schema", () => {
    for (const rawNote of UGLY_REAL_NOTES) {
      const note = coerceV2NoteSchema({ raw_note: rawNote });
      const validation = validateV2NoteSchema(note);
      const prepared = prepareCommentWrite(note);

      expect(note.raw_note).toBeTruthy();
      expect(note.summary).toBeTruthy();
      expect(note.target_id).toBe(V2_FROZEN_MANIFEST.default_target_task_id);
      expect(note.confidence).toBeGreaterThan(0);
      expect(validation.issues).toEqual([]);
      expect(prepared.ok).toBe(true);
      expect(prepared.commentText).not.toContain("Summary:");
    }
  });

  it("flags missing callback time for callback-shaped notes", () => {
    const note = coerceV2NoteSchema({
      raw_note: "call him back",
      note_type: "callback",
      callback_time: null,
    });

    expect(note.missing_fields).toContain("callback_time");
  });

  it("formats a stable comment body", () => {
    const note = coerceV2NoteSchema({
      raw_note: "vm left for jen call friday 11ish 3035558821",
      note_type: "voicemail",
      callback_time: "friday 11ish",
      phone: "3035558821",
      summary: "Left voicemail for Jen and should retry Friday at 11ish.",
    });

    expect(formatCommentBody(note)).toContain("Left voicemail for Jen and should retry Friday at 11ish.");
    expect(formatCommentBody(note)).toContain("Follow up: friday 11ish.");
    expect(formatCommentBody(note)).not.toContain("Note type:");
  });
});
