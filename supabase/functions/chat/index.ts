import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Core system prompt based on LOGIC_ARCHITECTURE.md
const CORE_SYSTEM_PROMPT = `You are the Life OS Conductor: a proactive, context-rich, non-judgmental assistant that offloads orchestration, scheduling, data synthesis, and pattern recognition so the user can focus on living with clarity and balance.

Core Principles:
- Never preach, lecture, moralize, give unsolicited productivity advice, or push optimization as an end goal
- Prioritize orientation — higher-level awareness of where things stand across life right now, why it matters, and the smallest aligned next action
- Treat every input as natural conversation and infer intent dynamically
- ClickUp is the single source of truth - all persistent state lives in the user's ClickUp workspace
- All proposed changes include clear reasoning and high-impact changes require confirmation
- Never fabricate metrics, summaries, or alignment statements not grounded in retrieved data`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { message, conversation_id } = await req.json()
    
    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Environment setup
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const groqApiKey = Deno.env.get('GROQ_API_KEY')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!groqApiKey || !supabaseServiceKey) {
      throw new Error('GROQ_API_KEY or SUPABASE_SERVICE_ROLE_KEY not found in environment')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Step 1: Detect Life Area (simplified for now - will enhance with RAG later)
    let lifeArea = null
    const lifeAreas = await detectLifeArea(message, supabase)
    
    // Step 2: Get Life Area configuration
    let lifeAreaConfig = null
    if (lifeAreas.length > 0) {
      lifeArea = lifeAreas[0]
      const { data: config } = await supabase
        .from('life_areas')
        .select('*')
        .eq('id', lifeArea.id)
        .single()
      
      lifeAreaConfig = config
    }

    // If no life areas exist, provide setup guidance
    if (!lifeAreaConfig) {
      const setupResponse = {
        message: "I see you haven't set up your Life Areas yet! Let's get you configured. Go to Settings to create your default categories (General, Health & Fitness, Finance, Work, Meal Planning, Workouts). Once you configure each area with your specific goals and context, I'll be able to provide much more personalized assistance.",
        metaResponse: "Guiding user to complete initial setup",
        actionNeeded: {
          id: `setup-${Date.now()}`,
          type: 'setup',
          description: 'Complete your Life OS setup by configuring your life areas',
          fields: []
        }
      }

      // Store user message
      await supabase
        .from('chat_messages')
        .insert({
          content: message,
          role: 'user',
          conversation_id: conversation_id || null
        })

      // Store setup response
      await supabase
        .from('chat_messages')
        .insert({
          content: setupResponse.message,
          role: 'assistant',
          conversation_id: conversation_id || null,
          meta_response: setupResponse.metaResponse,
          action_needed: setupResponse.actionNeeded
        })

      return new Response(
        JSON.stringify(setupResponse),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Step 3: Task Intelligence Engine - Decision Reasoning
    const decisionResult = await runTaskIntelligence(
      message, 
      lifeAreaConfig, 
      [], // Will populate with actual tasks from ClickUp later
      groqApiKey
    )

    // Step 4: Execute actions (simplified for now)
    let executedActions = []
    let actionNeeded = null
    
    // Check if ClickUp setup is needed for any action-oriented request
    if (!lifeAreaConfig?.clickup_space_id && 
        (decisionResult.decision === 'create' || 
         decisionResult.decision === 'update' || 
         decisionResult.decision === 'hybrid')) {
      actionNeeded = {
        id: `clickup-setup-${Date.now()}`,
        type: 'configuration',
        description: `I need to connect to your ClickUp workspace to manage your ${lifeAreaConfig?.name?.toLowerCase() || 'tasks'}. Please provide your ClickUp Space ID so I can create and update tasks for you.`,
        fields: [
          {
            name: 'spaceId',
            label: 'ClickUp Space ID',
            type: 'text',
            placeholder: 'e.g., 123456789'
          }
        ]
      }
    }
    
    // Also handle orient requests that need ClickUp data
    if (decisionResult.decision === 'orient' && !lifeAreaConfig?.clickup_space_id) {
      actionNeeded = {
        id: `clickup-setup-${Date.now()}`,
        type: 'configuration',
        description: `To give you a proper orientation on your ${lifeAreaConfig?.name?.toLowerCase() || 'life areas'}, I need to connect to your ClickUp workspace. Please provide your ClickUp Space ID so I can see your current tasks and status.`,
        fields: [
          {
            name: 'spaceId',
            label: 'ClickUp Space ID',
            type: 'text',
            placeholder: 'e.g., 123456789'
          }
        ]
      }
    }
    
    if (decisionResult.decision === 'clarify') {
      actionNeeded = {
        id: `clarify-${Date.now()}`,
        type: 'clarification',
        description: decisionResult.confirmation_prompt,
        fields: [
          {
            name: 'clarification',
            label: 'Please clarify',
            type: 'text',
            placeholder: 'Provide more details...'
          }
        ]
      }
    }

    // Store user message
    await supabase
      .from('chat_messages')
      .insert({
        content: message,
        role: 'user',
        conversation_id: conversation_id || null
      })

    // Generate AI response based on decision
    const aiResponse = generateResponse(decisionResult, lifeAreaConfig, actionNeeded, message)

    // Store AI response
    await supabase
      .from('chat_messages')
      .insert({
        content: aiResponse.content,
        role: 'assistant',
        conversation_id: conversation_id || null,
        meta_response: aiResponse.metaResponse,
        action_needed: actionNeeded
      })

    return new Response(
      JSON.stringify({
        message: aiResponse.content,
        metaResponse: aiResponse.metaResponse,
        actionNeeded,
        decision: decisionResult
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Chat API error:', error.message)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

// Helper function to detect Life Area (simplified version)
async function detectLifeArea(message: string, supabase: any) {
  const lowerMessage = message.toLowerCase()
  
  // Try to get user's life areas
  const { data: areas, error } = await supabase
    .from('life_areas')
    .select('*')
    .order('metadata->>priority', { ascending: true })
  
  if (error || !areas || areas.length === 0) {
    return []
  }
  
  // Enhanced keyword-based detection with context matching
  const workoutKeywords = ['workout', 'exercise', 'gym', 'fitness', 'training', 'lift', 'cardio']
  const mealKeywords = ['meal', 'food', 'eat', 'dinner', 'lunch', 'breakfast', 'cook', 'recipe']
  const financeKeywords = ['finance', 'money', 'budget', 'bill', 'payment', 'expense', 'income', 'save']
  const workKeywords = ['work', 'project', 'task', 'meeting', 'deadline', 'global payments', 'office']
  
  // Score each life area based on keyword matches
  const scoredAreas = areas.map(area => {
    let score = 0
    const areaName = area.name.toLowerCase()
    const areaContext = area.context?.toLowerCase() || ''
    const areaInstructions = area.instructions?.toLowerCase() || ''
    const combinedText = areaName + ' ' + areaContext + ' ' + areaInstructions
    
    if (workoutKeywords.some(keyword => lowerMessage.includes(keyword))) {
      if (areaName.includes('workout') || areaName.includes('fitness')) score += 10
      if (combinedText.includes('workout') || combinedText.includes('fitness')) score += 5
    }
    
    if (mealKeywords.some(keyword => lowerMessage.includes(keyword))) {
      if (areaName.includes('meal')) score += 10
      if (combinedText.includes('meal') || combinedText.includes('food')) score += 5
    }
    
    if (financeKeywords.some(keyword => lowerMessage.includes(keyword))) {
      if (areaName.includes('finance')) score += 10
      if (combinedText.includes('finance') || combinedText.includes('money')) score += 5
    }
    
    if (workKeywords.some(keyword => lowerMessage.includes(keyword))) {
      if (areaName.includes('work')) score += 10
      if (combinedText.includes('work') || combinedText.includes('project')) score += 5
    }
    
    return { area, score }
  })
  
  // Sort by score and return the best match
  scoredAreas.sort((a, b) => b.score - a.score)
  
  if (scoredAreas[0].score > 0) {
    return [scoredAreas[0].area]
  }
  
  // Default to General area
  const generalArea = areas.find(area => 
    area.name.toLowerCase().includes('general')
  )
  if (generalArea) return [generalArea]
  
  return []
}

// Task Intelligence Engine - Core Decision Loop
async function runTaskIntelligence(
  userInput: string, 
  lifeAreaConfig: any, 
  relevantTasks: any[], 
  groqApiKey: string
) {
  // Build context-aware system prompt
  const contextPrompt = lifeAreaConfig ? `
Life Area Context:
- Name: ${lifeAreaConfig.name}
- Context: ${lifeAreaConfig.context || 'Not specified'}
- Goals: ${Array.isArray(lifeAreaConfig.goals) ? lifeAreaConfig.goals.join(', ') : 'Not specified'}
- Instructions: ${lifeAreaConfig.instructions || 'Not specified'}
- ClickUp Space: ${lifeAreaConfig.clickup_space_id || 'Not configured'}
- Default Lists: ${lifeAreaConfig.default_list_ids ? lifeAreaConfig.default_list_ids.join(', ') : 'Not configured'}

Use this context to provide personalized assistance and determine appropriate actions.` : ''

  const systemPrompt = CORE_SYSTEM_PROMPT + contextPrompt + `

You must respond with a JSON object containing:

User Input: "${userInput}"

Reason step-by-step and output JSON only:
{
  "decision": "create|update|hybrid|query|orient|clarify|delete",
  "explanation": "Short reasoning",
  "actions": [],
  "user_confirmation_needed": false,
  "confirmation_prompt": ""
}`

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userInput
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    })
  })

  if (!response.ok) {
    throw new Error(`Decision reasoning failed: ${response.statusText}`)
  }

  const data = await response.json()
  const decisionText = data.choices[0].message.content
  
  try {
    return JSON.parse(decisionText)
  } catch (e) {
    // Fallback if JSON parsing fails
    return {
      decision: 'orient',
      explanation: 'Unable to parse decision, providing orientation',
      actions: [],
      user_confirmation_needed: false,
      confirmation_prompt: ''
    }
  }
}

// Generate user-facing response based on decision
function generateResponse(decisionResult: any, lifeAreaConfig: any, actionNeeded: any, userMessage: string) {
  let content = ''
  let metaResponse = ''

  switch (decisionResult.decision) {
    case 'create':
      content = `I understand you want to ${getActionIntent(userMessage)}. I can help you create a new task for that.`
      metaResponse = "Identified need for new task creation"
      break
    case 'update':
      content = `I see you want to ${getActionIntent(userMessage)} and update existing tasks.`
      metaResponse = "Detected task modification intent"
      break
    case 'query':
      content = "Let me check on that for you."
      metaResponse = "Processing information query"
      break
    case 'orient':
      content = `I understand you're looking for ${getActionIntent(userMessage)}. Let me give you an overview of where things stand.`
      metaResponse = "Providing orientation and current state"
      break
    case 'clarify':
      content = decisionResult.confirmation_prompt || "I need a bit more information to help you best."
      metaResponse = "Requesting clarification for better assistance"
      break
    default:
      content = "I'm here to help you organize and orient your life. What would you like to work on?"
      metaResponse = "Providing general assistance"
  }

  if (actionNeeded) {
    content += " I'll need some additional information to proceed."
  }

  return { content, metaResponse }
}

// Helper function to extract action intent from user message
function getActionIntent(message: string): string {
  const lowerMessage = message.toLowerCase()
  
  if (lowerMessage.includes('workout') || lowerMessage.includes('exercise') || lowerMessage.includes('gym')) {
    return 'workout planning'
  }
  if (lowerMessage.includes('meal') || lowerMessage.includes('food') || lowerMessage.includes('eat')) {
    return 'meal planning'
  }
  if (lowerMessage.includes('finance') || lowerMessage.includes('money') || lowerMessage.includes('budget')) {
    return 'financial planning'
  }
  if (lowerMessage.includes('work') || lowerMessage.includes('project') || lowerMessage.includes('task')) {
    return 'work organization'
  }
  
  return 'assistance with your request'
}
