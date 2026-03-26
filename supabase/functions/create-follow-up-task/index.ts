import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  coerceV2ActionPlan,
  getCreateFollowUpTaskAction,
  prepareCreateFollowUpTaskAction,
  validateV2ActionPlan,
  type CreateFollowUpTaskAction,
} from "../../../src/lib/v2ActionPlan.ts";
import { V2_FROZEN_MANIFEST } from "../../../src/lib/v2Manifest.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

function normalizeTaskTitle(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 72);
}

function normalizeTaskDescription(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

function extractTaskAction(payload: Record<string, unknown>) {
  const directAction = payload?.action as CreateFollowUpTaskAction | undefined;
  if (directAction?.type === "create_follow_up_task") {
    return directAction;
  }

  const plan = coerceV2ActionPlan(payload?.plan);
  const planValidation = validateV2ActionPlan(plan);
  if (!planValidation.valid) {
    return {
      error: {
        success: false,
        error: "Action plan validation failed",
        validation: planValidation,
      },
    };
  }

  return {
    action: getCreateFollowUpTaskAction(plan),
  };
}

function parseTimeOfDay(hint: string) {
  const normalized = hint.toLowerCase();
  const explicit = normalized.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (explicit) {
    let hour = Number(explicit[1]) % 12;
    const minute = explicit[2] ? Number(explicit[2]) : 0;
    if (explicit[3] === "pm") hour += 12;
    return { hour, minute };
  }

  if (/\bmorning\b/.test(normalized)) return { hour: 9, minute: 0 };
  if (/\bafternoon\b/.test(normalized)) return { hour: 15, minute: 0 };
  if (/\btonight\b|\bnight\b|\bevening\b/.test(normalized)) return { hour: 19, minute: 0 };

  return null;
}

function parseDueHintToMs(dueHint: string | null) {
  if (!dueHint) return null;
  const raw = dueHint.trim();
  const normalized = raw.toLowerCase();
  if (!normalized) return null;

  const directDate = new Date(raw);
  if (!Number.isNaN(directDate.getTime()) && /t\d{2}:\d{2}/i.test(raw)) {
    return directDate.getTime();
  }

  const isoMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})(?:[t\s](\d{2}:\d{2}))?$/i);
  if (isoMatch) {
    const date = new Date(`${isoMatch[1]}T${isoMatch[2] || "09:00"}:00`);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }

  const now = new Date();
  const result = new Date(now);
  result.setSeconds(0, 0);

  if (normalized.includes("tomorrow")) {
    result.setDate(result.getDate() + 1);
  } else if (normalized.includes("today")) {
    // keep today
  } else {
    const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
    const shortToFull: Record<string, number> = {
      sun: 0,
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5,
      sat: 6,
    };
    const weekdayMatch = normalized.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b/);
    if (weekdayMatch) {
      const raw = weekdayMatch[1];
      const targetDay =
        raw.length <= 3 ? shortToFull[raw.slice(0, 3) as keyof typeof shortToFull] : weekdays.indexOf(raw as (typeof weekdays)[number]);
      if (targetDay >= 0) {
        const currentDay = result.getDay();
        let daysAhead = (targetDay - currentDay + 7) % 7;
        if (daysAhead === 0) daysAhead = 7;
        result.setDate(result.getDate() + daysAhead);
      }
    } else {
      return null;
    }
  }

  const time = parseTimeOfDay(normalized);
  if (time) {
    result.setHours(time.hour, time.minute, 0, 0);
  } else {
    result.setHours(9, 0, 0, 0);
  }

  return result.getTime();
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
    const deviceTimeZone = typeof payload?.device_time_zone === "string" ? payload.device_time_zone : null;
    const extracted = extractTaskAction(payload || {});
    if ("error" in extracted && extracted.error) {
      return new Response(JSON.stringify(extracted.error), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prepared = prepareCreateFollowUpTaskAction(extracted.action);
    if (!prepared.ok || !prepared.taskAction) {
      console.info("[create-follow-up-task] validation_failed", prepared.validation);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Create follow-up task validation failed",
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
      return new Response(
        JSON.stringify({
          success: false,
          error: "CLICKUP_API_KEY not configured",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const dueDate = parseDueHintToMs(prepared.taskAction.payload.due_hint);
    const parentLeadId = prepared.taskAction.payload.source_target_id;
    const taskBody: Record<string, unknown> = {
      name: normalizeTaskTitle(prepared.taskAction.payload.title),
      description: normalizeTaskDescription(prepared.taskAction.payload.description),
      assignees: [V2_FROZEN_MANIFEST.grant_clickup_user_id],
      parent: parentLeadId,
    };

    if (dueDate) {
      taskBody.due_date = String(dueDate);
      taskBody.due_date_time = true;
    }

    console.info("[create-follow-up-task] subtask_create_requested", {
      list_id: prepared.taskAction.payload.list_id,
      parent_task_id: parentLeadId,
      due_hint: prepared.taskAction.payload.due_hint,
      due_date: dueDate,
      device_time_zone: deviceTimeZone,
    });

    const response = await fetch(
      `${CLICKUP_API_BASE}/list/${prepared.taskAction.payload.list_id}/task`,
      {
        method: "POST",
        headers: {
          Authorization: clickupApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskBody),
      }
    );

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      console.error("[create-follow-up-task] clickup_create_failed", {
        status: response.status,
        list_id: prepared.taskAction.payload.list_id,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: `ClickUp subtask create failed (${response.status})`,
          details,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    const createdTaskId = String(data?.id || "");
    const responseParentId =
      data?.parent != null
        ? String(data.parent)
        : data?.parent_task?.id != null
          ? String(data.parent_task.id)
          : data?.top_level_parent != null
            ? String(data.top_level_parent)
            : null;
    const subtaskAttached = Boolean(
      createdTaskId &&
      parentLeadId &&
      responseParentId &&
      String(responseParentId) === String(parentLeadId)
    );

    console.info("[create-follow-up-task] clickup_subtask_create_succeeded", {
      task_id: data?.id ?? null,
      parent_task_id: parentLeadId,
      list_id: prepared.taskAction.payload.list_id,
      response_parent_id: responseParentId,
      subtask_attached: subtaskAttached,
    });

    return new Response(
      JSON.stringify({
        success: true,
        action: prepared.taskAction,
        createdTask: data,
        parentLeadId,
        subtaskAttached,
        deviceTimeZone,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[create-follow-up-task] unhandled_error", error);
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
