import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CLICKUP_API_BASE, syncClickUpConfiguration } from '../lib/clickup-sync.ts'
import { APP_USER_ID } from '../config/defaultUser.ts'
import { createExecutionPlan } from '../../src/lib/executionRules.ts'
import {
  buildSingleClarificationPrompt,
  computePlanConfidence,
  needsSingleClarification
} from '../lib/plannerConfidence.ts'
import { computeGoalDeltas } from '../lib/artifactDelta.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ActionCardType = 'setup' | 'configuration' | 'plan' | 'error' | 'clarification'

type ActionCardField = {
  name: string
  label: string
  type: string
  placeholder?: string
  options?: string[]
}

type ActionCard = {
  id: string
  type: ActionCardType
  description: string
  fields: ActionCardField[]
  metadata?: Record<string, any>
}

type ListRoutingResolution = {
  selected: any | null
  candidates: Array<{ list: any; score: number }>
  ambiguous: boolean
}

type ExtractedEntities = {
  taskType: 'event' | 'task' | 'workout' | 'meal'
  primaryTitle: string | null
  dateRange: Record<string, any>
  location: string | null
  recurrence: string | null
  constraints: string[]
  tags: string[]
  applyToFuture?: boolean
  leadContext?: StructuredExtraction['context']
}

type InlineExecutionOverrides = {
  description?: string | null
  assigneeId?: string | null
}

type StructuredExtraction = {
  entity_type: 'lead' | 'event' | 'task' | 'workout' | 'meal' | 'unknown'
  intent_actions: string[]
  primary_title: string | null
  target_space_hint: string | null
  target_list_hint: string | null
  context: {
    contact_name?: string | null
    company?: string | null
    pain_point?: string | null
    timing_trigger?: string | null
    strategic_angle?: string | null
    follow_up_date?: string | null
  }
}

type GoalMetric = {
  metric: string
  target: number
  period: 'daily' | 'weekly' | 'monthly'
}

type ListConfig = {
  goals: GoalMetric[]
  execution: {
    require_subtasks: boolean
    due_date_policy: 'required' | 'optional' | 'forbid'
    reminders: 'none' | 'default'
  }
  naming: {
    max_words: number
    max_chars: number
    prefix?: string | null
  }
  description: {
    mode: 'compact' | 'detailed'
    include_source: boolean
  }
}

const EMPTY_STRUCTURED_EXTRACTION: StructuredExtraction = {
  entity_type: 'unknown',
  intent_actions: [],
  primary_title: null,
  target_space_hint: null,
  target_list_hint: null,
  context: {}
}

const DEFAULT_LIST_CONFIG: ListConfig = {
  goals: [],
  execution: {
    require_subtasks: false,
    due_date_policy: 'optional',
    reminders: 'none'
  },
  naming: {
    max_words: 8,
    max_chars: 32,
    prefix: null
  },
  description: {
    mode: 'compact',
    include_source: true
  }
}

function createActionCard(input: ActionCard): ActionCard {
  return {
    ...input,
    fields: Array.isArray(input.fields) ? input.fields : [],
    metadata: input.metadata || {}
  }
}

function parseDateTimeLocalToMs(value?: string) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return String(parsed.getTime())
}

function applyInlineOverridesToExtracted(
  extracted: ExtractedEntities,
  inlineOverrides: Record<string, string>
) {
  const patched: ExtractedEntities = JSON.parse(JSON.stringify(extracted))
  const startOverride = parseDateTimeLocalToMs(inlineOverrides.start_at)
  const dueOverride = parseDateTimeLocalToMs(inlineOverrides.end_at)
  if (startOverride) {
    patched.dateRange.start_date = startOverride
    patched.dateRange.has_time = true
  }
  if (dueOverride) {
    patched.dateRange.due_date = dueOverride
    patched.dateRange.has_time = true
  }
  const recurrenceOverride = String(inlineOverrides.recurrence || '').trim().toLowerCase()
  if (recurrenceOverride && recurrenceOverride !== 'none') {
    patched.recurrence = recurrenceOverride
  } else if (recurrenceOverride === 'none') {
    patched.recurrence = null
  }
  return patched
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

  let stage = 'init'
  try {
    stage = 'parse_payload'
    const payload = await req.json()
    const { message, conversation_id, metadata, userId: requestedUserId } = payload
    if (requestedUserId && requestedUserId !== APP_USER_ID) {
      return new Response(
        JSON.stringify({ error: "Invalid user context" }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const userId = requestedUserId || APP_USER_ID

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    stage = 'env_setup'
    // Environment setup
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('LOCAL_SUPABASE_URL')
    const groqApiKey = Deno.env.get('GROQ_API_KEY') ?? Deno.env.get('LOCAL_GROQ_API_KEY')
    const supabaseServiceKey =
      Deno.env.get('APP_SUPABASE_SERVICE_ROLE_KEY') ??
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
      Deno.env.get('LOCAL_SUPABASE_SERVICE_ROLE_KEY')
    const clickupApiKey = Deno.env.get('CLICKUP_API_KEY') ?? Deno.env.get('LOCAL_CLICKUP_API_KEY')
    
    if (!groqApiKey || !supabaseServiceKey || !supabaseUrl) {
      throw new Error('GROQ_API_KEY or APP_SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY not found in environment')
    }

    // Edge runtime DB access must use a JWT-shaped service role key, not publishable/secret API key strings.
    if (!supabaseServiceKey.includes('.') || supabaseServiceKey.split('.').length !== 3) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY must be the legacy JWT service_role key (format: x.y.z)')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const inlineOverrides: Record<string, string> = {}
    if (metadata?.inline_fields) {
      metadata.inline_fields.forEach((field: any) => {
        if (field.name && field.value !== undefined) {
          inlineOverrides[field.name] = field.value
        }
      })
    }
    const modifyRequest = String(inlineOverrides.modify_request || '').trim()
    const planningMessage = modifyRequest
      ? `${message}\nRequested modification: ${modifyRequest}`
      : message

    stage = 'background_sync'
    let backgroundSyncError: string | null = null
    if (clickupApiKey) {
      try {
        // Keep chat responsive even if background sync hits transient schema/API issues.
        await syncClickUpConfiguration(supabase, clickupApiKey, userId)
      } catch (syncError) {
        console.error('Background ClickUp sync failed during chat request', syncError)
        backgroundSyncError = syncError instanceof Error ? syncError.message : String(syncError)
      }
    }

    stage = 'load_target_workspace'
    const configuredWorkspaceId = (Deno.env.get('APP_CLICKUP_WORKSPACE_ID') ?? Deno.env.get('LOCAL_CLICKUP_WORKSPACE_ID'))?.trim() || null
    const configuredWorkspaceName = ((Deno.env.get('APP_CLICKUP_WORKSPACE_NAME') ?? Deno.env.get('LOCAL_CLICKUP_WORKSPACE_NAME')) || 'Life OS').trim().toLowerCase()
    const { data: allWorkspaces } = await supabase
      .from('clickup_workspaces')
      .select('clickup_workspace_id, name, metadata')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    const selectedWorkspace =
      (configuredWorkspaceId
        ? (allWorkspaces || []).find((workspace: any) => workspace.clickup_workspace_id === configuredWorkspaceId)
        : null) ||
      (allWorkspaces || []).find((workspace: any) => Boolean(workspace?.metadata?.single_tenant_target)) ||
      (allWorkspaces || []).find((workspace: any) => (workspace?.name || '').trim().toLowerCase() === configuredWorkspaceName) ||
      null

    const selectedWorkspaceId = selectedWorkspace?.clickup_workspace_id || configuredWorkspaceId || null

    stage = 'load_synced_spaces'
    let spacesQuery = supabase
      .from('clickup_spaces')
      .select('clickup_space_id, workspace_id, name')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
    if (selectedWorkspaceId) {
      spacesQuery = spacesQuery.eq('workspace_id', selectedWorkspaceId)
    }
    const { data: syncedSpaces } = await spacesQuery

    const validSpaceIds = new Set((syncedSpaces || []).map((space: any) => String(space.clickup_space_id)))

    stage = 'load_synced_lists'
    const { data: allLists } = await supabase
      .from('clickup_lists')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
    const syncedLists = (allLists || []).filter((list: any) => {
      const spaceId = list?.space_id || list?.metadata?.space_id
      return Boolean(spaceId) && validSpaceIds.has(String(spaceId))
    })

    stage = 'run_deterministic_pipeline'
    
    // Use our new deterministic pipeline instead of old routing
    const proposal = await runDeterministicPipeline(
      planningMessage,
      userId,
      supabase,
      groqApiKey
    )
    
    if (!proposal) {
      throw new Error('Pipeline failed to generate proposal')
    }
    
    // Extract execution plan from proposal metadata
    const executionPlan = proposal.action_card.metadata.execution_plan
    
    // Extract resolved space info from execution plan
    const resolvedSpace = {
      space_id: executionPlan.space_id,
      list_id: executionPlan.list_id,
      list_name: 'Resolved List' // We'll get this from the space if needed
    }
    
    // Create compatible execution plan for existing code
    const compatibleExecutionPlan = {
      summary: proposal.action_card.description,
      decision: 'create',
      target: {
        spaceId: executionPlan.space_id,
        listId: executionPlan.list_id,
        listName: 'Resolved List'
      },
      actions: [{
        capability: 'create_item',
        name: executionPlan.task_name,
        description: executionPlan.task_description,
        listId: executionPlan.list_id
      }]
    }
    const metadataWithPlan = { ...(metadata || {}), computed_plan: compatibleExecutionPlan }

    // Step 4: Execute actions using the ClickUp workspace
    const decisionRequiresClickUp = true // Our pipeline always creates ClickUp actions
    const hasClickUpConfig = true // Our pipeline ensures valid config
    const preferredListName = inlineOverrides.target_list_name || executionPlan.list_id
    const extractedBase = extractEntitiesFromMessage(
      planningMessage,
      { default_space_id: executionPlan.space_id }, // Minimal routing config
      'create',
      null // No structured intent needed
    )
    const inlineRename = String(inlineOverrides.rename_to || '').trim()
    const extractedEntities = applyInlineOverridesToExtracted(extractedBase, inlineOverrides)
    if (inlineRename) {
      extractedEntities.primaryTitle = inlineRename
    }
    if (
      extractedEntities.taskType === 'meal' &&
      decisionResult.decision === 'create' &&
      /\b(instead of|swapped|ate|had|changed meal|replaced)\b/i.test(planningMessage)
    ) {
      // Meal swaps default to updating today's recurring instance unless user requests future scope.
      decisionResult.decision = 'update'
    }
    const incomingPlan = metadata?.plan
    const planFromMetadata =
      incomingPlan && incomingPlan?.target?.listId ? incomingPlan : null
    const inlineApproval = Boolean(
      planFromMetadata &&
      (metadata?.inline_fields ?? []).some((field: any) => field.name === 'approval' && field.value === 'confirm')
    )
    const selectedSpaceOverride = String(inlineOverrides.target_space_id || '').trim()
    // Space overrides are now handled in the pipeline, so we can skip this logic

    stage = 'resolve_target_and_stage'
    let actionNeeded: ActionCard | null = null
    let executionResult: { success: boolean; summary?: string; error?: string; mainTask?: any } | null = null
    let targetList = null
    let routingResolution: ListRoutingResolution = { selected: null, candidates: [], ambiguous: false }
    let targetListConfig: ListConfig = DEFAULT_LIST_CONFIG
    let goalDeltas: any[] = []
    let priorityHint: string | null = null
    let executionReceipt: Record<string, any> | null = null

    if (decisionRequiresClickUp) {
      if (inlineApproval && planFromMetadata) {
        targetList = await resolveTargetListForPlan(planFromMetadata, { default_space_id: executionPlan.space_id }, supabase)
      } else if (inlineOverrides.target_list_id) {
        const overrideListId = String(inlineOverrides.target_list_id).split('|')[0]
        targetList = await resolveTargetListById(overrideListId, userId, supabase)
        routingResolution = {
          selected: targetList,
          candidates: targetList ? [{ list: targetList, score: 1000 }] : [],
          ambiguous: false
        }
      } else {
        // Use the resolved list from our pipeline
        targetList = {
          clickup_list_id: executionPlan.list_id,
          name: 'Resolved List',
          space_id: executionPlan.space_id
        }
        routingResolution = {
          selected: targetList,
          candidates: [{ list: targetList, score: 1000 }],
          ambiguous: false
        }
      }
    }

    // Skip duplicate detection for now - our pipeline handles this
    // TODO: Integrate duplicate detection with new pipeline
    
    // Create action card from our proposal
    actionNeeded = proposal.action_card

    // Store action card for user response
    const { error: insertError } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id,
        message,
        metadata: {
          action_card: actionNeeded,
          stage,
          background_sync_error: backgroundSyncError
        },
        user_id: userId
      })
    if (insertError) {
      console.error('Failed to store action card:', insertError)
    }
    
    return new Response(
      JSON.stringify({
        action_card: actionNeeded,
        execution_result: null,
        execution_receipt: null,
        decision_result: { decision: 'create', explanation: proposal.action_card.description },
        stage
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
      const overrideSpaces = (syncedSpaces || [])
        .filter((space: any) => Boolean(space?.clickup_space_id))
        .map((space: any) => ({
          id: String(space.clickup_space_id),
          name: space.name || 'Unnamed space'
        }))

      actionNeeded = createActionCard({
        id: `clickup-error-${Date.now()}`,
        type: 'error',
        description: 'An error occurred while processing your request.',
        fields: []
      })
    }

    if (decisionRequiresClickUp && !targetList && !actionNeeded && !inlineApproval) {
      const listNameField = {
        name: 'target_list_name',
        label: 'List name',
        type: 'text',
        placeholder: 'e.g., Work events'
      }
      actionNeeded = createActionCard({
        id: `clickup-list-${Date.now()}`,
        type: 'configuration',
        description: `I couldn't find or create a list inside ${routingConfig?.name || 'this space'}. Tell me which list you'd prefer and I can create it for you.`,
        fields: [listNameField],
        metadata: {
          fields: [listNameField]
        }
      })
    }

    const planValidation = decisionRequiresClickUp && targetList
      ? validatePlannedAction({
          decision: decisionResult.decision,
          targetList,
          extracted: extractedEntities,
          structuredIntent,
          listConfig: targetListConfig
        })
      : { valid: true, reasons: [] as string[] }

    const confidence = decisionRequiresClickUp
      ? computePlanConfidence({
          decision: decisionResult.decision,
          structuredIntent,
          extracted: extractedEntities,
          targetListId: targetList?.clickup_list_id || null
        })
      : { score: 1, signals: [] as any[] }

    if (
      decisionRequiresClickUp &&
      !inlineApproval &&
      !actionNeeded &&
      needsSingleClarification(confidence)
    ) {
      const question = buildSingleClarificationPrompt(confidence)
      actionNeeded = createActionCard({
        id: `clarify-confidence-${Date.now()}`,
        type: 'clarification',
        description: `I need one clarification before staging this plan: ${question}`,
        fields: [
          {
            name: 'clarification',
            label: 'Clarify',
            type: 'text',
            placeholder: 'Add one missing detail...'
          }
        ],
        metadata: {
          confidence_score: confidence.score,
          confidence_signals: confidence.signals
        }
      })
    }

    if (decisionRequiresClickUp && targetList && !planValidation.valid && !actionNeeded) {
      actionNeeded = createActionCard({
        id: `clarify-plan-${Date.now()}`,
        type: 'clarification',
        description: `Before I stage this, I need one detail: ${planValidation.reasons[0]}`,
          extractedEntities,
          listConfig: targetListConfig,
          goalDeltas
        )
      : null

        }))

      actionNeeded = createActionCard({
        id: `plan-${Date.now()}`,
        type: 'plan',
        description: `${planForAction.summary}\nTarget: ${suggestedTargetLabel}`,
        metadata: {
          plan: planForAction,
          original_message: message,
          clickup_space_id: routingConfig.default_space_id,
          target_list_id: planForAction.target.listId
          ,
          override_options: {
            spaces: overrideSpaces,
            lists: overrideLists
          },
          deltas: goalDeltas,
          preview: buildPlanPreview(planForAction, extractedEntities)
        },
        fields: targetOptions.length
          ? [
              {
                name: 'target_list_id',
                label: 'Destination list',
                type: 'select',
                options: targetOptions,
                placeholder: 'Use suggested target'
              }
            ]
          : []
      })
    }

    if (!actionNeeded && decisionRequiresClickUp && planFromMetadata && inlineApproval) {
      const mutablePlan = structuredClone(planFromMetadata)
      const approvedRename = String(inlineOverrides.rename_to || '').trim()
      if (approvedRename && Array.isArray(mutablePlan.actions) && mutablePlan.actions[0]) {
        mutablePlan.actions[0].name = approvedRename
      }
      const overrideTargetListId = inlineOverrides.target_list_id?.split('|')[0] || inlineOverrides.target_list_id
      const overriddenTargetList = overrideTargetListId
        ? await resolveTargetListById(overrideTargetListId, userId, supabase)
        : null
      const executionTargetList = overriddenTargetList || targetList

      if (!executionTargetList) {
        actionNeeded = createActionCard({
          id: `clickup-error-${Date.now()}`,
          type: 'error',
          description: 'I cannot locate the ClickUp list referenced in the plan.',
          fields: []
        })
      } else {
        // Primary path: execute directly with ClickUp API for deterministic single-tenant behavior.
        executionResult = await executeWorkoutPlan({
          message: planningMessage,
          routingConfig,
          targetList: executionTargetList,
          clickupApiKey,
          decision: mutablePlan.decision || decisionResult.decision,
          extracted: extractedEntities,
          listConfig: targetListConfig,
          executionOverrides: {
            description: inlineOverrides.description_override || null,
            assigneeId: inlineOverrides.assignee_id || null
          }
        })

        // Secondary fallback: capability router function.
        if (!executionResult.success) {
          executionResult = await executeViaCapabilityRouter({
            supabaseUrl,
            supabaseServiceKey,
            userId,
            plan: mutablePlan,
            message: planningMessage,
            routingConfig,
            targetList: executionTargetList
          })
        }

        const artifactId = await logArtifact({
          supabase,
          userId,
          plan: mutablePlan,
          requestPayload: {
            message: planningMessage,
            plan: mutablePlan
          },
          responsePayload: executionResult,
          status: executionResult.success ? 'success' : 'failure',
          summary: executionResult.summary,
          listId: executionTargetList?.clickup_list_id || mutablePlan.target.listId,
          error: executionResult.success ? null : executionResult.error
        })

        if (executionResult?.success) {
          const targetSpaceName =
            (syncedSpaces || []).find((space: any) => {
              const sid = executionTargetList?.space_id || executionTargetList?.metadata?.space_id
              return sid && String(space.clickup_space_id) === String(sid)
            })?.name || routingConfig?.name || 'Workspace'
          const targetListName = deriveListDisplayName(executionTargetList)
          let postExecutionDeltaSummary: string | null = null
          let postExecutionPriorityHint: string | null = null
          const executedListId = executionTargetList?.clickup_list_id || mutablePlan.target.listId
          // Keep delta snapshots fresh for the next planning turn.
          await refreshCompletionDeltaSnapshot({
            supabaseUrl,
            supabaseServiceKey,
            userId,
            listId: executedListId
          })
          if (targetListConfig.goals.length) {
            const { data: postArtifacts } = await supabase
              .from('clickup_artifacts')
              .select('created_at, request_payload, response_payload')
              .eq('user_id', userId)
              .eq('list_id', executedListId)
              .eq('status', 'success')
              .order('created_at', { ascending: false })
              .limit(300)
            const postDeltas = computeGoalDeltas(targetListConfig.goals as any, postArtifacts || [], new Date())
            postExecutionDeltaSummary = summarizeDeltaLines(postDeltas).join(' • ')
            postExecutionPriorityHint = derivePriorityHint(postDeltas)
          }

          executionReceipt = {
            artifactId: artifactId || null,
            title: `Created task in ${targetSpaceName} -> ${targetListName}`,
            targetSpaceName,
            targetListName,
            deltaSummary: postExecutionDeltaSummary,
            priorityHint: postExecutionPriorityHint
          }
        }

        if (executionResult && !executionResult.success && !actionNeeded) {
          actionNeeded = createActionCard({
            id: `clickup-error-${Date.now()}`,
            type: 'error',
            description:
              executionResult.error || 'Something went wrong while trying to sync with ClickUp.',
            fields: []
          })
        }
      }
    }

    if (!actionNeeded && decisionResult.decision === 'orient' && !hasClickUpConfig) {
      actionNeeded = createActionCard({
        id: `clickup-setup-${Date.now()}`,
        type: 'configuration',
        description: 'To give orientation, I need synced ClickUp spaces and lists. Run workspace sync, then I can stage actions.',
        fields: [
          {
            name: 'spaceId',
            label: 'ClickUp Space ID',
            type: 'text',
            placeholder: 'e.g., 123456789'
          }
        ]
      })
    }

    if (!actionNeeded && decisionResult.decision === 'clarify') {
      actionNeeded = createActionCard({
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
      })
    }

    stage = 'persist_user_message'
    // Store user message
    await supabase
      .from('chat_messages')
      .insert({
        content: message,
        role: 'user',
        conversation_id: conversation_id || null
      })

    // Generate AI response based on decision
    const aiResponse = generateResponse(
      decisionResult,
      routingConfig,
      actionNeeded,
      message,
      executionResult?.summary,
      backgroundSyncError,
      priorityHint
    )

    stage = 'persist_assistant_message'
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
        decision: decisionResult,
        receipt: executionReceipt
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error)
    const errStack = error instanceof Error ? error.stack : undefined
    console.error(`[chat] stage=${stage} error=${errMessage}`, errStack)
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

// ===== STAGE 1: Intent Classification (LLM-Based) =====
type IntentType = 'lead' | 'workout' | 'meeting' | 'task' | 'event' | 'finance' | 'health' | 'general'

interface ClassifiedIntent {
  type: IntentType
  confidence: number
  reasoning: string
  extracted: {
    primary_entity?: string
    secondary_entities?: string[]
    temporal?: string
    urgency?: 'high' | 'medium' | 'low'
    domain_hint?: string
  }
}

async function classifyIntent(message: string, groqApiKey: string): Promise<ClassifiedIntent> {
  const prompt = `Classify the user's intent and extract entities. Return ONLY valid JSON:

User message: "${message}"

Analyze and return:
{
  "type": "lead|workout|meeting|task|event|finance|health|general",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of classification",
  "extracted": {
    "primary_entity": "main business/person/topic",
    "secondary_entities": ["person1", "person2"],
    "temporal": "time reference like tomorrow or 2pm",
    "urgency": "high|medium|low",
    "domain_hint": "work|health|finance|general"
  }
}

Rules:
- "lead": business, client, customer, sales, contact, signature, decision maker
- "workout": exercise, gym, training, squats, deadlift, bench press
- "meeting": appointment, call, schedule, follow-up, discuss, review
- "event": conference, workshop, webinar, seminar
- "finance": expense, budget, cost, fee, spend, track
- "health": doctor, medical, appointment, medication, check-up
- "task": general action items, todo, need to do
- "general": fallback for unclear intents

Classification must be precise and confident.`

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-70b-8192',
        messages: [
          {
            role: 'system',
            content: 'You are an intent classification expert. Always return valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      })
    })

    if (!response.ok) {
      throw new Error(`LLM classification failed: ${response.statusText}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content
    
    if (!content) {
      throw new Error('Empty LLM response')
    }

    // Parse JSON response
    const classification = JSON.parse(content.trim())
    
    // Validate required fields
    if (!classification.type || typeof classification.confidence !== 'number' || !classification.extracted) {
      throw new Error('Invalid LLM classification format')
    }

    // Ensure valid intent type
    const validTypes: IntentType[] = ['lead', 'workout', 'meeting', 'task', 'event', 'finance', 'health', 'general']
    if (!validTypes.includes(classification.type)) {
      classification.type = 'general'
    }

    return {
      type: classification.type,
      confidence: Math.min(1, Math.max(0, classification.confidence)),
      reasoning: classification.reasoning || 'LLM classification',
      extracted: {
        primary_entity: classification.extracted.primary_entity,
        secondary_entities: Array.isArray(classification.extracted.secondary_entities) 
          ? classification.extracted.secondary_entities 
          : [],
        temporal: classification.extracted.temporal,
        urgency: ['high', 'medium', 'low'].includes(classification.extracted.urgency)
          ? classification.extracted.urgency 
          : 'medium',
        domain_hint: ['work', 'health', 'finance', 'general'].includes(classification.extracted.domain_hint)
          ? classification.extracted.domain_hint
          : 'general'
      }
    }
  } catch (error) {
    console.error('LLM intent classification failed:', error)
    
    // Fallback to basic classification
    return {
      type: 'general',
      confidence: 0.3,
      reasoning: 'LLM classification failed, using fallback',
      extracted: {
        primary_entity: extractTaskSubject(message),
        secondary_entities: [],
        temporal: extractTimeReference(message),
        urgency: 'medium',
        domain_hint: 'general'
      }
    }
  }
}

// ===== STAGE 2: Intent → Domain Mapping (General Domain Enum) =====
type Domain = 'work' | 'health' | 'finance' | 'general'

interface DomainMapping {
  domain: Domain
  confidence: number
}

function mapIntentToDomain(intent: ClassifiedIntent): DomainMapping {
  // Authoritative intent → domain mapping only
  // LLM domain_hint is logged but NOT used for routing
  const domainHint = intent.extracted.domain_hint
  console.log(`LLM suggested domain: ${domainHint} (ignored for routing)`)
  
  // Hardcoded authoritative mapping
  const intentToDomainMap: Record<IntentType, Domain> = {
    lead: 'work',
    workout: 'health',
    meeting: 'work',
    event: 'general',
    finance: 'finance',
    health: 'health',
    task: 'general',
    general: 'general'
  }
  
  const mappedDomain = intentToDomainMap[intent.type]
  
  return {
    domain: mappedDomain,
    confidence: intent.confidence
  }
}

// ===== STAGE 3: Space Resolution Within Domain (User-Configurable) =====
interface ResolvedSpace {
  space_id: string
  space_name: string
  list_id: string
  list_name: string
  resolution_strategy: string
}

async function resolveSpace(
  domainMapping: DomainMapping,
  intent: ClassifiedIntent,
  userId: string,
  supabase: any
): Promise<ResolvedSpace | null> {
  try {
    // Strategy 1: User-defined preference for this intent
    const { data: userPreferences } = await supabase
      .from('user_space_preferences')
      .select('preferred_space_id, priority_rank')
      .eq('user_id', userId)
      .eq('intent_type', intent.type)
      .order('priority_rank', { ascending: true })
      .limit(1)
    
    if (userPreferences && userPreferences.length > 0) {
      const preferredSpaceId = userPreferences[0].preferred_space_id
      const { data: preferredSpaces } = await supabase
        .from('clickup_spaces')
        .select('*')
        .eq('user_id', userId)
        .eq('clickup_space_id', preferredSpaceId)
        .eq('domain', domainMapping.domain)
        .limit(1)
      
      if (preferredSpaces && preferredSpaces.length > 0) {
        console.log(`Selected space by user preference: ${intent.type} → ${preferredSpaceId}`)
        return await buildResolvedSpace(preferredSpaces[0], userId, supabase, 'user_preference')
      }
    }
    
    // Strategy 2: Find spaces that support this intent type
    const { data: supportingSpaces } = await supabase
      .from('clickup_spaces')
      .select('*')
      .eq('user_id', userId)
      .eq('domain', domainMapping.domain)
      .contains('supports_intent_types', [intent.type])
      .order('priority_rank', { ascending: true })
      .limit(1)
    
    if (supportingSpaces && supportingSpaces.length > 0) {
      console.log(`Selected space by intent support: ${intent.type} → ${supportingSpaces[0].name}`)
      return await buildResolvedSpace(supportingSpaces[0], userId, supabase, 'intent_support')
    }
    
    // Strategy 3: Try default space for domain
    const { data: defaultSpaces } = await supabase
      .from('clickup_spaces')
      .select('*')
      .eq('user_id', userId)
      .eq('domain', domainMapping.domain)
      .eq('is_default', true)
      .limit(1)
    
    if (defaultSpaces && defaultSpaces.length > 0) {
      console.log(`Selected default space for domain: ${domainMapping.domain}`)
      return await buildResolvedSpace(defaultSpaces[0], userId, supabase, 'default_space')
    }
    
    // Strategy 4: Fallback to highest priority space in domain
    const { data: prioritySpaces } = await supabase
      .from('clickup_spaces')
      .select('*')
      .eq('user_id', userId)
      .eq('domain', domainMapping.domain)
      .order('priority_rank', { ascending: true })
      .limit(1)
    
    if (prioritySpaces && prioritySpaces.length > 0) {
      console.log(`Selected space by priority: rank ${prioritySpaces[0].priority_rank}`)
      return await buildResolvedSpace(prioritySpaces[0], userId, supabase, 'priority_fallback')
    }
    
    // Strategy 5: Explicit failure with helpful error
    const { data: allDomainSpaces } = await supabase
      .from('clickup_spaces')
      .select('name, space_type, supports_intent_types, priority_rank')
      .eq('user_id', userId)
      .eq('domain', domainMapping.domain)
    
    const availableSpaceTypes = allDomainSpaces?.map(s => s.space_type).join(', ') || 'none'
    const supportedIntents = allDomainSpaces?.flatMap(s => s.supports_intent_types || []).join(', ') || 'none'
    
    throw new Error(
      `No suitable space found for intent "${intent.type}" in domain "${domainMapping.domain}". ` +
      `Available spaces: ${availableSpaceTypes}. ` +
      `Supported intents: ${supportedIntents}. ` +
      `Configure space preferences or add a space that supports "${intent.type}".`
    )
    
  } catch (error) {
    console.error('Space resolution failed:', error)
    // Re-throw with context for user feedback
    if (error.message.includes('No suitable space found')) {
      throw error // Let user see configuration error
    }
    throw new Error(`Space resolution failed: ${error.message}`)
  }
}

async function buildResolvedSpace(
  space: any,
  userId: string,
  supabase: any,
  resolutionStrategy: string
): Promise<ResolvedSpace> {
  try {
    // Query lists within the space
    const { data: lists } = await supabase
      .from('clickup_lists')
      .select('*')
      .eq('user_id', userId)
      .eq('space_id', space.clickup_space_id)
    
    if (!lists || lists.length === 0) {
      throw new Error(`No lists found in space: ${space.name}`)
    }
    
    // Select appropriate list based on space type
    const selectedList = selectBestListBySpaceType(lists, space.space_type)
    
    if (!selectedList) {
      throw new Error(`No suitable list found in space: ${space.name}`)
    }
    
      } catch (error) {
    throw new Error(`Failed to build resolved space: ${error.message}`)
  }
}

function selectBestListBySpaceType(lists: any[], spaceType: string): any {
  // Enhanced list selection based on space type
  const spaceTypeListPreferences: Record<string, string[]> = {
    'sales_pipeline': ['leads', 'prospects', 'clients', 'opportunities'],
    'ops': ['tasks', 'operations', 'maintenance', 'systems'],
    'admin': ['expenses', 'budget', 'reporting', 'compliance'],
    'meetings': ['meetings', 'calls', 'appointments', 'calendar'],
    'projects': ['tasks', 'projects', 'deliverables', 'milestones'],
    'client_work': ['clients', 'projects', 'deliverables', 'communication'],
    'internal': ['tasks', 'projects', 'team', 'coordination'],
    'general': ['tasks', 'general', 'misc', 'todo']
  }
  
  const preferences = spaceTypeListPreferences[spaceType] || spaceTypeListPreferences.general
  
  for (const preference of preferences) {
    const match = lists.find(list => 
      list.name.toLowerCase().includes(preference.toLowerCase())
    )
    if (match) return match
  }
  
  // Fallback to first available list
  return lists[0]
}

// ===== STAGE 4: Context Injection From Resolved Space =====
interface InjectedContext {
  intent: ClassifiedIntent
  domain: DomainMapping
  space: ResolvedSpace
  systemPrompt: string
}

function injectContext(
  intent: ClassifiedIntent,
  domain: DomainMapping,
  space: ResolvedSpace
): InjectedContext {
  const basePrompt = `You are the Life OS Conductor for ${space.space_name}.`
  
  const contextPrompt = `No specific context configured for this area.`
  
  const systemPrompt = `${basePrompt}\n\n${contextPrompt}\n\nProcess the ${intent.type} intent with the following extracted data: ${JSON.stringify(intent.extracted)}.`
  
  return {
    intent,
    domain,
    space,
    systemPrompt
  }
}

// ===== STAGE 5: Structured Execution Plan Generation =====
interface ExecutionPlan {
  task_name: string
  task_description: string
  subtasks: Array<{
    name: string
    description: string
    due_relative?: string
  }>
  priority: 'high' | 'medium' | 'low'
  assignee_id: string
  space_id: string
  list_id: string
  metadata: Record<string, any>
}

function generateExecutionPlan(context: InjectedContext): ExecutionPlan {
  const { intent, space } = context
  
  switch (intent.type) {
    case 'lead':
      return generateLeadPlan(intent, space)
    case 'workout':
      return generateWorkoutPlan(intent, space)
    case 'meeting':
      return generateMeetingPlan(intent, space)
    case 'event':
      return generateEventPlan(intent, space)
    case 'finance':
      return generateFinancePlan(intent, space)
    case 'health':
      return generateHealthPlan(intent, space)
    default:
      return generateTaskPlan(intent, space)
  }
}

function generateLeadPlan(intent: ClassifiedIntent, space: ResolvedSpace): ExecutionPlan {
  const company = intent.extracted.primary_entity || 'Unknown Company'
  const contacts = intent.extracted.secondary_entities || []
  
  return {
    task_name: `${company} - Lead`,
    task_description: `Lead for ${company}${contacts.length > 0 ? `. Contacts: ${contacts.join(', ')}` : ''}`,
    subtasks: [
      {
        name: 'Initial Contact',
        description: `Reach out to ${contacts[0] || 'primary contact'}`,
        due_relative: 'today'
      },
      {
        name: 'Follow-up Meeting',
        description: `Schedule meeting with ${company}`,
        due_relative: intent.extracted.temporal || 'tomorrow'
      }
    ],
    priority: intent.extracted.urgency || 'medium',
    assignee_id: '114094508', // Your user ID
    space_id: space.space_id,
    list_id: space.list_id,
    metadata: {
      intent_type: 'lead',
      company,
      contacts,
      extracted: intent.extracted
    }
  }
}

function generateWorkoutPlan(intent: ClassifiedIntent, space: ResolvedSpace): ExecutionPlan {
  const workoutType = intent.extracted.primary_entity || 'Workout'
  
  return {
    task_name: `${workoutType} Workout`,
    task_description: `Workout session: ${workoutType}`,
    subtasks: parseWorkoutSubtasks(intent.extracted.primary_entity),
    priority: 'medium',
    assignee_id: '114094508',
    space_id: space.space_id,
    list_id: space.list_id,
    metadata: {
      intent_type: 'workout',
      workout_type: workoutType,
      extracted: intent.extracted
    }
  }
}

function generateMeetingPlan(intent: ClassifiedIntent, space: ResolvedSpace): ExecutionPlan {
  const subject = intent.extracted.primary_entity || 'Meeting'
  
  return {
    task_name: `${subject} - Meeting`,
    task_description: `Meeting: ${subject}`,
    subtasks: [
      {
        name: 'Preparation',
        description: `Prepare for ${subject} meeting`,
        due_relative: 'today'
      },
      {
        name: 'Meeting',
        description: `Attend ${subject} meeting`,
        due_relative: intent.extracted.temporal || 'tomorrow'
      }
    ],
    priority: intent.extracted.urgency || 'medium',
    assignee_id: '114094508',
    space_id: space.space_id,
    list_id: space.list_id,
    metadata: {
      intent_type: 'meeting',
      subject,
      extracted: intent.extracted
    }
  }
}

function generateEventPlan(intent: ClassifiedIntent, space: ResolvedSpace): ExecutionPlan {
  const eventName = intent.extracted.primary_entity || 'Event'
  
  return {
    task_name: eventName,
    task_description: `Event: ${eventName}`,
    subtasks: [],
    priority: 'medium',
    assignee_id: '114094508',
    space_id: space.space_id,
    list_id: space.list_id,
    metadata: {
      intent_type: 'event',
      event_name: eventName,
      extracted: intent.extracted
    }
  }
}

function generateFinancePlan(intent: ClassifiedIntent, space: ResolvedSpace): ExecutionPlan {
  const category = intent.extracted.primary_entity || 'Expense'
  
  return {
    task_name: `${category} - Expense`,
    task_description: `Track expense: ${category}`,
    subtasks: [],
    priority: 'low',
    assignee_id: '114094508',
    space_id: space.space_id,
    list_id: space.list_id,
    metadata: {
      intent_type: 'finance',
      category,
      extracted: intent.extracted
    }
  }
}

function generateHealthPlan(intent: ClassifiedIntent, space: ResolvedSpace): ExecutionPlan {
  const topic = intent.extracted.primary_entity || 'Health Task'
  
  return {
    task_name: topic,
    task_description: `Health: ${topic}`,
    subtasks: [],
    priority: intent.extracted.urgency || 'medium',
    assignee_id: '114094508',
    space_id: space.space_id,
    list_id: space.list_id,
    metadata: {
      intent_type: 'health',
      topic,
      extracted: intent.extracted
    }
  }
}

function generateTaskPlan(intent: ClassifiedIntent, space: ResolvedSpace): ExecutionPlan {
  const subject = intent.extracted.primary_entity || 'Task'
  
  return {
    task_name: subject,
    task_description: `Task: ${subject}`,
    subtasks: [],
    priority: intent.extracted.urgency || 'medium',
    assignee_id: '114094508',
    space_id: space.space_id,
    list_id: space.list_id,
    metadata: {
      intent_type: 'task',
      subject,
      extracted: intent.extracted
    }
  }
}

// ===== STAGE 6: Proposal Rendering From Structured Plan =====
interface RenderedProposal {
  action_card: {
    id: string
    type: 'create' | 'update' | 'clarification'
    description: string
    fields: Array<{
      name: string
      label: string
      type: 'text' | 'select'
      placeholder?: string
      options?: string[]
    }>
    metadata: Record<string, any>
  }
}

function renderProposal(plan: ExecutionPlan): RenderedProposal {
  const fields = generateProposalFields(plan)
  
  return {
    action_card: {
      id: `proposal-${Date.now()}`,
      type: 'create',
      description: generateProposalDescription(plan),
      fields,
      metadata: {
        execution_plan: plan,
        intent_type: plan.metadata.intent_type
      }
    }
  }
}

function generateProposalDescription(plan: ExecutionPlan): string {
  switch (plan.metadata.intent_type) {
    case 'lead':
      return `Create new lead for ${plan.metadata.company} with ${plan.subtasks.length} follow-up actions.`
    case 'workout':
      return `Create workout session with ${plan.subtasks.length} exercises.`
    case 'meeting':
      return `Schedule meeting with preparation and follow-up tasks.`
    default:
      return `Create task: ${plan.task_name}`
  }
}

function generateProposalFields(plan: ExecutionPlan) {
  switch (plan.metadata.intent_type) {
    case 'lead':
      return [
        {
          name: 'company_name',
          label: 'Company Name',
          type: 'text' as const,
          placeholder: plan.metadata.company
        },
        {
          name: 'priority',
          label: 'Priority',
          type: 'select' as const,
          options: [
            `high|High Priority`,
            `medium|Medium Priority`,
            `low|Low Priority`
          ]
        }
      ]
    case 'workout':
      return [
        {
          name: 'workout_type',
          label: 'Workout Type',
          type: 'text' as const,
          placeholder: plan.metadata.workout_type
        }
      ]
    default:
      return [
        {
          name: 'task_name',
          label: 'Task Name',
          type: 'text' as const,
          placeholder: plan.task_name
        }
      ]
  }
}

// ===== MAIN PIPELINE =====
async function runDeterministicPipeline(
  message: string,
  userId: string,
  supabase: any,
  groqApiKey: string
): Promise<RenderedProposal | null> {
  try {
    // Stage 1: Intent Classification (LLM-Based)
    const intent = await classifyIntent(message, groqApiKey)
    
    // Stage 2: Domain Mapping (General Domain Enum)
    const domain = mapIntentToDomain(intent)
    
    // Stage 3: Space Resolution Within Domain (Explicit Selection)
    const space = await resolveSpace(domain, intent, userId, supabase)
    if (!space) {
      throw new Error(`Failed to resolve space for domain: ${domain.domain}`)
    }
    
    // Stage 4: Context Injection From Resolved Space
    const context = injectContext(intent, domain, space)
    
    // Stage 5: Execution Plan Generation
    const plan = generateExecutionPlan(context)
    
    // Stage 6: Proposal Rendering From Structured Plan
    const proposal = renderProposal(plan)
    
    return proposal
  } catch (error) {
    console.error('Pipeline failed:', error)
    return null
  }
}

// ===== Helper Functions =====
function extractBusinessName(message: string): string {
  const patterns = [
    /(?:company|business|restaurant)\s+["']?([^"']+)["']?/i,
    /(?:at|@)\s+["']?([^"']+)["']?/i,
    /\b([A-Z][a-z]+\s+(?:Restaurant|Corp|Inc|LLC|Co))\b/i
  ]
  
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }
  
  return 'Unknown Business'
}

function extractPersonNames(message: string): string[] {
  const names: string[] = []
  const patterns = [
    /(?:Mr|Mrs|Ms|Dr)\.?\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/gi,
    /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\s+(?:is|was|will be|from|at)/gi
  ]
  
  for (const pattern of patterns) {
    const matches = message.match(pattern)
    if (matches) {
      matches.forEach(match => {
        const name = match.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)/)?.[1]
        if (name) names.push(name)
      })
    }
  }
  
  return [...new Set(names)]
}

function extractUrgency(message: string): 'high' | 'medium' | 'low' {
  const normalized = message.toLowerCase()
  
  if (/(?:urgent|asap|immediately|today|right\s+now|emergency)/.test(normalized)) {
    return 'high'
  }
  
  if (/(?:tomorrow|this\s+week|soon|quickly)/.test(normalized)) {
    return 'medium'
  }
  
  return 'low'
}

function extractTimeReference(message: string): string {
  const patterns = [
    /(?:today|tonight)/i,
    /(?:tomorrow|tom)/i,
    /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /(?:next\s+week|next\s+month)/i,
    /(?:in\s+\d+\s+(?:days?|weeks?|months?))/i
  ]
  
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match) {
      return match[0].toLowerCase()
    }
  }
  
  return 'no_time_specified'
}

function extractWorkoutType(message: string): string {
  const patterns = [
    /(?:workout|training|exercise)\s*(?:with|including)?\s*:?\s*([^.]+)/i,
    /(?:squats|deadlift|bench\s*press|sprints?|lunges?)/i
  ]
  
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }
  
  return 'Workout'
}

function extractMeetingSubject(message: string): string {
  const patterns = [
    /(?:meeting|call|appointment)\s*(?:with|about|regarding)?\s*:?\s*([^.]+)/i,
    /(?:discuss|review|cover)\s*:?\s*([^.]+)/i
  ]
  
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }
  
  return 'Meeting'
}

function extractEventName(message: string): string {
  const patterns = [
    /(?:event|conference|workshop)\s*:?\s*([^.]+)/i,
    /(?:attend|join)\s+(?:the\s+)?([A-Z][a-z]+\s+(?:Conference|Workshop|Event))/i
  ]
  
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }
  
  return 'Event'
}

function extractExpenseCategory(message: string): string {
  const patterns = [
    /(?:expense|cost|fee)\s*:?\s*([^.]+)/i,
    /(?:spent|paid)\s+\$?\d+\s+(?:on|for)\s+([^.]+)/i
  ]
  
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }
  
  return 'Expense'
}

function extractHealthTopic(message: string): string {
  const patterns = [
    /(?:doctor|appointment|check.?up)\s*(?:for|with)?\s*:?\s*([^.]+)/i,
    /(?:medication|medicine)\s*:?\s*([^.]+)/i
  ]
  
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }
  
  return 'Health Task'
}

function extractTaskSubject(message: string): string {
  const patterns = [
    /(?:task|todo|need\s+to)\s*:?\s*([^.]+)/i,
    /(?:complete|finish|do)\s+([^.]+)/i
  ]
  
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }
  
  return 'Task'
}

function parseWorkoutSubtasks(workoutType: string): Array<{name: string, description: string, due_relative?: string}> {
  const subtasks: Array<{name: string, description: string, due_relative?: string}> = []
  
  // Extract exercises from workout description
  const exercises = workoutType.split(/[,;]\s*(?:and|&|plus)\s*/i).map(ex => ex.trim()).filter(Boolean)
  
  if (exercises.length > 1) {
    return exercises.map((exercise, index) => ({
      name: `${exercise} ${index + 1}`,
      description: `Exercise ${index + 1}: ${exercise}`,
      due_relative: 'today'
    }))
  }
  
  return subtasks
}

function scoreTokenOverlap(sourceTokens: string[], candidateTokens: string[]) {
  if (!sourceTokens.length || !candidateTokens.length) return 0
  const candidateSet = new Set(candidateTokens)
  let score = 0
  for (const token of sourceTokens) {
    if (candidateSet.has(token)) score += 1
  }
  return score
}

async function buildStructureRoutingContext({
  message,
  userId,
  workspaceId,
  spaces,
  lists,
  supabase
}: {
  message: string
  userId: string
  workspaceId: string | null
  spaces: any[]
  lists: any[]
  supabase: any
}) {
  const messageTokens = tokenizeForRouting(message)
  const scoredSpaces = (spaces || []).map((space: any) => {
    const name = space?.name || ''
    const score = scoreSemanticOverlap(messageTokens, name)
    return { ...space, _score: score }
  })
  const selectedSpace = scoredSpaces.sort((a: any, b: any) => b._score - a._score)[0] || null
  const selectedSpaceId = selectedSpace?.clickup_space_id || spaces?.[0]?.clickup_space_id || null
  const selectedSpaceName = selectedSpace?.name || spaces?.[0]?.name || 'General'
  const scopedLists = (lists || []).filter((list: any) => {
    const listSpaceId = list?.space_id || list?.metadata?.space_id
    return selectedSpaceId ? String(listSpaceId) === String(selectedSpaceId) : true
  })

  // Fetch life area configuration for instructional context
  let lifeAreaConfig = { context: null, goals: [], instructions: null }
  // Remove life areas references - use deterministic routing
  if (selectedSpaceId) {
    try {
      // Skip life areas - use direct space resolution
      const space = await resolveSpace(domainMapping, intent.domain, selectedSpaceId, userId, supabase)
      const lists = await getListsForSpace(space.clickup_space_id, userId, supabase)
      
      if (!lists || lists.length === 0) {
        throw new Error(`No lists found in space: ${space.name}`)
      }
      
      // Select appropriate list based on space type
      const selectedList = selectBestListBySpaceType(lists, space.space_type)
      
      if (!selectedList) {
        throw new Error(`No suitable list found in space: ${space.name}`)
      }
      
      return {
        space_id: space.clickup_space_id,
        space_name: space.name,
        list_id: selectedList.clickup_list_id,
        list_name: selectedList.name,
        resolution_strategy: 'deterministic_space_routing'
      }
    } catch (error) {
      throw new Error(`Failed to build resolved space: ${error.message}`)
    }
  }
  return {
    id: null,
    name: selectedSpaceName,
    context: lifeAreaConfig.context,
    goals: lifeAreaConfig.goals,
    instructions: lifeAreaConfig.instructions,
    metadata: {},
    user_id: userId,
    workspace_id: workspaceId,
    clickup_space_id: selectedSpaceId,
    default_space_id: selectedSpaceId,
    clickup_lists: scopedLists.length ? scopedLists : lists || []
  }
}

// Task Intelligence Engine - Core Decision Loop
async function runTaskIntelligence(
  userInput: string, 
  routingConfig: any, 
  relevantTasks: any[], 
  groqApiKey: string
) {
  // Build context-aware system prompt
  const contextPrompt = routingConfig ? `
Routing Context:
- Selected Space: ${routingConfig.name}
- Context: ${routingConfig.context || 'Not specified'}
- Goals: ${Array.isArray(routingConfig.goals) ? routingConfig.goals.join(', ') : 'Not specified'}
- Instructions: ${routingConfig.instructions || 'Not specified'}
- ClickUp Space: ${routingConfig.default_space_id || 'Not configured'}
- Default Lists: ${routingConfig.default_list_ids ? routingConfig.default_list_ids.join(', ') : 'Not configured'}

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

  try {
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
      const text = await response.text().catch(() => '')
      console.error('Task intelligence request failed', response.status, text)
      return {
        decision: 'clarify',
        explanation: 'Decision model temporarily unavailable',
        actions: [],
        user_confirmation_needed: false,
        confirmation_prompt: "I hit a temporary planning issue. Can you restate this in one short sentence so I can stage the action card?"
      }
    }

    const data = await response.json()
    const decisionText = data.choices?.[0]?.message?.content
    if (!decisionText) {
      return {
        decision: 'clarify',
        explanation: 'No decision payload returned by model',
        actions: [],
        user_confirmation_needed: false,
        confirmation_prompt: "I couldn't parse the planning response. Please resend the request and I'll stage it."
      }
    }

    return JSON.parse(decisionText)
  } catch (e) {
    console.error('Task intelligence parsing failed', e)
    // Fallback if request or JSON parsing fails
    return {
      decision: 'clarify',
      explanation: 'Unable to parse decision payload',
      actions: [],
      user_confirmation_needed: false,
      confirmation_prompt: "I couldn't parse that reliably. Give me a concise action request and I'll stage a clean approval card."
    }
  }
}

function normalizeStructuredExtraction(payload: any): StructuredExtraction {
  const allowedEntityTypes = new Set(['lead', 'event', 'task', 'workout', 'meal', 'unknown'])
  const normalizedEntity = String(payload?.entity_type || 'unknown').toLowerCase()
  const entity_type = allowedEntityTypes.has(normalizedEntity)
    ? (normalizedEntity as StructuredExtraction['entity_type'])
    : 'unknown'

  const intentActions = Array.isArray(payload?.intent_actions)
    ? payload.intent_actions
        .map((action: any) => String(action || '').toLowerCase().trim())
        .filter((action: string) => action.length > 0)
    : []

  const context = payload?.context && typeof payload.context === 'object'
    ? payload.context
    : {}

  return {
    entity_type,
    intent_actions: intentActions,
    primary_title: typeof payload?.primary_title === 'string' ? payload.primary_title.trim() || null : null,
    target_space_hint:
      typeof payload?.target_space_hint === 'string' ? payload.target_space_hint.trim() || null : null,
    target_list_hint:
      typeof payload?.target_list_hint === 'string' ? payload.target_list_hint.trim() || null : null,
    context: {
      contact_name:
        typeof context.contact_name === 'string' ? context.contact_name.trim() || null : null,
      company:
        typeof context.company === 'string' ? context.company.trim() || null : null,
      pain_point:
        typeof context.pain_point === 'string' ? context.pain_point.trim() || null : null,
      timing_trigger:
        typeof context.timing_trigger === 'string' ? context.timing_trigger.trim() || null : null,
      strategic_angle:
        typeof context.strategic_angle === 'string' ? context.strategic_angle.trim() || null : null,
      follow_up_date:
        typeof context.follow_up_date === 'string' ? context.follow_up_date.trim() || null : null
    }
  }
}

function parseJsonFromText(rawText: string) {
  const direct = rawText.trim()
  try {
    return JSON.parse(direct)
  } catch {
    // Continue to fenced/embedded extraction.
  }

  const fencedMatch = direct.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim())
    } catch {
      // Continue to fallback extraction.
    }
  }

  const firstBrace = direct.indexOf('{')
  const lastBrace = direct.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(direct.slice(firstBrace, lastBrace + 1))
    } catch {
      return null
    }
  }
  return null
}

async function extractStructuredIntent(message: string, groqApiKey: string): Promise<StructuredExtraction> {
  const prompt = `Extract a strict JSON object from this user message.

Message:
"""${message}"""

Rules:
- Be semantic-first. Do not rely on literal trigger words.
- If the message references a person/company, interest, opportunity, prospect, or follow-up, classify entity_type as "lead".
- If the message is lead-related and also mentions a meeting, keep entity_type as "lead" and include "follow_up" in intent_actions (not event unless explicitly a calendar-only request).
- Use target_list_hint with likely destination intent (e.g. "pipeline", "calendar", "workout tracker").

Return JSON only with this schema:
{
  "entity_type": "lead|event|task|workout|meal|unknown",
  "intent_actions": ["create|update|query|schedule|follow_up|link|note"],
  "primary_title": "short title candidate or null",
  "target_space_hint": "space hint or null",
  "target_list_hint": "list hint or null",
  "context": {
    "contact_name": "string|null",
    "company": "string|null",
    "pain_point": "string|null",
    "timing_trigger": "string|null",
    "strategic_angle": "string|null",
    "follow_up_date": "ISO date string|null"
  }
}`

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content:
              'You are an information extraction engine. Output valid JSON only. Do not add prose.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0,
        max_tokens: 450
      })
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      console.error('structured-intent extraction failed', response.status, errorText)
      return EMPTY_STRUCTURED_EXTRACTION
    }

    const data = await response.json()
    const text = data?.choices?.[0]?.message?.content
    if (!text || typeof text !== 'string') {
      return EMPTY_STRUCTURED_EXTRACTION
    }

    const parsed = parseJsonFromText(text)
    if (!parsed) {
      console.error('structured-intent JSON parse failed', text)
      return EMPTY_STRUCTURED_EXTRACTION
    }
    return normalizeStructuredExtraction(parsed)
  } catch (error) {
    console.error('structured-intent extraction crashed', error)
    return EMPTY_STRUCTURED_EXTRACTION
  }
}

// Generate user-facing response based on decision
function generateResponse(
  decisionResult: any,
  routingConfig: any,
  actionNeeded: any,
  userMessage: string,
  executionSummary?: string,
  backgroundSyncError?: string | null,
  priorityHint?: string | null
) {
  if (executionSummary) {
    return {
      content: `Done. ${executionSummary}`,
      metaResponse: executionSummary
    }
  }

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
      content = decisionResult.explanation
        ? `I parsed this as orientation: ${decisionResult.explanation}.`
        : `I parsed this as orientation for ${getActionIntent(userMessage)}.`
      metaResponse = "Providing orientation and current state"
      break
    case 'clarify':
      content = decisionResult.confirmation_prompt || "I need a bit more information to help you best."
      metaResponse = "Requesting clarification for better assistance"
      break
    default:
      content = "I couldn't confidently map your request to a create/update/query path. Please specify whether this should create a new task or update an existing one."
      metaResponse = "Fallback: decision class unresolved"
  }

  if (actionNeeded) {
    content += " I'll need some additional information to proceed."
  }

  if (priorityHint && ['create', 'update', 'hybrid'].includes(decisionResult.decision)) {
    content += ` Priority: ${priorityHint}.`
  }

  if (backgroundSyncError) {
    content += ` (System note: background ClickUp sync error: ${backgroundSyncError})`
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

function normalizeDecision(rawDecision: unknown, message: string) {
  const value = String(rawDecision || '').toLowerCase().trim()
  if (['create', 'update', 'hybrid', 'query', 'orient', 'clarify', 'delete'].includes(value)) {
    return value
  }

  if (value.includes('create') || value.includes('new')) return 'create'
  if (value.includes('update') || value.includes('modify') || value.includes('edit')) return 'update'
  if (value.includes('hybrid') || value.includes('both')) return 'hybrid'
  if (value.includes('query') || value.includes('read') || value.includes('fetch')) return 'query'
  if (value.includes('orient') || value.includes('overview') || value.includes('status')) return 'orient'
  if (value.includes('clarify') || value.includes('question')) return 'clarify'
  if (value.includes('delete') || value.includes('remove')) return 'delete'

  // Fallback stays conservative; structured extraction handles semantic coercion.
  return 'clarify'
}

function coerceDecisionFromStructuredIntent(
  currentDecision: string,
  structuredIntent: StructuredExtraction | null
) {
  if (!structuredIntent) return currentDecision
  const current = normalizeDecision(currentDecision, '')
  const actions = new Set((structuredIntent.intent_actions || []).map((action) => action.toLowerCase()))

  if (actions.has('update') && !actions.has('create')) {
    return 'update'
  }

  if (actions.has('create') || actions.has('schedule') || actions.has('follow_up') || actions.has('note')) {
    return current === 'delete' ? current : 'create'
  }

  if (actions.has('query')) {
    return 'query'
  }

  if (current === 'orient' || current === 'clarify') {
    if (structuredIntent.entity_type === 'lead' || structuredIntent.entity_type === 'event') {
      return 'create'
    }
  }

  return current
}

function extractPreferredListNameFromMessage(message: string) {
  const match = message.match(/(?:list\s+(?:called|named|titled)\s+['"]?([^'"]+)['"]?)/i)
  if (match && match[1]) {
    return match[1].trim()
  }

  const slashMatch = message.match(/'(.*?)\/(.*?)'/)
  if (slashMatch && slashMatch[0]) {
    return slashMatch[0].replace(/'/g, '')
  }

  const bracketMatch = message.match(/list\s+(?:called|named|titled)?\s*\b([\w\s\-\/]+)\b/i)
  if (bracketMatch && bracketMatch[1]) {
    const candidate = bracketMatch[1].trim()
    if (candidate.length > 0 && !candidate.toLowerCase().includes('list')) {
      return candidate
    }
  }

  return null
}

function getEntityRoutingTokens(structuredIntent?: StructuredExtraction | null) {
  const entity = String(structuredIntent?.entity_type || 'unknown').toLowerCase()
  switch (entity) {
    case 'lead':
      return ['lead', 'pipeline', 'crm', 'prospect', 'opportunity', 'follow', 'client']
    case 'event':
      return ['event', 'calendar', 'schedule', 'meeting', 'appointment', 'time']
    case 'workout':
      return ['workout', 'training', 'fitness', 'exercise']
    case 'meal':
      return ['meal', 'nutrition', 'food', 'macro']
    default:
      return ['task', 'action', 'todo']
  }
}

function resolveClickUpList(
  message: string,
  routingConfig: any,
  preferredListName?: string,
  structuredIntent?: StructuredExtraction | null
): ListRoutingResolution {
  if (!routingConfig?.clickup_lists?.length) {
    return { selected: null, candidates: [], ambiguous: false }
  }

  const messageTokens = tokenizeForRouting(message)
  const normalizedPreferred = preferredListName?.toLowerCase().trim() || ''
  const lists = routingConfig.clickup_lists
  const listHint = structuredIntent?.target_list_hint?.toLowerCase().trim() || ''
  const hintTokens = tokenizeForRouting(
    `${structuredIntent?.target_list_hint || ''} ${structuredIntent?.target_space_hint || ''}`.trim()
  )
  const intentTokens = getEntityRoutingTokens(structuredIntent)

  if (normalizedPreferred) {
    const preferredMatch = lists.find((list: any) => {
      const listName = ((list.title || list.name || '') as string).toLowerCase()
      return listName.includes(normalizedPreferred)
    })
    if (preferredMatch) {
      return { selected: preferredMatch, candidates: [{ list: preferredMatch, score: 999 }], ambiguous: false }
    }
  }
  if (listHint) {
    const hintedMatch = lists.find((list: any) => {
      const listName = ((list.title || list.name || list.reference_name || '') as string).toLowerCase()
      return listName.includes(listHint)
    })
    if (hintedMatch) {
      return { selected: hintedMatch, candidates: [{ list: hintedMatch, score: 998 }], ambiguous: false }
    }
  }

  const scored = lists
    .filter((list: any) => Boolean(list?.clickup_list_id))
    .map((list: any) => {
      const listText = [
        list.title || '',
        list.name || '',
        list.reference_name || '',
        list.context || '',
        list.instructions || '',
        list.metadata?.source_name || ''
      ]
        .join(' ')
        .trim()
      const listTokens = tokenizeForRouting(listText)
      const messageScore = scoreTokenOverlap(messageTokens, listTokens)
      const intentScore = scoreTokenOverlap(intentTokens, listTokens)
      const hintScore = scoreTokenOverlap(hintTokens, listTokens)
      const score = messageScore + intentScore * 1.7 + hintScore * 2.5
      return { list, score }
    })
    .sort((a: any, b: any) => b.score - a.score)

  const top = scored[0] || null
  const second = scored[1] || null
  const ambiguous =
    Boolean(top && second) &&
    top.score > 0 &&
    Math.abs(top.score - second.score) < 0.85

  return {
    selected: top?.list || null,
    candidates: scored,
    ambiguous
  }
}

function inferListNameFromMessage(message: string, routingConfig: any) {
  const spaceName = (routingConfig?.name || 'General').replace(/[^a-zA-Z0-9 ]+/g, ' ').trim()
  const actionFragment = message.split(/[\n.]/)[0]?.trim() || 'Tasks'
  const sanitizedAction = actionFragment
    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
    .split(' ')
    .filter((token) => token.length > 2)
    .slice(0, 4)
    .join(' ')

  const base = spaceName || 'General'
  const suffix = sanitizedAction ? ` · ${sanitizedAction}` : ' · Actions'
  const candidate = `${base}${suffix}`.trim()
  return candidate.length > 60 ? candidate.slice(0, 60).trim() : candidate
}

async function resolveOrCreateTargetList(
  message: string,
  routingConfig: any,
  supabase: any,
  clickupApiKey?: string | null,
  preferredListName?: string,
  structuredIntent?: StructuredExtraction | null
) {
  if (!routingConfig) return { targetList: null, routing: { selected: null, candidates: [], ambiguous: false } }
  const routing = resolveClickUpList(message, routingConfig, preferredListName, structuredIntent)
  if (routing.selected) return { targetList: routing.selected, routing }
  const targetSpaceId = routingConfig.clickup_space_id || routingConfig.default_space_id
  if (!clickupApiKey || !targetSpaceId) {
    return { targetList: null, routing }
  }

  const listNameCandidate = (preferredListName || inferListNameFromMessage(message, routingConfig)).trim()
  if (!listNameCandidate) return { targetList: null, routing }

  try {
    const response = await fetch(`${CLICKUP_API_BASE}/space/${targetSpaceId}/list`, {
      method: 'POST',
      headers: {
        Authorization: clickupApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: listNameCandidate,
        content: `Auto-generated list for ${routingConfig.name || 'this space'}`,
        status: 'open',
        notify_all: false
      })
    })

    if (!response.ok) {
      console.error('ClickUp list creation failed', response.status)
      return { targetList: null, routing }
    }

    const createdList = await response.json()
    const storedRecord = {
      clickup_list_id: String(createdList.id),
      list_id: String(createdList.id),
      reference_name: `${targetSpaceId}:${createdList.name || listNameCandidate}`,
      space_id: targetSpaceId,
      title: createdList.name || listNameCandidate,
      context: createdList.content || null,
      instructions: routingConfig.instructions || null,
      metadata: {
        auto_created: true,
        generated_from: message,
        preferred_list_name: preferredListName || null,
        space_id: targetSpaceId,
        source_name: createdList.name || listNameCandidate,
        synced_at: new Date().toISOString()
      },
      user_id: routingConfig.user_id
    }

    await supabase.from('clickup_lists').insert(storedRecord)

    const enriched = {
      ...storedRecord,
      name: createdList.name,
      id: createdList.id
    }

    if (Array.isArray(routingConfig.clickup_lists)) {
      routingConfig.clickup_lists.push(enriched)
    } else {
      routingConfig.clickup_lists = [enriched]
    }

    return {
      targetList: enriched,
      routing: {
        selected: enriched,
        candidates: [{ list: enriched, score: 1 }],
        ambiguous: false
      }
    }
  } catch (error) {
    console.error('Could not create ClickUp list', error)
    return { targetList: null, routing }
  }
}

// Check for existing content in ClickUp to avoid duplicates
async function checkExistingContent({
  message,
  targetList,
  clickupApiKey,
  extracted
}: {
  message: string
  targetList: any
  clickupApiKey: string
  extracted: ExtractedEntities
}) {
  if (!targetList?.clickup_list_id) return { exists: [], shouldUpdate: false }

  try {
    // Fetch existing tasks in the target list
    const response = await fetch(`${CLICKUP_API_BASE}/list/${targetList.clickup_list_id}/task`, {
      headers: {
        Authorization: clickupApiKey,
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      console.error('Failed to fetch existing tasks for duplicate check')
      return { exists: [], shouldUpdate: false }
    }
    
    const data = await response.json()
    const existingTasks = data?.tasks || []
    
    // Enhanced company/person name extraction with variations
    const companyVariations = extractCompanyVariations(message)
    const personVariations = extractPersonVariations(message)
    
    const duplicates = []
    
    // Check for company duplicates with fuzzy matching
    for (const company of companyVariations) {
      const companyTasks = existingTasks.filter((task: any) => {
        const taskName = (task.name || '').toLowerCase()
        const taskDesc = (task.description || '').toLowerCase()
        
        // Check multiple variations of the company name
        return company.variations.some((variation: string) => 
          taskName.includes(variation) || taskDesc.includes(variation)
        )
      })
      
      if (companyTasks.length > 0) {
        duplicates.push({
          type: 'company',
          name: company.primary,
          variations: company.variations,
          existingTasks: companyTasks.map((task: any) => ({
            id: task.id,
            name: task.name,
            status: task.status?.status
          }))
        })
      }
    }
    
    // Check for person duplicates with fuzzy matching
    for (const person of personVariations) {
      const personTasks = existingTasks.filter((task: any) => {
        const taskName = (task.name || '').toLowerCase()
        const taskDesc = (task.description || '').toLowerCase()
        
        // Check multiple variations of the person name
        return person.variations.some((variation: string) => 
          taskName.includes(variation) || taskDesc.includes(variation)
        )
      })
      
      if (personTasks.length > 0) {
        duplicates.push({
          type: 'person',
          name: person.primary,
          variations: person.variations,
          existingTasks: personTasks.map((task: any) => ({
            id: task.id,
            name: task.name,
            status: task.status?.status
          }))
        })
      }
    }
    
    return { exists: duplicates, shouldUpdate: duplicates.length > 0 }
  } catch (error) {
    console.error('Error checking existing content:', error)
    return { exists: [], shouldUpdate: false }
  }
}

// Extract company name variations (Acme Co., Acme Corporation, etc.)
function extractCompanyVariations(message: string) {
  const companies = []
  
  // Direct company patterns
  const companyPatterns = [
    /(?:company|business|organization|corp|corporation|inc|llc|llp|ltd|co|pc)\s+["']?([^"']+)["']?/gi,
    /(?:work\s+at|employed\s+by)\s+["']?([^"']+)["']?/gi,
    /(?:client|customer|account)\s*[:]\s*["']?([^"']+)["']?/gi
  ]
  
  for (const pattern of companyPatterns) {
    const match = message.match(pattern)
    if (match && match[1]) {
      const baseName = match[1].trim()
      const variations = generateCompanyVariations(baseName)
      companies.push({ primary: baseName, variations })
    }
  }
  
  return companies
}

// Extract person name variations with titles and initials
function extractPersonVariations(message: string) {
  const people = []
  
  // Person patterns with titles and roles
  const personPatterns = [
    /(?:Mr|Mrs|Ms|Dr|Prof)\.?\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/gi,
    /(?:contact|person|individual|user|customer|client)\s*[:]\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/gi,
    /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\s+(?:is|was|will be|from|at)/gi
  ]
  
  for (const pattern of personPatterns) {
    const match = message.match(pattern)
    if (match && match[1]) {
      const baseName = match[1].trim()
      const variations = generatePersonVariations(baseName)
      people.push({ primary: baseName, variations })
    }
  }
  
  return people
}

// Generate company name variations
function generateCompanyVariations(baseName: string) {
  const variations = [baseName.toLowerCase()]
  
  // Add common suffixes/prefixes
  const suffixes = ['inc', 'corp', 'llc', 'llp', 'ltd', 'co', 'pc']
  const prefixes = ['the ', 'new ', 'old ', 'global ']
  
  for (const suffix of suffixes) {
    if (!baseName.toLowerCase().includes(suffix)) {
      variations.push(baseName.toLowerCase() + ' ' + suffix)
      variations.push(baseName.toLowerCase() + ', ' + suffix)
    }
  }
  
  for (const prefix of prefixes) {
    if (baseName.toLowerCase().startsWith(prefix)) {
      variations.push(baseName.toLowerCase().substring(prefix.length))
    }
  }
  
  return [...new Set(variations)] // Remove duplicates
}

// Generate person name variations
function generatePersonVariations(baseName: string) {
  const variations = [baseName.toLowerCase()]
  
  // Add common variations
  const parts = baseName.split(' ')
  if (parts.length >= 2) {
    // Handle initials
    variations.push(parts.map(part => part[0]).join(''))
    variations.push(parts.map(part => part[0] + '.').join(' '))
    
    // Handle first name only
    variations.push(parts[0].toLowerCase())
    
    // Handle last name only
    variations.push(parts[parts.length - 1].toLowerCase())
  }
  
  return [...new Set(variations)] // Remove duplicates
}

// Enhanced task creation with subtask support
async function createTaskWithSubtasks({
  taskName,
  description,
  targetList,
  clickupApiKey,
  extracted,
  defaultAssigneeId
}: {
  taskName: string
  description: string
  targetList: any
  clickupApiKey: string
  extracted: ExtractedEntities
  defaultAssigneeId?: string | null
}) {
  if (!targetList?.clickup_list_id) {
    return { success: false, error: 'Missing target list ID' }
  }

  try {
    // Create main task first
    const mainTaskResponse = await fetch(`${CLICKUP_API_BASE}/list/${targetList.clickup_list_id}/task`, {
      method: 'POST',
      headers: {
        Authorization: clickupApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: taskName,
        description: description,
        status: 'to do',
        notify_all: false,
        assignees: defaultAssigneeId ? [defaultAssigneeId] : undefined,
        start_date: extracted?.dateRange?.start_date,
        due_date: extracted?.dateRange?.due_date
      })
    })

    if (!mainTaskResponse.ok) {
      const errorText = await mainTaskResponse.text()
      return { success: false, error: `Failed to create main task: ${errorText}` }
    }

    const mainTask = await mainTaskResponse.json()
    const createdSubtasks = []

    // Extract subtasks from message (workout exercises, meeting agenda items, etc.)
    const subtasks = parseSubtasksFromMessage(extracted?.primaryTitle || description)
    
    // Create subtasks if detected
    for (const subtask of subtasks) {
      try {
        const subtaskResponse = await fetch(`${CLICKUP_API_BASE}/task/${mainTask.id}/subtask`, {
          method: 'POST',
          headers: {
            Authorization: clickupApiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: subtask.name,
            description: subtask.description || '',
            status: 'to do',
            notify_all: false
          })
        })

        if (subtaskResponse.ok) {
          createdSubtasks.push(await subtaskResponse.json())
        }
      } catch (subtaskError) {
        console.error('Failed to create subtask:', subtaskError)
      }
    }

    return {
      success: true,
      mainTask,
      createdSubtasks,
      summary: `Created task "${mainTask.name}"${createdSubtasks.length > 0 ? ` with ${createdSubtasks.length} subtasks` : ''}`
    }
  } catch (error) {
    return { 
      success: false, 
      error: `Task creation failed: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

// Parse subtasks from message content with enhanced patterns
function parseSubtasksFromMessage(content: string) {
  const subtasks: any[] = []
  
  // Workout patterns - enhanced for complex descriptions
  const workoutPatterns = [
    /(?:workout|training|exercise|gym).*?(?:with|including)?\s*:?\s*([^.]+)/i,
    /(?:squats|deadlift|bench\s*press|sprints?|lunges?|pull.?ups?|rows?|cardio)\s*:?\s*([^.]+)/i
  ]
  
  for (const pattern of workoutPatterns) {
    const match = content.match(pattern)
    if (match && match[1]) {
      const exercises = match[1].split(/[,;]\s*(?:and|&|plus)\s*/i).map(ex => ex.trim()).filter(Boolean)
      return exercises.map((exercise, index) => ({
        name: `${exercise}${exercises.length > 1 ? ` ${index + 1}` : ''}`,
        description: `Exercise${exercises.length > 1 ? ` ${index + 1}` : ''}: ${exercise}`
      }))
    }
  }
  
  // Meeting patterns - enhanced for agendas and topics
  const meetingPatterns = [
    /(?:agenda|topics?|discuss|review|cover)\s*:?\s*([^.]+)/i,
    /(?:meeting|call|sync|stand.?up)\s*:?\s*(?:we\s+)?(?:will|should|need\s+to)?\s*(?:discuss|talk\s+about|review|cover)\s*:?\s*([^.]+)/i
  ]
  
  for (const pattern of meetingPatterns) {
    const match = content.match(pattern)
    if (match && match[1]) {
      const topics = match[1].split(/[,;]\s*(?:and|&|plus)\s*/i).map(topic => topic.trim()).filter(Boolean)
      return topics.map((topic, index) => ({
        name: `Topic ${index + 1}: ${topic}`,
        description: `Discussion topic: ${topic}`
      }))
    }
  }
  
  // Project/task breakdown patterns
  const projectPatterns = [
    /(?:break\s+down|steps?|phases?|stages?)\s*:?\s*([^.]+)/i,
    /(?:subtasks?|sub.?tasks?|items?|deliverables?)\s*:?\s*([^.]+)/i
  ]
  
  for (const pattern of projectPatterns) {
    const match = content.match(pattern)
    if (match && match[1]) {
      const items = match[1].split(/[,;]\s*(?:and|&|plus)\s*/i).map(item => item.trim()).filter(Boolean)
      return items.map((item, index) => ({
        name: `Step ${index + 1}: ${item}`,
        description: `Task item: ${item}`
      }))
    }
  }
  
  // Multi-part workout routines
  const routinePattern = content.match(/(?:routine|circuit|circuit)\s*:?\s*([^.]+)/i)
  if (routinePattern) {
    const exercises = routinePattern[1].split(/[,;]\s*(?:then|next|and)\s*/i).map(ex => ex.trim()).filter(Boolean)
    return exercises.map((exercise, index) => ({
      name: `${exercise}${exercises.length > 1 ? ` ${index + 1}` : ''}`,
      description: `Routine exercise${exercises.length > 1 ? ` ${index + 1}` : ''}: ${exercise}`
    }))
  }
  
  return subtasks
}

// Enhanced timezone-aware date parsing
function parseDatesFromMessage(message: string) {
  const dateRange: any = {
    start_date: null,
    due_date: null,
    has_time: false,
    pretty: null,
    repeat_weeks: null
  }
  
  const now = new Date()
  let targetDate = new Date(now) // Start with today
  
  // Parse specific dates first
  const datePatterns = [
    { pattern: /(?:today|tonight)/gi, getDate: () => new Date(now) },
    { pattern: /(?:tomorrow|tom)/gi, getDate: () => new Date(now.getTime() + 24 * 60 * 60 * 1000) },
    { pattern: /(?:monday|mon)/gi, getDate: () => getNextDayOfWeek(now, 1) },
    { pattern: /(?:tuesday|tue)/gi, getDate: () => getNextDayOfWeek(now, 2) },
    { pattern: /(?:wednesday|wed)/gi, getDate: () => getNextDayOfWeek(now, 3) },
    { pattern: /(?:thursday|thu)/gi, getDate: () => getNextDayOfWeek(now, 4) },
    { pattern: /(?:friday|fri)/gi, getDate: () => getNextDayOfWeek(now, 5) },
    { pattern: /(?:saturday|sat)/gi, getDate: () => getNextDayOfWeek(now, 6) },
    { pattern: /(?:sunday|sun)/gi, getDate: () => getNextDayOfWeek(now, 0) }
  ]
  
  for (const { pattern, getDate } of datePatterns) {
    if (pattern.test(message)) {
      targetDate = getDate()
      break
    }
  }
  
  // Parse time patterns
  const timePatterns = [
    /(?:at|@)\s*(\d{1,2}:\d{2})\s*(am|pm|a|p)/gi,
    /(\d{1,2}:\d{2})\s*(am|pm|a|p)/gi
  ]
  
  let hour24 = null
  let minute = null
  
  for (const pattern of timePatterns) {
    const match = message.match(pattern)
    if (match) {
      const time = match[1]
      const period = match[2].toLowerCase()
      const [hours, minutes] = time.split(':').map(Number)
      
      // Convert to 24-hour format
      hour24 = hours
      if (period.includes('pm') && hours < 12) {
        hour24 = hours + 12
      } else if (period.includes('am') && hours === 12) {
        hour24 = 0
      }
      minute = minutes
      dateRange.has_time = true
      break
    }
  }
  
  // Set the date and time
  if (hour24 !== null && minute !== null) {
    // Create date in local timezone
    targetDate.setHours(hour24, minute, 0, 0)
    
    // Convert to UTC timestamp for ClickUp (ClickUp uses UTC)
    const utcTimestamp = targetDate.getTime()
    
    // For a 1-hour meeting (common default)
    const endTime = new Date(targetDate.getTime() + 60 * 60 * 1000)
    
    dateRange.start_date = utcTimestamp
    dateRange.due_date = endTime.getTime()
    dateRange.pretty = formatLocalDateTime(targetDate)
  } else {
    // No time specified, just set the date
    targetDate.setHours(9, 0, 0, 0) // Default to 9 AM
    dateRange.start_date = targetDate.getTime()
    dateRange.due_date = targetDate.getTime() + 60 * 60 * 1000 // 1 hour default
    dateRange.pretty = targetDate.toLocaleDateString()
  }
  
  return dateRange
}

// Helper function to get next occurrence of a specific day
function getNextDayOfWeek(date: Date, dayOfWeek: number): Date {
  const currentDay = date.getDay()
  const daysUntilNext = (dayOfWeek - currentDay + 7) % 7
  const nextDate = new Date(date)
  nextDate.setDate(date.getDate() + (daysUntilNext === 0 ? 7 : daysUntilNext)) // If today, go to next week
  return nextDate
}

// Helper function to format date/time in local timezone
function formatLocalDateTime(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

async function executeWorkoutPlan({
  message,
  routingConfig,
  targetList,
  clickupApiKey,
  decision,
  extracted,
  listConfig,
  executionOverrides
}: {
  message: string
  routingConfig: any
  targetList: any
  clickupApiKey?: string | null
  decision: string
  extracted: ExtractedEntities
  listConfig: ListConfig
  executionOverrides?: InlineExecutionOverrides
}) {
  if (!targetList?.clickup_list_id || !clickupApiKey) {
    return { success: false, error: 'Missing ClickUp configuration.' }
  }

  const defaultAssigneeId =
    executionOverrides?.assigneeId?.trim() ||
    Deno.env.get('APP_CLICKUP_ASSIGNEE_ID')?.trim() ||
    Deno.env.get('LOCAL_CLICKUP_ASSIGNEE_ID')?.trim() ||
    null
  const listId = targetList.clickup_list_id
  const dateRange = extracted?.dateRange || parseDatesFromMessage(message)
  const builtDescription =
    executionOverrides?.description?.trim() ||
    buildTaskDescription(message, decision, routingConfig, extracted, listConfig)
  const lifts = parseWorkoutLifts(message)
  const shouldUpdate = ['update', 'hybrid'].includes(decision)
  const executionIntent = classifyExecutionIntent(extracted)
  const repeatConfig = buildClickUpRepeatConfig({ message, extracted, dateRange })
  const applyRecurrenceToSeries = Boolean(
    repeatConfig &&
      (extracted.taskType !== 'meal' || extracted.applyToFuture)
  )

    if (shouldUpdate) {
      const explicitTaskId = parseTaskIdFromMessage(message)
      let targetTask = null

      if (explicitTaskId) {
        targetTask = await fetchTask(explicitTaskId, clickupApiKey)
      }

      if (!targetTask) {
        const existingTasks = await fetchListTasks(listId, clickupApiKey)
        if (extracted.taskType === 'meal' && !extracted.applyToFuture) {
          targetTask = findTodaysMealTask(existingTasks, message) || findTaskToUpdate(existingTasks, message)
        } else {
          targetTask = findTaskToUpdate(existingTasks, message)
        }
      }

    if (targetTask) {
      const updateBasePayload: Record<string, any> = {
        description: builtDescription,
        name: createWorkoutTitle(message, routingConfig, targetList, extracted, listConfig)
      }
      const updatePayloadResult = buildExecutionPayloadByIntent({
        intent: executionIntent,
        basePayload: updateBasePayload,
        dateRange,
        extracted,
        listConfig,
        defaultAssigneeId,
        decision: 'update'
      })
      if (!updatePayloadResult.valid) {
        return {
          success: false,
          error: updatePayloadResult.error || 'Unable to build valid update payload.'
        }
      }
      const updatePayload = updatePayloadResult.payload


      const updateResponse = await fetch(`${CLICKUP_API_BASE}/task/${targetTask.id}`, {
        method: 'PUT',
        headers: {
          Authorization: clickupApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatePayload)
      })

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text()
        return {
          success: false,
          error: `ClickUp failed to update the workout task (${updateResponse.status}): ${errorText}`
        }
      }

      const updatedTask = await updateResponse.json()
      let recurrenceApplied = false
      if (applyRecurrenceToSeries) {
        recurrenceApplied = await applyClickUpRecurrence(updatedTask.id, repeatConfig, clickupApiKey)
      }
      const repeatMsg =
        dateRange.repeat_weeks && dateRange.repeat_weeks > 0
          ? `Repeats for ${dateRange.repeat_weeks} week${dateRange.repeat_weeks > 1 ? 's' : ''}.`
          : undefined
      const summaryParts = [
        `Updated ${updatedTask.name} in ${targetList.title || 'your list'}.`,
        dateRange.pretty ? `Rescheduled for ${dateRange.pretty}.` : 'Timeline preserved.'
      ]
      if (repeatMsg) {
        summaryParts.push(repeatMsg)
      }
      if (applyRecurrenceToSeries && !recurrenceApplied) {
        summaryParts.push('Recurrence could not be applied via API; intent remains in description.')
      }
      if (extracted.taskType === 'meal' && !extracted.applyToFuture) {
        summaryParts.push('Applied to today only; future recurring meals are unchanged.')
      }

      return {
        success: true,
        summary: summaryParts.join(' '),
        mainTask: updatedTask,
        updated: true
      }
    }
  }

  const finalTaskName = createWorkoutTitle(message, routingConfig, targetList, extracted, listConfig)
  const baseCreationPayload: Record<string, any> = {
    name: finalTaskName,
    description: builtDescription,
    status: 'to do',
    notify_all: false
  }
  const creationPayloadResult = buildExecutionPayloadByIntent({
    intent: executionIntent,
    basePayload: baseCreationPayload,
    dateRange,
    extracted,
    listConfig,
    defaultAssigneeId,
    decision: 'create'
  })
  if (!creationPayloadResult.valid) {
    return {
      success: false,
      error: creationPayloadResult.error || 'Unable to build valid creation payload.'
    }
  }
  const creationPayload = creationPayloadResult.payload

  const mainTaskResponse = await fetch(`${CLICKUP_API_BASE}/list/${listId}/task`, {
    method: 'POST',
    headers: {
      Authorization: clickupApiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(creationPayload)
  })

  if (!mainTaskResponse.ok) {
    const errorText = await mainTaskResponse.text()
    return {
      success: false,
      error: `ClickUp failed to create the workout task (${mainTaskResponse.status}): ${errorText}`
    }
  }

  const mainTask = await mainTaskResponse.json()
  let recurrenceApplied = false
  if (applyRecurrenceToSeries) {
    recurrenceApplied = await applyClickUpRecurrence(mainTask.id, repeatConfig, clickupApiKey)
  }
  const createdSubtasks: any[] = []

  for (const lift of lifts) {
    const subtaskResponse = await fetch(`${CLICKUP_API_BASE}/task/${mainTask.id}/subtask`, {
      method: 'POST',
      headers: {
        Authorization: clickupApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: formatSubtaskName(lift),
        description: formatSubtaskDescription(lift),
        status: 'to do',
        notify_all: false
      })
    })

    if (subtaskResponse.ok) {
      createdSubtasks.push(await subtaskResponse.json())
    }
  }

  const repeatMsg =
    dateRange.repeat_weeks && dateRange.repeat_weeks > 0
      ? `Repeats for ${dateRange.repeat_weeks} week${dateRange.repeat_weeks > 1 ? 's' : ''}.`
      : undefined
  const summaryParts = [
    `Created ${mainTask.name} in ${targetList.title || 'your list'}.`,
    dateRange.pretty ? `Scheduled for ${dateRange.pretty}.` : 'No structured lifts detected.'
  ]
  if (repeatMsg) {
    summaryParts.push(repeatMsg)
  }
  if (applyRecurrenceToSeries && !recurrenceApplied) {
    summaryParts.push('Recurrence could not be applied via API; intent remains in description.')
  }

  return {
    success: true,
    summary: summaryParts.join(' '),
    mainTask,
    subtasks: createdSubtasks
  }
}

function classifyExecutionIntent(extracted: ExtractedEntities): 'event' | 'task' | 'routine' {
  if (extracted.taskType === 'event') return 'event'
  if (extracted.recurrence) return 'routine'
  return 'task'
}

function buildExecutionPayloadByIntent({
  intent,
  basePayload,
  dateRange,
  extracted,
  listConfig,
  defaultAssigneeId,
  decision
}: {
  intent: 'event' | 'task' | 'routine'
  basePayload: Record<string, any>
  dateRange: Record<string, any>
  extracted: ExtractedEntities
  listConfig: ListConfig
  defaultAssigneeId: string | null
  decision: 'create' | 'update'
}) {
  const payload: Record<string, any> = { ...basePayload }
  const isUpdate = decision === 'update'

  if (defaultAssigneeId) {
    payload.assignees = isUpdate
      ? { add: [defaultAssigneeId], rem: [] }
      : [defaultAssigneeId]
  }

  if (intent === 'event') {
    if (!dateRange.start_date || !dateRange.due_date) {
      return {
        valid: false,
        error: 'Event execution requires both start and end date/time.'
      }
    }
    payload.start_date = dateRange.start_date
    payload.due_date = dateRange.due_date
    payload.start_date_time = true
    payload.due_date_time = true
    return { valid: true, payload }
  }

  if (intent === 'routine') {
    if (!dateRange.start_date) {
      return {
        valid: false,
        error: 'Routine execution requires a start date.'
      }
    }
    payload.start_date = dateRange.start_date
    if (dateRange.due_date) payload.due_date = dateRange.due_date
    if (dateRange.has_time) {
      payload.start_date_time = true
      if (dateRange.due_date) payload.due_date_time = true
    }
    // Keep explicit recurrence intent in description for auditability even when API repeat is applied separately.
    if (extracted.recurrence && typeof payload.description === 'string') {
      payload.description = `${payload.description}\nRecurrence intent: ${extracted.recurrence}`
    }
    return { valid: true, payload }
  }

  if (dateRange.start_date) payload.start_date = dateRange.start_date
  if (dateRange.due_date) payload.due_date = dateRange.due_date
  if (dateRange.has_time) {
    payload.start_date_time = true
    if (dateRange.due_date) payload.due_date_time = true
  }

  if (listConfig.execution.due_date_policy === 'required' && !payload.due_date) {
    return { valid: false, error: 'This list requires a due date.' }
  }
  if (listConfig.execution.due_date_policy === 'forbid') {
    delete payload.due_date
    delete payload.due_date_time
    delete payload.start_date
    delete payload.start_date_time
  }

  return { valid: true, payload }
}

function buildClickUpRepeatConfig({
  message,
  extracted,
  dateRange
}: {
  message: string
  extracted: ExtractedEntities
  dateRange: Record<string, any>
}) {
  const lower = message.toLowerCase()
  const everyDay = /\bevery day\b/.test(lower) || extracted.recurrence === 'daily'
  const everyWeek = /\bweekly\b|\bevery week\b/.test(lower)
  const everyMonth = /\bmonthly\b|\bevery month\b/.test(lower)
  const weekdaysOnly = /\bevery weekday\b/.test(lower)

  if (!everyDay && !everyWeek && !everyMonth && !weekdaysOnly) {
    return null
  }

  const until = computeRepeatUntil(dateRange)
  const base =
    weekdaysOnly
      ? { freq: 'WEEKLY', interval: 1, week_days: [1, 2, 3, 4, 5] }
      : everyDay
        ? { freq: 'DAILY', interval: 1 }
        : everyMonth
          ? { freq: 'MONTHLY', interval: 1 }
          : { freq: 'WEEKLY', interval: 1 }

  return {
    ...base,
    ...(until ? { until } : {})
  }
}

function computeRepeatUntil(dateRange: Record<string, any>) {
  const start = Number(dateRange?.start_date)
  const repeatWeeks = Number(dateRange?.repeat_weeks)
  if (!Number.isFinite(start) || !Number.isFinite(repeatWeeks) || repeatWeeks <= 0) {
    return null
  }
  const endMs = start + repeatWeeks * 7 * 24 * 60 * 60 * 1000
  return endMs
}

async function applyClickUpRecurrence(taskId: string, repeat: Record<string, any>, clickupApiKey: string) {
  const attemptBodies = [
    { repeat },
    {
      repeat: {
        ...repeat,
        freq: typeof repeat.freq === 'string' ? repeat.freq.toLowerCase() : repeat.freq
      }
    }
  ]

  for (const body of attemptBodies) {
    try {
      const response = await fetch(`${CLICKUP_API_BASE}/task/${taskId}`, {
        method: 'PUT',
        headers: {
          Authorization: clickupApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
      if (response.ok) {
        return true
      }
      const errorText = await response.text().catch(() => '')
      console.error('ClickUp recurrence apply failed', response.status, errorText, body)
    } catch (error) {
      console.error('ClickUp recurrence apply crashed', error)
    }
  }
  return false
}

function parseWorkoutLifts(message: string) {
  return message
    .split(/[\n.;]/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const setsMatch = line.match(/(\\d+)\\s*sets?/i)
      const repsMatch = line.match(/(\\d+)\\s*reps?/i)
      const weightMatch =
        line.match(/@\\s*(\\d+\\.?\\d*)\\s*(lb|kg)?/i) || line.match(/(\\d+\\.?\\d*)\\s*(lb|kg)/i)

      const sanitizedLine = line
        .replace(/\\d+\\s*sets?/gi, '')
        .replace(/\\d+\\s*reps?/gi, '')
        .replace(/@\\s*\\d+\\.?\\d*\\s*(lb|kg)?/gi, '')
        .replace(/(lb|kg)/gi, '')
        .replace(/[x×]/gi, '')
        .trim()

      return {
        name: sanitizedLine || 'Workout detail',
        sets: setsMatch ? Number(setsMatch[1]) : undefined,
        reps: repsMatch ? Number(repsMatch[1]) : undefined,
        weight: weightMatch ? `${weightMatch[1]}${weightMatch[2] || ''}` : undefined,
        raw: line
      }
    })
    .filter((lift) => Boolean(lift.name && (lift.sets || lift.reps || lift.weight || lift.raw)))
}

function formatSubtaskName(lift: { name: string; sets?: number; reps?: number; weight?: string }) {
  const parts = [lift.name]
  if (lift.sets) parts.push(`${lift.sets} sets`)
  if (lift.reps) parts.push(`${lift.reps} reps`)
  if (lift.weight) parts.push(`@ ${lift.weight}`)
  return parts.join(' · ')
}

function formatSubtaskDescription(lift: { sets?: number; reps?: number; weight?: string; raw?: string }) {
  const lines = []
  if (lift.sets) lines.push(`Sets: ${lift.sets}`)
  if (lift.reps) lines.push(`Reps: ${lift.reps}`)
  if (lift.weight) lines.push(`Weight: ${lift.weight}`)
  if (lift.raw && !lines.length) {
    lines.push(lift.raw)
  }
  return lines.join('\n')
}

function parseDatesFromMessage(message: string) {
  const relativeDate = parseRelativeDate(message)
  if (relativeDate) {
    return relativeDate
  }

  const monthRegex =
    /(?:\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?).*\s*)?(?:\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?))[^\d]{0,4}(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4}))?/i
  const match = message.match(monthRegex)

  if (!match) {
    return parseFallbackWeekday(message)
  }

  const monthName = match[1]
  const day = Number(match[2])
  const year = match[3] ? Number(match[3]) : new Date().getFullYear()
  const monthIndex = monthName ? monthNameToIndex(monthName) : new Date().getMonth()

  if (Number.isNaN(day) || monthIndex === undefined) {
    return {}
  }

  const baseDate = new Date(year, monthIndex, day)
  baseDate.setHours(0, 0, 0, 0)
  const timeMatches = message.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi) || []
  let start: Date | null = null
  let end: Date | null = null

  if (timeMatches.length) {
    start = applyTimeToDate(baseDate, timeMatches[0])
    if (timeMatches.length > 1) {
      end = applyTimeToDate(baseDate, timeMatches[1])
    } else if (timeMatches.length === 1) {
      end = new Date(start.getTime() + 6 * 60 * 60 * 1000)
    }
  } else {
    start = new Date(baseDate)
    end = new Date(baseDate)
    end.setHours(end.getHours() + 1)
  }

  if (!start || !end) {
    return {}
  }

  const repeatMatch = message.match(/for\s+(\d+)\s+weeks?/i)
  const repeatWeeks = repeatMatch ? Number(repeatMatch[1]) : undefined

  return {
    start_date: start.getTime(),
    due_date: end.getTime(),
    pretty: formatDateRange(start, end),
    repeat_weeks: repeatWeeks,
    has_time: Boolean(timeMatches.length)
  }
}

function parseRelativeDate(message: string) {
  const lower = message.toLowerCase()
  if (!/\b(today|tomorrow)\b/.test(lower)) return null

  const base = new Date()
  if (/\btomorrow\b/.test(lower)) {
    base.setDate(base.getDate() + 1)
  }
  base.setHours(0, 0, 0, 0)

  const timeMatches = message.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi) || []
  let start = new Date(base)
  let end = new Date(base)

  if (timeMatches.length >= 1) {
    start = applyTimeToDate(base, timeMatches[0])
  } else {
    start.setHours(9, 0, 0, 0)
  }

  if (timeMatches.length >= 2) {
    end = applyTimeToDate(base, timeMatches[1])
  } else {
    end = new Date(start.getTime() + 60 * 60 * 1000)
  }

  return {
    start_date: start.getTime(),
    due_date: end.getTime(),
    pretty: formatDateRange(start, end),
    repeat_weeks: /\bthis week\b/.test(lower) ? 1 : undefined,
    has_time: true
  }
}

function applyTimeToDate(baseDate: Date, timeSegment: string) {
  const match = timeSegment.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (!match) {
    return new Date(baseDate)
  }

  let hour = Number(match[1])
  const minute = match[2] ? Number(match[2]) : 0
  const meridiem = match[3]?.toLowerCase()

  if (meridiem === 'pm' && hour < 12) {
    hour += 12
  }
  if (meridiem === 'am' && hour === 12) {
    hour = 0
  }

  const result = new Date(baseDate)
  result.setHours(hour, minute, 0, 0)
  return result
}

function formatDateRange(start: Date, end: Date) {
  const datePart = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const startTime = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const endTime = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${datePart} ${startTime} - ${endTime}`
}

function parseFallbackWeekday(message: string) {
  const weekdayMatch = message.match(/\b(mon|tue|wed|thu|fri|sat|sun)(?:day)?\b/i)
  if (!weekdayMatch) {
    return {}
  }

  const dayIndex = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(
    weekdayMatch[1].toLowerCase().slice(0, 3)
  )
  const today = new Date()
  const nextDate = new Date(today)
  const diff = (dayIndex - today.getDay() + 7) % 7
  nextDate.setDate(today.getDate() + (diff === 0 ? 7 : diff))
  nextDate.setHours(9, 0, 0, 0)
  const endDate = new Date(nextDate)
  endDate.setHours(17, 0, 0, 0)

  return {
    start_date: nextDate.getTime(),
    due_date: endDate.getTime(),
    pretty: formatDateRange(nextDate, endDate),
    has_time: true
  }
}

function monthNameToIndex(name: string) {
  const normalized = name.toLowerCase()
  const monthMap: Record<string, number> = {
    january: 0,
    jan: 0,
    february: 1,
    feb: 1,
    march: 2,
    mar: 2,
    april: 3,
    apr: 3,
    may: 4,
    june: 5,
    jun: 5,
    july: 6,
    jul: 6,
    august: 7,
    aug: 7,
    september: 8,
    sep: 8,
    october: 9,
    oct: 9,
    november: 10,
    nov: 10,
    december: 11,
    dec: 11
  }
  return monthMap[normalized]
}

function parseTaskIdFromMessage(message: string) {
  const match = message.match(/(?:task\s+ID\s+|ID\s+)([0-9a-zA-Z]+)/i)
  return match?.[1] ? match[1].trim() : null
}

async function fetchTask(taskId: string, clickupApiKey: string) {
  try {
    const response = await fetch(`${CLICKUP_API_BASE}/task/${taskId}`, {
      headers: {
        Authorization: clickupApiKey
      }
    })

    if (!response.ok) {
      return null
    }

    return await response.json()
  } catch (error) {
    console.error('Failed to fetch task by ID', error)
    return null
  }
}

async function fetchListTasks(listId: string, clickupApiKey: string) {
  try {
    const response = await fetch(`${CLICKUP_API_BASE}/list/${listId}/task?archived=false&page=0&subtasks=true`, {
      headers: {
        Authorization: clickupApiKey
      }
    })

    if (!response.ok) {
      return []
    }

    const payload = await response.json()
    return payload.tasks || []
  } catch (error) {
    console.error('Failed to fetch list tasks', error)
    return []
  }
}

function findTaskToUpdate(tasks: any[], message: string) {
  if (!tasks?.length) {
    return null
  }

  const normalizedMessage = normalizeText(message)
  const tokens = normalizedMessage.split(/\s+/).filter((token) => token.length > 3)
  if (!tokens.length) {
    return null
  }

  let bestMatch = null
  let bestScore = 0

  for (const task of tasks) {
    const haystack = normalizeText(`${task.name} ${task.description || ''}`)
    let score = 0
    for (const token of tokens) {
      if (haystack.includes(token)) {
        score += 1
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestMatch = task
    }
  }

  return bestScore >= 2 ? bestMatch : null
}

function isTodayEpochMs(value: unknown) {
  const epoch = Number(value)
  if (!Number.isFinite(epoch) || epoch <= 0) return false
  const date = new Date(epoch)
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

function findTodaysMealTask(tasks: any[], message: string) {
  const todays = (tasks || []).filter((task) => {
    const start = task?.start_date
    const due = task?.due_date
    return isTodayEpochMs(start) || isTodayEpochMs(due)
  })
  if (!todays.length) return null
  const normalizedMessage = normalizeText(message)
  const tokens = normalizedMessage.split(/\s+/).filter((token) => token.length > 3)
  if (!tokens.length) return todays[0]

  let best = todays[0]
  let bestScore = -1
  for (const task of todays) {
    const haystack = normalizeText(`${task?.name || ''} ${task?.description || ''}`)
    let score = 0
    for (const token of tokens) {
      if (haystack.includes(token)) score += 1
    }
    if (score > bestScore) {
      best = task
      bestScore = score
    }
  }
  return best
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function deriveListDisplayName(list: any) {
  const fromTitle =
    list?.title ||
    list?.reference_name ||
    list?.metadata?.source_name ||
    list?.name ||
    null
  if (fromTitle && fromTitle !== 'ClickUp list') {
    return fromTitle
  }
  return list?.clickup_list_id ? `List ${list.clickup_list_id}` : 'Unknown list'
}

function parseJsonLike(value: unknown) {
  if (!value) return null
  if (typeof value === 'object') return value as Record<string, any>
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function normalizeListConfig(raw: Record<string, any> | null): ListConfig {
  if (!raw) return DEFAULT_LIST_CONFIG
  const goals: GoalMetric[] = Array.isArray(raw.goals)
    ? raw.goals
        .map((goal: any) => ({
          metric: typeof goal?.metric === 'string' ? goal.metric.trim() : '',
          target: Number(goal?.target),
          period: goal?.period
        }))
        .filter(
          (goal) =>
            goal.metric.length > 0 &&
            Number.isFinite(goal.target) &&
            ['daily', 'weekly', 'monthly'].includes(String(goal.period))
        ) as GoalMetric[]
    : []

  const dueDatePolicy = raw.execution?.due_date_policy
  const reminders = raw.execution?.reminders
  const mode = raw.description?.mode

  return {
    goals,
    execution: {
      require_subtasks: Boolean(raw.execution?.require_subtasks),
      due_date_policy:
        dueDatePolicy === 'required' || dueDatePolicy === 'forbid' ? dueDatePolicy : 'optional',
      reminders: reminders === 'default' ? 'default' : 'none'
    },
    naming: {
      max_words: Number.isFinite(Number(raw.naming?.max_words))
        ? Math.max(4, Number(raw.naming.max_words))
        : DEFAULT_LIST_CONFIG.naming.max_words,
      max_chars: Number.isFinite(Number(raw.naming?.max_chars))
        ? Math.max(16, Number(raw.naming.max_chars))
        : DEFAULT_LIST_CONFIG.naming.max_chars,
      prefix: typeof raw.naming?.prefix === 'string' ? raw.naming.prefix.trim() || null : null
    },
    description: {
      mode: mode === 'detailed' ? 'detailed' : 'compact',
      include_source:
        typeof raw.description?.include_source === 'boolean'
          ? raw.description.include_source
          : DEFAULT_LIST_CONFIG.description.include_source
    }
  }
}

function getListConfig(targetList: any): ListConfig {
  const preferences = parseJsonLike(targetList?.preferences)
  const metadata = parseJsonLike(targetList?.metadata)
  const contextConfig = parseJsonLike(targetList?.context)
  const candidate =
    (metadata?.list_config && typeof metadata.list_config === 'object' ? metadata.list_config : null) ||
    (preferences && typeof preferences === 'object' ? preferences : null) ||
    (contextConfig && typeof contextConfig === 'object' ? contextConfig : null)
  return normalizeListConfig(candidate)
}

function validatePlannedAction({
  decision,
  targetList,
  extracted,
  structuredIntent,
  listConfig
}: {
  decision: string
  targetList: any
  extracted: ExtractedEntities
  structuredIntent: StructuredExtraction | null
  listConfig: ListConfig
}) {
  const reasons: string[] = []
  if (!targetList?.clickup_list_id) {
    reasons.push('I could not determine a destination list.')
  }

  if (decision === 'create' || decision === 'update') {
    const candidateTitle = extracted.primaryTitle
    if (candidateTitle && looksLikeConfirmationOnly(candidateTitle)) {
      reasons.push('Please provide a clearer title than a confirmation phrase.')
    }
  }

  const expectsSchedule =
    structuredIntent?.entity_type === 'event' ||
    (structuredIntent?.intent_actions || []).includes('schedule')
  if (expectsSchedule && !extracted.dateRange?.start_date) {
    reasons.push('what date/time this should be scheduled for')
  }

  if (listConfig.execution.due_date_policy === 'required' && !extracted.dateRange?.due_date) {
    reasons.push('the due date required by this list')
  }
  if (listConfig.execution.due_date_policy === 'forbid' && extracted.dateRange?.due_date) {
    reasons.push('this list does not allow due dates; remove schedule details or pick another list')
  }

  return {
    valid: reasons.length === 0,
    reasons
  }
}

function createWorkoutTitle(
  message: string,
  routingConfig: any,
  targetList: any,
  extracted?: ExtractedEntities | null,
  listConfig: ListConfig = DEFAULT_LIST_CONFIG
) {
  return buildCompactTaskTitle(message, routingConfig, targetList, extracted, listConfig)
}

function buildCompactTaskTitle(
  message: string,
  routingConfig: any,
  targetList: any,
  extracted?: ExtractedEntities | null,
  listConfig: ListConfig = DEFAULT_LIST_CONFIG
) {
  const candidateTitle = extracted?.primaryTitle || null
  if (candidateTitle && !looksLikeConfirmationOnly(candidateTitle)) {
    return enforceTitleLimits(candidateTitle, listConfig)
  }

  const normalizedType = extracted?.taskType || 'task'
  const categoryByType: Record<string, string> = {
    task: 'Task',
    event: 'Event',
    workout: 'Workout',
    meal: 'Meal'
  }
  const category = categoryByType[normalizedType] || 'Task'

  const leadName = extracted?.leadContext?.contact_name?.trim()
  const timingTrigger = extracted?.leadContext?.timing_trigger?.trim()
  let focus = leadName ? `${leadName}` : 'Task'
  if (timingTrigger && leadName) {
    focus = `${leadName} follow-up`
  } else if (!leadName) {
    const cleaned = message
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\b(starts?|ends?|tomorrow|today|tonight|next week|this week|every day|daily)\b/gi, ' ')
      .replace(/\b\d{1,2}(?::\d{2})?\s*(am|pm)\b/gi, ' ')
      .replace(/[^a-zA-Z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const significant = cleaned
      .split(' ')
      .filter((word) => word.length > 2)
      .slice(0, 3)
      .join(' ')
    focus = significant ? toTitleCase(significant) : 'Task'
  }

  const compact = `${category} - ${focus}`
  return enforceTitleLimits(compact, listConfig)
}

function enforceTitleLimits(title: string, listConfig: ListConfig = DEFAULT_LIST_CONFIG) {
  const maxWords = Math.max(4, listConfig.naming?.max_words || 8)
  const maxChars = Math.max(16, listConfig.naming?.max_chars || 32)
  const words = title.split(/\s+/).filter(Boolean).slice(0, maxWords)
  let value = words.join(' ')
  const prefix = listConfig.naming?.prefix?.trim()
  if (prefix && !value.toLowerCase().startsWith(prefix.toLowerCase())) {
    value = `${prefix} ${value}`.trim()
  }
  if (value.length > maxChars) {
    value = value.slice(0, maxChars).trim()
  }
  return value || 'Task'
}

function toTitleCase(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function looksLikeConfirmationOnly(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim()
  return /^(yes|yep|yeah|ok|okay|do it|add him|add her|add it|create it|sounds good)$/.test(normalized)
}

function buildActionPlan(
  decisionResult: any,
  routingConfig: any,
  targetList: any,
  message: string,
  extracted?: ExtractedEntities,
  listConfig: ListConfig = DEFAULT_LIST_CONFIG,
  goalDeltas: any[] = []
) {
  const decision = decisionResult?.decision || 'create'
  const listId = targetList?.clickup_list_id || ''
  const extractedEntities = extracted || extractEntitiesFromMessage(message, routingConfig, decision)
  const dateRange = extractedEntities?.dateRange || parseDatesFromMessage(message)
  const taskName = createWorkoutTitle(message, routingConfig, targetList, extractedEntities, listConfig)
  const description = buildTaskDescription(message, decision, routingConfig, extractedEntities, listConfig)
  const conciseAction = decision === 'update' ? 'Update task' : 'Create task'
  const conciseTime = dateRange.pretty ? ` • ${dateRange.pretty}` : ''
  const deltaHints = goalDeltas
    .filter((delta: any) => Number.isFinite(Number(delta?.remaining)))
    .slice(0, 2)
    .map((delta: any) => {
      const remaining = Number(delta.remaining)
      if (remaining > 0) {
        return `Remaining ${delta.metric}: ${remaining} (${delta.actual}/${delta.target})`
      }
      return `${delta.metric} target met (${delta.actual}/${delta.target})`
    })
  const priority = derivePriorityHint(goalDeltas)
  if (priority) {
    deltaHints.unshift(`Priority: ${priority}`)
  }

  return {
    summary: `${conciseAction}: ${taskName}${conciseTime}`,
    details: deltaHints,
    decision,
    target: {
      spaceId: routingConfig?.default_space_id || null,
      listId,
      listName: targetList?.title || targetList?.name || null
    },
    actions: [
      {
        capability: decision === 'update' ? 'update_item' : 'create_item',
        listId,
        name: taskName,
        description,
        start_date: dateRange.start_date || null,
        due_date: dateRange.due_date || null
      }
    ]
  }
}

function buildPlanPreview(plan: any, extracted: ExtractedEntities) {
  const firstAction = Array.isArray(plan?.actions) ? plan.actions[0] : null
  const startRaw = firstAction?.start_date || null
  const dueRaw = firstAction?.due_date || null
  const startDate = startRaw ? new Date(Number(startRaw)) : null
  const dueDate = dueRaw ? new Date(Number(dueRaw)) : null
  return {
    name: firstAction?.name || null,
    type: extracted?.taskType || null,
    date: extracted?.dateRange?.pretty || null,
    start: startDate && !Number.isNaN(startDate.getTime()) ? startDate.toISOString() : null,
    due: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate.toISOString() : null,
    description: firstAction?.description || null,
    tags: extracted?.tags || [],
    recurrence: extracted?.recurrence || null
  }
}

function summarizeDeltaLines(goalDeltas: any[]) {
  return (goalDeltas || [])
    .slice(0, 3)
    .map((delta: any) => {
      const remaining = Number(delta?.remaining || 0)
      if (remaining > 0) {
        return `${delta.metric}: ${remaining} left`
      }
      return `${delta.metric}: target met`
    })
}

function derivePriorityHint(goalDeltas: any[]) {
  if (!Array.isArray(goalDeltas) || !goalDeltas.length) return null
  const candidates = goalDeltas
    .map((delta: any) => {
      const remaining = Number(delta?.remaining || 0)
      const target = Number(delta?.target || 0)
      const ratio = target > 0 ? remaining / target : 0
      return { metric: delta.metric, remaining, ratio }
    })
    .filter((entry: any) => entry.remaining > 0)
    .sort((a: any, b: any) => b.ratio - a.ratio)
  if (!candidates.length) return 'all tracked goals are on target'
  const top = candidates[0]
  return `focus ${top.metric} (${Math.ceil(top.remaining)} remaining)`
}

function extractEntitiesFromMessage(
  message: string,
  routingConfig: any,
  decision: string,
  structuredIntent?: StructuredExtraction | null
): ExtractedEntities {
  const lower = message.toLowerCase()
  const dateRange = parseDatesFromMessage(message)
  const location =
    message.match(/\b(?:at|in)\s+([A-Z][A-Za-z0-9&' -]{2,})/)?.[1]?.trim() || null
  const recurrence = lower.includes('every day')
    ? 'daily'
    : lower.includes('this week')
      ? 'this_week'
      : lower.includes('next week')
        ? 'next_week'
        : null
  const constraints: string[] = []
  if (/\bwrist\b|\binjury\b/i.test(message)) constraints.push('injury-aware')
  if (/\bno\b.*\b(grip|supinated|pronated)\b/i.test(lower)) constraints.push('movement-constraint')
  if (/\b30 min\b|\bquick\b/i.test(lower)) constraints.push('time-constrained')

  const tags: string[] = []
  if (/\btraining\b|\bclass\b/i.test(lower)) tags.push('training')
  if (/\bmeeting\b/i.test(lower)) tags.push('meeting')
  if (/\bworkout\b|\bgym\b|\bpush\b|\bcardio\b/i.test(lower)) tags.push('workout')
  if (/\bmeal\b|\bfood\b|\bmacro\b/i.test(lower)) tags.push('meal')
  const applyToFuture =
    /\b(go(?:ing)? forward|from now on|apply to future|future (days|instances)|all future|template)\b/i.test(lower) ||
    /\b(every day from now|for the rest of prep)\b/i.test(lower)

  const taskType = inferTaskType(message, routingConfig, decision, structuredIntent)
  return {
    taskType,
    primaryTitle: structuredIntent?.primary_title || null,
    dateRange,
    location,
    recurrence,
    constraints,
    tags,
    applyToFuture,
    leadContext: structuredIntent?.context || undefined
  }
}

function inferTaskType(
  message: string,
  routingConfig: any,
  decision: string,
  structuredIntent?: StructuredExtraction | null
): ExtractedEntities['taskType'] {
  if (structuredIntent?.entity_type === 'event') return 'event'
  if (structuredIntent?.entity_type === 'workout') return 'workout'
  if (structuredIntent?.entity_type === 'meal') return 'meal'
  if (structuredIntent?.entity_type === 'lead') return 'task'
  const hasStructuredSchedule = Boolean(structuredIntent?.intent_actions?.includes('schedule'))
  const dateRange = parseDatesFromMessage(message)
  if (hasStructuredSchedule && dateRange.start_date) return 'event'
  if (decision === 'update' || decision === 'create' || decision === 'hybrid') return 'task'
  return 'task'
}

function buildTaskDescription(
  message: string,
  decision: string,
  routingConfig: any,
  extracted: ExtractedEntities,
  listConfig: ListConfig = DEFAULT_LIST_CONFIG
) {
  const lines: string[] = []
  const actionVerb = decision === 'update' ? 'Update' : 'Create'
  switch (extracted.taskType) {
    case 'event':
      lines.push(`Type: ${listConfig.terminology.item_singular || 'Event'}`)
      lines.push(`Action: ${actionVerb}`)
      if (extracted.dateRange?.pretty) lines.push(`When: ${extracted.dateRange.pretty}`)
      if (extracted.recurrence) lines.push(`Recurrence: ${extracted.recurrence}`)
      if (extracted.location) lines.push(`Where: ${extracted.location}`)
      break
    case 'workout':
      lines.push(`Type: ${listConfig.terminology.item_singular || 'Workout'}`)
      lines.push(`Action: ${actionVerb}`)
      if (extracted.dateRange?.pretty) lines.push(`When: ${extracted.dateRange.pretty}`)
      if (extracted.constraints.length) lines.push(`Constraints: ${extracted.constraints.join(', ')}`)
      break
    case 'meal':
      lines.push(`Type: ${listConfig.terminology.item_singular || 'Meal'}`)
      lines.push(`Action: ${actionVerb}`)
      if (extracted.dateRange?.pretty) lines.push(`When: ${extracted.dateRange.pretty}`)
      break
    default:
      lines.push(`Type: ${listConfig.terminology.item_singular || 'Task'}`)
      lines.push(`Action: ${actionVerb}`)
      if (extracted.dateRange?.pretty) lines.push(`When: ${extracted.dateRange.pretty}`)
      break
  }
  if (extracted.leadContext?.contact_name) lines.push(`Lead: ${extracted.leadContext.contact_name}`)
  if (extracted.leadContext?.company) lines.push(`Company: ${extracted.leadContext.company}`)
  if (extracted.leadContext?.pain_point) lines.push(`Pain point: ${extracted.leadContext.pain_point}`)
  if (extracted.leadContext?.timing_trigger) lines.push(`Timing: ${extracted.leadContext.timing_trigger}`)
  if (extracted.leadContext?.strategic_angle) lines.push(`Strategic angle: ${extracted.leadContext.strategic_angle}`)
  if (extracted.leadContext?.follow_up_date) lines.push(`Follow-up: ${extracted.leadContext.follow_up_date}`)
  if (routingConfig?.instructions) lines.push(`Rule: ${routingConfig.instructions}`)
  if (extracted.tags.length) lines.push(`Tags: ${extracted.tags.join(', ')}`)
  if (listConfig.description.include_source) lines.push(`Source: ${message}`)

  const lineLimit = listConfig.description.mode === 'detailed' ? 20 : 8
  return lines.slice(0, lineLimit).join('\n')
}

async function resolveTargetListForPlan(plan: any, routingConfig: any, supabase: any) {
  const planListId = plan?.target?.listId
  if (!planListId) return null

  const inMemory = routingConfig?.clickup_lists?.find((list: any) => list.clickup_list_id === planListId)
  if (inMemory) return inMemory

  const { data } = await supabase
    .from('clickup_lists')
    .select('*')
    .eq('clickup_list_id', planListId)
    .maybeSingle()

  return data || null
}

async function resolveTargetListById(listId: string, userId: string, supabase: any) {
  if (!listId) return null
  const { data } = await supabase
    .from('clickup_lists')
    .select('*')
    .eq('user_id', userId)
    .eq('clickup_list_id', listId)
    .maybeSingle()
  return data || null
}

async function logArtifact({
  supabase,
  userId,
  plan,
  requestPayload,
  responsePayload,
  status,
  summary,
  listId,
  error
}: {
  supabase: any
  userId: string
  plan: any
  requestPayload: any
  responsePayload: any
  status: 'success' | 'failure'
  summary?: string
  listId: string
  error?: string | null
}) {
  const artifactRow = {
    user_id: userId,
    list_id: listId || plan?.target?.listId || 'unknown',
    status,
    request_payload: requestPayload,
    response_payload: responsePayload,
    error: error || null,
    summary_note: summary || null,
    fallback_used: false,
    list_config_id: null,
    clickup_task_id: responsePayload?.mainTask?.id || null,
    clickup_task_url: responsePayload?.mainTask?.url || null,
    reference_name: null,
    pragmatic_end_goal: null,
    why_sent: null
  }

  const { data: inserted, error: insertError } = await supabase
    .from('clickup_artifacts')
    .insert(artifactRow)
    .select('id')
    .maybeSingle()
  if (insertError) {
    console.error('Artifact logging failed', insertError)
    return null
  }
  return inserted?.id || null
}

async function refreshCompletionDeltaSnapshot({
  supabaseUrl,
  supabaseServiceKey,
  userId,
  listId
}: {
  supabaseUrl: string
  supabaseServiceKey: string
  userId: string
  listId: string
}) {
  if (!supabaseUrl || !supabaseServiceKey || !listId) return
  try {
    await fetch(`${supabaseUrl}/functions/v1/sync-clickup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        userId,
        mode: 'completion_only',
        listIds: [listId]
      })
    })
  } catch (error) {
    console.error('Completion delta refresh failed', error)
  }
}

async function executeViaCapabilityRouter({
  supabaseUrl,
  supabaseServiceKey,
  userId,
  plan,
  message,
  routingConfig,
  targetList
}: {
  supabaseUrl: string
  supabaseServiceKey: string
  userId: string
  plan: any
  message: string
  routingConfig: any
  targetList: any
}) {
  try {
    const firstAction = plan?.actions?.[0]
    const capability = firstAction?.capability || (plan?.decision === 'update' ? 'update_item' : 'create_item')
    const payload = {
      userId,
      capability,
      target: {
        listId: targetList?.clickup_list_id,
        taskId: firstAction?.taskId || parseTaskIdFromMessage(message),
        spaceId: routingConfig?.default_space_id || null
      },
      input: {
        name: firstAction?.name || createWorkoutTitle(message, routingConfig, targetList),
        description: firstAction?.description || `Intent: ${message}`,
        start_date: firstAction?.start_date || null,
        due_date: firstAction?.due_date || null,
        status: 'to do'
      }
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/execute-clickup-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify(payload)
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      return {
        success: false,
        error: data?.error || `execute-clickup-action failed (${response.status})`
      }
    }

    return {
      success: true,
      summary: data?.summary || 'Action executed.',
      mainTask: data?.mainTask || null,
      response: data
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
