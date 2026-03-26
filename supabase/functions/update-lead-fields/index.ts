import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import type { V2ExtractedNote } from "../../../src/lib/v2ExtractedNote.ts";
import { prepareLeadFieldUpdates } from "../../../src/lib/v2LeadFieldUpdate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

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
    const targetId = String(payload?.targetId || "").trim();
    const extractedNote = (payload?.extractedNote || null) as V2ExtractedNote | null;

    if (!targetId) {
      return new Response(JSON.stringify({ success: false, error: "targetId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!extractedNote) {
      return new Response(JSON.stringify({ success: false, error: "extractedNote is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clickupApiKey = Deno.env.get("CLICKUP_API_KEY") ?? Deno.env.get("LOCAL_CLICKUP_API_KEY");
    if (!clickupApiKey) {
      return new Response(JSON.stringify({ success: false, error: "CLICKUP_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prepared = prepareLeadFieldUpdates(extractedNote);
    if (prepared.updates.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          updated: [],
          skipped: prepared.skipped,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const updated: string[] = [];
    const failed: Array<{ field: string; status: number; details: string }> = [];

    for (const update of prepared.updates) {
      const response = await fetch(`${CLICKUP_API_BASE}/task/${targetId}/field/${update.fieldId}`, {
        method: "POST",
        headers: {
          Authorization: clickupApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value: update.value }),
      });

      if (!response.ok) {
        failed.push({
          field: update.field,
          status: response.status,
          details: await response.text().catch(() => ""),
        });
        continue;
      }

      updated.push(update.field);
    }

    return new Response(
      JSON.stringify({
        success: failed.length === 0,
        updated,
        skipped: prepared.skipped,
        failed,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
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
