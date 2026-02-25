import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Multi-task creation across multiple ClickUp lists
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const { message, conversation_id, metadata, userId: requestedUserId } = payload
    
    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('🚀 MULTI-TASK ANALYSIS - Input message:', message)

    const normalizedMessage = message.toLowerCase().trim()
    
    // Multi-pattern detection - can detect multiple task types in one message
    const patterns = {
      lead: {
        keywords: ['lead', 'prospect', 'contact', 'dan', 'guillermo', 'new client'],
        target_list_type: 'leads',
        target_list_id: 'demo-leads-list',
        priority: 1
      },
      opportunity: {
        keywords: ['opportunity', 'la fountain', 'deal', 'proposal', 'signature', 'qualified'],
        target_list_type: 'opportunities',
        target_list_id: 'demo-opportunities-list',
        priority: 2
      },
      task: {
        keywords: ['call', 'follow up', 'task', 'action', 'followup', 'email'],
        target_list_type: 'tasks',
        target_list_id: 'demo-tasks-list',
        priority: 3
      },
      event: {
        keywords: ['meeting', 'appointment', 'schedule', 'calendar', 'call'],
        target_list_type: 'events',
        target_list_id: 'demo-events-list',
        priority: 4
      }
    }

    // Entity extraction for all detected patterns
    const entities = {
      contact_name: extractContactName(normalizedMessage),
      company: extractCompany(normalizedMessage),
      opportunity_name: extractOpportunity(normalizedMessage),
      action_type: extractAction(normalizedMessage),
      timing: extractTiming(normalizedMessage),
      phone: extractPhone(normalizedMessage)
    }

    console.log('📋 Extracted entities:', entities)

    // Detect all matching patterns
    const detectedActions = Object.entries(patterns)
      .filter(([_, pattern]) => 
        pattern.keywords.some(keyword => normalizedMessage.includes(keyword))
      )
      .map(([patternType, pattern]) => ({
        pattern_type: patternType,
        target_list_type: pattern.target_list_type,
        target_list_id: pattern.target_list_id,
        priority: pattern.priority,
        confidence: calculateConfidence(normalizedMessage, patternType, entities),
        task_data: generateTaskData(patternType, entities, message)
      }))
      .sort((a, b) => a.priority - b.priority)

    console.log('🎯 Detected actions:', detectedActions)

    if (detectedActions.length === 0) {
      return new Response(
        JSON.stringify({
          action_card: {
            id: `no-multi-route-${Date.now()}`,
            type: 'clarification',
            description: 'I could not determine what actions to create. Please provide more context.',
            fields: [{
              name: 'clarification',
              label: 'Clarify your request',
              type: 'text',
              placeholder: 'e.g., "Add new lead Dan from La Fountain and schedule a call"'
            }]
          },
          multi_task_result: null
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create multi-task action card
    const multiTaskCard = {
      id: `multi-task-${Date.now()}`,
      type: 'multi_task_plan',
      description: `Create ${detectedActions.length} task${detectedActions.length > 1 ? 's' : ''} across multiple lists`,
      actions: detectedActions.map(action => ({
        id: `${action.pattern_type}-${Date.now()}`,
        type: action.pattern_type,
        target_list: action.target_list_type,
        description: action.task_data.name,
        enabled: true,
        editable: true,
        fields: getActionFieldsForType(action.pattern_type, action.task_data)
      })),
      metadata: {
        original_message: message,
        detected_actions: detectedActions,
        entities: entities,
        execution_mode: 'staged',
        workflow_id: 'sales-crm-workflow'
      }
    }

    console.log('✅ MULTI-TASK RESULT:', {
      action_count: detectedActions.length,
      actions: detectedActions.map(a => ({ type: a.pattern_type, confidence: a.confidence })),
      card_summary: multiTaskCard.description
    })

    return new Response(
      JSON.stringify({
        action_card: multiTaskCard,
        multi_task_result: {
          detected_actions: detectedActions,
          entities: entities,
          execution_plan: 'staged_creation'
        },
        stage: 'multi_task_analysis_complete'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error)
    console.error(`❌ MULTI-TASK FAILED: ${errMessage}`, error)
    
    return new Response(
      JSON.stringify({ 
        error: errMessage,
        success: false
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

// Entity extraction functions
function extractContactName(message: string): string | null {
  const patterns = [
    /(?:contact|talk|spoke|called|met)\s+(?:with\s+)?([a-z][a-z\s]+)/gi,
    /(?:dan|guillermo|john|jane|mike|sarah)/gi
  ]
  
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    } else if (match) {
      return match[0].trim()
    }
  }
  return null
}

function extractCompany(message: string): string | null {
  const patterns = [
    /(?:at|@|from)\s+([a-z][a-z\s]*(?:restaurant|company|corp|inc|llc))/gi,
    /(?:la fountain|restaurant|cafe)/gi
  ]
  
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    } else if (match) {
      return match[0].trim()
    }
  }
  return null
}

function extractOpportunity(message: string): string | null {
  if (message.includes('la fountain')) {
    return 'La Fountain'
  }
  
  const patterns = [
    /(?:opportunity|deal|proposal)\s+(?:called|named|for)\s+([^,.]+)/gi
  ]
  
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }
  return null
}

function extractAction(message: string): string | null {
  if (message.includes('call')) return 'Call'
  if (message.includes('meeting')) return 'Meeting'
  if (message.includes('email')) return 'Email'
  if (message.includes('follow up')) return 'Follow up'
  return null
}

function extractTiming(message: string): string | null {
  const patterns = [
    /(?:today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi,
    /(?:in\s+\d+\s+(?:hours?|days?|weeks?))/gi,
    /(?:couple\s+hours?\s+today)/gi
  ]
  
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match) {
      return match[0].trim()
    }
  }
  return null
}

function extractPhone(message: string): string | null {
  const phonePattern = /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/g
  const match = message.match(phonePattern)
  return match ? match[0] : null
}

function calculateConfidence(message: string, patternType: string, entities: any): number {
  let confidence = 0.5
  
  // Base confidence for pattern match
  confidence += 0.2
  
  // Boost confidence based on entity matches
  if (patternType === 'lead' && entities.contact_name) confidence += 0.2
  if (patternType === 'lead' && entities.company) confidence += 0.1
  if (patternType === 'opportunity' && entities.company) confidence += 0.2
  if (patternType === 'task' && entities.action_type) confidence += 0.2
  if (patternType === 'event' && entities.timing) confidence += 0.2
  
  return Math.min(confidence, 1.0)
}

function generateTaskData(patternType: string, entities: any, originalMessage: string): any {
  switch (patternType) {
    case 'lead':
      return {
        name: `Lead: ${entities.contact_name || 'New Contact'}`,
        description: `Lead from ${entities.company || 'unknown company'}${entities.phone ? ` - Phone: ${entities.phone}` : ''}`,
        assignees: [],
        priority: 'high'
      }
      
    case 'opportunity':
      return {
        name: `Opportunity: ${entities.opportunity_name || 'New Opportunity'}`,
        description: `Business opportunity for ${entities.company || 'prospect'}`,
        assignees: [],
        priority: 'high'
      }
      
    case 'task':
      return {
        name: `Task: ${entities.action_type || 'Follow up'}`,
        description: originalMessage,
        assignees: [],
        priority: 'normal'
      }
      
    case 'event':
      return {
        name: `Event: ${entities.action_type || 'Meeting'}`,
        description: originalMessage,
        assignees: [],
        priority: 'normal',
        due_date: entities.timing || null
      }
      
    default:
      return {
        name: 'New Task',
        description: originalMessage,
        assignees: [],
        priority: 'normal'
      }
  }
}

function getActionFieldsForType(patternType: string, taskData: any): any[] {
  switch (patternType) {
    case 'lead':
      return [
        {
          name: 'lead_name',
          label: 'Lead Name',
          type: 'text',
          default: taskData.name.replace('Lead: ', '')
        },
        {
          name: 'company',
          label: 'Company',
          type: 'text',
          default: ''
        }
      ]
      
    case 'opportunity':
      return [
        {
          name: 'opportunity_name',
          label: 'Opportunity Name',
          type: 'text',
          default: taskData.name.replace('Opportunity: ', '')
        }
      ]
      
    case 'task':
      return [
        {
          name: 'task_description',
          label: 'Task Description',
          type: 'text',
          default: taskData.description
        }
      ]
      
    case 'event':
      return [
        {
          name: 'event_title',
          label: 'Event Title',
          type: 'text',
          default: taskData.name.replace('Event: ', '')
        },
        {
          name: 'timing',
          label: 'When',
          type: 'text',
          default: taskData.due_date || ''
        }
      ]
      
    default:
      return []
  }
}
