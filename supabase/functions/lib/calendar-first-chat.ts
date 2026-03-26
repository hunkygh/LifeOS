import { createCalendarEvent, updateCalendarEvent } from './calendar-adapter.ts';

type SupabaseClient = any;

export type CalendarFirstResult = {
  handled: boolean;
  response?: Response;
};

type ActionCardField = {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select';
  placeholder?: string;
  options?: string[];
};

type ChatActionCard = {
  id: string;
  type: 'plan' | 'clarification' | 'error';
  description: string;
  fields: ActionCardField[];
  metadata: Record<string, any>;
};

type CalendarEventPlan = {
  title: string;
  description: string;
  start: string;
  end: string;
  recurrence: string | null;
  timezone: string;
};

type ClickUpPlan = {
  spaceId: string | null;
  listId: string | null;
  title: string;
  description: string;
  start: string;
  end: string;
  recurrence: string | null;
};

type NormalizedPlan = {
  version: 'v1';
  mode: 'calendar_description' | 'clickup_task';
  event: CalendarEventPlan;
  clickup?: ClickUpPlan;
  metadata: {
    confidence: number;
    requiresClarification: boolean;
    sourceIntent: string;
  };
};

type Dependencies = {
  req: Request;
  payload: any;
  message: string;
  metadata: Record<string, any>;
  inlineOverrides: Record<string, string>;
  supabase: SupabaseClient;
  userId: string;
  clickupApiKey: string | null;
  corsHeaders: Record<string, string>;
};

function parseBooleanFlag(value: string | undefined | null, defaultValue = false) {
  if (value == null) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parseNaturalDate(message: string): Date | null {
  const lower = message.toLowerCase();
  const now = new Date();
  const base = new Date(now);
  base.setHours(9, 0, 0, 0);

  if (lower.includes('tomorrow')) {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    return d;
  }

  const weekdayMatch = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (weekdayMatch) {
    const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const target = weekdays.indexOf(weekdayMatch[1]);
    if (target >= 0) {
      const d = new Date(base);
      const delta = (target - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + (delta === 0 ? 7 : delta));
      return d;
    }
  }

  return base;
}

function parseTimeOfDay(message: string, fallbackHour = 9, fallbackMinute = 0) {
  const match = message.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (!match) return { hour: fallbackHour, minute: fallbackMinute };
  let hour = Number(match[1]);
  const minute = Number(match[2] || '0');
  const meridiem = match[3].toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return { hour, minute };
}

function parseEndTime(message: string, start: Date): Date {
  const rangeMatch = message.match(/(?:to|\-|–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (rangeMatch) {
    let hour = Number(rangeMatch[1]);
    const minute = Number(rangeMatch[2] || '0');
    const meridiem = rangeMatch[3].toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    const due = new Date(start);
    due.setHours(hour, minute, 0, 0);
    if (due.getTime() <= start.getTime()) {
      due.setHours(due.getHours() + 1);
    }
    return due;
  }

  const due = new Date(start);
  due.setHours(due.getHours() + 1);
  return due;
}

function detectRecurrence(message: string): string | null {
  const lower = message.toLowerCase();
  if (lower.includes('every day') || lower.includes('daily')) return 'daily';
  if (lower.includes('every week') || lower.includes('weekly')) return 'weekly';
  if (lower.includes('every month') || lower.includes('monthly')) return 'monthly';
  return null;
}

function compactTitle(message: string) {
  const stripped = message
    .replace(/\s+/g, ' ')
    .replace(/^[\-–•\s]+/, '')
    .trim();
  const firstClause = stripped.split(/[.!?]/)[0] || stripped;
  const words = firstClause.split(' ').filter(Boolean);
  return words.slice(0, 7).join(' ').slice(0, 48) || 'Scheduled item';
}

function deriveSourceIntent(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes('meeting') || lower.includes('call') || lower.includes('appointment')) return 'event';
  if (lower.includes('task') || lower.includes('todo')) return 'task';
  return 'general';
}

function explicitClickUpMode(message: string, inlineOverrides: Record<string, string>, metadata: Record<string, any>) {
  const explicitMode = String(inlineOverrides.execution_mode || metadata.executionMode || '').trim().toLowerCase();
  if (explicitMode === 'clickup_task') return true;
  if (explicitMode === 'calendar_description') return false;

  const lower = message.toLowerCase();
  return (
    lower.includes('clickup') &&
    (lower.includes('task') || lower.includes('create in clickup') || lower.includes('make a task'))
  );
}

async function fetchClickupTargets(supabase: SupabaseClient, userId: string) {
  const { data: spaces } = await supabase
    .from('clickup_spaces')
    .select('clickup_space_id,name')
    .eq('user_id', userId)
    .order('name', { ascending: true });

  const { data: lists } = await supabase
    .from('clickup_lists')
    .select('clickup_list_id,title,space_id,metadata')
    .eq('user_id', userId)
    .order('title', { ascending: true });

  const safeSpaces = Array.isArray(spaces) ? spaces : [];
  const safeLists = Array.isArray(lists) ? lists : [];

  const spaceNameById = new Map<string, string>();
  safeSpaces.forEach((space: any) => {
    spaceNameById.set(String(space.clickup_space_id), space.name || `Space ${space.clickup_space_id}`);
  });

  const overrideSpaces = safeSpaces.map((space: any) => ({
    id: String(space.clickup_space_id),
    name: space.name || `Space ${space.clickup_space_id}`,
  }));

  const overrideLists = safeLists.map((list: any) => {
    const listId = String(list.clickup_list_id);
    const spaceId = String(list.space_id || list?.metadata?.space_id || '');
    const listName = list.title || list?.metadata?.source_name || `List ${listId}`;
    const spaceName = spaceNameById.get(spaceId) || 'Unknown Space';
    return {
      id: listId,
      label: `[${listName}] (${spaceName})`,
      name: listName,
      spaceId,
    };
  });

  return { overrideSpaces, overrideLists };
}

function pickBestClickupTarget(overrideLists: any[], message: string) {
  if (!overrideLists.length) return { listId: null, spaceId: null, label: null };
  const lower = message.toLowerCase();

  const scored = overrideLists.map((entry) => {
    const haystack = `${entry.name} ${entry.label}`.toLowerCase();
    let score = 0;
    if (haystack.includes('calendar') && (lower.includes('meeting') || lower.includes('schedule') || lower.includes('event'))) score += 10;
    if (haystack.includes('pipeline') && (lower.includes('lead') || lower.includes('prospect') || lower.includes('client'))) score += 10;
    if (haystack.includes('workout') && lower.includes('workout')) score += 10;
    if (haystack.includes('meal') && (lower.includes('meal') || lower.includes('protein'))) score += 10;
    if (lower.includes(entry.name.toLowerCase())) score += 4;
    return { ...entry, score };
  }).sort((a, b) => b.score - a.score);

  const chosen = scored[0];
  return {
    listId: chosen.id,
    spaceId: chosen.spaceId,
    label: chosen.label,
  };
}

function buildPlan(
  message: string,
  inlineOverrides: Record<string, string>,
  metadata: Record<string, any>,
  timezone: string,
  clickupTargets: { overrideSpaces: any[]; overrideLists: any[] }
): NormalizedPlan {
  const baseDate = parseNaturalDate(message) || new Date();
  const time = parseTimeOfDay(message, 9, 0);
  const start = new Date(baseDate);
  start.setHours(time.hour, time.minute, 0, 0);
  const end = parseEndTime(message, start);

  const recurrence = inlineOverrides.recurrence || detectRecurrence(message);
  const title = (inlineOverrides.rename_to || '').trim() || compactTitle(message);
  const description = (inlineOverrides.description_override || '').trim() || message.trim();
  const sourceIntent = deriveSourceIntent(message);
  const clickupMode = explicitClickUpMode(message, inlineOverrides, metadata);
  const suggestedTarget = pickBestClickupTarget(clickupTargets.overrideLists, message);

  const plan: NormalizedPlan = {
    version: 'v1',
    mode: clickupMode ? 'clickup_task' : 'calendar_description',
    event: {
      title,
      description,
      start: start.toISOString(),
      end: end.toISOString(),
      recurrence: recurrence || null,
      timezone,
    },
    metadata: {
      confidence: 0.7,
      requiresClarification: false,
      sourceIntent,
    },
  };

  if (clickupMode) {
    plan.clickup = {
      spaceId: String(inlineOverrides.target_space_id || suggestedTarget.spaceId || '' || null),
      listId: String(inlineOverrides.target_list_id || suggestedTarget.listId || '' || null),
      title,
      description,
      start: start.toISOString(),
      end: end.toISOString(),
      recurrence: recurrence || null,
    };
  }

  return plan;
}

function planSummary(plan: NormalizedPlan) {
  const startLabel = new Date(plan.event.start).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
  const endLabel = new Date(plan.event.end).toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });
  const recurrence = plan.event.recurrence ? ` • ${plan.event.recurrence}` : '';
  return `${plan.event.title} • ${startLabel} - ${endLabel}${recurrence}`;
}

function buildActionCard(
  message: string,
  plan: NormalizedPlan,
  clickupTargets: { overrideSpaces: any[]; overrideLists: any[] }
): ChatActionCard {
  const targetListId = plan.clickup?.listId || null;
  const targetSpaceId = plan.clickup?.spaceId || null;

  const targetLabel = (() => {
    if (!targetListId) return 'Google Calendar (primary)';
    const matched = clickupTargets.overrideLists.find((list) => String(list.id) === String(targetListId));
    return matched?.label || 'ClickUp task target';
  })();

  const fields: ActionCardField[] = [
    {
      name: 'target_space_id',
      label: 'Destination space',
      type: 'select',
      options: clickupTargets.overrideSpaces.map((space: any) => `${space.id}|${space.name}`),
    },
    {
      name: 'target_list_id',
      label: 'Destination list',
      type: 'select',
      options: clickupTargets.overrideLists
        .filter((list: any) => !targetSpaceId || String(list.spaceId) === String(targetSpaceId))
        .map((list: any) => `${list.id}|${list.label}`),
    },
  ];

  return {
    id: `calendar-plan-${Date.now()}`,
    type: 'plan',
    description: planSummary(plan),
    fields,
    metadata: {
      plan: {
        summary: planSummary(plan),
        details: [
          `Mode: ${plan.mode === 'calendar_description' ? 'Calendar-first' : 'Calendar + ClickUp task'}`,
          `Timezone: ${plan.event.timezone}`,
        ],
        target: {
          listId: targetListId,
          listName: targetLabel,
          spaceId: targetSpaceId,
        },
      },
      executionMode: plan.mode,
      preview: {
        name: plan.event.title,
        start: plan.event.start,
        due: plan.event.end,
        recurrence: plan.event.recurrence,
        description: plan.event.description,
      },
      fields,
      override_options: {
        spaces: clickupTargets.overrideSpaces,
        lists: clickupTargets.overrideLists,
      },
      clickup_space_id: targetSpaceId,
      target_list_id: targetListId,
      original_message: message,
      normalized_plan: plan,
      calendar: {
        timezone: plan.event.timezone,
      },
      mode_badge: plan.mode,
    },
  };
}

async function createClickUpTask(plan: ClickUpPlan, clickupApiKey: string) {
  if (!plan.listId) {
    throw new Error('ClickUp list is required for clickup_task mode');
  }

  const assigneeEnv = Deno.env.get('APP_CLICKUP_ASSIGNEE_ID') || Deno.env.get('LOCAL_CLICKUP_ASSIGNEE_ID') || '';
  const assignees = assigneeEnv ? [assigneeEnv] : undefined;

  const body: Record<string, any> = {
    name: plan.title,
    description: plan.description,
    start_date: String(new Date(plan.start).getTime()),
    due_date: String(new Date(plan.end).getTime()),
    due_date_time: true,
    start_date_time: true,
  };

  if (assignees?.length) body.assignees = assignees;

  const response = await fetch(`https://api.clickup.com/api/v2/list/${plan.listId}/task`, {
    method: 'POST',
    headers: {
      Authorization: clickupApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`ClickUp task creation failed (${response.status}): ${details}`);
  }

  const task = await response.json();
  return {
    taskId: task?.id ? String(task.id) : null,
    taskUrl: task?.url ? String(task.url) : null,
  };
}

async function saveExecutionMapping(supabase: SupabaseClient, payload: Record<string, any>) {
  try {
    await supabase.from('calendar_execution_log').upsert(payload, { onConflict: 'idempotency_key' });
  } catch (error) {
    console.error('Failed to persist calendar execution mapping', error);
  }
}

function buildResponse(body: Record<string, any>, corsHeaders: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export async function handleCalendarFirstChat(deps: Dependencies): Promise<CalendarFirstResult> {
  const enabled = parseBooleanFlag(Deno.env.get('CALENDAR_FIRST_ENABLED'), true);
  if (!enabled) return { handled: false };

  const { message, metadata, inlineOverrides, supabase, userId, clickupApiKey, corsHeaders } = deps;

  const timezone =
    Deno.env.get('APP_DEFAULT_TIMEZONE') ||
    Deno.env.get('GOOGLE_CALENDAR_TIMEZONE') ||
    'America/Denver';

  const clickupTargets = await fetchClickupTargets(supabase, userId);
  const basePlan = (metadata.normalized_plan as NormalizedPlan | undefined) || buildPlan(message, inlineOverrides, metadata, timezone, clickupTargets);

  const isApproval = String(inlineOverrides.approval || '').toLowerCase() === 'confirm';

  if (!isApproval) {
    const card = buildActionCard(message, basePlan, clickupTargets);
    return {
      handled: true,
      response: buildResponse(
        {
          message: `Prepared ${basePlan.mode === 'calendar_description' ? 'calendar' : 'calendar + ClickUp'} plan.`,
          metaResponse: 'Plan staged for approval',
          actionNeeded: card,
          executionMode: basePlan.mode,
        },
        corsHeaders,
        200
      ),
    };
  }

  const idempotencyKey =
    String(metadata.actionId || metadata.idempotencyKey || `${userId}:${basePlan.event.title}:${basePlan.event.start}`).slice(0, 180);

  let calendarResult;
  try {
    if (metadata.calendarEventId) {
      calendarResult = await updateCalendarEvent(String(metadata.calendarEventId), basePlan.event);
    } else {
      calendarResult = await createCalendarEvent(basePlan.event);
    }
  } catch (error) {
    return {
      handled: true,
      response: buildResponse(
        {
          message: 'Calendar execution failed. Please retry.',
          metaResponse: 'Calendar create/update error',
          stage: 'calendar_execute',
          error: error instanceof Error ? error.message : String(error),
        },
        corsHeaders,
        502
      ),
    };
  }

  let clickupTaskId: string | null = null;
  let clickupTaskUrl: string | null = null;
  let partialSuccess = false;
  let partialReason: string | null = null;

  const clickupTaskModeEnabled = parseBooleanFlag(Deno.env.get('CLICKUP_TASK_MODE_ENABLED'), true);

  if (basePlan.mode === 'clickup_task' && clickupTaskModeEnabled) {
    if (!clickupApiKey) {
      partialSuccess = true;
      partialReason = 'ClickUp API key not configured; calendar event created only.';
    } else if (!basePlan.clickup) {
      partialSuccess = true;
      partialReason = 'ClickUp task payload missing; calendar event created only.';
    } else {
      try {
        const taskResult = await createClickUpTask(basePlan.clickup, clickupApiKey);
        clickupTaskId = taskResult.taskId;
        clickupTaskUrl = taskResult.taskUrl;

        if (clickupTaskUrl) {
          const patchDescription = `${basePlan.event.description}\n\nClickUp Task: ${clickupTaskUrl}`;
          await updateCalendarEvent(calendarResult.eventId, {
            ...basePlan.event,
            description: patchDescription,
          });
        }
      } catch (error) {
        partialSuccess = true;
        partialReason = `ClickUp task creation failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  }

  await saveExecutionMapping(supabase, {
    idempotency_key: idempotencyKey,
    user_id: userId,
    execution_mode: basePlan.mode,
    proposal_payload: basePlan,
    calendar_event_id: calendarResult.eventId,
    clickup_task_id: clickupTaskId,
    status: partialSuccess ? 'partial_success' : 'success',
    error_reason: partialReason,
    updated_at: new Date().toISOString(),
  });

  const modeLabel = basePlan.mode === 'calendar_description' ? 'event' : 'event + task';

  return {
    handled: true,
    response: buildResponse(
      {
        message: partialSuccess
          ? `Created calendar event. ClickUp task step failed: ${partialReason}`
          : `Created ${modeLabel}: ${basePlan.event.title}`,
        metaResponse: partialSuccess ? 'Partial success' : 'Execution complete',
        executionMode: basePlan.mode,
        calendarEventId: calendarResult.eventId,
        clickupTaskId,
        partialSuccess,
        receipt: {
          title: `Created ${basePlan.event.title} in Google Calendar`,
          artifactId: calendarResult.eventId,
          deltaSummary: partialReason,
          priorityHint: basePlan.metadata.sourceIntent,
        },
      },
      corsHeaders,
      200
    ),
  };
}
