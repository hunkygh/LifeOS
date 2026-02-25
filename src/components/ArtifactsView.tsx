import { useState, useEffect } from "react";
import { Activity } from "lucide-react";
import { supabase } from "../integrations/supabase/client";
import { DEFAULT_USER_ID } from "../config/defaultUser";

interface ClickUpArtifact {
  id: string;
  reference_name: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'success' | 'failure';
  created_at: string;
  metadata?: Record<string, any>;
  response_payload?: Record<string, any>;
  summary_note?: string | null;
}

const ArtifactsView = () => {
  const [artifacts, setArtifacts] = useState<ClickUpArtifact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArtifacts = async () => {
      try {
        const userId = DEFAULT_USER_ID;

        const { data, error } = await supabase
          .from('clickup_artifacts')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setArtifacts(data || []);
      } catch (error) {
        console.error('Error fetching artifacts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchArtifacts();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
      case "success":
        return "bg-green-100 text-green-800";
      case "failed":
      case "failure":
        return "bg-red-100 text-red-800";
      case "processing":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const extractMetricSummary = (artifact: ClickUpArtifact) => {
    const updates = (artifact.response_payload as any)?.metric_updates;
    if (!Array.isArray(updates) || updates.length === 0) return null;
    return updates
      .slice(0, 3)
      .map((entry: any) => `${entry.metric}: ${entry.value}`)
      .join(" • ");
  };

  const extractPrioritySummary = (artifact: ClickUpArtifact) => {
    const updates = (artifact.response_payload as any)?.metric_updates;
    if (!Array.isArray(updates) || updates.length === 0) return null;
    const critical = updates
      .map((entry: any) => {
        const metric = String(entry?.metric || "");
        const value = Number(entry?.value ?? 0);
        if (!metric || !Number.isFinite(value)) return null;
        if (metric.includes("daily") && value === 0) return `Priority: no completions today`;
        if (metric.includes("weekly") && value <= 1) return `Priority: weekly completions are low`;
        return null;
      })
      .find(Boolean);
    return critical || null;
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-6 pb-44 scrollbar-hide">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Action Logs</h1>
              <p className="text-xs text-muted-foreground">Recent AI actions and artifacts</p>
            </div>
          </div>
        </div>

        {/* Action Artifacts */}
        <div className="space-y-3">
          <div className="text-[10px] tracking-widest uppercase text-muted-foreground mb-4">
            Action artifacts
          </div>

          {loading ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">Loading artifacts...</p>
            </div>
          ) : artifacts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">No artifacts yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your action artifacts will appear here
              </p>
            </div>
          ) : (
            artifacts.map((artifact) => (
              <div key={artifact.id} className="glass-panel soft-lift rounded-[32px] p-8 mb-4 opacity-95">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-[10px] tracking-widest uppercase font-bold text-gray-400 mb-2">
                      {artifact.reference_name || "Action artifact"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(artifact.created_at).toLocaleDateString()}
                    </div>
                    {artifact.summary_note && (
                      <div className="mt-1 text-xs text-gray-500">{artifact.summary_note}</div>
                    )}
                    {extractMetricSummary(artifact) && (
                      <div className="mt-2 text-xs text-gray-600">{extractMetricSummary(artifact)}</div>
                    )}
                    {extractPrioritySummary(artifact) && (
                      <div className="mt-1 text-xs text-gray-500">{extractPrioritySummary(artifact)}</div>
                    )}
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(artifact.status)}`}>
                    {artifact.status}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ArtifactsView;
