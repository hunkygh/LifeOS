// Workflow-based routing library for Life OS
// Replaces complex deterministic pipeline with simple, deterministic pattern matching

export interface WorkflowPattern {
  id: string
  workflow_id: string
  pattern_type: 'lead' | 'opportunity' | 'task' | 'event'
  keywords: string[]
  regex_pattern?: string
  target_list_type: 'leads' | 'opportunities' | 'tasks' | 'events'
  priority: number
  is_active: boolean
}

export interface Workflow {
  id: string
  name: string
  description?: string
  workflow_type: string
  clickup_space_id: string
  leads_list_id?: string
  opportunities_list_id?: string
  tasks_list_id?: string
  events_list_id?: string
  is_active: boolean
  priority_rank: number
}

export interface WorkflowRoutingResult {
  workflow: Workflow
  target_list_id: string
  target_list_type: 'leads' | 'opportunities' | 'tasks' | 'events'
  pattern_match: WorkflowPattern
  confidence: number
  extraction: {
    primary_entity?: string
    company?: string
    contact_name?: string
    opportunity_name?: string
    action_type?: string
    timing?: string
  }
}

export class WorkflowRouter {
  private patterns: WorkflowPattern[] = []
  private workflows: Workflow[] = []

  constructor(patterns: WorkflowPattern[], workflows: Workflow[]) {
    this.patterns = patterns.filter(p => p.is_active).sort((a, b) => a.priority - b.priority)
    this.workflows = workflows.filter(w => w.is_active).sort((a, b) => a.priority_rank - b.priority_rank)
  }

  // Simple deterministic routing based on keyword matching
  routeMessage(message: string): WorkflowRoutingResult | null {
    const normalizedMessage = message.toLowerCase().trim()
    
    // Try to find active Sales/CRM workflow
    const salesWorkflow = this.workflows.find(w => w.workflow_type === 'sales_crm')
    if (!salesWorkflow) {
      return null
    }

    // Extract entities from message
    const extraction = this.extractEntities(normalizedMessage)
    
    // Find matching pattern by priority order
    for (const pattern of this.patterns) {
      if (pattern.workflow_id && pattern.workflow_id !== salesWorkflow.id) continue
      
      const match = this.matchesPattern(normalizedMessage, pattern, extraction)
      if (match) {
        const targetListId = this.getListIdForType(salesWorkflow, pattern.target_list_type)
        if (!targetListId) {
          console.warn(`No list ID configured for type: ${pattern.target_list_type}`)
          continue
        }

        return {
          workflow: salesWorkflow,
          target_list_id: targetListId,
          target_list_type: pattern.target_list_type,
          pattern_match: pattern,
          confidence: this.calculateConfidence(normalizedMessage, pattern, extraction),
          extraction
        }
      }
    }

    return null
  }

  private extractEntities(message: string): Record<string, string> {
    const entities: Record<string, string> = {}
    
    // Extract contact names (simple pattern matching)
    const namePatterns = [
      /(?:contact|talk|spoke|called|met)\s+(?:with\s+)?([a-z][a-z\s]+)/gi,
      /(?:dan|guillermo|john|jane|mike|sarah)/gi,
      /(?:mr|mrs|ms)\.?\s*([a-z][a-z]+\s+[a-z][a-z]+)/gi
    ]
    
    for (const pattern of namePatterns) {
      const match = message.match(pattern)
      if (match && match[1]) {
        entities.contact_name = match[1].trim()
        break
      }
    }

    // Extract company names
    const companyPatterns = [
      /(?:at|@|from)\s+([a-z][a-z\s]*(?:restaurant|company|corp|inc|llc))/gi,
      /(?:la fountain|restaurant|cafe)/gi
    ]
    
    for (const pattern of companyPatterns) {
      const match = message.match(pattern)
      if (match && match[1]) {
        entities.company = match[1].trim()
        break
      }
    }

    // Extract timing
    const timingPatterns = [
      /(?:today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi,
      /(?:in\s+\d+\s+(?:hours?|days?|weeks?))/gi,
      /(?:couple\s+hours?\s+today)/gi
    ]
    
    for (const pattern of timingPatterns) {
      const match = message.match(pattern)
      if (match) {
        entities.timing = match[0].trim()
        break
      }
    }

    // Extract opportunity names
    const opportunityPatterns = [
      /(?:opportunity|deal|proposal)\s+(?:called|named|for)\s+([^,.]+)/gi,
      /la fountain/gi
    ]
    
    for (const pattern of opportunityPatterns) {
      const match = message.match(pattern)
      if (match && match[1]) {
        entities.opportunity_name = match[1].trim()
      } else if (match) {
        entities.opportunity_name = 'La Fountain'
      }
    }

    return entities
  }

  private matchesPattern(message: string, pattern: WorkflowPattern, entities: Record<string, string>): boolean {
    // Keyword matching
    if (pattern.keywords.length > 0) {
      const keywordMatch = pattern.keywords.some(keyword => 
        message.includes(keyword.toLowerCase())
      )
      if (keywordMatch) {
        return true
      }
    }

    // Regex pattern matching
    if (pattern.regex_pattern) {
      try {
        const regex = new RegExp(pattern.regex_pattern, 'gi')
        return regex.test(message)
      } catch (error) {
        console.warn(`Invalid regex pattern: ${pattern.regex_pattern}`, error)
      }
    }

    return false
  }

  private calculateConfidence(message: string, pattern: WorkflowPattern, entities: Record<string, string>): number {
    let confidence = 0.5 // Base confidence
    
    // Keyword matches increase confidence
    const keywordMatches = pattern.keywords.filter(keyword => 
      message.includes(keyword.toLowerCase())
    ).length
    
    if (pattern.keywords.length > 0) {
      confidence += (keywordMatches / pattern.keywords.length) * 0.3
    }

    // Entity matches increase confidence
    if (pattern.pattern_type === 'lead' && entities.contact_name) {
      confidence += 0.2
    }
    
    if (pattern.pattern_type === 'opportunity' && entities.company) {
      confidence += 0.2
    }
    
    if (pattern.pattern_type === 'event' && entities.timing) {
      confidence += 0.2
    }

    return Math.min(confidence, 1.0)
  }

  private getListIdForType(workflow: Workflow, listType: string): string | null {
    switch (listType) {
      case 'leads':
        return workflow.leads_list_id || null
      case 'opportunities':
        return workflow.opportunities_list_id || null
      case 'tasks':
        return workflow.tasks_list_id || null
      case 'events':
        return workflow.events_list_id || null
      default:
        return null
    }
  }

  // Check if workflow system is enabled for user
  static async isWorkflowSystemEnabled(supabase: any, userId: string): Promise<boolean> {
    try {
      const { data } = await supabase
        .from('feature_flags')
        .select('is_enabled')
        .eq('flag_name', 'workflow_system_enabled')
        .eq('user_id', userId)
        .single()
      
      return data?.is_enabled || false
    } catch (error) {
      console.error('Error checking workflow system flag:', error)
      return false // Default to legacy system on error
    }
  }

  // Load workflow configuration for user
  static async loadWorkflowConfig(supabase: any, userId: string): Promise<{
    patterns: WorkflowPattern[]
    workflows: Workflow[]
  }> {
    try {
      const [patternsResult, workflowsResult] = await Promise.all([
        supabase
          .from('workflow_patterns')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('priority', { ascending: true }),
        
        supabase
          .from('workflows')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('priority_rank', { ascending: true })
      ])

      return {
        patterns: patternsResult.data || [],
        workflows: workflowsResult.data || []
      }
    } catch (error) {
      console.error('Error loading workflow config:', error)
      return { patterns: [], workflows: [] }
    }
  }
}
