import { V2_FROZEN_MANIFEST, getFrozenTarget, isAllowedFrozenTarget } from "./v2Manifest.ts";

export const V2_NOTE_TYPES = [
  "sales_note",
  "follow_up",
  "callback",
  "voicemail",
  "contact_update",
  "unknown",
] as const;

export type V2NoteType = (typeof V2_NOTE_TYPES)[number];

export type V2NoteSchema = {
  raw_note: string;
  note_type: V2NoteType;
  target_id: string;
  summary: string;
  callback_time: string | null;
  phone: string | null;
  confidence: number;
  missing_fields: string[];
};

export type V2NoteValidation = {
  valid: boolean;
  missing_fields: string[];
  issues: string[];
};

const CALLBACK_HINT =
  /\b(call back|callback|cb|ring back|try again|follow up|follow-up|ping)\b/i;
const VOICEMAIL_HINT = /\b(vm|voicemail|left (?:him|her|them)?\s?(?:a )?msg|left message)\b/i;
const CONTACT_UPDATE_HINT = /\b(cell|phone|number|digits|text me|use cell|use this number)\b/i;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function summarize(rawNote: string) {
  const normalized = normalizeWhitespace(rawNote);
  return normalized.slice(0, 180);
}

function toSentence(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return "";
  const withCapitalizedLead = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return /[.!?]$/.test(withCapitalizedLead) ? withCapitalizedLead : `${withCapitalizedLead}.`;
}

export function inferNoteType(rawNote: string): V2NoteType {
  if (VOICEMAIL_HINT.test(rawNote)) return "voicemail";
  if (CALLBACK_HINT.test(rawNote)) return "callback";
  if (CONTACT_UPDATE_HINT.test(rawNote)) return "contact_update";
  if (/\b(follow up|follow-up|check back|circle back)\b/i.test(rawNote)) return "follow_up";
  if (normalizeWhitespace(rawNote)) return "sales_note";
  return "unknown";
}

export function extractPhone(rawNote: string) {
  const matched = rawNote.match(
    /(?:\+?1[\s.-]?)?(?:\(?(\d{3})\)?[\s.-]?)(\d{3})[\s.-]?(\d{4})/
  );
  if (!matched) return null;
  const local = `${matched[1]}${matched[2]}${matched[3]}`;
  return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6, 10)}`;
}

export function extractCallbackTime(rawNote: string) {
  const directMatch = rawNote.match(
    /\b(today|tomorrow|tonight|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|next week|after \d{1,2}(?::\d{2})?\s?(?:am|pm)?|before \d{1,2}(?::\d{2})?\s?(?:am|pm)?|\d{1,2}(?::\d{2})?\s?(?:am|pm)|\d{1,2}ish|\d+\s*wks?)\b/i
  );
  return directMatch ? normalizeWhitespace(directMatch[0]) : null;
}

export function fallbackV2NoteFromRawNote(
  rawNote: string,
  targetId = V2_FROZEN_MANIFEST.default_target_task_id
): V2NoteSchema {
  const note_type = inferNoteType(rawNote);
  const summary = summarize(rawNote);
  const callback_time = extractCallbackTime(rawNote);
  const phone = extractPhone(rawNote);

  return {
    raw_note: rawNote,
    note_type,
    target_id: targetId,
    summary,
    callback_time,
    phone,
    confidence: 0.42,
    missing_fields: [],
  };
}

export function coerceV2NoteSchema(
  input: Partial<V2NoteSchema> & { raw_note?: unknown },
  fallbackTargetId = V2_FROZEN_MANIFEST.default_target_task_id
): V2NoteSchema {
  const raw_note = normalizeWhitespace(String(input.raw_note || ""));
  const fallback = fallbackV2NoteFromRawNote(raw_note, fallbackTargetId);
  const note_type = V2_NOTE_TYPES.includes(input.note_type as V2NoteType)
    ? (input.note_type as V2NoteType)
    : fallback.note_type;
  const target_id =
    fallback.target_id;
  const summary =
    typeof input.summary === "string" && input.summary.trim()
      ? normalizeWhitespace(input.summary)
      : fallback.summary;
  const callback_time =
    typeof input.callback_time === "string" && input.callback_time.trim()
      ? normalizeWhitespace(input.callback_time)
      : fallback.callback_time;
  const phone =
    typeof input.phone === "string" && input.phone.trim()
      ? extractPhone(input.phone) || normalizeWhitespace(input.phone)
      : fallback.phone;
  const confidence =
    typeof input.confidence === "number"
      ? Math.min(1, Math.max(0, input.confidence))
      : fallback.confidence;

  const note: V2NoteSchema = {
    raw_note,
    note_type,
    target_id,
    summary,
    callback_time,
    phone,
    confidence,
    missing_fields: Array.isArray(input.missing_fields)
      ? input.missing_fields.map((value) => String(value)).filter(Boolean)
      : [],
  };

  const validation = validateV2NoteSchema(note);
  return {
    ...note,
    missing_fields: validation.missing_fields,
  };
}

export function validateV2NoteSchema(note: V2NoteSchema): V2NoteValidation {
  const missing_fields: string[] = [];
  const issues: string[] = [];

  if (!note.raw_note.trim()) missing_fields.push("raw_note");
  if (!note.summary.trim()) missing_fields.push("summary");
  if (!note.target_id.trim()) missing_fields.push("target_id");
  if (!V2_NOTE_TYPES.includes(note.note_type)) missing_fields.push("note_type");

  if ((note.note_type === "callback" || note.note_type === "follow_up") && !note.callback_time) {
    missing_fields.push("callback_time");
  }

  if (!isAllowedFrozenTarget(note.target_id)) {
    issues.push("target_id is not in the frozen manifest");
  }

  if (note.confidence < 0 || note.confidence > 1) {
    issues.push("confidence must be between 0 and 1");
  }

  return {
    valid: missing_fields.length === 0 && issues.length === 0,
    missing_fields: Array.from(new Set(missing_fields)),
    issues,
  };
}

export function formatCommentBody(note: V2NoteSchema) {
  const lines = [toSentence(note.summary)];

  if (note.callback_time) {
    lines.push(`Follow up: ${normalizeWhitespace(note.callback_time)}.`);
  }

  if (note.phone && note.note_type === "contact_update") {
    lines.push(`Phone: ${note.phone}.`);
  }

  return lines.join("\n");
}

export function prepareCommentWrite(note: V2NoteSchema) {
  return prepareCommentWriteForTarget(note, note.target_id);
}

export function prepareCommentWriteForTarget(note: V2NoteSchema, targetId: string) {
  const validation = validateV2NoteSchema(note);
  const filteredIssues = validation.issues.filter(
    (issue) => issue !== "target_id is not in the frozen manifest"
  );
  const targetValidation = {
    valid: validation.missing_fields.length === 0 && filteredIssues.length === 0 && Boolean(targetId?.trim()),
    missing_fields: targetId?.trim()
      ? validation.missing_fields
      : Array.from(new Set([...validation.missing_fields, "target_id"])),
    issues: filteredIssues,
  };
  if (!targetValidation.valid) {
    return {
      ok: false as const,
      validation: targetValidation,
      target: null,
      commentText: null,
    };
  }

  return {
    ok: true as const,
    validation: targetValidation,
    target: getFrozenTarget(targetId) || { id: targetId, kind: "task", label: "Resolved target", listId: "" },
    commentText: formatCommentBody(note),
  };
}
