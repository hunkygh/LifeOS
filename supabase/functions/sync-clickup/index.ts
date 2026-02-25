import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CLICKUP_API_BASE, syncClickUpConfiguration } from '../lib/clickup-sync.ts'
import { APP_USER_ID } from '../config/defaultUser.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = req.method === "POST" ? await req.json().catch(() => ({})) : {}
    const mode = String(payload?.mode || "full").toLowerCase()
    const completionOnly = mode === "completion_only"
    const requestedListIds = Array.isArray(payload?.listIds)
      ? payload.listIds.map((value: any) => String(value)).filter(Boolean)
      : []
    const requestedUserId = payload?.userId
    if (requestedUserId && requestedUserId !== APP_USER_ID) {
      return new Response(JSON.stringify({ error: "Invalid user context" }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const userId = requestedUserId || APP_USER_ID

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey =
      Deno.env.get('APP_SUPABASE_SERVICE_ROLE_KEY') ||
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const clickupApiKey = Deno.env.get('CLICKUP_API_KEY')

    if (!supabaseServiceKey || !supabaseUrl) {
      throw new Error('Missing Supabase configuration')
    }

    if (!supabaseServiceKey.includes('.') || supabaseServiceKey.split('.').length !== 3) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY must be the legacy JWT service_role key (format: x.y.z)')
    }

    if (!clickupApiKey) {
      throw new Error('CLICKUP_API_KEY not configured')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const syncResult = completionOnly
      ? {
          workspaces: [],
          selected_workspace_id: Deno.env.get("APP_CLICKUP_WORKSPACE_ID")?.trim() || null,
          selected_workspace_name: Deno.env.get("APP_CLICKUP_WORKSPACE_NAME")?.trim() || null,
          spaces_synced: 0,
          lists_synced: 0
        }
      : await syncClickUpConfiguration(supabase, clickupApiKey, userId)
    const scopedWorkspaceId =
      syncResult?.selected_workspace_id ||
      (syncResult?.workspaces || [])[0]?.clickup_workspace_id ||
      null
    let workspaceQuery = supabase
      .from("clickup_workspaces")
      .select("id, clickup_workspace_id, name")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
    if (scopedWorkspaceId) {
      workspaceQuery = workspaceQuery.eq("clickup_workspace_id", scopedWorkspaceId)
    }
    const { data: workspaceRows } = await workspaceQuery

    let spacesQuery = supabase
      .from("clickup_spaces")
      .select("clickup_space_id")
      .eq("user_id", userId)
    if (scopedWorkspaceId) {
      spacesQuery = spacesQuery.eq("workspace_id", scopedWorkspaceId)
    }
    const { data: spaceRows } = await spacesQuery

    const scopedSpaceIds = new Set((spaceRows || []).map((space: any) => String(space.clickup_space_id)))

    const { data: listRows } = await supabase
      .from("clickup_lists")
      .select("id, clickup_list_id, title, list_id, space_id, metadata")
      .eq("user_id", userId)
    const scopedLists = (listRows || []).filter((list: any) => {
      const spaceId = list?.space_id || list?.metadata?.space_id || null
      return spaceId ? scopedSpaceIds.has(String(spaceId)) : false
    }).filter((list: any) => {
      if (!requestedListIds.length) return true
      const listId = String(list?.clickup_list_id || list?.list_id || '')
      return requestedListIds.includes(listId)
    })

    const completionSnapshots = await ingestCompletionSnapshots({
      supabase,
      clickupApiKey,
      userId,
      lists: scopedLists,
      source: completionOnly ? 'completion-only' : 'sync-clickup'
    })

    return new Response(JSON.stringify({
      success: true,
      workspaces: workspaceRows || syncResult?.workspaces || [],
      synced_workspaces: syncResult?.workspaces?.length || 0,
      total_spaces: spaceRows?.length ?? 0,
      total_lists: scopedLists.length,
      persisted_spaces: syncResult?.spaces_synced ?? 0,
      persisted_lists: syncResult?.lists_synced ?? 0,
      selected_workspace_id: scopedWorkspaceId,
      mode,
      completion_snapshots: completionSnapshots
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  } catch (error) {
    console.error('Sync ClickUp error', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function ingestCompletionSnapshots({
  supabase,
  clickupApiKey,
  userId,
  lists,
  source
}: {
  supabase: any
  clickupApiKey: string
  userId: string
  lists: any[]
  source: string
}) {
  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfWeek = new Date(startOfToday)
  const day = startOfWeek.getDay()
  const diff = (day + 6) % 7
  startOfWeek.setDate(startOfWeek.getDate() - diff)
  const todayKey = startOfToday.toISOString().slice(0, 10)

  let inserted = 0
  let skipped = 0
  let errors = 0

  for (const list of lists) {
    const clickupListId = String(list?.clickup_list_id || list?.list_id || '')
    if (!clickupListId) {
      skipped += 1
      continue
    }

    try {
      const response = await fetch(
        `${CLICKUP_API_BASE}/list/${clickupListId}/task?archived=false&include_closed=true&page=0&subtasks=true`,
        {
          headers: { Authorization: clickupApiKey }
        }
      )
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        console.error('Completion snapshot fetch failed', clickupListId, response.status, text)
        continue
      }

      const payload = await response.json()
      const tasks = Array.isArray(payload?.tasks) ? payload.tasks : []
      let completedToday = 0
      let completedWeek = 0

      for (const task of tasks) {
        const closedAtRaw = task?.date_closed || task?.date_done || null
        if (!closedAtRaw) continue
        const closedAt = new Date(Number(closedAtRaw))
        if (Number.isNaN(closedAt.getTime())) continue

        if (closedAt >= startOfWeek) completedWeek += 1
        if (closedAt >= startOfToday) completedToday += 1
      }

      const metricUpdates = [
        { metric: 'completed_tasks_daily', value: completedToday },
        { metric: 'completed_tasks_weekly', value: completedWeek }
      ]
      const listTitle = list?.title || list?.metadata?.source_name || `List ${clickupListId}`
      const referenceName = `sync-completion:${clickupListId}:${todayKey}`
      const { data: existing } = await supabase
        .from('clickup_artifacts')
        .select('id')
        .eq('user_id', userId)
        .eq('reference_name', referenceName)
        .limit(1)
        .maybeSingle()
      if (existing?.id) {
        skipped += 1
        continue
      }

      const artifactRow = {
        user_id: userId,
        list_id: clickupListId,
        status: 'success',
        reference_name: referenceName,
        summary_note: `Completion snapshot for ${listTitle}`,
        request_payload: {
          source,
          list_id: clickupListId,
          list_title: listTitle
        },
        response_payload: {
          metric_updates: metricUpdates
        },
        fallback_used: false
      }
      const { error } = await supabase.from('clickup_artifacts').insert(artifactRow)
      if (error) {
        console.error('Completion snapshot artifact insert failed', error)
        errors += 1
      } else {
        inserted += 1
      }
    } catch (error) {
      console.error('Completion snapshot processing failed', clickupListId, error)
      errors += 1
    }
  }

  return { inserted, skipped, errors }
}
