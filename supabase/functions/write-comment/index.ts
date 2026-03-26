import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { prepareCommentWriteForTarget, coerceV2NoteSchema } from "../../../src/lib/v2NoteSchema.ts";
import { V2_FROZEN_MANIFEST } from "../../../src/lib/v2Manifest.ts";

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
    const explicitTargetId = String(payload?.targetId || "").trim();
    const note = coerceV2NoteSchema(payload?.note || {});
    const resolvedTargetId = explicitTargetId || V2_FROZEN_MANIFEST.default_target_task_id;
    console.info("[write-comment] note_coerced", {
      note_type: note.note_type,
      target_id: resolvedTargetId,
      raw_note_length: note.raw_note.length,
    });
    const prepared = prepareCommentWriteForTarget({
      ...note,
      target_id: resolvedTargetId,
    }, resolvedTargetId);

    if (!prepared.ok || !prepared.commentText) {
      console.info("[write-comment] validation_failed", prepared.validation);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Schema validation failed",
          note,
          validation: prepared.validation,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const clickupApiKey =
      Deno.env.get("CLICKUP_API_KEY") ?? Deno.env.get("LOCAL_CLICKUP_API_KEY");

    if (!clickupApiKey) {
      console.error("[write-comment] missing_clickup_api_key");
      return new Response(
        JSON.stringify({
          success: false,
          error: "CLICKUP_API_KEY not configured",
          note,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const response = await fetch(`${CLICKUP_API_BASE}/task/${resolvedTargetId}/comment`, {
      method: "POST",
      headers: {
        Authorization: clickupApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        comment_text: prepared.commentText,
        notify_all: false,
      }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      console.error("[write-comment] clickup_write_failed", {
        status: response.status,
        target_id: resolvedTargetId,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: `ClickUp comment write failed (${response.status})`,
          details,
          note,
          target: { id: resolvedTargetId },
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    console.info("[write-comment] clickup_write_succeeded", {
      target_id: resolvedTargetId,
      comment_id: data?.id ?? null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        note,
        target: { id: resolvedTargetId },
        commentText: prepared.commentText,
        clickupResponse: data,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[write-comment] unhandled_error", error);
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
