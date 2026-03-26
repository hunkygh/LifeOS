import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { syncClickUpConfiguration } from '../lib/clickup-sync.ts'
import { APP_USER_ID } from '../config/defaultUser.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Document sync endpoint for analyzing and organizing misplaced documents
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let stage = 'init'
  try {
    stage = 'parse_payload'
    const payload = await req.json()
    const { operation_type, userId: requestedUserId, analysis_options } = payload
    if (requestedUserId && requestedUserId !== APP_USER_ID) {
      return new Response(
        JSON.stringify({ error: 'Invalid user context' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const userId = requestedUserId || APP_USER_ID

    if (!operation_type || !['analysis', 'movement', 'rollback'].includes(operation_type)) {
      return new Response(
        JSON.stringify({ error: 'Valid operation_type required (analysis, movement, or rollback)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    stage = 'env_setup'
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const clickupApiKey = Deno.env.get('CLICKUP_API_KEY') ?? Deno.env.get('LOCAL_CLICKUP_API_KEY')
    const supabaseServiceKey =
      Deno.env.get('APP_SUPABASE_SERVICE_ROLE_KEY') ||
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('SUPABASE_URL or service role key not configured')
    }
    if (!clickupApiKey) {
      throw new Error('CLICKUP_API_KEY not configured')
    }
    if (!supabaseServiceKey.includes('.') || supabaseServiceKey.split('.').length !== 3) {
      throw new Error('SUPABASE service role key must be legacy JWT format (x.y.z)')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    stage = 'create_sync_operation'
    // Create sync operation record
    const { data: syncOp, error: syncOpError } = await supabase
      .from('document_sync_operations')
      .insert({
        operation_type,
        status: 'running',
        user_id: userId,
        metadata: analysis_options || {}
      })
      .select()
      .single()

    if (syncOpError || !syncOp) {
      throw new Error(`Failed to create sync operation: ${syncOpError?.message}`)
    }

    const startTime = Date.now()

    if (operation_type === 'analysis') {
      return await handleAnalysisOperation(supabase, clickupApiKey, userId, syncOp.id, startTime)
    } else if (operation_type === 'movement') {
      return await handleMovementOperation(supabase, clickupApiKey, userId, syncOp.id, startTime)
    } else if (operation_type === 'rollback') {
      return await handleRollbackOperation(supabase, clickupApiKey, userId, syncOp.id, startTime)
    }

  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error)
    console.error(`[document-sync] stage=${stage} error=${errMessage}`, error)
    
    return new Response(
      JSON.stringify({ 
        error: errMessage,
        stage,
        success: false
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

async function handleAnalysisOperation(
  supabase: any, 
  clickupApiKey: string, 
  userId: string, 
  syncOpId: string,
  startTime: number
) {
  try {
    await syncClickUpConfiguration(supabase, clickupApiKey, userId)

    const configuredWorkspaceId = Deno.env.get('APP_CLICKUP_WORKSPACE_ID')?.trim()
    let workspaceId = configuredWorkspaceId || ''
    if (!workspaceId) {
      const { data: workspaceRow, error: workspaceError } = await supabase
        .from('clickup_workspaces')
        .select('clickup_workspace_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle()
      if (workspaceError) {
        throw new Error(`Failed to resolve ClickUp workspace: ${workspaceError.message}`)
      }
      workspaceId = String(workspaceRow?.clickup_workspace_id || '')
    }

    if (!workspaceId) {
      throw new Error('No ClickUp workspace configured for document sync')
    }

    const cutoffDate = new Date(Date.now() - (2 * 24 * 60 * 60 * 1000))
    const unsortedDocs = await fetchWorkspaceLevelDocs(clickupApiKey, workspaceId, cutoffDate)

    const { data: spaces, error: spacesError } = await supabase
      .from('clickup_spaces')
      .select('clickup_space_id,name')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)

    if (spacesError) {
      throw new Error(`Failed to load spaces for semantic routing: ${spacesError.message}`)
    }

    const { data: lists, error: listsError } = await supabase
      .from('clickup_lists')
      .select('clickup_list_id,title,space_id')
      .eq('user_id', userId)
      .not('clickup_list_id', 'is', null)

    if (listsError) {
      throw new Error(`Failed to load lists for semantic routing: ${listsError.message}`)
    }

    const routingCandidates = (lists || [])
      .map((list: any) => {
        const parentSpace = (spaces || []).find((space: any) => String(space.clickup_space_id) === String(list.space_id))
        if (!parentSpace) return null
        return {
          listId: String(list.clickup_list_id),
          listName: String(list.title || 'Untitled List'),
          spaceId: String(parentSpace.clickup_space_id),
          spaceName: String(parentSpace.name || 'Untitled Space'),
        }
      })
      .filter(Boolean) as Array<{ listId: string; listName: string; spaceId: string; spaceName: string }>

    const groqApiKey = Deno.env.get('GROQ_API_KEY') ?? Deno.env.get('LOCAL_GROQ_API_KEY') ?? ''
    const recommendations = []
    for (const doc of unsortedDocs) {
      const routingHint = extractRoutingHint(doc.title)
      let resolvedTarget: Awaited<ReturnType<typeof resolveDestinationFromHint>> = null
      if (routingHint && routingCandidates.length > 0 && groqApiKey) {
        resolvedTarget = await resolveDestinationFromHint(groqApiKey, routingHint, routingCandidates)
      }

      recommendations.push({
        document_id: doc.id,
        document_title: doc.title,
        current_space_id: null,
        current_list_id: null,
        current_space_name: 'Workspace',
        current_list_name: 'Unsorted Docs',
        recommended_space_id: resolvedTarget?.spaceId || null,
        recommended_list_id: resolvedTarget?.listId || null,
        recommended_space_name: resolvedTarget?.spaceName || '',
        recommended_list_name: resolvedTarget?.listName || '',
        confidence_score: resolvedTarget?.confidence ?? 0.75,
        reasoning: resolvedTarget
          ? `Title hint "${routingHint}" routed semantically`
          : 'Workspace-level Doc without resolved destination',
        content_type: 'workspace_doc',
        keywords: routingHint ? [routingHint] : [],
        entities: routingHint ? { routing_hint: routingHint } : {},
        sync_operation_id: syncOpId,
        user_id: userId
      })
    }

    await supabase
      .from('document_recommendations')
      .delete()
      .eq('user_id', userId)
      .eq('moved', false)

    if (recommendations.length > 0) {
      const { error: insertError } = await supabase
        .from('document_recommendations')
        .insert(recommendations)

      if (insertError) {
        throw new Error(`Failed to store recommendations: ${insertError.message}`)
      }
    }

    // Update sync operation
    const executionTime = Date.now() - startTime
    await supabase
      .from('document_sync_operations')
      .update({
        status: 'completed',
        documents_analyzed: unsortedDocs.length,
        documents_moved: 0,
        documents_failed: 0,
        execution_time_ms: executionTime,
        completed_at: new Date().toISOString(),
        metadata: {
          workspace_id: workspaceId,
          docs_found: unsortedDocs.length,
          freshness_window_days: 2
        }
      })
      .eq('id', syncOpId)

    return new Response(
      JSON.stringify({
        success: true,
        operation_type: 'analysis',
        sync_operation_id: syncOpId,
        summary: {
          documents_analyzed: unsortedDocs.length,
          misplaced_documents_found: unsortedDocs.length,
          recommendations_created: recommendations.length,
          execution_time_ms: executionTime
        },
        recommendations: recommendations.map(rec => ({
          id: rec.id,
          document_title: rec.document_title,
          current_location: `${rec.current_space_name} > ${rec.current_list_name}`,
          confidence_score: rec.confidence_score
        })),
        stage: 'analysis_complete'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    // Update sync operation with error
    await supabase
      .from('document_sync_operations')
      .update({
        status: 'failed',
        error_details: { message: error instanceof Error ? error.message : String(error) },
        completed_at: new Date().toISOString()
      })
      .eq('id', syncOpId)

    throw error
  }
}

async function handleMovementOperation(
  supabase: any, 
  clickupApiKey: string, 
  userId: string, 
  syncOpId: string,
  startTime: number
) {
  try {
    // Get approved recommendations
    const { data: recommendations, error: recError } = await supabase
      .from('document_recommendations')
      .select('*')
      .eq('user_id', userId)
      .eq('user_approved', true)
      .eq('moved', false)

    if (recError) {
      throw new Error(`Failed to fetch recommendations: ${recError.message}`)
    }

    if (!recommendations?.length) {
      return new Response(
        JSON.stringify({
          success: true,
          operation_type: 'movement',
          sync_operation_id: syncOpId,
          summary: {
            documents_moved: 0,
            documents_failed: 0,
            message: 'No approved recommendations found to move'
          }
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    let movedCount = 0
    let failedCount = 0
    const movementHistory = []

    // Execute movements
    for (const recommendation of recommendations) {
      try {
        // Move document in ClickUp
        await moveDocumentInClickUp(
          clickupApiKey,
          recommendation.document_id,
          recommendation.recommended_list_id
        )

        // Record movement history
        movementHistory.push({
          document_id: recommendation.document_id,
          document_title: recommendation.document_title,
          from_space_id: recommendation.current_space_id,
          from_list_id: recommendation.current_list_id,
          from_space_name: recommendation.current_space_name,
          from_list_name: recommendation.current_list_name,
          to_space_id: recommendation.recommended_space_id,
          to_list_id: recommendation.recommended_list_id,
          to_space_name: recommendation.recommended_space_name,
          to_list_name: recommendation.recommended_list_name,
          movement_reason: recommendation.reasoning,
          sync_operation_id: syncOpId,
          user_initiated: false,
          user_id: userId
        })

        // Mark recommendation as moved
        await supabase
          .from('document_recommendations')
          .update({ moved: true, moved_at: new Date().toISOString() })
          .eq('id', recommendation.id)

        movedCount++

      } catch (moveError) {
        console.error(`Failed to move document ${recommendation.document_id}:`, moveError)
        
        // Mark recommendation as failed
        await supabase
          .from('document_recommendations')
          .update({ 
            move_error: moveError instanceof Error ? moveError.message : String(moveError)
          })
          .eq('id', recommendation.id)

        failedCount++
      }
    }

    // Store movement history
    if (movementHistory.length > 0) {
      await supabase
        .from('document_movement_history')
        .insert(movementHistory)
    }

    // Update sync operation
    const executionTime = Date.now() - startTime
    await supabase
      .from('document_sync_operations')
      .update({
        status: 'completed',
        documents_analyzed: 0,
        documents_moved: movedCount,
        documents_failed: failedCount,
        execution_time_ms: executionTime,
        completed_at: new Date().toISOString()
      })
      .eq('id', syncOpId)

    return new Response(
      JSON.stringify({
        success: true,
        operation_type: 'movement',
        sync_operation_id: syncOpId,
        summary: {
          documents_moved: movedCount,
          documents_failed: failedCount,
          execution_time_ms: executionTime
        },
        movements: movementHistory.map(movement => ({
          document_title: movement.document_title,
          from_location: `${movement.from_space_name} > ${movement.from_list_name}`,
          to_location: `${movement.to_space_name} > ${movement.to_list_name}`,
          movement_reason: movement.movement_reason
        })),
        stage: 'movement_complete'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    // Update sync operation with error
    await supabase
      .from('document_sync_operations')
      .update({
        status: 'failed',
        error_details: { message: error instanceof Error ? error.message : String(error) },
        completed_at: new Date().toISOString()
      })
      .eq('id', syncOpId)

    throw error
  }
}

async function handleRollbackOperation(
  supabase: any, 
  clickupApiKey: string, 
  userId: string, 
  syncOpId: string,
  startTime: number
) {
  try {
    // Get recent movement history for this user
    const { data: movements, error: moveError } = await supabase
      .from('document_movement_history')
      .select('*')
      .eq('user_id', userId)
      .eq('user_initiated', false)
      .order('created_at', { ascending: false })
      .limit(50) // Limit to last 50 movements

    if (moveError) {
      throw new Error(`Failed to fetch movement history: ${moveError.message}`)
    }

    if (!movements?.length) {
      return new Response(
        JSON.stringify({
          success: true,
          operation_type: 'rollback',
          sync_operation_id: syncOpId,
          summary: {
            documents_rolled_back: 0,
            documents_failed: 0,
            message: 'No recent movements found to rollback'
          }
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    let rollbackCount = 0
    let failedCount = 0

    // Execute rollback movements
    for (const movement of movements) {
      try {
        // Move document back to original location
        await moveDocumentInClickUp(
          clickupApiKey,
          movement.document_id,
          movement.from_list_id
        )

        // Update recommendation
        await supabase
          .from('document_recommendations')
          .update({ 
            moved: false, 
            moved_at: null,
            move_error: null 
          })
          .eq('document_id', movement.document_id)
          .eq('user_id', userId)

        rollbackCount++

      } catch (rollbackError) {
        console.error(`Failed to rollback document ${movement.document_id}:`, rollbackError)
        failedCount++
      }
    }

    // Update sync operation
    const executionTime = Date.now() - startTime
    await supabase
      .from('document_sync_operations')
      .update({
        status: 'completed',
        documents_analyzed: 0,
        documents_moved: rollbackCount,
        documents_failed: failedCount,
        execution_time_ms: executionTime,
        completed_at: new Date().toISOString(),
        metadata: { rollback_operation: true }
      })
      .eq('id', syncOpId)

    return new Response(
      JSON.stringify({
        success: true,
        operation_type: 'rollback',
        sync_operation_id: syncOpId,
        summary: {
          documents_rolled_back: rollbackCount,
          documents_failed: failedCount,
          execution_time_ms: executionTime
        },
        stage: 'rollback_complete'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    // Update sync operation with error
    await supabase
      .from('document_sync_operations')
      .update({
        status: 'failed',
        error_details: { message: error instanceof Error ? error.message : String(error) },
        completed_at: new Date().toISOString()
      })
      .eq('id', syncOpId)

    throw error
  }
}

// Helper functions
async function fetchWorkspaceLevelDocs(
  clickupApiKey: string,
  workspaceId: string,
  cutoffDate: Date
): Promise<any[]> {
  const response = await fetch(
    `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs`,
    {
      headers: {
        'Authorization': clickupApiKey
      }
    }
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Failed to fetch workspace docs (${response.status}): ${body}`)
  }

  const payload = await response.json()
  const docs = Array.isArray(payload?.docs) ? payload.docs : []

  const workspaceOnlyDocs = docs.filter((doc: any) => {
    const parentType = String(doc?.parent?.type || '').toLowerCase()
    const hasLocation = Boolean(
      doc?.space_id ||
      doc?.folder_id ||
      doc?.list_id ||
      doc?.location?.space_id ||
      doc?.location?.folder_id ||
      doc?.location?.list_id
    )

    if (!hasLocation) return true
    return parentType === 'workspace'
  })

  const freshDocs = workspaceOnlyDocs.filter((doc: any) => {
    const timestamp = getDocTimestamp(doc)
    return timestamp ? timestamp >= cutoffDate : true
  })

  return freshDocs.map((doc: any) => ({
    id: String(doc.id),
    title: String(doc.name || doc.title || 'Untitled Doc')
  }))
}

function getDocTimestamp(doc: any): Date | null {
  if (doc?.date_updated) {
    const ms = Number(doc.date_updated)
    if (!Number.isNaN(ms)) return new Date(ms)
  }
  if (doc?.date_created) {
    const ms = Number(doc.date_created)
    if (!Number.isNaN(ms)) return new Date(ms)
  }
  if (doc?.updated_at) {
    const parsed = new Date(doc.updated_at)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  if (doc?.created_at) {
    const parsed = new Date(doc.created_at)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return null
}

function extractRoutingHint(title: string): string | null {
  const source = String(title || '')
  const delimiters = [';', '-']
  for (const delimiter of delimiters) {
    const idx = source.lastIndexOf(delimiter)
    if (idx > 0 && idx < source.length - 1) {
      const hint = source.slice(idx + 1).trim()
      if (hint.length >= 2) return hint
    }
  }
  return null
}

async function resolveDestinationFromHint(
  groqApiKey: string,
  routingHint: string,
  candidates: Array<{ listId: string; listName: string; spaceId: string; spaceName: string }>
): Promise<{ listId: string; listName: string; spaceId: string; spaceName: string; confidence: number } | null> {
  const compactCandidates = candidates.map((candidate, index) => ({
    idx: index + 1,
    list_id: candidate.listId,
    list_name: candidate.listName,
    space_id: candidate.spaceId,
    space_name: candidate.spaceName,
  }))

  const prompt = `Map this document routing hint to the best ClickUp destination.\nHint: "${routingHint}"\nCandidates: ${JSON.stringify(compactCandidates)}\nReturn strict JSON only: {"idx":number|null,"confidence":number}.\nChoose null if no reasonable match.`

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      messages: [
        { role: 'system', content: 'You are a strict JSON router. Never output prose.' },
        { role: 'user', content: prompt }
      ]
    })
  })

  if (!response.ok) return null
  const result = await response.json()
  const rawContent = result?.choices?.[0]?.message?.content ?? ''
  const jsonStart = rawContent.indexOf('{')
  const jsonEnd = rawContent.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) return null

  try {
    const parsed = JSON.parse(rawContent.slice(jsonStart, jsonEnd + 1))
    const idx = Number(parsed?.idx)
    const confidence = Math.max(0, Math.min(1, Number(parsed?.confidence || 0)))
    if (!Number.isFinite(idx) || idx < 1 || idx > candidates.length) return null
    const candidate = candidates[idx - 1]
    return {
      listId: candidate.listId,
      listName: candidate.listName,
      spaceId: candidate.spaceId,
      spaceName: candidate.spaceName,
      confidence
    }
  } catch {
    return null
  }
}

async function moveDocumentInClickUp(
  clickupApiKey: string,
  taskId: string,
  targetListId: string
): Promise<void> {
  const response = await fetch(
    `https://api.clickup.com/api/v2/task/${taskId}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': clickupApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        list_id: targetListId
      })
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`ClickUp API error: ${response.status} - ${errorText}`)
  }
}
