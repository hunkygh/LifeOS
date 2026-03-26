import {
  V2_ACTION_PLAN_VERSION,
  coerceV2ActionPlan,
  type V2ActionPlan,
} from "./v2ActionPlan.ts";
import { V2_FROZEN_MANIFEST } from "./v2Manifest.ts";
import type { V2ExtractedIntent, V2ExtractedNote } from "./v2ExtractedNote.ts";
import { formatCommentBody, type V2NoteSchema } from "./v2NoteSchema.ts";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function titleCaseWord(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function preferredLeadLabel(extracted: V2ExtractedNote) {
  return (
    extracted.facts.candidate_business_name ||
    extracted.facts.candidate_contact_name ||
    "Lead"
  );
}

function validateSuggestedTaskTitle(value: string | null | undefined) {
  const normalized = normalizeWhitespace(value || "");
  if (!normalized) return null;
  if (normalized.length < 4) return null;
  if (/^(with|for|call|called|met|meeting|follow up|follow-up)$/i.test(normalized)) return null;
  return normalized.slice(0, 72);
}

function compactTimingLabel(value: string | null) {
  if (!value) return null;
  return normalizeWhitespace(value).replace(/\b(am|pm)\b/gi, (match) => match.toUpperCase());
}

function compactTimeOnlyLabel(value: string | null) {
  if (!value) return null;
  const normalized = compactTimingLabel(value);
  const match = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!match) return null;
  return `${match[1]}${match[2] ? `:${match[2]}` : ""} ${match[3].toUpperCase()}`;
}

function uniqueNonEmptyLines(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeWhitespace(value || ""))
        .filter(Boolean)
    )
  );
}

function findIntent(extracted: V2ExtractedNote, type: V2ExtractedIntent["type"]) {
  return extracted.intents.find((intent) => intent.type === type) || null;
}

function buildTaskDescription(extracted: V2ExtractedNote, structuredNote: V2NoteSchema) {
  const activityIntent = findIntent(extracted, "append_activity_log");
  const taskIntent = findIntent(extracted, "create_linked_task");
  const summaryLine =
    extracted.facts.summary ||
    taskIntent?.summary ||
    activityIntent?.summary ||
    structuredNote.summary;

  const lines = uniqueNonEmptyLines([
    `Objective: ${summaryLine}`,
    taskIntent?.summary && normalizeWhitespace(taskIntent.summary) !== normalizeWhitespace(summaryLine)
      ? `Next step: ${taskIntent.summary}`
      : null,
    extracted.facts.candidate_contact_name ? `Contact: ${extracted.facts.candidate_contact_name}` : null,
    extracted.facts.candidate_owner_name ? `Owner: ${extracted.facts.candidate_owner_name}` : null,
    extracted.facts.candidate_phone_numbers[0] ? `Phone: ${extracted.facts.candidate_phone_numbers[0]}` : null,
    extracted.facts.timing ? `Timing requested: ${extracted.facts.timing}` : null,
    extracted.facts.best_time_to_contact ? `Best time to contact on file: ${extracted.facts.best_time_to_contact}` : null,
    activityIntent?.summary && normalizeWhitespace(activityIntent.summary) !== normalizeWhitespace(summaryLine)
      ? `Context: ${activityIntent.summary}`
      : null,
  ]);

  return lines.join("\n\n");
}

function inferTaskActionName(extracted: V2ExtractedNote) {
  const note = normalizeWhitespace(extracted.raw_note).toLowerCase();
  if (/\b(confirm|confirmation)\b/.test(note) && /\b(appt|appointment|walk-?in|visit|meeting)\b/.test(note)) {
    return "Confirm Appt";
  }
  if (/\bemail|e-mail\b/.test(note)) return "Email";
  if (/\btext|sms\b/.test(note)) return "Text";
  if (/\bswing by|stop by|head to|go by|visit|walk-?in|meet|meeting\b/.test(note) || extracted.facts.interaction_type === "meeting") {
    return "Visit";
  }
  if (/\bcall|called|call back|reach|voicemail\b/.test(note) || extracted.facts.interaction_type === "call" || extracted.facts.interaction_type === "voicemail") {
    return "Call";
  }
  return "Follow Up";
}

function buildTaskTitle(extracted: V2ExtractedNote) {
  const suggested = validateSuggestedTaskTitle(extracted.facts.suggested_task_title);
  const lead = preferredLeadLabel(extracted);
  const timeOnly = compactTimeOnlyLabel(extracted.facts.timing);

  if (suggested) {
    if (suggested.includes(" - ")) {
      return suggested;
    }
    return [inferTaskActionName(extracted), lead, timeOnly].filter(Boolean).join(" - ").slice(0, 72);
  }

  return [inferTaskActionName(extracted), lead, timeOnly].filter(Boolean).join(" - ").slice(0, 72);
}

function shouldCreateLinkedTask(extracted: V2ExtractedNote) {
  if (findIntent(extracted, "ask_clarifying_question")) {
    return false;
  }

  if (extracted.uncertainty.needs_review.length > 0) {
    return false;
  }

  if (extracted.uncertainty.needs_review.includes("timing")) {
    return false;
  }

  return Boolean(findIntent(extracted, "create_linked_task"));
}

function shouldWriteAssignedComment(extracted: V2ExtractedNote) {
  return Boolean(findIntent(extracted, "ask_clarifying_question"));
}

export function mapExtractedNoteToV2ActionPlan(
  extracted: V2ExtractedNote,
  structuredNote: V2NoteSchema
): V2ActionPlan {
  const actions: Array<Record<string, unknown>> = [
    {
      type: "write_comment",
      payload: {
        comment_text: formatCommentBody(structuredNote),
      },
    },
  ];

  if (shouldCreateLinkedTask(extracted)) {
    actions.push({
      type: "create_follow_up_task",
      payload: {
        title: buildTaskTitle(extracted),
        description: [
          `Source item: ${structuredNote.target_id}`,
          `Lead: ${preferredLeadLabel(extracted)}`,
          buildTaskDescription(extracted, structuredNote),
        ]
          .filter(Boolean)
          .join("\n\n"),
        due_hint: extracted.facts.timing,
        source_target_id: structuredNote.target_id,
        list_id: V2_FROZEN_MANIFEST.default_source_list_id,
      },
    });
  } else if (shouldWriteAssignedComment(extracted) && actions.length < 2) {
    const questionIntent = findIntent(extracted, "ask_clarifying_question");
    actions.push({
      type: "write_assigned_comment",
      payload: {
        comment_text: questionIntent?.summary || `Question for Grant: ${structuredNote.summary}`,
        assignee_id: V2_FROZEN_MANIFEST.grant_clickup_user_id,
      },
    });
  }

  return coerceV2ActionPlan({
    version: V2_ACTION_PLAN_VERSION,
    target_id: structuredNote.target_id,
    actions,
  });
}
