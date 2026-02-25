import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DocumentAnalyzer, DocumentAnalysis, DocumentAnalysisConfig } from '../lib/document-analyzer.ts'
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
    // Sync ClickUp configuration first
    await syncClickUpConfiguration(supabase, clickupApiKey, userId)

    // Get workspace configuration
    const { data: spaces } = await supabase
      .from('clickup_spaces')
      .select('*')
      .eq('user_id', userId)
      .order('priority_rank', { ascending: true })

    const { data: lists } = await supabase
      .from('clickup_lists')
      .select('*')
      .eq('user_id', userId)

    if (!spaces?.length || !lists?.length) {
      throw new Error('No ClickUp spaces or lists found. Please sync your ClickUp workspace first.')
    }

    // Configure document analyzer
    const config: DocumentAnalysisConfig = {
      workspaceId: spaces[0].workspace_id,
      spaces: spaces,
      lists: lists,
      analysisDepth: 'deep',
      confidenceThreshold: 0.7
    }

    const analyzer = new DocumentAnalyzer(config)

    // Fetch recent documents from ClickUp (last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const documents = await fetchRecentDocuments(clickupApiKey, spaces, sevenDaysAgo)

    // Analyze documents
    const analyses = await analyzer.analyzeDocuments(documents)

    // Filter for misplaced documents (confidence >= 0.7 and not already in optimal location)
    const misplacedDocs = analyses.filter(analysis => 
      analysis.confidence >= 0.7 && 
      analysis.recommendedPlacement.confidence >= 0.7 &&
      (analysis.currentSpaceId !== analysis.recommendedPlacement.targetSpaceId ||
       analysis.currentListId !== analysis.recommendedPlacement.targetListId)
    )

    // Store recommendations
    const recommendations = misplacedDocs.map(analysis => ({
      document_id: analysis.documentId,
      document_title: analysis.title,
      current_space_id: analysis.currentSpaceId,
      current_list_id: analysis.currentListId,
      current_space_name: analysis.currentSpaceName,
      current_list_name: analysis.currentListName,
      recommended_space_id: analysis.recommendedPlacement.targetSpaceId,
      recommended_list_id: analysis.recommendedPlacement.targetListId,
      recommended_space_name: analysis.recommendedPlacement.targetSpaceName,
      recommended_list_name: analysis.recommendedPlacement.targetListName,
      confidence_score: analysis.recommendedPlacement.confidence,
      reasoning: analysis.recommendedPlacement.reasoning,
      content_type: analysis.contentType,
      keywords: analysis.keywords,
      entities: analysis.entities,
      sync_operation_id: syncOpId,
      user_id: userId
    }))

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
        documents_analyzed: documents.length,
        documents_moved: 0,
        documents_failed: 0,
        execution_time_ms: executionTime,
        completed_at: new Date().toISOString(),
        metadata: {
          misplaced_documents_found: misplacedDocs.length,
          average_confidence: misplacedDocs.length > 0 
            ? misplacedDocs.reduce((sum, doc) => sum + doc.confidence, 0) / misplacedDocs.length 
            : 0
        }
      })
      .eq('id', syncOpId)

    return new Response(
      JSON.stringify({
        success: true,
        operation_type: 'analysis',
        sync_operation_id: syncOpId,
        summary: {
          documents_analyzed: documents.length,
          misplaced_documents_found: misplacedDocs.length,
          recommendations_created: recommendations.length,
          execution_time_ms: executionTime
        },
        recommendations: recommendations.map(rec => ({
          id: rec.id,
          document_title: rec.document_title,
          current_location: `${rec.current_space_name} > ${rec.current_list_name}`,
          recommended_location: `${rec.recommended_space_name} > ${rec.recommended_list_name}`,
          confidence_score: rec.confidence_score,
          reasoning: rec.reasoning,
          content_type: rec.content_type
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
async function fetchRecentDocuments(
  clickupApiKey: string, 
  spaces: any[], 
  sinceDate: Date
): Promise<any[]> {
  const allDocuments = []

  for (const space of spaces) {
    try {
      // Fetch lists for this space
      const listsResponse = await fetch(
        `https://api.clickup.com/api/v2/space/${space.clickup_space_id}/list`,
        {
          headers: {
            'Authorization': clickupApiKey
          }
        }
      )

      if (!listsResponse.ok) continue

      const listsData = await listsResponse.json()
      const lists = listsData.lists || []

      // Fetch tasks from each list
      for (const list of lists) {
        if (list.archived) continue

        const tasksResponse = await fetch(
          `https://api.clickup.com/api/v2/list/${list.id}/task?include_closed=true&date_created_after=${sinceDate.getTime()}`,
          {
            headers: {
              'Authorization': clickupApiKey
            }
          }
        )

        if (!tasksResponse.ok) continue

        const tasksData = await tasksResponse.json()
        const tasks = tasksData.tasks || []

        // Add space and list info to each task
        tasks.forEach(task => {
          allDocuments.push({
            ...task,
            space: space,
            list: list
          })
        })
      }

    } catch (error) {
      console.error(`Error fetching documents for space ${space.id}:`, error)
    }
  }

  return allDocuments
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
