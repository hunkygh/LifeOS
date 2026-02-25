import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CLICKUP_API_BASE, syncClickUpConfiguration } from '../lib/clickup-sync.ts'
import { APP_USER_ID } from '../config/defaultUser.ts'
import { WorkflowRouter, WorkflowRoutingResult } from '../lib/workflow-router.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ActionCardType = 'setup' | 'configuration' | 'plan' | 'error' | 'clarification'

type ActionCard = {
  id: string
  type: ActionCardType
  description: string
  fields: any[]
  metadata?: Record<string, any>
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let stage = 'init'
  try {
    stage = 'parse_payload'
    const payload = await req.json()
    const { message, conversation_id, metadata, userId: requestedUserId } = payload
    
    const userId = requestedUserId || APP_USER_ID

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    stage = 'env_setup'
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('LOCAL_SUPABASE_URL')
    const groqApiKey = Deno.env.get('GROQ_API_KEY') ?? Deno.env.get('LOCAL_GROQ_API_KEY')
    const supabaseServiceKey =
      Deno.env.get('APP_SUPABASE_SERVICE_ROLE_KEY') ??
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
      Deno.env.get('LOCAL_SUPABASE_SERVICE_ROLE_KEY')
    const clickupApiKey = Deno.env.get('CLICKUP_API_KEY') ?? Deno.env.get('LOCAL_CLICKUP_API_KEY')
    
    if (!groqApiKey || !supabaseServiceKey || !supabaseUrl) {
      throw new Error('Missing required environment variables')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    stage = 'check_workflow_system'
    // Check if workflow system is enabled
    const isWorkflowEnabled = await WorkflowRouter.isWorkflowSystemEnabled(supabase, userId)
    
    if (!isWorkflowEnabled) {
      // Fallback to legacy system or return setup card
      return new Response(
        JSON.stringify({
          action_card: {
            id: `enable-workflow-${Date.now()}`,
            type: 'setup',
            description: 'Workflow system is not enabled. Please enable it in settings to use new routing.',
            fields: []
          }
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    stage = 'background_sync'
    let backgroundSyncError: string | null = null
    if (clickupApiKey) {
      try {
        await syncClickUpConfiguration(supabase, clickupApiKey, userId)
      } catch (syncError) {
        console.error('Background ClickUp sync failed', syncError)
        backgroundSyncError = syncError instanceof Error ? syncError.message : String(syncError)
      }
    }

    stage = 'load_workflow_config'
    // Load workflow configuration
    const { patterns, workflows } = await WorkflowRouter.loadWorkflowConfig(supabase, userId)
    const router = new WorkflowRouter(patterns, workflows)

    stage = 'route_message'
    // Route message using workflow system
    const routingResult = router.routeMessage(message)
    
    if (!routingResult) {
      return new Response(
        JSON.stringify({
          action_card: {
            id: `no-route-${Date.now()}`,
            type: 'clarification',
            description: 'I could not determine how to route this message. Please provide more context or try rephrasing.',
            fields: [{
              name: 'clarification',
              label: 'Clarify your request',
              type: 'text',
              placeholder: 'e.g., "Add new lead Dan from La Fountain"'
            }]
          }
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    stage = 'create_proposal'
    // Create action proposal based on routing result
    const actionCard = createWorkflowActionCard(routingResult, message)

    stage = 'store_message'
    // Store user message and action card
    await supabase
      .from('chat_messages')
      .insert({
        conversation_id,
        message,
        metadata: {
          action_card: actionCard,
          stage,
          background_sync_error: backgroundSyncError,
          routing_result: routingResult
        },
        user_id: userId
      })

    return new Response(
      JSON.stringify({
        action_card: actionCard,
        routing_result: routingResult,
        stage
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error)
    const errStack = error instanceof Error ? error.stack : undefined
    console.error(`[chat-workflow] stage=${stage} error=${errMessage}`, errStack)
    
    return new Response(
      JSON.stringify({ 
        error: errMessage,
        stage,
        stack: errStack,
        success: false
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

function createWorkflowActionCard(routingResult: WorkflowRoutingResult, originalMessage: string): ActionCard {
  const { pattern_match, extraction, target_list_type } = routingResult
  
  let description = ''
  let fields: any[] = []
  
  switch (pattern_match.pattern_type) {
    case 'lead':
      description = `Create new lead: ${extraction.contact_name || 'Unknown'}${extraction.company ? ` from ${extraction.company}` : ''}`
      fields = [
        {
          name: 'lead_name',
          label: 'Lead Name',
          type: 'text',
          default: extraction.contact_name || ''
        },
        {
          name: 'company',
          label: 'Company',
          type: 'text', 
          default: extraction.company || ''
        }
      ]
      break
      
    case 'opportunity':
      description = `Create opportunity: ${extraction.opportunity_name || 'New Opportunity'}`
      fields = [
        {
          name: 'opportunity_name',
          label: 'Opportunity Name',
          type: 'text',
          default: extraction.opportunity_name || ''
        }
      ]
      break
      
    case 'task':
      description = `Create task: ${extraction.action_type || 'Follow up'}`
      fields = [
        {
          name: 'task_description',
          label: 'Task Description',
          type: 'text',
          default: originalMessage
        }
      ]
      break
      
    case 'event':
      description = `Schedule event: ${extraction.timing || 'Meeting'}`
      fields = [
        {
          name: 'event_title',
          label: 'Event Title',
          type: 'text',
          default: extraction.action_type || 'Meeting'
        },
        {
          name: 'timing',
          label: 'When',
          type: 'text',
          default: extraction.timing || ''
        }
      ]
      break
  }
  
  return {
    id: `workflow-${pattern_match.pattern_type}-${Date.now()}`,
    type: 'plan',
    description,
    fields,
    metadata: {
      routing_result: routingResult,
      target_list_id: routingResult.target_list_id,
      target_list_type: routingResult.target_list_type,
      workflow_id: routingResult.workflow.id
    }
  }
}
