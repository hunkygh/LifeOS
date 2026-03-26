import { V2_FROZEN_MANIFEST } from "./v2Manifest.ts";
import type { V2ExtractedNote } from "./v2ExtractedNote.ts";

export type LeadFieldUpdate = {
  field: "owner_email" | "owner_names" | "phone" | "best_time_to_contact" | "pos_system" | "next_step" | "location_count";
  fieldId: string;
  value: string | number | string[];
};

export type LeadFieldUpdatePreparation = {
  updates: LeadFieldUpdate[];
  skipped: string[];
};

export function prepareLeadFieldUpdates(extracted: V2ExtractedNote): LeadFieldUpdatePreparation {
  const updates: LeadFieldUpdate[] = [];
  const skipped: string[] = [];

  if (extracted.facts.candidate_owner_email) {
    if (V2_FROZEN_MANIFEST.lead_owner_email_field_id) {
      updates.push({
        field: "owner_email",
        fieldId: V2_FROZEN_MANIFEST.lead_owner_email_field_id,
        value: extracted.facts.candidate_owner_email,
      });
    } else {
      skipped.push("owner_email_field_unconfigured");
    }
  }

  if (extracted.facts.candidate_owner_name) {
    if (V2_FROZEN_MANIFEST.lead_owner_names_field_id) {
      updates.push({
        field: "owner_names",
        fieldId: V2_FROZEN_MANIFEST.lead_owner_names_field_id,
        value: extracted.facts.candidate_owner_name,
      });
    } else {
      skipped.push("owner_names_field_unconfigured");
    }
  }

  if (
    extracted.facts.candidate_phone_numbers.length === 1 &&
    !extracted.uncertainty.needs_review.includes("multiple_phone_numbers")
  ) {
    if (V2_FROZEN_MANIFEST.lead_phone_field_id) {
      updates.push({
        field: "phone",
        fieldId: V2_FROZEN_MANIFEST.lead_phone_field_id,
        value: extracted.facts.candidate_phone_numbers[0],
      });
    } else {
      skipped.push("phone_field_unconfigured");
    }
  } else if (extracted.facts.candidate_phone_numbers.length > 1) {
    skipped.push("phone_needs_review");
  }

  if (
    extracted.facts.best_time_to_contact
  ) {
    if (V2_FROZEN_MANIFEST.lead_best_time_to_contact_field_id) {
      updates.push({
        field: "best_time_to_contact",
        fieldId: V2_FROZEN_MANIFEST.lead_best_time_to_contact_field_id,
        value: extracted.facts.best_time_to_contact,
      });
    } else {
      skipped.push("best_time_to_contact_field_unconfigured");
    }
  }

  if (extracted.facts.pos_system) {
    skipped.push("pos_system_needs_review");
  }

  const nextStepIntent = extracted.intents.find((intent) => intent.type === "create_linked_task");
  if (nextStepIntent?.summary) {
    if (V2_FROZEN_MANIFEST.lead_next_step_field_id) {
      updates.push({
        field: "next_step",
        fieldId: V2_FROZEN_MANIFEST.lead_next_step_field_id,
        value: nextStepIntent.summary,
      });
    } else {
      skipped.push("next_step_field_unconfigured");
    }
  }

  if (typeof extracted.facts.location_count === "number") {
    if (V2_FROZEN_MANIFEST.lead_location_count_field_id) {
      updates.push({
        field: "location_count",
        fieldId: V2_FROZEN_MANIFEST.lead_location_count_field_id,
        value: extracted.facts.location_count,
      });
    } else {
      skipped.push("location_count_field_unconfigured");
    }
  }

  return {
    updates,
    skipped: Array.from(new Set(skipped)),
  };
}
