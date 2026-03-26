import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { APP_USER_ID } from "../config/defaultUser.ts";
import { V2_FROZEN_MANIFEST } from "../../../src/lib/v2Manifest.ts";
import { resolveCachedClickUpListByName } from "../lib/v2-list-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function canonicalizeBusinessName(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|restaurant|restaurante|llc|inc|co|corp)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCandidateValue(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = normalizeWhitespace(value);
  return normalized || null;
}

function extractCustomFieldText(task: any, fieldId: string | null) {
  if (!fieldId) return null;
  const customFields = Array.isArray(task?.custom_fields) ? task.custom_fields : [];
  const field = customFields.find((entry: any) => String(entry?.id || "") === String(fieldId));
  if (!field) return null;
  const value = field.value;
  if (typeof value === "string") return normalizeWhitespace(value) || null;
  return null;
}

function summarizeTaskDescription(task: any) {
  const description = normalizeWhitespace(String(task?.description || task?.text_content || ""));
  return description || null;
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

const NAME_STOPWORDS = new Set([
  "met",
  "meet",
  "meeting",
  "visit",
  "visited",
  "text",
  "texted",
  "call",
  "called",
  "spoke",
  "left",
  "follow",
  "need",
  "needs",
  "should",
  "will",
  "soft",
]);

function extractPerson(rawNote: string, extractedFacts?: Record<string, unknown>) {
  const company = extractCompany(rawNote, extractedFacts);
  const candidateOwner = normalizeCandidateValue(extractedFacts?.candidate_owner_name);
  if (candidateOwner) return candidateOwner;
  const candidateContact = normalizeCandidateValue(extractedFacts?.candidate_contact_name);
  if (candidateContact) return candidateContact;

  const PERSON_PATTERN = "([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)";
  const explicitPatterns = [
    new RegExp(`\\b(?:met with|met|visit|visited|text|texted|called|call|spoke with|spoke to|left voicemail for)\\s+${PERSON_PATTERN}\\b`, "i"),
  ];

  for (const pattern of explicitPatterns) {
    const match = rawNote.match(pattern);
    if (match?.[1]) {
      const candidate = match[1];
      if (company && company.toLowerCase().startsWith(candidate.toLowerCase())) continue;
      return candidate;
    }
  }

  const words = rawNote.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) || [];
  return words.find((word) => !NAME_STOPWORDS.has(word.toLowerCase())) || null;
}

function extractCompany(rawNote: string, extractedFacts?: Record<string, unknown>) {
  const candidateBusiness = normalizeCandidateValue(extractedFacts?.candidate_business_name);
  if (candidateBusiness) return candidateBusiness;

  const phrasePatterns = [
    /\b(?:swing by|stop by|head to|go by)\s+((?:[A-Z][A-Za-z0-9&'.-]*|la|el|los|las|de|del|of)(?:\s+(?:[A-Z][A-Za-z0-9&'.-]*|la|el|los|las|de|del|of)){1,5})\b/i,
    /\b(?:meeting with|met with|met|meeting|visit(?:ed)?|spoke with|spoke to|talk(?:ed)? to|call(?:ed)? with|with)\s+((?:[A-Z][A-Za-z0-9&'.-]*|la|el|los|las|de|del|of)(?:\s+(?:[A-Z][A-Za-z0-9&'.-]*|la|el|los|las|de|del|of)){1,4})\b/,
    /@\s*((?:[A-Z][A-Za-z0-9&'.-]*|la|el|los|las|de|del|of)(?:\s+(?:[A-Z][A-Za-z0-9&'.-]*|la|el|los|las|de|del|of)){0,4})\b/,
    /\b(?:at|from)\s+((?:[A-Z][A-Za-z0-9&'.-]*|la|el|los|las|de|del|of)(?:\s+(?:[A-Z][A-Za-z0-9&'.-]*|la|el|los|las|de|del|of)){0,4})\b/,
  ];

  for (const pattern of phrasePatterns) {
    const match = rawNote.match(pattern);
    if (match?.[1]) {
      return trimTrailingBusinessNoise(normalizeWhitespace(match[1]));
    }
  }

  const atMatch = rawNote.match(/@\s*([A-Z][A-Za-z0-9&.\- ]{1,40})/);
  if (atMatch?.[1]) return trimTrailingBusinessNoise(normalizeWhitespace(atMatch[1]));

  const companyMatch = rawNote.match(/\b(?:at|from)\s+([A-Z][A-Za-z0-9&.\- ]{1,40})/);
  if (companyMatch?.[1]) return trimTrailingBusinessNoise(normalizeWhitespace(companyMatch[1]));

  return null;
}

function buildSourceItemName(rawNote: string, summary?: string | null, extractedFacts?: Record<string, unknown>) {
  const person = extractPerson(rawNote, extractedFacts);
  const company = extractCompany(rawNote, extractedFacts);

  // Leads should resolve to the company/business record when we have one.
  if (company) return company.slice(0, 80);
  if (person) return person.slice(0, 80);
  return normalizeWhitespace(summary || rawNote).slice(0, 80) || "New Lead";
}

function computeMatchScore(task: any, rawNote: string, desiredName: string, extractedFacts?: Record<string, unknown>) {
  const taskName = normalizeWhitespace(String(task?.name || "")).toLowerCase();
  const note = rawNote.toLowerCase();
  const desired = desiredName.toLowerCase();
  let score = 0;

  if (!taskName) return score;
  if (taskName === desired) score += 100;
  if (taskName.includes(desired) || desired.includes(taskName)) score += 40;

  const person = extractPerson(rawNote, extractedFacts)?.toLowerCase();
  if (person && taskName.includes(person)) score += 35;

  const company = extractCompany(rawNote, extractedFacts)?.toLowerCase();
  if (company && taskName.includes(company)) score += 25;
  if (company) {
    const companyPattern = new RegExp(`\\b${escapeRegex(company)}\\b`, "i");
    if (companyPattern.test(String(task?.name || ""))) score += 55;

    const canonicalCompany = canonicalizeBusinessName(company);
    const canonicalTaskName = canonicalizeBusinessName(String(task?.name || ""));
    if (canonicalCompany && canonicalTaskName) {
      if (canonicalCompany === canonicalTaskName) {
        score += 140;
      } else if (
        canonicalTaskName.includes(canonicalCompany) ||
        canonicalCompany.includes(canonicalTaskName)
      ) {
        score += 85;
      } else {
        const companyTokens = canonicalCompany.split(" ").filter(Boolean);
        const taskTokens = new Set(canonicalTaskName.split(" ").filter(Boolean));
        const overlap = companyTokens.filter((token) => taskTokens.has(token));
        if (companyTokens.length >= 2 && overlap.length >= Math.min(companyTokens.length, 2)) {
          score += 55;
        }
      }
    }
  }

  if (person && company && note.includes(person) && note.includes(company)) score += 10;

  return score;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const forceCreate = Boolean(payload?.forceCreate);
    const manualName = normalizeWhitespace(String(payload?.manualName || payload?.manual_name || ""));
    const requestedUserId = payload?.userId ? String(payload.userId) : APP_USER_ID;
    if (requestedUserId !== APP_USER_ID) {
      return new Response(JSON.stringify({ success: false, error: "Invalid user context" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawNote = normalizeWhitespace(String(payload?.rawNote || payload?.raw_note || ""));
    const summary = normalizeWhitespace(String(payload?.summary || ""));
    const extractedFacts =
      payload?.extractedNote && typeof payload.extractedNote === "object" && payload.extractedNote.facts
        ? payload.extractedNote.facts
        : undefined;
    if (!rawNote) {
      return new Response(JSON.stringify({ success: false, error: "rawNote is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("LOCAL_SUPABASE_URL");
    const supabaseServiceKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("APP_SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("LOCAL_SUPABASE_SERVICE_ROLE_KEY");
    const clickupApiKey = Deno.env.get("CLICKUP_API_KEY") ?? Deno.env.get("LOCAL_CLICKUP_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !clickupApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Supabase or ClickUp environment is not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const leadsList =
      (V2_FROZEN_MANIFEST.default_source_list_id
        ? {
            clickup_list_id: V2_FROZEN_MANIFEST.default_source_list_id,
            title: V2_FROZEN_MANIFEST.default_source_list_name,
            space_id: null,
            space_name: V2_FROZEN_MANIFEST.default_source_space_name,
          }
        : null) ||
      (await resolveCachedClickUpListByName(
        supabase as any,
        requestedUserId,
        V2_FROZEN_MANIFEST.default_source_list_name,
        V2_FROZEN_MANIFEST.default_source_space_name
      ));

    if (!leadsList?.clickup_list_id) {
      return new Response(
        JSON.stringify({
          success: false,
          needsListName: true,
          error: "Could not resolve the default source list from cached ClickUp lists",
          requested_list_name: V2_FROZEN_MANIFEST.default_source_list_name,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const desiredName = manualName || buildSourceItemName(rawNote, summary, extractedFacts);
    const listTasksResponse = await fetch(`${CLICKUP_API_BASE}/list/${leadsList.clickup_list_id}/task`, {
      headers: {
        Authorization: clickupApiKey,
        "Content-Type": "application/json",
      },
    });

    if (!listTasksResponse.ok) {
      const details = await listTasksResponse.text().catch(() => "");
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to load source list tasks (${listTasksResponse.status})`,
          details,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const tasksData = await listTasksResponse.json();
    const existingTasks = Array.isArray(tasksData?.tasks) ? tasksData.tasks : [];
    const rankedMatches = existingTasks
      .map((task: any) => ({ task, score: computeMatchScore(task, rawNote, desiredName, extractedFacts) }))
      .filter((entry: { score: number }) => entry.score >= 60)
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score);

    const bestMatch = rankedMatches[0];
    const secondMatch = rankedMatches[1];
    const hasConfidentSingleMatch =
      Boolean(bestMatch) && (!secondMatch || bestMatch.score - secondMatch.score >= 20);

    if (!forceCreate && hasConfidentSingleMatch) {
      const task = bestMatch.task;
      console.info("[resolve-source-item] matched_existing_source_item", {
        task_id: task?.id ?? null,
        score: bestMatch.score,
        list_id: leadsList.clickup_list_id,
      });
      return new Response(
        JSON.stringify({
          success: true,
          sourceItem: {
            id: String(task.id),
            name: String(task.name || desiredName),
            url: task.url || `https://app.clickup.com/t/${task.id}`,
            list_id: leadsList.clickup_list_id,
            list_name: leadsList.title,
            best_time_to_contact: extractCustomFieldText(task, V2_FROZEN_MANIFEST.lead_best_time_to_contact_field_id),
            description: summarizeTaskDescription(task),
          },
          created: false,
          matched: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!forceCreate && rankedMatches.length > 1) {
      return new Response(
        JSON.stringify({
          success: false,
          ambiguous: true,
          candidates: rankedMatches.slice(0, 2).map((entry: { task: any; score: number }) => ({
            id: String(entry.task?.id || ""),
            name: String(entry.task?.name || desiredName),
            url: entry.task?.url || `https://app.clickup.com/t/${entry.task?.id}`,
            score: entry.score,
            list_id: leadsList.clickup_list_id,
            best_time_to_contact: extractCustomFieldText(entry.task, V2_FROZEN_MANIFEST.lead_best_time_to_contact_field_id),
            description: summarizeTaskDescription(entry.task),
          })),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!forceCreate) {
      return new Response(
        JSON.stringify({
          success: false,
          proposed: true,
          sourceItem: {
            id: null,
            name: desiredName,
            url: null,
            list_id: leadsList.clickup_list_id,
            list_name: leadsList.title,
          },
          candidates: rankedMatches.slice(0, 2).map((entry: { task: any; score: number }) => ({
            id: String(entry.task?.id || ""),
            name: String(entry.task?.name || desiredName),
            url: entry.task?.url || `https://app.clickup.com/t/${entry.task?.id}`,
            score: entry.score,
            list_id: leadsList.clickup_list_id,
            best_time_to_contact: extractCustomFieldText(entry.task, V2_FROZEN_MANIFEST.lead_best_time_to_contact_field_id),
            description: summarizeTaskDescription(entry.task),
          })),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const createResponse = await fetch(`${CLICKUP_API_BASE}/list/${leadsList.clickup_list_id}/task`, {
      method: "POST",
      headers: {
        Authorization: clickupApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: desiredName,
        description: [
          `Created by LifeOS from note intake.`,
          summary ? `Summary: ${summary}` : null,
          `Original note: ${rawNote}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
        assignees: [V2_FROZEN_MANIFEST.grant_clickup_user_id],
      }),
    });

    if (!createResponse.ok) {
      const details = await createResponse.text().catch(() => "");
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to create source item (${createResponse.status})`,
          details,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const created = await createResponse.json();
    console.info("[resolve-source-item] created_source_item", {
      task_id: created?.id ?? null,
      list_id: leadsList.clickup_list_id,
      task_name: desiredName,
    });

    return new Response(
      JSON.stringify({
        success: true,
        sourceItem: {
          id: String(created.id),
          name: String(created.name || desiredName),
          url: created.url || `https://app.clickup.com/t/${created.id}`,
          list_id: leadsList.clickup_list_id,
          list_name: leadsList.title,
        },
        created: true,
        matched: false,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[resolve-source-item] unhandled_error", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
