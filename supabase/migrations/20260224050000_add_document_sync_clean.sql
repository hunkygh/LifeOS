-- Add document sync tracking and recommendations tables
-- Enables intelligent document organization and movement tracking

-- Document sync operations tracking
CREATE TABLE IF NOT EXISTS document_sync_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type TEXT NOT NULL CHECK (operation_type IN ('analysis', 'movement', 'rollback')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  documents_analyzed INTEGER DEFAULT 0,
  documents_moved INTEGER DEFAULT 0,
  documents_failed INTEGER DEFAULT 0,
  error_details JSONB DEFAULT '{}'::jsonb,
  execution_time_ms INTEGER,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Document placement recommendations
CREATE TABLE IF NOT EXISTS document_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id TEXT NOT NULL, -- ClickUp task/document ID
  document_title TEXT,
  current_space_id TEXT,
  current_list_id TEXT,
  current_space_name TEXT,
  current_list_name TEXT,
  recommended_space_id TEXT,
  recommended_list_id TEXT,
  recommended_space_name TEXT,
  recommended_list_name TEXT,
  confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  reasoning TEXT,
  content_type TEXT,
  keywords TEXT[] DEFAULT '{}',
  entities JSONB DEFAULT '{}'::jsonb,
  user_approved BOOLEAN DEFAULT FALSE,
  moved BOOLEAN DEFAULT FALSE,
  move_error TEXT,
  sync_operation_id UUID REFERENCES document_sync_operations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document movement history
CREATE TABLE IF NOT EXISTS document_movement_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id TEXT NOT NULL,
  document_title TEXT,
  from_space_id TEXT,
  from_list_id TEXT,
  from_space_name TEXT,
  from_list_name TEXT,
  to_space_id TEXT,
  to_list_id TEXT,
  to_space_name TEXT,
  to_list_name TEXT,
  movement_reason TEXT,
  sync_operation_id UUID REFERENCES document_sync_operations(id) ON DELETE CASCADE,
  user_initiated BOOLEAN DEFAULT FALSE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on new tables
ALTER TABLE document_sync_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_movement_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for document_sync_operations
CREATE POLICY "Users can view their own sync operations" ON document_sync_operations
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own sync operations" ON document_sync_operations
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own sync operations" ON document_sync_operations
  FOR UPDATE USING (user_id = auth.uid());

-- RLS policies for document_recommendations
CREATE POLICY "Users can view their own document recommendations" ON document_recommendations
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own document recommendations" ON document_recommendations
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own document recommendations" ON document_recommendations
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own document recommendations" ON document_recommendations
  FOR DELETE USING (user_id = auth.uid());

-- RLS policies for document_movement_history
CREATE POLICY "Users can view their own document movement history" ON document_movement_history
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own document movement history" ON document_movement_history
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_sync_operations_user_id ON document_sync_operations(user_id);
CREATE INDEX IF NOT EXISTS idx_document_sync_operations_status ON document_sync_operations(status);
CREATE INDEX IF NOT EXISTS idx_document_sync_operations_created_at ON document_sync_operations(created_at);

CREATE INDEX IF NOT EXISTS idx_document_recommendations_user_id ON document_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_document_recommendations_document_id ON document_recommendations(document_id);
CREATE INDEX IF NOT EXISTS idx_document_recommendations_confidence ON document_recommendations(confidence_score);
CREATE INDEX IF NOT EXISTS idx_document_recommendations_user_approved ON document_recommendations(user_approved);
CREATE INDEX IF NOT EXISTS idx_document_recommendations_moved ON document_recommendations(moved);
CREATE INDEX IF NOT EXISTS idx_document_recommendations_sync_operation_id ON document_recommendations(sync_operation_id);

CREATE INDEX IF NOT EXISTS idx_document_movement_history_user_id ON document_movement_history(user_id);
CREATE INDEX IF NOT EXISTS idx_document_movement_history_document_id ON document_movement_history(document_id);
CREATE INDEX IF NOT EXISTS idx_document_movement_history_created_at ON document_movement_history(created_at);
CREATE INDEX IF NOT EXISTS idx_document_movement_history_sync_operation_id ON document_movement_history(sync_operation_id);

-- Add helpful functions for document sync management

-- Function to get pending recommendations for a user
CREATE OR REPLACE FUNCTION get_pending_document_recommendations(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  document_id TEXT,
  document_title TEXT,
  current_space_name TEXT,
  current_list_name TEXT,
  recommended_space_name TEXT,
  recommended_list_name TEXT,
  confidence_score DECIMAL(3,2),
  reasoning TEXT,
  content_type TEXT,
  keywords TEXT[],
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dr.id,
    dr.document_id,
    dr.document_title,
    dr.current_space_name,
    dr.current_list_name,
    dr.recommended_space_name,
    dr.recommended_list_name,
    dr.confidence_score,
    dr.reasoning,
    dr.content_type,
    dr.keywords,
    dr.created_at
  FROM document_recommendations dr
  WHERE dr.user_id = p_user_id
    AND dr.user_approved = FALSE
    AND dr.moved = FALSE
    AND dr.confidence_score >= 0.7
  ORDER BY dr.confidence_score DESC, dr.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get sync operation summary
CREATE OR REPLACE FUNCTION get_sync_operation_summary(p_operation_id UUID)
RETURNS TABLE (
  operation_type TEXT,
  status TEXT,
  documents_analyzed INTEGER,
  documents_moved INTEGER,
  documents_failed INTEGER,
  execution_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dso.operation_type,
    dso.status,
    dso.documents_analyzed,
    dso.documents_moved,
    dso.documents_failed,
    dso.execution_time_ms,
    dso.created_at,
    dso.completed_at
  FROM document_sync_operations dso
  WHERE dso.id = p_operation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup old recommendations (keep only last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_recommendations(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM document_recommendations 
  WHERE user_id = p_user_id 
    AND created_at < NOW() - INTERVAL '30 days'
    AND user_approved = FALSE
    AND moved = FALSE;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_document_recommendations_updated_at
  BEFORE UPDATE ON document_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
