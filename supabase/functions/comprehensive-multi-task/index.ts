import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Comprehensive multi-task execution with staging and verification
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

    console.log('🚀 COMPREHENSIVE MULTI-TASK ANALYSIS - Input:', message)

    const normalizedMessage = message.toLowerCase().trim()
    
    // Enhanced pattern detection for all workflow types
    const workflowPatterns = {
      // 1. Leads workflow
      lead: {
        keywords: ['spoke with', 'contact', 'new lead', 'prospect', 'met with', 'introduced'],
        extractors: {
          company: extractCompany,
          contact: extractContactName,
          interest: extractInterest,
          timing: extractTiming
        },
        target_list: 'leads',
        task_name_strategy: 'company_only',
        subtask_strategy: 'follow_up_actions'
      },
      
      // 2. Opportunities workflow  
      opportunity: {
        keywords: ['signed up', 'pilot', 'deal', 'contract', 'opportunity', 'closed'],
        extractors: {
          company: extractCompany,
          stage: extractOpportunityStage,
          value: extractValue
        },
        target_list: 'opportunities',
        task_name_strategy: 'company_only',
        subtask_strategy: 'related_events'
      },
      
      // 3. Workouts workflow
      workout: {
        keywords: ['squats', 'bench', 'deadlifts', 'workout', 'gym', 'exercise'],
        extractors: {
          exercises: extractExercises,
          day: extractWorkoutDay
        },
        target_list: 'workouts',
        task_name_strategy: 'workout_day',
        subtask_strategy: 'individual_exercises',
        auto_assign: true
      },
      
      // 4. Meals workflow
      meal: {
        keywords: ['breakfast', 'lunch', 'dinner', 'meal', 'food', 'eating'],
        extractors: {
          meals: extractMeals,
          day: extractMealDay,
          macros: extractMacros
        },
        target_list: 'meals',
        task_name_strategy: 'day_only',
        subtask_strategy: 'individual_meals',
        auto_checkoff: '21:00' // 9pm
      },
      
      // 5. Events workflow
      event: {
        keywords: ['meeting', 'appointment', 'call', '1:1', 'schedule', 'event'],
        extractors: {
          title: extractEventTitle,
          time: extractEventTime,
          attendees: extractAttendees,
          location: extractLocation
        },
        target_list: 'events',
        task_name_strategy: 'event_title',
        subtask_strategy: 'prep_actions',
        timezone_sensitive: true
      }
    }

    // Detect all matching workflow patterns
    const detectedWorkflows = Object.entries(workflowPatterns)
      .filter(([_, pattern]) => 
        pattern.keywords.some(keyword => normalizedMessage.includes(keyword))
      )
      .map(([workflowType, pattern]) => {
        const entities = {}
        Object.entries(pattern.extractors).forEach(([key, extractor]) => {
          entities[key] = extractor(normalizedMessage)
        })
        
        return {
          workflow_type: workflowType,
          target_list: pattern.target_list,
          entities: entities,
          confidence: calculateWorkflowConfidence(normalizedMessage, workflowType, entities),
          strategy: {
            task_name: pattern.task_name_strategy,
            subtasks: pattern.subtask_strategy,
            auto_assign: pattern.auto_assign,
            auto_checkoff: pattern.auto_checkoff,
            timezone_sensitive: pattern.timezone_sensitive
          }
        }
      })
      .sort((a, b) => b.confidence - a.confidence)

    console.log('🎯 Detected workflows:', detectedWorkflows.map(w => ({ 
      type: w.workflow_type, 
      confidence: w.confidence,
      entities: Object.keys(w.entities).length 
    })))

    if (detectedWorkflows.length === 0) {
      return new Response(
        JSON.stringify({
          action_card: {
            id: `no-workflow-${Date.now()}`,
            type: 'clarification',
            description: 'I could not determine what type of task to create. Please provide more context.',
            examples: [
              "Spoke with Jane at Acme Corp, wants demo next week",
              "Squats 3x10, bench 3x8, deadlifts 5x5", 
              "Breakfast: eggs, Lunch: salad, Dinner: chicken",
              "1:1 with Dan tomorrow at 3pm"
            ]
          },
          detected_workflows: []
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check for duplicates
    const duplicateCheck = await checkForDuplicates(detectedWorkflows, message)
    
    // Generate execution plan with staging
    const executionPlan = generateStagedExecutionPlan(detectedWorkflows, duplicateCheck)
    
    // Create comprehensive multi-task action card
    const multiTaskCard = {
      id: `comprehensive-multi-${Date.now()}`,
      type: 'comprehensive_multi_task',
      description: `Create ${executionPlan.tasks.length} task${executionPlan.tasks.length > 1 ? 's' : ''} across ${executionPlan.workflows.length} workflow${executionPlan.workflows.length > 1 ? 's' : ''}`,
      workflows: executionPlan.workflows.map(w => ({
        type: w.workflow_type,
        target_list: w.target_list,
        confidence: w.confidence,
        entities: w.entities
      })),
      tasks: executionPlan.tasks.map(task => ({
        id: task.id,
        workflow_type: task.workflow_type,
        target_list: task.target_list,
        task_name: task.task_name,
        description: task.description,
        subtasks: task.subtasks,
        relationships: task.relationships,
        duplicate_detected: task.duplicate_detected,
        enabled: !task.duplicate_detected,
        editable: true,
        fields: generateTaskFields(task)
      })),
      staging: {
        mode: 'sequential',
        total_stages: executionPlan.stages.length,
        current_stage: 0,
        stage_descriptions: executionPlan.stages
      },
      verification: {
        duplicate_check: duplicateCheck,
        relationship_integrity: true,
        timezone_handling: executionPlan.workflows.some(w => w.strategy.timezone_sensitive),
        auto_scheduling: executionPlan.workflows.some(w => w.strategy.auto_checkoff)
      },
      metadata: {
        original_message: message,
        execution_plan: executionPlan,
        workflow_id: 'comprehensive-workflow-system'
      }
    }

    console.log('✅ COMPREHENSIVE MULTI-TASK RESULT:', {
      workflows_detected: detectedWorkflows.length,
      tasks_to_create: executionPlan.tasks.length,
      duplicates_found: duplicateCheck.duplicates.length,
      staging_required: executionPlan.stages.length
    })

    return new Response(
      JSON.stringify({
        action_card: multiTaskCard,
        comprehensive_result: {
          detected_workflows: detectedWorkflows,
          execution_plan: executionPlan,
          duplicate_analysis: duplicateCheck
        },
        stage: 'comprehensive_analysis_complete'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error)
    console.error(`❌ COMPREHENSIVE MULTI-TASK FAILED: ${errMessage}`, error)
    
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

// Enhanced entity extraction functions
function extractCompany(message: string): string | null {
  const patterns = [
    /(?:at|@|from)\s+([a-z][a-z\s]*(?:corp|company|inc|llc|ltd))/gi,
    /(?:acme corp|google|microsoft|apple|amazon|facebook|tesla)/gi
  ]
  
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match) {
      return match[0].trim()
    }
  }
  return null
}

function extractContactName(message: string): string | null {
  const patterns = [
    /(?:spoke with|met with|contact)\s+([a-z][a-z\s]+)/gi,
    /(?:jane|john|dan|guillermo|sarah|mike)/gi
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

function extractInterest(message: string): string | null {
  if (message.includes('demo')) return 'Demo requested'
  if (message.includes('pilot')) return 'Pilot program'
  if (message.includes('meeting')) return 'Meeting scheduled'
  return null
}

function extractOpportunityStage(message: string): string | null {
  if (message.includes('signed up')) return 'Closed - Signed'
  if (message.includes('pilot')) return 'Pilot phase'
  if (message.includes('proposal')) return 'Proposal stage'
  return null
}

function extractValue(message: string): string | null {
  const valuePattern = /\$[\d,]+/g
  const match = message.match(valuePattern)
  return match ? match[0] : null
}

function extractExercises(message: string): string[] {
  const exercisePattern = /(\w+)\s+\d+x\d+/gi
  const matches = message.match(exercisePattern) || []
  return matches.map(match => match.trim())
}

function extractWorkoutDay(message: string): string | null {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' })
  if (message.includes('today')) return today
  if (message.includes('tomorrow')) {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toLocaleDateString('en-US', { weekday: 'long' })
  }
  return today
}

function extractMeals(message: string): string[] {
  const meals = []
  if (message.includes('breakfast')) {
    const breakfastMatch = message.match(/breakfest[:\s]+([^,]+)/i)
    if (breakfastMatch) meals.push(`Breakfast: ${breakfastMatch[1].trim()}`)
  }
  if (message.includes('lunch')) {
    const lunchMatch = message.match(/lunch[:\s]+([^,]+)/i)
    if (lunchMatch) meals.push(`Lunch: ${lunchMatch[1].trim()}`)
  }
  if (message.includes('dinner')) {
    const dinnerMatch = message.match(/dinner[:\s]+([^,]+)/i)
    if (dinnerMatch) meals.push(`Dinner: ${dinnerMatch[1].trim()}`)
  }
  return meals
}

function extractMealDay(message: string): string | null {
  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'long', 
    day: 'numeric' 
  })
  return today
}

function extractMacros(message: string): any {
  return {
    calories: null, // Would need more complex parsing
    protein: null,
    carbs: null,
    fats: null
  }
}

function extractEventTitle(message: string): string | null {
  const patterns = [
    /(\d+:\d+\s*(?:am|pm)?)\s+(?:with|and)\s+([^,]+)/gi,
    /(?:meeting|call|1:1)\s+(?:with|and)\s+([^,]+)/gi
  ]
  
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match) {
      return match[2] ? match[2].trim() : match[0].trim()
    }
  }
  return null
}

function extractEventTime(message: string): string | null {
  const timePattern = /(\d+:\d+\s*(?:am|pm)?)/gi
  const match = message.match(timePattern)
  return match ? match[0] : null
}

function extractAttendees(message: string): string[] {
  const attendees = []
  if (message.includes('with')) {
    const withMatch = message.match(/with\s+([^,]+)/i)
    if (withMatch) attendees.push(withMatch[1].trim())
  }
  return attendees
}

function extractLocation(message: string): string | null {
  // Would need location-specific patterns
  return null
}

function extractTiming(message: string): string | null {
  if (message.includes('next week')) return 'Next week'
  if (message.includes('tomorrow')) return 'Tomorrow'
  if (message.includes('today')) return 'Today'
  return null
}

function calculateWorkflowConfidence(message: string, workflowType: string, entities: any): number {
  let confidence = 0.3 // Base confidence
  
  // Boost based on entity extraction quality
  const entityCount = Object.values(entities).filter(v => v !== null).length
  confidence += (entityCount * 0.15)
  
  // Boost for specific keyword matches
  if (workflowType === 'lead' && entities.company && entities.contact) confidence += 0.2
  if (workflowType === 'workout' && entities.exercises.length > 0) confidence += 0.3
  if (workflowType === 'meal' && entities.meals.length > 0) confidence += 0.3
  if (workflowType === 'event' && entities.time) confidence += 0.2
  
  return Math.min(confidence, 1.0)
}

async function checkForDuplicates(workflows: any[], message: string): Promise<any> {
  // Simulate duplicate detection - in real implementation would query ClickUp
  const duplicates = []
  
  for (const workflow of workflows) {
    if (workflow.workflow_type === 'lead' && workflow.entities.company) {
      // Check if lead for this company already exists
      duplicates.push({
        workflow_type: 'lead',
        company: workflow.entities.company,
        existing_task_id: 'existing-lead-id',
        duplicate_reason: 'Lead for this company already exists'
      })
    }
  }
  
  return {
    duplicates: duplicates,
    safe_to_proceed: duplicates.length === 0,
    duplicate_resolution: 'skip_duplicates'
  }
}

function generateStagedExecutionPlan(workflows: any[], duplicateCheck: any): any {
  const tasks = []
  const stages = []
  
  // Stage 1: Create primary tasks (leads, opportunities, main workout/meal tasks)
  workflows.forEach(workflow => {
    const isDuplicate = duplicateCheck.duplicates.some(d => 
      d.workflow_type === workflow.workflow_type
    )
    
    if (!isDuplicate) {
      const task = generatePrimaryTask(workflow)
      tasks.push(task)
    }
  })
  
  stages.push({
    stage: 1,
    description: 'Create primary tasks',
    tasks: tasks.map(t => t.id),
    dependencies: []
  })
  
  // Stage 2: Create subtasks and relationships
  const subtasks = []
  tasks.forEach(task => {
    if (task.subtasks && task.subtasks.length > 0) {
      subtasks.push(...task.subtasks)
    }
  })
  
  if (subtasks.length > 0) {
    stages.push({
      stage: 2,
      description: 'Create subtasks and relationships',
      tasks: subtasks.map(st => st.id),
      dependencies: tasks.map(t => t.id)
    })
  }
  
  // Stage 3: Set up automation (cron jobs, reminders)
  const automationTasks = workflows.filter(w => 
    w.strategy.auto_checkoff || w.strategy.auto_assign
  )
  
  if (automationTasks.length > 0) {
    stages.push({
      stage: 3,
      description: 'Configure automation and scheduling',
      tasks: automationTasks.map(w => `automation-${w.workflow_type}`),
      dependencies: [...tasks.map(t => t.id), ...subtasks.map(st => st.id)]
    })
  }
  
  return {
    workflows: workflows,
    tasks: tasks,
    stages: stages,
    total_execution_time: stages.length * 2 // 2 seconds per stage
  }
}

function generatePrimaryTask(workflow: any): any {
  const task = {
    id: `${workflow.workflow_type}-${Date.now()}`,
    workflow_type: workflow.workflow_type,
    target_list: workflow.target_list,
    task_name: generateTaskName(workflow),
    description: generateTaskDescription(workflow),
    subtasks: generateSubtasks(workflow),
    relationships: generateRelationships(workflow),
    duplicate_detected: false,
    automation: {
      auto_assign: workflow.strategy.auto_assign,
      auto_checkoff: workflow.strategy.auto_checkoff,
      timezone_sensitive: workflow.strategy.timezone_sensitive
    }
  }
  
  return task
}

function generateTaskName(workflow: any): string {
  switch (workflow.strategy.task_name) {
    case 'company_only':
      return workflow.entities.company || 'New Lead'
    case 'workout_day':
      return `${workflow.entities.day} Workout`
    case 'day_only':
      return workflow.entities.day || 'Today'
    case 'event_title':
      return workflow.entities.title || 'Meeting'
    default:
      return 'New Task'
  }
}

function generateTaskDescription(workflow: any): string {
  const parts = []
  
  if (workflow.entities.contact) parts.push(`Contact: ${workflow.entities.contact}`)
  if (workflow.entities.company) parts.push(`Company: ${workflow.entities.company}`)
  if (workflow.entities.interest) parts.push(`Interest: ${workflow.entities.interest}`)
  if (workflow.entities.stage) parts.push(`Stage: ${workflow.entities.stage}`)
  if (workflow.entities.value) parts.push(`Value: ${workflow.entities.value}`)
  
  return parts.join(' | ') || 'Task description'
}

function generateSubtasks(workflow: any): any[] {
  const subtasks = []
  
  switch (workflow.strategy.subtasks) {
    case 'follow_up_actions':
      if (workflow.entities.interest === 'Demo requested') {
        subtasks.push({
          name: 'Schedule demo',
          due_date: workflow.entities.timing || 'Next week'
        })
      }
      if (workflow.entities.contact) {
        subtasks.push({
          name: `Follow up with ${workflow.entities.contact}`,
          due_date: 'Tomorrow'
        })
      }
      break
      
    case 'individual_exercises':
      workflow.entities.exercises.forEach(exercise => {
        subtasks.push({
          name: exercise,
          completed: false
        })
      })
      break
      
    case 'individual_meals':
      workflow.entities.meals.forEach(meal => {
        subtasks.push({
          name: meal,
          completed: false
        })
      })
      break
      
    case 'prep_actions':
      if (workflow.entities.title) {
        subtasks.push({
          name: `Prepare for ${workflow.entities.title}`,
          due_date: '1 hour before'
        })
      }
      break
  }
  
  return subtasks
}

function generateRelationships(workflow: any): any[] {
  const relationships = []
  
  // Lead -> Opportunity relationship
  if (workflow.workflow_type === 'lead' && workflow.entities.company) {
    relationships.push({
      type: 'can_become_opportunity',
      target_workflow: 'opportunity',
      target_entity: workflow.entities.company
    })
  }
  
  // Event -> Lead relationship
  if (workflow.workflow_type === 'event' && workflow.entities.attendees.length > 0) {
    relationships.push({
      type: 'related_to_lead',
      target_workflow: 'lead',
      target_entity: workflow.entities.attendees[0]
    })
  }
  
  return relationships
}

function generateTaskFields(task: any): any[] {
  const fields = [
    {
      name: 'task_name',
      label: 'Task Name',
      type: 'text',
      default: task.task_name
    },
    {
      name: 'description',
      label: 'Description',
      type: 'textarea',
      default: task.description
    }
  ]
  
  if (task.automation.auto_assign) {
    fields.push({
      name: 'assignee',
      label: 'Assign To',
      type: 'select',
      default: 'me',
      options: ['me', 'unassigned']
    })
  }
  
  return fields
}
