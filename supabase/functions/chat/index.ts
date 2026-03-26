import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { APP_USER_ID } from "../config/defaultUser.ts";
import { V2_FROZEN_MANIFEST } from "../../../src/lib/v2Manifest.ts";
import {
  coerceV2NoteSchema,
  fallbackV2NoteFromRawNote,
  formatCommentBody,
  validateV2NoteSchema,
} from "../../../src/lib/v2NoteSchema.ts";
import {
  coerceV2ActionPlan,
  validateV2ActionPlan,
  V2_ACTION_PLAN_VERSION,
} from "../../../src/lib/v2ActionPlan.ts";
import {
  fallbackV2ExtractedNote,
  type V2ExtractedNote,
  validateV2ExtractedNote,
} from "../../../src/lib/v2ExtractedNote.ts";
import { mapExtractedNoteToV2ActionPlan } from "../../../src/lib/v2IntentMapper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type SandboxAiProvider =
  | { provider: "gemini"; apiKey: string }
  | { provider: "groq"; apiKey: string }
  | { provider: "fallback"; apiKey: null };

function escapeForPrompt(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanCandidateValue(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = normalizeWhitespace(value);
  if (!normalized) return null;
  if (/^(today|tomorrow|tonight|later|follow|with|at|around|about|like)\b/i.test(normalized)) return null;
  if (/(today with|tomorrow with|today to|tomorrow to|later today)/i.test(normalized)) return null;
  return normalized || null;
}

function mergePrimaryCandidate(primary: unknown, fallback: string | null) {
  return cleanCandidateValue(primary) ?? fallback;
}

function isLegacyJwtKey(value?: string | null) {
  return Boolean(value && value.includes(".") && value.split(".").length === 3);
}

function pickServiceRoleKey(candidates: Array<string | undefined | null>) {
  const present = candidates.filter((value): value is string => Boolean(value));
  const jwtKey = present.find((value) => isLegacyJwtKey(value));
  return jwtKey ?? present[0] ?? null;
}

function getSandboxAiProvider(): SandboxAiProvider {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("LOCAL_GEMINI_API_KEY");
  if (geminiApiKey) return { provider: "gemini", apiKey: geminiApiKey };

  const groqApiKey = Deno.env.get("GROQ_API_KEY") ?? Deno.env.get("LOCAL_GROQ_API_KEY");
  if (groqApiKey) return { provider: "groq", apiKey: groqApiKey };

  return { provider: "fallback", apiKey: null };
}

async function structureExactV2Note(message: string, aiProvider: SandboxAiProvider) {
  if (aiProvider.provider === "fallback") {
    return fallbackV2NoteFromRawNote(message, V2_FROZEN_MANIFEST.default_target_task_id);
  }

  const prompt = [
    "Convert this messy sales note into the exact JSON schema below.",
    "Return JSON only:",
    "{",
    '  "raw_note": "string",',
    '  "note_type": "sales_note|follow_up|callback|voicemail|contact_update|unknown",',
    '  "target_id": "' + V2_FROZEN_MANIFEST.default_target_task_id + '",',
    '  "summary": "string",',
    '  "callback_time": "string|null",',
    '  "phone": "string|null",',
    '  "confidence": 0.0,',
    '  "missing_fields": ["string"]',
    "}",
    "",
    "Rules:",
    "- target_id must stay inside the frozen manifest.",
    "- Keep summary short and operational.",
    "- Use missing_fields only for fields materially absent from the note.",
    '- Raw note: "' + escapeForPrompt(message) + '"',
  ].join("\n");

  try {
    let content: string | null = null;

    if (aiProvider.provider === "gemini") {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: {
            "x-goog-api-key": aiProvider.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt + "\n\nReturn valid JSON only." }] }],
            generationConfig: {
              responseMimeType: "application/json",
            },
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Gemini V2 note structuring failed: " + response.status + " " + response.statusText);
      }

      const data = await response.json();
      const parts = Array.isArray(data?.candidates?.[0]?.content?.parts)
        ? data.candidates[0].content.parts
        : [];
      const textPart = parts.find((part: { text?: unknown }) => typeof part?.text === "string");
      content = typeof textPart?.text === "string" ? textPart.text : null;
    } else {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + aiProvider.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama3-70b-8192",
          messages: [
            {
              role: "system",
              content: "You produce strict JSON for a frozen manifest sales-note schema. No prose.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.1,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        throw new Error("Groq V2 note structuring failed: " + response.status + " " + response.statusText);
      }

      const data = await response.json();
      content = data?.choices?.[0]?.message?.content ?? null;
    }

    if (!content) {
      throw new Error("Empty V2 note structuring response");
    }

    return coerceV2NoteSchema(JSON.parse(content.trim()), V2_FROZEN_MANIFEST.default_target_task_id);
  } catch (error) {
    console.error("V2 note structuring failed (" + aiProvider.provider + ")", error);
    return fallbackV2NoteFromRawNote(message, V2_FROZEN_MANIFEST.default_target_task_id);
  }
}

async function structureExactV2ExtractedNote(
  message: string,
  structuredNote: ReturnType<typeof fallbackV2NoteFromRawNote>,
  aiProvider: SandboxAiProvider,
) {
  const fallbackExtracted = fallbackV2ExtractedNote(message, structuredNote);

  if (aiProvider.provider === "fallback") {
    return fallbackExtracted;
  }

  const prompt = [
    "Convert this messy sales or CRM note into the exact neutral JSON schema below.",
    "Return JSON only:",
    "{",
    '  "raw_note": "string",',
    '  "facts": {',
    '    "candidate_business_name": "string|null",',
    '    "candidate_contact_name": "string|null",',
    '    "candidate_owner_name": "string|null",',
    '    "candidate_owner_email": "string|null",',
    '    "candidate_phone_numbers": ["string"],',
    '    "candidate_address": "string|null",',
    '    "timing": "string|null",',
    '    "best_time_to_contact": "string|null",',
    '    "interaction_type": "meeting|call|voicemail|follow_up|contact_update|general",',
    '    "pos_system": "string|null",',
    '    "location_count": "number|null",',
    '    "summary": "string",',
    '    "suggested_task_title": "string|null"',
    "  },",
    '  "intents": [{ "type": "create_lead|update_lead_fields|create_linked_task|append_activity_log|update_task_status|ask_clarifying_question", "summary": "string", "payload": {} }],',
    '  "uncertainty": { "tentative_fields": ["string"], "needs_review": ["string"] }',
    "}",
    "",
    "Rules:",
    "- Use semantic interpretation, not keyword echoing.",
    "- Treat candidate_* fields as evidence, not canonical identity.",
    "- candidate_business_name should be just the business/lead name, without scheduling words or next-step language.",
    "- candidate_contact_name should be the human contact only, never the business name.",
    "- Only populate candidate_owner_name when ownership is explicit.",
    "- facts.summary should be a clean, useful CRM brief written in your own words, not a copy of the raw note.",
    "- facts.summary should preserve important context, but it should not be arbitrarily short or cut off.",
    "- Preserve real timing detail whenever present. If the note says something like 'around 3 today' or 'at 11 tomorrow' and no AM/PM is stated, use a business-hours assumption: 1-6 means PM, 7-11 means AM, and explicit AM/PM in the note always wins.",
    "- suggested_task_title should be concise and action-oriented, but lead identity is still resolver-owned.",
    "- If timing is tentative, keep the timing value and add timing to tentative_fields.",
    "- Do not create ask_clarifying_question just because timing is fuzzy.",
    "- append_activity_log should almost always be present.",
    "- create_linked_task should be present when there is a real next action or scheduled follow-up.",
    "",
    "Structured note for grounding:",
    JSON.stringify(structuredNote, null, 2),
    "",
    'Raw note: "' + escapeForPrompt(message) + '"',
  ].join("\n");

  try {
    let content: string | null = null;

    if (aiProvider.provider === "gemini") {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: {
            "x-goog-api-key": aiProvider.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt + "\n\nReturn valid JSON only." }] }],
            generationConfig: {
              responseMimeType: "application/json",
            },
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Gemini extracted-note structuring failed: " + response.status + " " + response.statusText);
      }

      const data = await response.json();
      const parts = Array.isArray(data?.candidates?.[0]?.content?.parts)
        ? data.candidates[0].content.parts
        : [];
      const textPart = parts.find((part: { text?: unknown }) => typeof part?.text === "string");
      content = typeof textPart?.text === "string" ? textPart.text : null;
    } else {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + aiProvider.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama3-70b-8192",
          messages: [
            {
              role: "system",
              content: "You produce strict JSON for a neutral CRM extraction contract. No prose.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.1,
          max_tokens: 900,
        }),
      });

      if (!response.ok) {
        throw new Error("Groq extracted-note structuring failed: " + response.status + " " + response.statusText);
      }

      const data = await response.json();
      content = data?.choices?.[0]?.message?.content ?? null;
    }

    if (!content) {
      throw new Error("Empty extracted-note response");
    }

    const parsed = JSON.parse(content.trim()) as V2ExtractedNote;
    return {
      ...parsed,
      raw_note: parsed.raw_note || fallbackExtracted.raw_note,
      facts: {
        ...fallbackExtracted.facts,
        ...parsed.facts,
        candidate_business_name: mergePrimaryCandidate(
          parsed.facts?.candidate_business_name,
          fallbackExtracted.facts.candidate_business_name
        ),
        candidate_contact_name: mergePrimaryCandidate(
          parsed.facts?.candidate_contact_name,
          fallbackExtracted.facts.candidate_contact_name
        ),
        candidate_owner_name: mergePrimaryCandidate(
          parsed.facts?.candidate_owner_name,
          fallbackExtracted.facts.candidate_owner_name
        ),
        candidate_owner_email: mergePrimaryCandidate(
          parsed.facts?.candidate_owner_email,
          fallbackExtracted.facts.candidate_owner_email
        ),
        candidate_phone_numbers:
          Array.isArray(parsed.facts?.candidate_phone_numbers) && parsed.facts.candidate_phone_numbers.length > 0
            ? parsed.facts.candidate_phone_numbers
            : fallbackExtracted.facts.candidate_phone_numbers,
        candidate_address: mergePrimaryCandidate(
          parsed.facts?.candidate_address,
          fallbackExtracted.facts.candidate_address
        ),
        timing: mergePrimaryCandidate(parsed.facts?.timing, fallbackExtracted.facts.timing),
        best_time_to_contact: mergePrimaryCandidate(
          parsed.facts?.best_time_to_contact,
          fallbackExtracted.facts.best_time_to_contact
        ),
        pos_system: mergePrimaryCandidate(parsed.facts?.pos_system, fallbackExtracted.facts.pos_system),
        suggested_task_title: mergePrimaryCandidate(
          parsed.facts?.suggested_task_title,
          fallbackExtracted.facts.suggested_task_title
        ),
      },
      intents: Array.isArray(parsed.intents) && parsed.intents.length > 0 ? parsed.intents : fallbackExtracted.intents,
      uncertainty: {
        tentative_fields: Array.from(
          new Set([...(parsed.uncertainty?.tentative_fields || []), ...fallbackExtracted.uncertainty.tentative_fields]),
        ),
        needs_review: Array.from(
          new Set([...(parsed.uncertainty?.needs_review || []), ...fallbackExtracted.uncertainty.needs_review]),
        ),
      },
    };
  } catch (error) {
    console.error("V2 extracted-note structuring failed (" + aiProvider.provider + ")", error);
    return fallbackExtracted;
  }
}

async function buildDryRunV2ActionPlan(
  structuredNote: ReturnType<typeof fallbackV2NoteFromRawNote>,
  extractedNote: V2ExtractedNote,
  aiProvider: SandboxAiProvider,
) {
  const mappedPlan = mapExtractedNoteToV2ActionPlan(extractedNote, structuredNote);

  if (aiProvider.provider === "fallback") {
    return mappedPlan;
  }

  const prompt = [
    "Return JSON only for a dry-run action plan refinement.",
    "",
    "Allowed action types:",
    "- write_comment",
    "- write_assigned_comment",
    "- create_follow_up_task",
    "",
    "Rules:",
    "- This is dry-run only.",
    "- Do not add, remove, reorder, or change action types from the deterministic mapper plan.",
    "- You may refine wording only.",
    "",
    "Structured note:",
    JSON.stringify(structuredNote, null, 2),
    "",
    "Extracted note:",
    JSON.stringify(extractedNote, null, 2),
    "",
    "Deterministic mapper plan:",
    JSON.stringify(mappedPlan, null, 2),
  ].join("\n");

  try {
    let content: string | null = null;

    if (aiProvider.provider === "gemini") {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: {
            "x-goog-api-key": aiProvider.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt + "\n\nReturn valid JSON only." }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Gemini action plan failed: " + response.status + " " + response.statusText);
      }

      const data = await response.json();
      const parts = Array.isArray(data?.candidates?.[0]?.content?.parts)
        ? data.candidates[0].content.parts
        : [];
      const textPart = parts.find((part: { text?: unknown }) => typeof part?.text === "string");
      content = typeof textPart?.text === "string" ? textPart.text : null;
    } else {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + aiProvider.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama3-70b-8192",
          messages: [
            {
              role: "system",
              content: "You produce strict JSON for a constrained dry-run action plan. No prose.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.1,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        throw new Error("Groq action plan failed: " + response.status + " " + response.statusText);
      }

      const data = await response.json();
      content = data?.choices?.[0]?.message?.content ?? null;
    }

    if (!content) {
      throw new Error("Empty action plan response");
    }

    const plan = coerceV2ActionPlan(JSON.parse(content.trim()));
    const validation = validateV2ActionPlan(plan);
    if (!validation.valid) return mappedPlan;

    const mappedActionTypes = mappedPlan.actions.map((action) => action.type);
    const aiActionTypes = plan.actions.map((action) => action.type);
    const matchesMappedActionSet =
      mappedActionTypes.length === aiActionTypes.length &&
      mappedActionTypes.every((type, index) => type === aiActionTypes[index]);

    return matchesMappedActionSet ? plan : mappedPlan;
  } catch (error) {
    console.error("V2 action plan failed (" + aiProvider.provider + ")", error);
    return mappedPlan;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const message = String(payload?.message || "").trim();
    const userId = String(payload?.userId || APP_USER_ID);
    const metadata = payload?.metadata || {};

    if (!message) {
      return new Response(JSON.stringify({ error: "Missing message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const inlineOverrides: Record<string, string> = {};
    if (Array.isArray(metadata?.inline_fields)) {
      metadata.inline_fields.forEach((field: { name?: string; value?: unknown }) => {
        if (field?.name && field.value !== undefined) {
          inlineOverrides[field.name] = String(field.value);
        }
      });
    }

    const modifyRequest = String(inlineOverrides.modify_request || "").trim();
    const planningMessage = modifyRequest ? message + "\nRequested modification: " + modifyRequest : message;

    const aiProvider = getSandboxAiProvider();
    console.info("[chat] sandbox_ai_provider_selected", { provider: aiProvider.provider });

    const structuredNote = await structureExactV2Note(planningMessage, aiProvider);
    const validation = validateV2NoteSchema(structuredNote);
    const extractedNote = await structureExactV2ExtractedNote(planningMessage, structuredNote, aiProvider);
    const extractionValidation = validateV2ExtractedNote(extractedNote);
    const actionPlan = await buildDryRunV2ActionPlan(structuredNote, extractedNote, aiProvider);
    const actionPlanValidation = validateV2ActionPlan(actionPlan);

    console.info("[chat] sandbox_note_structured", {
      note_type: structuredNote.note_type,
      target_id: structuredNote.target_id,
      raw_note_length: structuredNote.raw_note.length,
    });
    console.info("[chat] sandbox_note_extracted", {
      interaction_type: extractedNote.facts.interaction_type,
      candidate_business_name: extractedNote.facts.candidate_business_name,
      suggested_task_title: extractedNote.facts.suggested_task_title,
      intent_types: extractedNote.intents.map((intent) => intent.type),
      needs_review: extractedNote.uncertainty.needs_review,
    });
    console.info("[chat] sandbox_action_plan_built", {
      action_count: actionPlan.actions.length,
      action_types: actionPlan.actions.map((action) => action.type),
    });

    const assistantMessage = [
      "Sandbox note captured.",
      "Summary: " + structuredNote.summary,
      ...(structuredNote.callback_time ? ["Callback: " + structuredNote.callback_time] : []),
      ...(structuredNote.phone ? ["Phone: " + structuredNote.phone] : []),
      ...(actionPlanValidation.valid
        ? actionPlan.actions
            .filter((action) => action.type !== "write_comment")
            .map((action) =>
              action.type === "write_assigned_comment"
                ? "Planned: Assigned comment for Grant"
                : "Planned: Follow-up subtask under lead"
            )
        : ["Planned: action plan needs review"]),
    ].join("\n");

    const metaResponse = JSON.stringify(
      {
        mode: "sandbox-v2",
        extracted_note: extractedNote,
        extraction_validation: extractionValidation,
        structured_note: structuredNote,
        validation,
        action_plan: actionPlan,
        action_plan_validation: actionPlanValidation,
        manifest: V2_FROZEN_MANIFEST,
      },
      null,
      2,
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("LOCAL_SUPABASE_URL");
    const supabaseServiceKey = pickServiceRoleKey([
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      Deno.env.get("APP_SUPABASE_SERVICE_ROLE_KEY"),
      Deno.env.get("LOCAL_SUPABASE_SERVICE_ROLE_KEY"),
    ]);

    if (supabaseUrl && supabaseServiceKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        await supabase.from("chat_messages").insert({
          content: message,
          role: "user",
          conversation_id: payload?.conversation_id || null,
          user_id: userId,
          metadata: {
            mode: "sandbox-v2",
            raw_note: message,
          },
        });

        await supabase.from("chat_messages").insert({
          content: assistantMessage,
          role: "assistant",
          conversation_id: payload?.conversation_id || null,
          user_id: userId,
          meta_response: metaResponse,
          metadata: {
            mode: "sandbox-v2",
            extracted_note: extractedNote,
            extraction_validation: extractionValidation,
            validation,
            action_plan: actionPlan,
            action_plan_validation: actionPlanValidation,
          },
        });
      } catch (persistError) {
        console.warn("[chat] sandbox_persist_failed", persistError);
      }
    }

    return new Response(
      JSON.stringify({
        message: assistantMessage,
        metaResponse,
        actionNeeded: null,
        safeMode: true,
        extractedNote,
        extractionValidation,
        structuredNote,
        validation,
        actionPlan,
        actionPlanValidation,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error("[chat] sandbox_error", error);
    return new Response(JSON.stringify({ error: errMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
