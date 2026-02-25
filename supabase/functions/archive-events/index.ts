import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const { userId, workspaceId } = await req.json()
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'User ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('LOCAL_SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('APP_SUPABASE_SERVICE_ROLE_KEY') ??
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
      Deno.env.get('LOCAL_SUPABASE_SERVICE_ROLE_KEY')
    const clickupApiKey = Deno.env.get('CLICKUP_API_KEY') ?? Deno.env.get('LOCAL_CLICKUP_API_KEY')

    if (!supabaseUrl || !supabaseServiceKey || !clickupApiKey) {
      return new Response(JSON.stringify({ error: 'Missing required environment variables' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const now = new Date()

    // Fetch all spaces for the user to find events
    const { data: spaces } = await supabase
      .from('clickup_spaces')
      .select('clickup_space_id, name')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)

    if (!spaces || spaces.length === 0) {
      return new Response(JSON.stringify({ error: 'No spaces found for user' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const archivedCount = { events: 0, tasks: 0 }
    const errors: string[] = []

    // Process each space for events to archive
    for (const space of spaces) {
      try {
        // Fetch all lists in the space
        const listsResponse = await fetch(`https://api.clickup.com/api/v2/space/${space.clickup_space_id}/list`, {
          headers: {
            Authorization: clickupApiKey,
            'Content-Type': 'application/json'
          }
        })

        if (!listsResponse.ok) {
          errors.push(`Failed to fetch lists for space ${space.name}`)
          continue
        }

        const listsData = await listsResponse.json()
        const lists = listsData?.lists || []

        // Process each list for events
        for (const list of lists) {
          try {
            // Fetch all tasks in the list
            const tasksResponse = await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task`, {
              headers: {
                Authorization: clickupApiKey,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                subtasks: true,
                include_closed: true
              })
            })

            if (!tasksResponse.ok) {
              errors.push(`Failed to fetch tasks for list ${list.name}`)
              continue
            }

            const tasksData = await tasksResponse.json()
            const tasks = tasksData?.tasks || []

            // Find events that should be archived
            for (const task of tasks) {
              if (
                task.due_date && 
                task.status?.status !== 'complete' && 
                task.status?.status !== 'closed' &&
                new Date(task.due_date) < now
              ) {
                try {
                  // Archive/close the event
                  const updateResponse = await fetch(`https://api.clickup.com/api/v2/task/${task.id}`, {
                    method: 'PUT',
                    headers: {
                      Authorization: clickupApiKey,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      status: 'complete',
                      closed: true,
                      date_closed: now.toISOString()
                    })
                  })

                  if (updateResponse.ok) {
                    archivedCount.events++
                  } else {
                    errors.push(`Failed to archive task ${task.id}`)
                  }
                } catch (taskError) {
                  errors.push(`Error archiving task ${task.id}: ${taskError}`)
                }
              }
            }

            archivedCount.tasks += tasks.length
          } catch (listError) {
            errors.push(`Error processing list ${list.name}: ${listError}`)
          }
        }
      } catch (spaceError) {
        errors.push(`Error processing space ${space.name}: ${spaceError}`)
      }
    }

    // Log the archival activity
    await supabase
      .from('activity_log')
      .insert({
        action: 'archive_events',
        entity_type: 'system',
        entity_id: 'archive_cron',
        user_id: userId,
        metadata: {
          archived_count: archivedCount.events,
          tasks_processed: archivedCount.tasks,
          errors: errors.length,
          error_details: errors,
          timestamp: now.toISOString()
        }
      })

    return new Response(JSON.stringify({
      success: true,
      archived: archivedCount.events,
      processed: archivedCount.tasks,
      errors: errors.length,
      error_details: errors,
      timestamp: now.toISOString()
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Archive events error:', error)
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
