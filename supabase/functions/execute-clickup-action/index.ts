import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type CapabilityType =
  | 'create_item'
  | 'update_item'
  | 'schedule_item'
  | 'propose_structure_change'

interface ExecutePayload {
  userId: string
  capability: CapabilityType
  target: {
    listId?: string
    taskId?: string
    spaceId?: string
  }
  input: {
    name?: string
    description?: string
    start_date?: number
    due_date?: number
    status?: string
    metadata?: Record<string, unknown>
  }
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function validatePayload(payload: any): payload is ExecutePayload {
  if (!payload || typeof payload !== 'object') return false
  if (!payload.userId || typeof payload.userId !== 'string') return false
  if (!payload.capability || typeof payload.capability !== 'string') return false
  if (!payload.target || typeof payload.target !== 'object') return false
  if (!payload.input || typeof payload.input !== 'object') return false
  return true
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  try {
    const clickupApiKey = Deno.env.get('CLICKUP_API_KEY') ?? Deno.env.get('LOCAL_CLICKUP_API_KEY')
    const defaultAssigneeId = (Deno.env.get('APP_CLICKUP_ASSIGNEE_ID') ?? Deno.env.get('LOCAL_CLICKUP_ASSIGNEE_ID'))?.trim() || null
    if (!clickupApiKey) {
      return json(500, { error: 'CLICKUP_API_KEY is not configured' })
    }

    const payload = await req.json()
    if (!validatePayload(payload)) {
      return json(400, { error: 'Invalid payload shape for execute-clickup-action' })
    }

    const { capability, target, input } = payload

    if (capability === 'propose_structure_change') {
      // Non-executing capability by design.
      return json(200, {
        success: true,
        executed: false,
        status: 'proposal_only',
        summary: 'Structure change proposal recorded. No mutation executed.',
      })
    }

    if (capability === 'create_item') {
      if (!target.listId) {
        return json(400, { error: 'create_item requires target.listId' })
      }

      const response = await fetch(`https://api.clickup.com/api/v2/list/${target.listId}/task`, {
        method: 'POST',
        headers: {
          Authorization: clickupApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: input.name || 'New Item',
          description: input.description || '',
          status: input.status || 'to do',
          notify_all: false,
          start_date: input.start_date,
          due_date: input.due_date,
          assignees: defaultAssigneeId ? [defaultAssigneeId] : undefined,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        return json(502, {
          error: `ClickUp create_item failed (${response.status})`,
          details: data,
        })
      }

      return json(200, {
        success: true,
        executed: true,
        capability,
        summary: `Created item ${data?.name || ''}`.trim(),
        mainTask: data,
      })
    }

    if (capability === 'update_item') {
      if (!target.taskId) {
        return json(400, { error: 'update_item requires target.taskId' })
      }

      const response = await fetch(`https://api.clickup.com/api/v2/task/${target.taskId}`, {
        method: 'PUT',
        headers: {
          Authorization: clickupApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: input.name,
          description: input.description,
          status: input.status,
          start_date: input.start_date,
          due_date: input.due_date,
          assignees: defaultAssigneeId
            ? {
                add: [defaultAssigneeId],
                rem: [],
              }
            : undefined,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        return json(502, {
          error: `ClickUp update_item failed (${response.status})`,
          details: data,
        })
      }

      return json(200, {
        success: true,
        executed: true,
        capability,
        summary: `Updated item ${data?.name || ''}`.trim(),
        mainTask: data,
      })
    }

    if (capability === 'schedule_item') {
      if (!target.taskId) {
        return json(400, { error: 'schedule_item requires target.taskId' })
      }

      const response = await fetch(`https://api.clickup.com/api/v2/task/${target.taskId}`, {
        method: 'PUT',
        headers: {
          Authorization: clickupApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          start_date: input.start_date,
          due_date: input.due_date,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        return json(502, {
          error: `ClickUp schedule_item failed (${response.status})`,
          details: data,
        })
      }

      return json(200, {
        success: true,
        executed: true,
        capability,
        summary: `Scheduled item ${data?.name || ''}`.trim(),
        mainTask: data,
      })
    }

    return json(400, { error: `Unsupported capability: ${capability}` })
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error)
    return json(500, { error: err, success: false })
  }
})
