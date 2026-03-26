import type { V2NoteSchema } from "./v2NoteSchema.ts";

export const V2_INTENT_TYPES = [
  "create_lead",
  "update_lead_fields",
  "create_linked_task",
  "append_activity_log",
  "update_task_status",
  "ask_clarifying_question",
] as const;

export type V2IntentType = (typeof V2_INTENT_TYPES)[number];

export type V2ExtractedIntent = {
  type: V2IntentType;
  summary: string;
  payload?: Record<string, unknown>;
};

export type V2ExtractedFacts = {
  candidate_business_name: string | null;
  candidate_contact_name: string | null;
  candidate_owner_name: string | null;
  candidate_owner_email: string | null;
  candidate_phone_numbers: string[];
  candidate_address: string | null;
  timing: string | null;
  best_time_to_contact: string | null;
  interaction_type: "meeting" | "call" | "voicemail" | "follow_up" | "contact_update" | "general";
  pos_system: string | null;
  location_count: number | null;
  summary: string;
  suggested_task_title: string | null;
};

export type V2ExtractedUncertainty = {
  tentative_fields: string[];
  needs_review: string[];
};

export type V2ExtractedNote = {
  raw_note: string;
  facts: V2ExtractedFacts;
  intents: V2ExtractedIntent[];
  uncertainty: V2ExtractedUncertainty;
};

export type V2ExtractedNoteValidation = {
  valid: boolean;
  missing_fields: string[];
  issues: string[];
};

const LOWERCASE_CONNECTORS = ["la", "el", "los", "las", "de", "del", "of", "and", "&"];
const POS_SYSTEMS = ["clover", "toast", "square", "aloha", "micros", "ncr", "spoton", "revel"] as const;
const BUSINESS_TRAILING_STOPWORDS = new Set([
  "today",
  "tomorrow",
  "tonight",
  "follow",
  "up",
  "at",
  "around",
  "about",
  "like",
  "before",
  "after",
  "call",
  "text",
  "email",
  "confirm",
]);
const IDENTITY_JUNK_PHRASES = [
  "today with",
  "tomorrow with",
  "today to",
  "tomorrow to",
  "later today",
  "follow up",
  "stay in the loop",
];

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toSentence(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return "";
  const capitalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return null;
  return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6, 10)}`;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function isJunkIdentityValue(value: string) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) return true;
  if (IDENTITY_JUNK_PHRASES.some((phrase) => normalized.includes(phrase))) return true;
  if (/^(today|tomorrow|tonight|later|follow|with|at|around|about|like)\b/.test(normalized)) return true;
  return false;
}

function trimTrailingBusinessNoise(value: string) {
  const words = normalizeWhitespace(value).split(" ").filter(Boolean);
  while (words.length > 1) {
    const last = words[words.length - 1].toLowerCase().replace(/[^\w&'-]/g, "");
    if (!BUSINESS_TRAILING_STOPWORDS.has(last)) break;
    words.pop();
  }
  return words.join(" ");
}

export function extractBusinessName(rawNote: string) {
  const phrasePatterns = [
    /\b(?:swing by|stop by|head to|go by)\s+((?:[A-Z][A-Za-z0-9&'.-]*|la|el|los|las|de|del|of)(?:\s+(?:[A-Z][A-Za-z0-9&'.-]*|la|el|los|las|de|del|of)){1,5})\b/i,
    /\bcalled\s+([^.]+?)\s+(?:to reach|and (?:spoke|talked) with)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:\s*\(owner\))?(?:[.!?]|$)/i,
    /\bcalled\s+((?:[A-Z][A-Za-z0-9&'.-]*|la|el|los|las|de|del|of)(?:\s+(?:[A-Z][A-Za-z0-9&'.-]*|la|el|los|las|de|del|of)){1,5})(?:[.!?]|$)/i,
    /\b(?:spoke with|spoke to|met with|met|meeting with|called|texted)\s+[A-Z][a-z]+\s+at\s+([^.]+?)(?:[.!?]|$)/i,
    /\b(?:spoke with owner|owner is|owner name is)\s+[A-Z][a-z]+\s+at\s+([^.]+?)(?:[.!?]|$)/i,
    /\b(?:meeting with|met with|met|meeting|visit(?:ed)?|spoke with|spoke to|talk(?:ed)? to|call(?:ed)? with|with)\s+((?:[A-Z][A-Za-z0-9&'.-]*|la|el|los|las|de|del|of)(?:\s+(?:[A-Z][A-Za-z0-9&'.-]*|la|el|los|las|de|del|of)){0,4})\b/,
    /@\s*((?:[A-Z][A-Za-z0-9&'.-]*|la|el|los|las|de|del|of)(?:\s+(?:[A-Z][A-Za-z0-9&'.-]*|la|el|los|las|de|del|of)){0,4})\b/,
    /\b(?:at|from)\s+((?:[A-Z][A-Za-z0-9&'.-]*|la|el|los|las|de|del|of)(?:\s+(?:[A-Z][A-Za-z0-9&'.-]*|la|el|los|las|de|del|of)){0,4})\b/,
  ];

  for (const pattern of phrasePatterns) {
    const match = rawNote.match(pattern);
    if (!match?.[1]) continue;
    const words = normalizeWhitespace(match[1]).split(" ");
    const normalizedWords = words.map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && LOWERCASE_CONNECTORS.includes(lower)) return lower;
      return word;
    });
    const candidate = trimTrailingBusinessNoise(normalizedWords.join(" "));
    if (!isJunkIdentityValue(candidate)) return candidate;
  }

  return null;
}

export function extractAddress(rawNote: string) {
  const addressMatch = rawNote.match(
    /\b\d{1,6}\s+[A-Z0-9][A-Za-z0-9.\- ]{2,40}\s(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way)\b/i
  );
  if (addressMatch?.[0]) return normalizeWhitespace(addressMatch[0]);

  const locationHint = rawNote.match(/\bin\s+([A-Z][A-Za-z.\- ]{2,30})\b/);
  if (locationHint?.[1]) return normalizeWhitespace(locationHint[1]);

  return null;
}

export function extractContactName(rawNote: string, businessName?: string | null) {
  const PERSON_PATTERN = "([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)";
  const directPatterns = [
    new RegExp(`\\b(?:add|create)\\s+${PERSON_PATTERN}\\s+as\\s+a\\s+lead\\b`, "i"),
    new RegExp(`\\badd\\s+${PERSON_PATTERN}\\s+to\\s+[A-Z][A-Za-z0-9&'.\\- ]+\\s+list\\b`, "i"),
    new RegExp(`\\b(?:spoke with|spoke to|left voicemail for|left message for|texted)\\s+${PERSON_PATTERN}\\b`, "i"),
    new RegExp(`\\bcall\\s+today\\s+with\\s+${PERSON_PATTERN}\\b`, "i"),
  ];

  for (const pattern of directPatterns) {
    const match = rawNote.match(pattern);
    if (!match?.[1]) continue;
    if (businessName && businessName.toLowerCase().startsWith(match[1].toLowerCase())) continue;
    if (isJunkIdentityValue(match[1])) continue;
    return match[1];
  }

  return null;
}

export function extractOwnerName(rawNote: string, businessName?: string | null) {
  const PERSON_PATTERN = "([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)";
  const patterns = [
    new RegExp(`\\bowner(?:'s)?\\s+name\\s+is\\s+${PERSON_PATTERN}\\b`, "i"),
    new RegExp(`\\bowner\\s+is\\s+${PERSON_PATTERN}\\b`, "i"),
    new RegExp(`\\b${PERSON_PATTERN}\\s+is\\s+the\\s+owner\\b`, "i"),
    new RegExp(`\\bspoke with owner\\s+${PERSON_PATTERN}\\b`, "i"),
    new RegExp(`\\bmet with owner\\s+${PERSON_PATTERN}\\b`, "i"),
    new RegExp(`\\b${PERSON_PATTERN}\\s*\\(owner\\)`, "i"),
    new RegExp(`\\bowner\\s+${PERSON_PATTERN}\\b`, "i"),
  ];

  for (const pattern of patterns) {
    const match = rawNote.match(pattern);
    if (!match?.[1]) continue;
    return match[1];
  }

  return null;
}

export function extractPhoneNumbers(rawNote: string) {
  const matches = rawNote.match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g) || [];
  return unique(matches.map((value) => formatPhone(value)).filter((value): value is string => Boolean(value)));
}

export function extractOwnerEmail(rawNote: string) {
  const match = rawNote.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return match?.[0] ? normalizeWhitespace(match[0].toLowerCase()) : null;
}

export function extractBestTimeToContact(rawNote: string) {
  const patterns = [
    /\b(?:best time to contact|best time to reach|best time to catch|best to reach (?:him|her|them)?|usually available|usually in|owner usually in|catch (?:him|her|them)?(?: best)?|reach (?:him|her|them)?(?: best)?)(?: is| are|:)?\s+([^.]+)/i,
    /\b(?:mornings|afternoons|evenings|after \d{1,2}(?::\d{2})?\s?(?:am|pm)?|before \d{1,2}(?::\d{2})?\s?(?:am|pm)?|around \d{1,2}(?::\d{2})?\s?(?:am|pm)?|mon(?:day)?(?:s)?|tue(?:s|sday)?(?:s)?|wed(?:nesday)?(?:s)?|thu(?:r|rs|rsday)?(?:s)?|fri(?:day)?(?:s)?|sat(?:urday)?(?:s)?|sun(?:day)?(?:s)?)\b/i,
  ];

  const explicitMatch = rawNote.match(patterns[0]);
  if (explicitMatch?.[1]) {
    return normalizeWhitespace(explicitMatch[1]).replace(/[.]+$/g, "");
  }

  return null;
}

export function extractPosSystem(rawNote: string) {
  const found = POS_SYSTEMS.filter((pos) => new RegExp(`\\b${pos}\\b`, "i").test(rawNote));
  return found.length === 1 ? found[0][0].toUpperCase() + found[0].slice(1) : null;
}

export function extractLocationCount(rawNote: string) {
  const digitsMatch = rawNote.match(/\b(\d+)\s+(?:locations?|stores?|trucks?)\b/i);
  if (digitsMatch?.[1]) return Number(digitsMatch[1]);
  const wordMatch = rawNote.match(/\b(one|two|three|four|five)\s+(?:locations?|stores?|trucks?)\b/i);
  if (!wordMatch?.[1]) return null;
  const map: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  return map[wordMatch[1].toLowerCase()] ?? null;
}

function extractTiming(rawNote: string, note: V2NoteSchema) {
  const normalized = normalizeWhitespace(rawNote);
  const dayMatch = normalized.match(
    /\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i
  );
  const explicitTimeMatch = normalized.match(
    /\b(?:at\s+|around\s+|about\s+|like\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i
  );
  const implicitTimeMatch = normalized.match(
    /\b(?:at\s+|around\s+|about\s+|like\s+)(\d{1,2})(?::(\d{2}))?\b/i
  );

  const inferMeridiem = (hourValue: number) => {
    if (/\b(morning|breakfast)\b/i.test(normalized)) return "AM";
    if (/\b(afternoon|evening|night|tonight|later today|at the latest)\b/i.test(normalized)) return "PM";
    // Business-hours default when the note does not explicitly specify AM/PM:
    // 1-6 => PM, 7-11 => AM, 12 => PM.
    if (hourValue >= 1 && hourValue <= 6) return "PM";
    if (hourValue >= 7 && hourValue <= 11) return "AM";
    if (hourValue === 12) return "PM";
    return null;
  };

  if (dayMatch && explicitTimeMatch) {
    const hour = explicitTimeMatch[1];
    const minute = explicitTimeMatch[2] ? `:${explicitTimeMatch[2]}` : ":00";
    const meridiem = explicitTimeMatch[3].toUpperCase();
    return `${dayMatch[1]} at ${hour}${minute} ${meridiem}`;
  }

  if (explicitTimeMatch) {
    const hour = explicitTimeMatch[1];
    const minute = explicitTimeMatch[2] ? `:${explicitTimeMatch[2]}` : ":00";
    const meridiem = explicitTimeMatch[3].toUpperCase();
    return `${hour}${minute} ${meridiem}`;
  }

  if (implicitTimeMatch) {
    const hourValue = Number(implicitTimeMatch[1]);
    const minute = implicitTimeMatch[2] ? `:${implicitTimeMatch[2]}` : ":00";
    const meridiem = inferMeridiem(hourValue);
    if (meridiem) {
      if (dayMatch) {
        return `${dayMatch[1]} at ${hourValue}${minute} ${meridiem}`;
      }
      return `${hourValue}${minute} ${meridiem}`;
    }
  }

  return note.callback_time;
}

function inferInteractionType(note: V2NoteSchema, rawNote: string): V2ExtractedFacts["interaction_type"] {
  if (/\b(meeting|met|appointment|walk-in|visit)\b/i.test(rawNote)) return "meeting";
  if (note.note_type === "voicemail") return "voicemail";
  if (note.note_type === "follow_up") return "follow_up";
  if (note.note_type === "callback") return "call";
  if (note.note_type === "contact_update") return "contact_update";
  return "general";
}

function buildSuggestedTaskTitle(
  note: V2NoteSchema,
  facts: Pick<
    V2ExtractedFacts,
    "candidate_business_name" | "candidate_contact_name" | "timing" | "interaction_type" | "summary"
  >
) {
  const label =
    facts.candidate_business_name ||
    facts.candidate_contact_name ||
    "Lead";
  const normalizedNote = normalizeWhitespace(note.raw_note).toLowerCase();
  const timeOnlyMatch = (facts.timing || "").match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  const timeOnly = timeOnlyMatch
    ? `${timeOnlyMatch[1]}${timeOnlyMatch[2] ? `:${timeOnlyMatch[2]}` : ""} ${timeOnlyMatch[3].toUpperCase()}`
    : null;

  let action = "Follow Up";
  if (/\b(confirm|confirmation)\b/.test(normalizedNote) && /\b(appt|appointment|walk-?in|visit|meeting)\b/.test(normalizedNote)) {
    action = "Confirm Appt";
  } else if (/\bemail|e-mail\b/.test(normalizedNote)) {
    action = "Email";
  } else if (/\btext|sms\b/.test(normalizedNote)) {
    action = "Text";
  } else if (/\bswing by|stop by|head to|go by|visit|walk-?in|meet|meeting\b/.test(normalizedNote) || facts.interaction_type === "meeting") {
    action = "Visit";
  } else if (/\bcall|called|call back|reach|voicemail\b/.test(normalizedNote) || facts.interaction_type === "call" || facts.interaction_type === "voicemail") {
    action = "Call";
  }

  return [action, label, timeOnly].filter(Boolean).join(" - ").slice(0, 72);
}

function isExplicitHumanQuestion(rawNote: string) {
  return /\b(can you|should i|do we|does this|which one|who is|what is|need more info|find out|confirm whether|not sure)\b/i.test(
    rawNote
  );
}

function impliesStructuredFollowUp(note: V2NoteSchema, facts: V2ExtractedFacts) {
  if (note.note_type === "callback" || note.note_type === "follow_up") {
    return true;
  }

  if (facts.interaction_type === "meeting" && Boolean(facts.timing)) {
    return true;
  }

  if (facts.interaction_type === "call" && Boolean(facts.timing)) {
    return true;
  }

  return false;
}

function inferIntents(rawNote: string, note: V2NoteSchema, facts: V2ExtractedFacts): V2ExtractedIntent[] {
  const intents: V2ExtractedIntent[] = [
    {
      type: "append_activity_log",
      summary: toSentence(facts.summary),
    },
  ];

  if (facts.candidate_business_name || facts.candidate_contact_name) {
    intents.push({
      type: "create_lead",
      summary: facts.candidate_business_name || facts.candidate_contact_name || "Resolve lead record",
      payload: {
        candidate_business_name: facts.candidate_business_name,
        candidate_contact_name: facts.candidate_contact_name,
      },
    });
  }

  if (facts.candidate_phone_numbers.length > 0 || facts.pos_system || facts.location_count || facts.candidate_owner_email || facts.candidate_owner_name || facts.best_time_to_contact) {
    intents.push({
      type: "update_lead_fields",
      summary: "Update known lead facts",
      payload: {
        candidate_phone_numbers: facts.candidate_phone_numbers,
        candidate_owner_email: facts.candidate_owner_email,
        candidate_owner_name: facts.candidate_owner_name,
        best_time_to_contact: facts.best_time_to_contact,
        pos_system: facts.pos_system,
        location_count: facts.location_count,
      },
    });
  }

  // Fallback mode should stay conservative and avoid phrase-triggered actions.
  // It may create a follow-up task only when the normalized note shape already
  // indicates a concrete follow-up or scheduled interaction.
  if (impliesStructuredFollowUp(note, facts)) {
    intents.push({
      type: "create_linked_task",
      summary: toSentence(facts.summary),
      payload: {
        when: facts.timing,
        interaction_type: facts.interaction_type,
      },
    });
  }

  // Clarification should only appear when the user is explicitly asking for
  // human judgment, not because punctuation or vague timing showed up.
  if (isExplicitHumanQuestion(rawNote)) {
    intents.push({
      type: "ask_clarifying_question",
      summary: toSentence(facts.summary),
    });
  }

  return unique(intents.map((intent) => JSON.stringify(intent))).map((value) => JSON.parse(value));
}

function inferUncertainty(rawNote: string, note: V2NoteSchema, facts: V2ExtractedFacts): V2ExtractedUncertainty {
  const tentative_fields: string[] = [];
  const needs_review: string[] = [];

  if (!facts.candidate_business_name && !facts.candidate_contact_name) {
    needs_review.push("lead_identity");
  }

  if ((note.note_type === "callback" || note.note_type === "follow_up") && !facts.timing) {
    needs_review.push("timing");
  }

  if (facts.candidate_phone_numbers.length > 1) {
    needs_review.push("multiple_phone_numbers");
  }

  if (/\b(maybe|probably|sounds like|might be)\b/i.test(rawNote)) {
    if (facts.pos_system) {
      tentative_fields.push("pos_system");
    }
    if (!facts.timing || /\b(probably|maybe)\b/i.test(rawNote)) {
      tentative_fields.push("confidence");
    }
  }

  if (facts.timing && /\b(probably|maybe|around|about|like)\b/i.test(rawNote)) {
    tentative_fields.push("timing");
  }

  const posMentions = POS_SYSTEMS.filter((pos) => new RegExp(`\\b${pos}\\b`, "i").test(rawNote));
  if (posMentions.length > 1) {
    needs_review.push("pos_system");
  }

  return {
    tentative_fields: unique(tentative_fields),
    needs_review: unique(needs_review),
  };
}

export function fallbackV2ExtractedNote(rawNote: string, note: V2NoteSchema): V2ExtractedNote {
  const candidate_business_name = extractBusinessName(rawNote);
  const candidate_contact_name = extractContactName(rawNote, candidate_business_name);
  const candidate_owner_name = extractOwnerName(rawNote, candidate_business_name);
  const candidate_phone_numbers = extractPhoneNumbers(rawNote);
  const candidate_owner_email = extractOwnerEmail(rawNote);
  const timing = extractTiming(rawNote, note);
  const interaction_type = inferInteractionType(note, rawNote);
  const facts: V2ExtractedFacts = {
    candidate_business_name,
    candidate_contact_name,
    candidate_owner_name,
    candidate_owner_email,
    candidate_phone_numbers,
    candidate_address: extractAddress(rawNote),
    timing,
    best_time_to_contact: extractBestTimeToContact(rawNote),
    interaction_type,
    pos_system: extractPosSystem(rawNote),
    location_count: extractLocationCount(rawNote),
    summary: note.summary,
    suggested_task_title: buildSuggestedTaskTitle(note, {
      candidate_business_name,
      candidate_contact_name,
      timing,
      interaction_type,
      summary: note.summary,
    }),
  };

  return {
    raw_note: note.raw_note,
    facts,
    intents: inferIntents(rawNote, note, facts),
    uncertainty: inferUncertainty(rawNote, note, facts),
  };
}

export function validateV2ExtractedNote(extracted: V2ExtractedNote): V2ExtractedNoteValidation {
  const missing_fields: string[] = [];
  const issues: string[] = [];

  if (!normalizeWhitespace(extracted.raw_note)) missing_fields.push("raw_note");
  if (!normalizeWhitespace(extracted.facts.summary)) missing_fields.push("facts.summary");
  if (!Array.isArray(extracted.intents) || extracted.intents.length === 0) missing_fields.push("intents");

  extracted.intents.forEach((intent, index) => {
    if (!V2_INTENT_TYPES.includes(intent.type)) {
      issues.push(`intents[${index}].type is not allowed`);
    }
    if (!normalizeWhitespace(intent.summary)) {
      missing_fields.push(`intents[${index}].summary`);
    }
  });

  return {
    valid: missing_fields.length === 0 && issues.length === 0,
    missing_fields: unique(missing_fields),
    issues: unique(issues),
  };
}
