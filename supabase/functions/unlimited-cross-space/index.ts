import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Unlimited cross-space multi-action system with simplified preview UX
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

    console.log('🚀 UNLIMITED CROSS-SPACE MULTI-ACTION - Input:', message)

    const normalizedMessage = message.toLowerCase().trim()
    
    // Comprehensive domain detection for unlimited spaces
    const domainConfigurations = {
      work: {
        space_id: 'work-space-id',
        space_name: 'Work',
        keywords: ['meeting', 'client', 'project', 'deadline', 'acme corp', 'sales', 'call', 'presentation', 'report'],
        lists: {
          leads: { id: 'work-leads-list', name: 'Leads' },
          opportunities: { id: 'work-opportunities-list', name: 'Opportunities' },
          tasks: { id: 'work-tasks-list', name: 'Tasks' },
          events: { id: 'work-events-list', name: 'Events' }
        }
      },
      health: {
        space_id: 'health-space-id',
        space_name: 'Health & Fitness',
        keywords: ['workout', 'gym', 'squats', 'bench', 'deadlifts', 'exercise', 'fitness', 'doctor', 'appointment'],
        lists: {
          workouts: { id: 'health-workouts-list', name: 'Workouts' },
          meal_plans: { id: 'health-meals-list', name: 'Meal Plans' },
          health_tasks: { id: 'health-tasks-list', name: 'Health Tasks' }
        }
      },
      finance: {
        space_id: 'finance-space-id',
        space_name: 'Finance',
        keywords: ['budget', 'invoice', 'payment', 'expense', 'financial', 'money', 'tax', 'investment'],
        lists: {
          transactions: { id: 'finance-transactions-list', name: 'Transactions' },
          budgets: { id: 'finance-budgets-list', name: 'Budgets' },
          financial_tasks: { id: 'finance-tasks-list', name: 'Financial Tasks' }
        }
      },
      personal: {
        space_id: 'personal-space-id',
        space_name: 'Personal',
        keywords: ['grocery', 'shopping', 'personal', 'home', 'family', 'appointment', 'vacation', 'errands'],
        lists: {
          personal_tasks: { id: 'personal-tasks-list', name: 'Personal Tasks' },
          shopping: { id: 'personal-shopping-list', name: 'Shopping' },
          appointments: { id: 'personal-appointments-list', name: 'Appointments' }
        }
      },
      learning: {
        space_id: 'learning-space-id',
        space_name: 'Learning',
        keywords: ['course', 'study', 'learn', 'book', 'tutorial', 'certification', 'skill'],
        lists: {
          courses: { id: 'learning-courses-list', name: 'Courses' },
          study_tasks: { id: 'learning-study-list', name: 'Study Tasks' },
          resources: { id: 'learning-resources-list', name: 'Resources' }
        }
      }
    }

    // Detect all domains present in the message
    const detectedDomains = Object.entries(domainConfigurations)
      .filter(([_, config]) => 
        config.keywords.some(keyword => normalizedMessage.includes(keyword))
      )
      .map(([domain, config]) => ({
        domain,
        space_id: config.space_id,
        space_name: config.space_name,
        lists: config.lists,
        confidence: calculateDomainConfidence(normalizedMessage, config.keywords),
        detected_keywords: config.keywords.filter(k => normalizedMessage.includes(k))
      }))
      .sort((a, b) => b.confidence - a.confidence)

    console.log('🎯 Detected domains:', detectedDomains.map(d => ({ 
      name: d.space_name, 
      confidence: d.confidence,
      keywords: d.detected_keywords.length 
    })))

    if (detectedDomains.length === 0) {
      return new Response(
        JSON.stringify({
          action_card: {
            id: `no-domain-${Date.now()}`,
            type: 'clarification',
            description: 'I could not detect any domains in your message. Try including keywords like: meeting, workout, budget, shopping, course',
            examples: [
              "Meeting with client at 2pm, then workout at gym, need to buy groceries, and study for certification",
              "Project deadline Friday, doctor appointment Monday, budget review due, vacation planning"
            ]
          },
          cross_space_result: null
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Generate unlimited tasks across all detected domains
    const crossSpaceTasks = []
    detectedDomains.forEach(domain => {
      const domainTasks = generateDomainTasks(normalizedMessage, domain)
      domainTasks.forEach(task => {
        crossSpaceTasks.push({
          ...task,
          domain: domain.domain,
          space_id: domain.space_id,
          space_name: domain.space_name,
          confidence: domain.confidence
        })
      })
    })

    console.log('📋 Generated tasks:', crossSpaceTasks.length, 'across', detectedDomains.length, 'domains')

    // Create staged execution plan for proper payload management
    const executionPlan = generateStagedExecutionPlan(crossSpaceTasks, detectedDomains)

    // Create simplified preview card with toggle/modify UX
    const previewCard = {
      id: `cross-space-preview-${Date.now()}`,
      type: 'cross_space_preview',
      description: `Create ${crossSpaceTasks.length} task${crossSpaceTasks.length > 1 ? 's' : ''} across ${detectedDomains.length} space${detectedDomains.length > 1 ? 's' : ''}`,
      summary: {
        total_tasks: crossSpaceTasks.length,
        total_spaces: detectedDomains.length,
        estimated_time: `${executionPlan.total_stages * 2} seconds`
      },
      domains: detectedDomains.map(domain => ({
        id: domain.domain,
        name: domain.space_name,
        space_id: domain.space_id,
        confidence: domain.confidence,
        task_count: crossSpaceTasks.filter(t => t.domain === domain.domain).length,
        tasks: crossSpaceTasks
          .filter(t => t.domain === domain.domain)
          .map(task => ({
            id: task.id,
            type: task.type,
            list_name: task.list_name,
            name: task.name,
            description: task.description,
            enabled: true,
            editable: true,
            expanded: false // Start collapsed for clean UX
          }))
      })),
      execution: {
        stages: executionPlan.stages,
        current_stage: 0,
        total_stages: executionPlan.total_stages,
        mode: 'sequential_with_rollback'
      },
      actions: {
        execute_all: {
          label: 'Execute All Tasks',
          enabled: true,
          stages_required: executionPlan.total_stages
        },
        modify_individual: {
          label: 'Modify Individual Tasks',
          enabled: true,
          expandable: true
        },
        toggle_domains: {
          label: 'Toggle Entire Domains',
          enabled: true,
          bulk_action: true
        }
      },
      metadata: {
        original_message: message,
        detected_domains: detectedDomains,
        cross_space_tasks: crossSpaceTasks,
        execution_plan: executionPlan,
        unlimited_capacity: true,
        cross_space_relationships: generateCrossSpaceRelationships(crossSpaceTasks)
      }
    }

    console.log('✅ UNLIMITED CROSS-SPACE RESULT:', {
      domains: detectedDomains.length,
      tasks: crossSpaceTasks.length,
      stages: executionPlan.total_stages,
      relationships: previewCard.metadata.cross_space_relationships.length
    })

    return new Response(
      JSON.stringify({
        action_card: previewCard,
        cross_space_result: {
          detected_domains: detectedDomains,
          cross_space_tasks: crossSpaceTasks,
          execution_plan: executionPlan,
          unlimited_capacity: true
        },
        stage: 'cross_space_analysis_complete'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error)
    console.error(`❌ UNLIMITED CROSS-SPACE FAILED: ${errMessage}`, error)
    
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

function calculateDomainConfidence(message: string, keywords: string[]): number {
  const matches = keywords.filter(keyword => message.includes(keyword)).length
  return Math.min(1.0, (matches / keywords.length) + 0.1)
}

function generateDomainTasks(message: string, domain: any): any[] {
  const tasks = []
  
  // Work domain tasks
  if (domain.domain === 'work') {
    if (message.includes('meeting') || message.includes('call') || message.includes('presentation')) {
      tasks.push({
        id: `work-event-${Date.now()}-${Math.random()}`,
        type: 'event',
        list_id: domain.lists.events.id,
        list_name: domain.lists.events.name,
        name: extractEventName(message) || 'Work Meeting',
        description: extractEventDescription(message) || 'Schedule work-related meeting',
        priority: 'high',
        due_date: extractTiming(message)
      })
    }
    
    if (message.includes('client') || message.includes('acme corp') || message.includes('lead')) {
      tasks.push({
        id: `work-lead-${Date.now()}-${Math.random()}`,
        type: 'lead',
        list_id: domain.lists.leads.id,
        list_name: domain.lists.leads.name,
        name: extractCompanyName(message) || 'New Client Lead',
        description: extractLeadDescription(message) || 'New business opportunity',
        priority: 'high'
      })
    }
    
    if (message.includes('project') || message.includes('deadline') || message.includes('report')) {
      tasks.push({
        id: `work-task-${Date.now()}-${Math.random()}`,
        type: 'task',
        list_id: domain.lists.tasks.id,
        list_name: domain.lists.tasks.name,
        name: extractProjectName(message) || 'Work Task',
        description: extractProjectDescription(message) || 'Complete work-related task',
        priority: message.includes('deadline') ? 'urgent' : 'normal'
      })
    }
    
    if (message.includes('opportunity') || message.includes('deal') || message.includes('proposal')) {
      tasks.push({
        id: `work-opportunity-${Date.now()}-${Math.random()}`,
        type: 'opportunity',
        list_id: domain.lists.opportunities.id,
        list_name: domain.lists.opportunities.name,
        name: extractOpportunityName(message) || 'Business Opportunity',
        description: extractOpportunityDescription(message) || 'Track business opportunity',
        priority: 'high'
      })
    }
  }
  
  // Health domain tasks
  if (domain.domain === 'health') {
    if (message.includes('workout') || message.includes('gym') || message.includes('exercise')) {
      tasks.push({
        id: `health-workout-${Date.now()}-${Math.random()}`,
        type: 'workout',
        list_id: domain.lists.workouts.id,
        list_name: domain.lists.workouts.name,
        name: extractWorkoutName(message) || 'Workout Session',
        description: extractWorkoutDescription(message) || 'Complete fitness workout',
        auto_assign: true
      })
    }
    
    if (message.includes('meal') || message.includes('food') || message.includes('nutrition')) {
      tasks.push({
        id: `health-meal-${Date.now()}-${Math.random()}`,
        type: 'meal_plan',
        list_id: domain.lists.meal_plans.id,
        list_name: domain.lists.meal_plans.name,
        name: extractMealPlanName(message) || 'Meal Plan',
        description: extractMealPlanDescription(message) || 'Plan meals for the day',
        auto_checkoff: '21:00'
      })
    }
    
    if (message.includes('doctor') || message.includes('appointment') || message.includes('checkup')) {
      tasks.push({
        id: `health-appointment-${Date.now()}-${Math.random()}`,
        type: 'appointment',
        list_id: domain.lists.health_tasks.id,
        list_name: domain.lists.health_tasks.name,
        name: 'Health Appointment',
        description: extractAppointmentDescription(message) || 'Schedule health-related appointment',
        priority: 'high'
      })
    }
  }
  
  // Finance domain tasks
  if (domain.domain === 'finance') {
    if (message.includes('budget') || message.includes('financial') || message.includes('planning')) {
      tasks.push({
        id: `finance-budget-${Date.now()}-${Math.random()}`,
        type: 'budget',
        list_id: domain.lists.budgets.id,
        list_name: domain.lists.budgets.name,
        name: extractBudgetName(message) || 'Budget Review',
        description: extractBudgetDescription(message) || 'Review and update financial budget',
        priority: 'normal'
      })
    }
    
    if (message.includes('payment') || message.includes('invoice') || message.includes('transaction')) {
      tasks.push({
        id: `finance-transaction-${Date.now()}-${Math.random()}`,
        type: 'transaction',
        list_id: domain.lists.transactions.id,
        list_name: domain.lists.transactions.name,
        name: extractTransactionName(message) || 'Financial Transaction',
        description: extractTransactionDescription(message) || 'Process financial transaction',
        priority: message.includes('urgent') ? 'high' : 'normal'
      })
    }
  }
  
  // Personal domain tasks
  if (domain.domain === 'personal') {
    if (message.includes('grocery') || message.includes('shopping') || message.includes('buy')) {
      tasks.push({
        id: `personal-shopping-${Date.now()}-${Math.random()}`,
        type: 'shopping',
        list_id: domain.lists.shopping.id,
        list_name: domain.lists.shopping.name,
        name: extractShoppingName(message) || 'Shopping List',
        description: extractShoppingDescription(message) || 'Complete shopping errands',
        priority: 'normal'
      })
    }
    
    if (message.includes('appointment') || message.includes('family') || message.includes('personal')) {
      tasks.push({
        id: `personal-appointment-${Date.now()}-${Math.random()}`,
        type: 'appointment',
        list_id: domain.lists.appointments.id,
        list_name: domain.lists.appointments.name,
        name: extractPersonalAppointmentName(message) || 'Personal Appointment',
        description: extractPersonalAppointmentDescription(message) || 'Schedule personal appointment',
        priority: 'normal'
      })
    }
    
    if (message.includes('vacation') || message.includes('travel') || message.includes('trip')) {
      tasks.push({
        id: `personal-vacation-${Date.now()}-${Math.random()}`,
        type: 'vacation',
        list_id: domain.lists.personal_tasks.id,
        list_name: domain.lists.personal_tasks.name,
        name: extractVacationName(message) || 'Vacation Planning',
        description: extractVacationDescription(message) || 'Plan vacation or travel',
        priority: 'normal'
      })
    }
  }
  
  // Learning domain tasks
  if (domain.domain === 'learning') {
    if (message.includes('course') || message.includes('study') || message.includes('learn')) {
      tasks.push({
        id: `learning-course-${Date.now()}-${Math.random()}`,
        type: 'course',
        list_id: domain.lists.courses.id,
        list_name: domain.lists.courses.name,
        name: extractCourseName(message) || 'Learning Course',
        description: extractCourseDescription(message) || 'Complete learning course',
        priority: 'normal'
      })
    }
    
    if (message.includes('book') || message.includes('read') || message.includes('tutorial')) {
      tasks.push({
        id: `learning-study-${Date.now()}-${Math.random()}`,
        type: 'study_task',
        list_id: domain.lists.study_tasks.id,
        list_name: domain.lists.study_tasks.name,
        name: extractStudyTaskName(message) || 'Study Task',
        description: extractStudyTaskDescription(message) || 'Complete study or reading task',
        priority: 'normal'
      })
    }
  }
  
  return tasks
}

// Entity extraction functions for cross-space tasks
function extractEventName(message: string): string | null {
  const patterns = [
    /(?:meeting|call|presentation)\s+(?:with|about)\s+([^,.]+)/gi,
    /(?:meeting|call|presentation)\s+(?:at|on)\s+([^,.]+)/gi
  ]
  
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }
  return null
}

function extractEventDescription(message: string): string | null {
  if (message.includes('client')) return 'Client meeting or call'
  if (message.includes('presentation')) return 'Prepare and deliver presentation'
  if (message.includes('team')) return 'Team meeting or discussion'
  return 'Schedule work-related meeting'
}

function extractCompanyName(message: string): string | null {
  const patterns = [
    /(?:client|company|at)\s+([^,\s]+(?:\s+[^,\s]+)*)/gi,
    /(acme corp|google|microsoft|apple|amazon|tesla)/gi
  ]
  
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match) {
      return match[0].trim()
    }
  }
  return null
}

function extractLeadDescription(message: string): string | null {
  if (message.includes('new')) return 'New client opportunity'
  if (message.includes('follow up')) return 'Follow up with potential client'
  return 'New business opportunity'
}

function extractProjectName(message: string): string | null {
  if (message.includes('report')) return 'Report Completion'
  if (message.includes('project')) return 'Project Task'
  if (message.includes('deadline')) return 'Deadline Task'
  return 'Work Task'
}

function extractProjectDescription(message: string): string | null {
  if (message.includes('urgent')) return 'Urgent work task requiring immediate attention'
  if (message.includes('deadline')) return 'Task with upcoming deadline'
  return 'Complete work-related task'
}

function extractOpportunityName(message: string): string | null {
  if (message.includes('deal')) return 'Business Deal'
  if (message.includes('proposal')) return 'Proposal Opportunity'
  return 'Business Opportunity'
}

function extractOpportunityDescription(message: string): string | null {
  if (message.includes('new')) return 'New business opportunity to pursue'
  if (message.includes('follow up')) return 'Follow up on existing opportunity'
  return 'Track business opportunity'
}

function extractWorkoutName(message: string): string | null {
  if (message.includes('squats') || message.includes('bench') || message.includes('deadlifts')) {
    return 'Strength Training'
  }
  if (message.includes('cardio') || message.includes('running')) {
    return 'Cardio Workout'
  }
  return 'Workout Session'
}

function extractWorkoutDescription(message: string): string | null {
  if (message.includes('squats')) return 'Leg day - squats and lower body'
  if (message.includes('bench')) return 'Upper body - bench press and chest'
  if (message.includes('deadlifts')) return 'Full body - deadlifts compound movements'
  return 'Complete fitness workout'
}

function extractMealPlanName(message: string): string | null {
  return 'Meal Plan'
}

function extractMealPlanDescription(message: string): string | null {
  if (message.includes('breakfast')) return 'Plan breakfast meals'
  if (message.includes('lunch')) return 'Plan lunch meals'
  if (message.includes('dinner')) return 'Plan dinner meals'
  return 'Plan meals for the day'
}

function extractAppointmentDescription(message: string): string | null {
  if (message.includes('doctor')) return 'Schedule doctor appointment'
  if (message.includes('checkup')) return 'Schedule health checkup'
  return 'Schedule health-related appointment'
}

function extractBudgetName(message: string): string | null {
  if (message.includes('monthly')) return 'Monthly Budget'
  if (message.includes('weekly')) return 'Weekly Budget'
  return 'Budget Review'
}

function extractBudgetDescription(message: string): string | null {
  if (message.includes('review')) return 'Review and update financial budget'
  if (message.includes('plan')) return 'Create financial budget plan'
  return 'Review and update financial budget'
}

function extractTransactionName(message: string): string | null {
  if (message.includes('payment')) return 'Payment Processing'
  if (message.includes('invoice')) return 'Invoice Management'
  return 'Financial Transaction'
}

function extractTransactionDescription(message: string): string | null {
  if (message.includes('urgent')) return 'Urgent financial transaction'
  if (message.includes('process')) return 'Process financial transaction'
  return 'Process financial transaction'
}

function extractShoppingName(message: string): string | null {
  if (message.includes('grocery')) return 'Grocery Shopping'
  if (message.includes('buy')) return 'Shopping Errands'
  return 'Shopping List'
}

function extractShoppingDescription(message: string): string | null {
  if (message.includes('grocery')) return 'Buy groceries and food items'
  if (message.includes('urgent')) return 'Urgent shopping errands'
  return 'Complete shopping errands'
}

function extractPersonalAppointmentName(message: string): string | null {
  return 'Personal Appointment'
}

function extractPersonalAppointmentDescription(message: string): string | null {
  if (message.includes('family')) return 'Family-related appointment'
  if (message.includes('personal')) return 'Personal scheduling'
  return 'Schedule personal appointment'
}

function extractVacationName(message: string): string | null {
  if (message.includes('planning')) return 'Vacation Planning'
  if (message.includes('trip')) return 'Trip Planning'
  return 'Vacation Planning'
}

function extractVacationDescription(message: string): string | null {
  if (message.includes('planning')) return 'Plan vacation details and itinerary'
  if (message.includes('booking')) return 'Book vacation arrangements'
  return 'Plan vacation or travel'
}

function extractCourseName(message: string): string | null {
  if (message.includes('certification')) return 'Certification Course'
  if (message.includes('skill')) return 'Skill Development'
  return 'Learning Course'
}

function extractCourseDescription(message: string): string | null {
  if (message.includes('complete')) return 'Complete learning course'
  if (message.includes('start')) return 'Start new learning course'
  return 'Complete learning course'
}

function extractStudyTaskName(message: string): string | null {
  if (message.includes('book')) return 'Reading Assignment'
  if (message.includes('tutorial')) return 'Tutorial Completion'
  return 'Study Task'
}

function extractStudyTaskDescription(message: string): string | null {
  if (message.includes('read')) return 'Complete reading assignment'
  if (message.includes('practice')) return 'Practice learned skills'
  return 'Complete study or reading task'
}

function extractTiming(message: string): string | null {
  if (message.includes('today')) return 'Today'
  if (message.includes('tomorrow')) return 'Tomorrow'
  if (message.includes('next week')) return 'Next Week'
  if (message.includes('urgent')) return 'ASAP'
  return null
}

function generateStagedExecutionPlan(tasks: any[], domains: any[]): any {
  const stages = []
  
  // Stage 1: Create primary tasks across all spaces
  stages.push({
    stage: 1,
    description: 'Create primary tasks across all domains',
    domains: domains.map(d => d.domain),
    task_count: tasks.length,
    estimated_time: '2 seconds',
    rollback_available: true
  })
  
  // Stage 2: Create cross-space relationships
  if (domains.length > 1) {
    stages.push({
      stage: 2,
      description: 'Establish cross-space relationships',
      domains: domains.map(d => d.domain),
      task_count: domains.length - 1,
      estimated_time: '1 second',
      rollback_available: true
    })
  }
  
  // Stage 3: Configure domain-specific automation
  stages.push({
    stage: 3,
    description: 'Configure domain-specific automation',
    domains: domains.map(d => d.domain),
    task_count: domains.length,
    estimated_time: '2 seconds',
    rollback_available: false
  })
  
  // Stage 4: Final verification and cleanup
  stages.push({
    stage: 4,
    description: 'Final verification and cleanup',
    domains: domains.map(d => d.domain),
    task_count: 1,
    estimated_time: '1 second',
    rollback_available: false
  })
  
  return {
    total_stages: stages.length,
    total_tasks: tasks.length,
    stages: stages,
    estimated_total_time: `${stages.length * 2} seconds`,
    rollback_capability: true
  }
}

function generateCrossSpaceRelationships(tasks: any[]): any[] {
  const relationships = []
  
  // Work -> Health relationships (work stress -> self care)
  const workTasks = tasks.filter(t => t.domain === 'work')
  const healthTasks = tasks.filter(t => t.domain === 'health')
  
  if (workTasks.length > 0 && healthTasks.length > 0) {
    relationships.push({
      type: 'work_life_balance',
      source_task: workTasks[0].id,
      target_task: healthTasks[0].id,
      description: 'Balance work commitments with health activities'
    })
  }
  
  // Finance -> Personal relationships (budget -> shopping)
  const financeTasks = tasks.filter(t => t.domain === 'finance')
  const personalTasks = tasks.filter(t => t.domain === 'personal')
  
  if (financeTasks.length > 0 && personalTasks.some(t => t.type === 'shopping')) {
    relationships.push({
      type: 'budget_constraint',
      source_task: financeTasks[0].id,
      target_task: personalTasks.find(t => t.type === 'shopping')?.id,
      description: 'Shopping should align with budget constraints'
    })
  }
  
  return relationships
}
