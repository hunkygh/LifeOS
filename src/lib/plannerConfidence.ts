export type ConfidenceInput = {
  decision: string
  structuredIntent: {
    entity_type?: string | null
    intent_actions?: string[] | null
    primary_title?: string | null
  } | null
  extracted: {
    dateRange?: Record<string, any> | null
  } | null
  targetListId?: string | null
}

export type ConfidenceSignal =
  | 'missing_target'
  | 'missing_schedule'
  | 'unclear_decision'
  | 'unknown_entity'
  | 'unclear_title'

export type ConfidenceResult = {
  score: number
  signals: ConfidenceSignal[]
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function looksLikeWeakTitle(value: string | null | undefined) {
  if (!value) return true
  const normalized = value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim()
  if (!normalized) return true
  if (/^(yes|yep|yeah|ok|okay|do it)$/.test(normalized)) return true
  if (/^(add him|add her|add it|create it)$/.test(normalized)) return true
  if (/^(yes|yep|yeah|ok|okay)\s+/.test(normalized)) return true
  return false
}

export function computePlanConfidence(input: ConfidenceInput): ConfidenceResult {
  let score = 0.25
  const signals: ConfidenceSignal[] = []

  const normalizedDecision = String(input.decision || '').toLowerCase()
  if (['create', 'update', 'hybrid', 'query', 'delete'].includes(normalizedDecision)) {
    score += 0.2
  } else {
    signals.push('unclear_decision')
  }

  const entityType = String(input.structuredIntent?.entity_type || 'unknown').toLowerCase()
  if (entityType && entityType !== 'unknown') {
    score += 0.15
  } else {
    signals.push('unknown_entity')
  }

  const intentActions = Array.isArray(input.structuredIntent?.intent_actions)
    ? input.structuredIntent!.intent_actions!.filter(Boolean)
    : []
  if (intentActions.length > 0) {
    score += 0.1
  }

  if (input.targetListId) {
    score += 0.25
  } else {
    score -= 0.35
    signals.push('missing_target')
  }

  const isScheduleIntent = entityType === 'event' || intentActions.includes('schedule')
  const hasStart = Boolean(input.extracted?.dateRange?.start_date)
  const hasDue = Boolean(input.extracted?.dateRange?.due_date)
  if (isScheduleIntent) {
    if (hasStart && hasDue) {
      score += 0.2
    } else {
      score -= 0.3
      signals.push('missing_schedule')
    }
  } else {
    score += 0.05
  }

  if (!looksLikeWeakTitle(input.structuredIntent?.primary_title)) {
    score += 0.05
  } else {
    score -= 0.15
    signals.push('unclear_title')
  }

  return {
    score: clamp(score),
    signals
  }
}

export function needsSingleClarification(result: ConfidenceResult, threshold = 0.65) {
  if (result.signals.includes('missing_target') || result.signals.includes('missing_schedule')) {
    return true
  }
  return result.score < threshold
}

export function buildSingleClarificationPrompt(result: ConfidenceResult) {
  const first = result.signals[0]
  switch (first) {
    case 'missing_target':
      return 'Which list should this go to?'
    case 'missing_schedule':
      return 'What date and time should I schedule this for?'
    case 'unclear_decision':
      return 'Should this create a new item or update an existing one?'
    case 'unknown_entity':
      return 'Should I treat this as a task, event, or note?'
    case 'unclear_title':
      return 'What short title should I use for this item?'
    default:
      return 'Please add one detail so I can stage this correctly.'
  }
}
