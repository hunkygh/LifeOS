import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { WorkflowRouter, WorkflowRoutingResult } from '../lib/workflow-router.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    
    const userId = requestedUserId || 'demo-user-id' // Fallback for testing

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    stage = 'env_setup'
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://demo.supabase.co'
    const groqApiKey = Deno.env.get('GROQ_API_KEY') || 'demo-key'
    
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL not configured')
    }

    const supabase = createClient(supabaseUrl, 'demo-anon-key') // Use anon key for testing

    stage = 'test_workflow_routing'
    // Test workflow routing with mock data
    const mockPatterns = [
      {
        id: '1',
        workflow_id: 'sales-crm-workflow',
        pattern_type: 'lead' as const,
        keywords: ['lead', 'prospect', 'contact', 'dan', 'guillermo'],
        target_list_type: 'leads' as const,
        priority: 1,
        is_active: true
      },
      {
        id: '2', 
        workflow_id: 'sales-crm-workflow',
        pattern_type: 'opportunity' as const,
        keywords: ['opportunity', 'la fountain', 'signature'],
        target_list_type: 'opportunities' as const,
        priority: 2,
        is_active: true
      },
      {
        id: '3',
        workflow_id: 'sales-crm-workflow', 
        pattern_type: 'task' as const,
        keywords: ['follow up', 'call', 'task'],
        target_list_type: 'tasks' as const,
        priority: 3,
        is_active: true
      }
    ]

    const mockWorkflow = {
      id: 'sales-crm-workflow',
      name: 'Sales/CRM',
      workflow_type: 'sales_crm',
      clickup_space_id: 'demo-space-id',
      leads_list_id: 'demo-leads-list',
      opportunities_list_id: 'demo-opportunities-list', 
      tasks_list_id: 'demo-tasks-list',
      events_list_id: 'demo-events-list',
      is_active: true,
      priority_rank: 1
    }

    const router = new WorkflowRouter(mockPatterns, [mockWorkflow])
    const routingResult = router.routeMessage(message)

    stage = 'create_response'
    if (!routingResult) {
      return new Response(
        JSON.stringify({
          action_card: {
            id: `no-route-${Date.now()}`,
            type: 'clarification',
            description: 'I could not determine how to route this message. Please provide more context.',
            fields: [{
              name: 'clarification',
              label: 'Clarify your request',
              type: 'text',
              placeholder: 'e.g., "Add new lead Dan from La Fountain"'
            }]
          },
          routing_result: null,
          stage
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create action card based on routing result
    const actionCard = {
      id: `workflow-${routingResult.pattern_match.pattern_type}-${Date.now()}`,
      type: 'plan',
      description: getActionDescription(routingResult),
      fields: getActionFields(routingResult),
      metadata: {
        routing_result: routingResult,
        target_list_id: routingResult.target_list_id,
        target_list_type: routingResult.target_list_type,
        workflow_id: routingResult.workflow.id
      }
    }

    stage = 'store_message'
    // For now, just return the response without storing
    console.log('Would store message:', { message, routingResult, actionCard })

    return new Response(
      JSON.stringify({
        action_card: actionCard,
        routing_result: routingResult,
        stage,
        test_mode: true // Indicate this is test mode
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error)
    const errStack = error instanceof Error ? error.stack : undefined
    console.error(`[chat-workflow-test] stage=${stage} error=${errMessage}`, errStack)
    
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

function getActionDescription(routingResult: WorkflowRoutingResult): string {
  const { pattern_match, extraction } = routingResult
  
  switch (pattern_match.pattern_type) {
    case 'lead':
      return `Create new lead: ${extraction.contact_name || 'Unknown'}${extraction.company ? ` from ${extraction.company}` : ''}`
    case 'opportunity':
      return `Create opportunity: ${extraction.opportunity_name || 'New Opportunity'}`
    case 'task':
      return `Create task: ${extraction.action_type || 'Follow up'}`
    case 'event':
      return `Schedule event: ${extraction.timing || 'Meeting'}`
    default:
      return 'Create new item'
  }
}

function getActionFields(routingResult: WorkflowRoutingResult): any[] {
  const { pattern_match, extraction } = routingResult
  
  switch (pattern_match.pattern_type) {
    case 'lead':
      return [
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
      
    case 'opportunity':
      return [
        {
          name: 'opportunity_name',
          label: 'Opportunity Name',
          type: 'text',
          default: extraction.opportunity_name || ''
        }
      ]
      
    case 'task':
      return [
        {
          name: 'task_description',
          label: 'Task Description',
          type: 'text',
          default: 'Follow up with Dan about La Fountain opportunity'
        }
      ]
      
    case 'event':
      return [
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
          default: extraction.timing || 'Today'
        }
      ]
      
    default:
      return []
  }
}
