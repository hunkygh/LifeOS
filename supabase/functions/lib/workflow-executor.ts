// Workflow execution engine for ClickUp integration
// Handles task creation and relationship management

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface TaskRelationship {
  source_task_id: string
  target_task_id: string
  relationship_type: 'related_to' | 'parent_of' | 'blocks' | 'depends_on'
}

export interface WorkflowExecution {
  workflow_id: string
  target_list_id: string
  target_list_type: 'leads' | 'opportunities' | 'tasks' | 'events'
  task_data: {
    name: string
    description?: string
    assignees?: string[]
    priority?: string
    due_date?: string
    status?: string
  }
  relationships?: TaskRelationship[]
}

export interface ExecutionResult {
  success: boolean
  task_id?: string
  task_url?: string
  error?: string
  relationships_created?: number
}

export class WorkflowExecutor {
  private supabase: any
  private clickupApiKey: string
  private clickupBase = 'https://api.clickup.com/api/v2'

  constructor(supabase: any, clickupApiKey: string) {
    this.supabase = supabase
    this.clickupApiKey = clickupApiKey
  }

  // Execute workflow by creating task and relationships
  async execute(execution: WorkflowExecution): Promise<ExecutionResult> {
    try {
      // Step 1: Create the main task
      const taskResult = await this.createClickUpTask(execution)
      
      if (!taskResult.success) {
        return taskResult
      }

      // Step 2: Create relationships if specified
      let relationshipsCreated = 0
      if (execution.relationships && execution.relationships.length > 0) {
        for (const relationship of execution.relationships) {
          const relResult = await this.createTaskRelationship(
            taskResult.task_id!,
            relationship
          )
          if (relResult.success) {
            relationshipsCreated++
          }
        }
      }

      // Step 3: Log execution for analytics
      await this.logExecution(execution, {
        ...taskResult,
        relationships_created: relationshipsCreated
      })

      return {
        success: true,
        task_id: taskResult.task_id,
        task_url: taskResult.task_url,
        relationships_created: relationshipsCreated
      }

    } catch (error) {
      console.error('Workflow execution failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  // Create task in ClickUp API
  private async createClickUpTask(execution: WorkflowExecution): Promise<ExecutionResult> {
    try {
      const payload = {
        name: execution.task_data.name,
        description: execution.task_data.description || '',
        assignees: execution.task_data.assignees || [],
        priority: execution.task_data.priority || 'normal',
        due_date: execution.task_data.due_date || null,
        status: execution.task_data.status || 'to do'
      }

      const response = await fetch(`${this.clickupBase}/list/${execution.target_list_id}/task`, {
        method: 'POST',
        headers: {
          'Authorization': this.clickupApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`ClickUp API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      
      return {
        success: true,
        task_id: data.id,
        task_url: `https://app.clickup.com/${execution.target_list_id}/t/${data.id}`
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  // Create task relationship using ClickUp Custom Relationships API
  private async createTaskRelationship(
    sourceTaskId: string, 
    relationship: TaskRelationship
  ): Promise<ExecutionResult> {
    try {
      // Try to use ClickUp's Custom Relationships API first
      const payload = {
        type: relationship.relationship_type,
        relates_to: relationship.target_task_id
      }

      const response = await fetch(`${this.clickupBase}/task/${sourceTaskId}/relationship`, {
        method: 'POST',
        headers: {
          'Authorization': this.clickupApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        return { success: true }
      }

      // Fallback: store relationship in our database if ClickUp API fails
      const { error } = await this.supabase
        .from('task_relationships')
        .insert({
          source_task_id: sourceTaskId,
          target_task_id: relationship.target_task_id,
          relationship_type: relationship.relationship_type,
          user_id: (await this.supabase.auth.getUser()).data.user?.id
        })

      if (error) {
        throw new Error(`Failed to create relationship: ${error.message}`)
      }

      return { success: true }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  // Log execution for analytics and debugging
  private async logExecution(
    execution: WorkflowExecution,
    result: ExecutionResult
  ): Promise<void> {
    try {
      await this.supabase
        .from('workflow_executions')
        .insert({
          workflow_id: execution.workflow_id,
          target_list_id: execution.target_list_id,
          target_list_type: execution.target_list_type,
          task_data: execution.task_data,
          execution_result: result,
          user_id: (await this.supabase.auth.getUser()).data.user?.id,
          created_at: new Date().toISOString()
        })
    } catch (error) {
      console.error('Failed to log execution:', error)
    }
  }

  // Build execution plan from routing result and user input
  static buildExecutionPlan(
    routingResult: any,
    userInput: string,
    formData?: Record<string, any>
  ): WorkflowExecution {
    const { target_list_id, target_list_type, pattern_match, extraction } = routingResult
    
    let taskData: any = {
      name: '',
      description: userInput
    }

    // Customize based on pattern type
    switch (pattern_match.pattern_type) {
      case 'lead':
        taskData = {
          name: `Lead: ${extraction.contact_name || formData?.lead_name || 'New Contact'}`,
          description: `Lead from ${extraction.company || 'unknown company'}`,
          priority: 'high'
        }
        break
        
      case 'opportunity':
        taskData = {
          name: `Opportunity: ${extraction.opportunity_name || formData?.opportunity_name || 'New Opportunity'}`,
          description: `Business opportunity for ${extraction.company || 'prospect'}`,
          priority: 'high'
        }
        break
        
      case 'task':
        taskData = {
          name: `Task: ${extraction.action_type || 'Follow up'}`,
          description: userInput,
          priority: 'normal'
        }
        break
        
      case 'event':
        taskData = {
          name: `Event: ${extraction.action_type || 'Meeting'}`,
          description: userInput,
          priority: 'normal',
          due_date: extraction.timing || formData?.timing || null
        }
        break
    }

    // Override with form data if provided
    if (formData) {
      Object.assign(taskData, formData)
    }

    // Build relationships for complex scenarios
    const relationships: TaskRelationship[] = []
    
    // Example: Lead -> Opportunity relationship
    if (pattern_match.pattern_type === 'lead' && extraction.company) {
      // This would be created when opportunity is added later
      relationships.push({
        source_task_id: '', // Will be filled after task creation
        target_task_id: '', // Will be filled when opportunity is created
        relationship_type: 'related_to'
      })
    }

    // Example: Task -> Lead relationship
    if (pattern_match.pattern_type === 'task' && extraction.contact_name) {
      relationships.push({
        source_task_id: '', // Current task
        target_task_id: '', // Lead task (should exist)
        relationship_type: 'related_to'
      })
    }

    return {
      workflow_id: routingResult.workflow.id,
      target_list_id,
      target_list_type,
      task_data: taskData,
      relationships: relationships.length > 0 ? relationships : undefined
    }
  }

  // Get existing tasks for relationship linking
  async findExistingTasks(
    listId: string,
    searchTerm: string
  ): Promise<any[]> {
    try {
      const response = await fetch(`${this.clickupBase}/list/${listId}/task`, {
        headers: {
          'Authorization': this.clickupApiKey
        }
      })

      if (!response.ok) {
        return []
      }

      const data = await response.json()
      const tasks = data.tasks || []
      
      // Simple text matching for now
      return tasks.filter((task: any) => 
        task.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.description.toLowerCase().includes(searchTerm.toLowerCase())
      )

    } catch (error) {
      console.error('Error finding existing tasks:', error)
      return []
    }
  }
}
