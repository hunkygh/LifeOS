-- Create workflow-based structure for Sales/CRM proof-of-concept
-- This migration preserves existing life_areas data for backwards compatibility

-- Create workflows table for Sales/CRM workflow
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  workflow_type TEXT NOT NULL DEFAULT 'sales_crm', -- sales_crm, health, finance, etc.
  clickup_space_id TEXT NOT NULL,
  leads_list_id TEXT,
  opportunities_list_id TEXT,
  tasks_list_id TEXT,
  events_list_id TEXT,
  is_active BOOLEAN DEFAULT true,
  priority_rank INTEGER DEFAULT 1,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create deterministic routing patterns table
CREATE TABLE IF NOT EXISTS workflow_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  pattern_type TEXT NOT NULL, -- 'lead', 'opportunity', 'task', 'event'
  keywords TEXT[] DEFAULT '{}',
  regex_pattern TEXT,
  target_list_type TEXT NOT NULL, -- 'leads', 'opportunities', 'tasks', 'events'
  priority INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create task relationships table for ClickUp Custom Relationships
CREATE TABLE IF NOT EXISTS task_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_task_id TEXT NOT NULL, -- ClickUp task ID
  target_task_id TEXT NOT NULL, -- ClickUp task ID
  relationship_type TEXT NOT NULL, -- 'related_to', 'parent_of', 'blocks', 'depends_on'
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS on new tables
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_relationships ENABLE ROW LEVEL SECURITY;

-- RLS policies for workflows
CREATE POLICY "Users can view their own workflows" ON workflows
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own workflows" ON workflows
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own workflows" ON workflows
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own workflows" ON workflows
  FOR DELETE USING (user_id = auth.uid());

-- RLS policies for workflow_patterns
CREATE POLICY "Users can view their own workflow patterns" ON workflow_patterns
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own workflow patterns" ON workflow_patterns
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own workflow patterns" ON workflow_patterns
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own workflow patterns" ON workflow_patterns
  FOR DELETE USING (user_id = auth.uid());

-- RLS policies for task_relationships
CREATE POLICY "Users can view their own task relationships" ON task_relationships
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own task relationships" ON task_relationships
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own task relationships" ON task_relationships
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own task relationships" ON task_relationships
  FOR DELETE USING (user_id = auth.uid());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_workflows_type ON workflows(workflow_type);
CREATE INDEX IF NOT EXISTS idx_workflows_active ON workflows(is_active);
CREATE INDEX IF NOT EXISTS idx_workflow_patterns_user_id ON workflow_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_patterns_workflow_id ON workflow_patterns(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_patterns_type ON workflow_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_task_relationships_user_id ON task_relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_task_relationships_source_task ON task_relationships(source_task_id);
CREATE INDEX IF NOT EXISTS idx_task_relationships_workflow_id ON task_relationships(workflow_id);

-- Insert default Sales/CRM workflow patterns
-- These will be used for deterministic routing
INSERT INTO workflow_patterns (workflow_id, pattern_type, keywords, target_list_type, priority, user_id) 
SELECT 
  w.id,
  'lead',
  ARRAY['lead', 'prospect', 'contact', 'new client', 'potential customer', 'dan', 'guillermo'],
  'leads',
  1,
  w.user_id
FROM workflows w 
WHERE w.workflow_type = 'sales_crm' AND w.is_active = true
ON CONFLICT DO NOTHING;

INSERT INTO workflow_patterns (workflow_id, pattern_type, keywords, target_list_type, priority, user_id) 
SELECT 
  w.id,
  'opportunity',
  ARRAY['opportunity', 'qualified lead', 'deal', 'proposal', 'signature', 'la fountain'],
  'opportunities',
  2,
  w.user_id
FROM workflows w 
WHERE w.workflow_type = 'sales_crm' AND w.is_active = true
ON CONFLICT DO NOTHING;

INSERT INTO workflow_patterns (workflow_id, pattern_type, keywords, target_list_type, priority, user_id) 
SELECT 
  w.id,
  'task',
  ARRAY['follow up', 'call', 'email', 'task', 'action', 'to do', 'followup'],
  'tasks',
  3,
  w.user_id
FROM workflows w 
WHERE w.workflow_type = 'sales_crm' AND w.is_active = true
ON CONFLICT DO NOTHING;

INSERT INTO workflow_patterns (workflow_id, pattern_type, keywords, target_list_type, priority, user_id) 
SELECT 
  w.id,
  'event',
  ARRAY['meeting', 'call', 'appointment', 'demo', 'schedule', 'calendar'],
  'events',
  4,
  w.user_id
FROM workflows w 
WHERE w.workflow_type = 'sales_crm' AND w.is_active = true
ON CONFLICT DO NOTHING;
