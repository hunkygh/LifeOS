// Simple document sync component - shows inline card in chat instead of modal
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  RefreshCw, 
  CheckSquare, 
  Square, 
  ChevronDown, 
  ChevronRight, 
  AlertCircle, 
  CheckCircle,
  FileText,
  Clock,
  FolderOpen
} from "lucide-react";
import { Button } from "./ui/button";
import { supabase } from "../integrations/supabase/client";
import { DEFAULT_USER_ID } from "../config/defaultUser";

interface DocumentRecommendation {
  id: string;
  document_id: string;
  document_title: string;
  current_space_name: string;
  current_list_name: string;
  recommended_space_name: string;
  recommended_list_name: string;
  confidence_score: number;
  reasoning: string;
  content_type: string;
  keywords: string[];
  user_approved: boolean;
  moved: boolean;
  created_at: string;
}

interface DocumentSyncViewProps {
  onSyncComplete?: () => void;
}

export default function DocumentSyncView({ onSyncComplete }: DocumentSyncViewProps) {
  const [recommendations, setRecommendations] = useState<DocumentRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Auto-start analysis when component mounts
  useEffect(() => {
    startAnalysis();
  }, []);

  const startAnalysis = async () => {
    console.log('🔄 Starting document analysis...');
    
    try {
      setIsLoading(true);
      const { data: result, error } = await supabase.functions.invoke('document-sync', {
        body: {
          operation_type: 'analysis',
          userId: DEFAULT_USER_ID,
          analysis_options: {
            confidence_threshold: 0.7,
            days_to_analyze: 7
          }
        }
      });
      if (error) {
        throw error;
      }
      
      if (result.success) {
        setRecommendations(result.recommendations || []);
        setShowResults(true);
        onSyncComplete?.();
      } else {
        console.error('Analysis failed:', result.error);
      }
    } catch (error) {
      console.error('Error starting analysis:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const moveSelectedDocuments = async () => {
    // For now, just log the action
    console.log('Moving documents:', recommendations.length);
    // In a real implementation, this would call the movement endpoint
  };

  if (!showResults || recommendations.length === 0) {
    return null; // Don't render anything until analysis is complete
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-pink-gradient flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Document Organization Complete</h3>
              <p className="text-sm text-gray-600">
                Found {recommendations.length} documents that can be better organized
              </p>
            </div>
          </div>
          <Button 
            onClick={moveSelectedDocuments}
            className="bg-blue-pink-gradient text-white hover:opacity-90"
          >
            Move All Documents
          </Button>
        </div>

        <div className="space-y-3">
          {recommendations.slice(0, 5).map((rec, index) => (
            <div
              key={rec.id || `${rec.document_id}-${rec.created_at}-${index}`}
              className="border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{rec.document_title}</h4>
                  <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                    <span className="flex items-center gap-1">
                      <FolderOpen className="w-3 h-3" />
                      {rec.current_space_name} &gt; {rec.current_list_name}
                    </span>
                    <ChevronRight className="w-3 h-3" />
                    <span className="flex items-center gap-1 text-green-600">
                      <FolderOpen className="w-3 h-3" />
                      {rec.recommended_space_name} &gt; {rec.recommended_list_name}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Confidence: {Math.round(rec.confidence_score * 100)}%
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(rec.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
          
          {recommendations.length > 5 && (
            <div className="text-center pt-4">
              <p className="text-sm text-gray-600">
                ... and {recommendations.length - 5} more documents
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
