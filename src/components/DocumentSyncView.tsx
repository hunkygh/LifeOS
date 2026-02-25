import { useEffect, useMemo, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "./ui/button";
import { supabase } from "../integrations/supabase/client";
import { DEFAULT_USER_ID } from "../config/defaultUser";

interface DocumentRecommendation {
  id?: string;
  document_id: string;
  document_title: string;
  current_space_name: string;
  current_list_name: string;
  recommended_space_name: string;
  recommended_list_name: string;
  confidence_score: number;
  reasoning: string;
  created_at: string;
}

interface SpaceOption {
  clickup_space_id: string;
  name: string;
}

interface DocumentSyncViewProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSyncComplete?: () => void;
}

export default function DocumentSyncView({
  isOpen = false,
  onClose,
  onSyncComplete,
}: DocumentSyncViewProps) {
  const [recommendations, setRecommendations] = useState<DocumentRecommendation[]>([]);
  const [spaces, setSpaces] = useState<SpaceOption[]>([]);
  const [selectedSpaces, setSelectedSpaces] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const hasResults = recommendations.length > 0;

  useEffect(() => {
    if (!isOpen) return;
    const run = async () => {
      setErrorText(null);
      setRecommendations([]);
      setSelectedSpaces({});
      await Promise.all([loadSpaces(), startAnalysis()]);
    };
    run();
  }, [isOpen]);

  const loadSpaces = async () => {
    const { data, error } = await supabase
      .from("clickup_spaces")
      .select("clickup_space_id,name")
      .eq("user_id", DEFAULT_USER_ID)
      .order("name", { ascending: true });
    if (error) {
      console.error("Space load failed", error);
      return;
    }
    setSpaces(
      (data || [])
        .filter((row) => row.clickup_space_id)
        .map((row) => ({
          clickup_space_id: String(row.clickup_space_id),
          name: row.name || "Unnamed space",
        }))
    );
  };

  const startAnalysis = async () => {
    try {
      setIsLoading(true);
      const { data: result, error } = await supabase.functions.invoke("document-sync", {
        body: {
          operation_type: "analysis",
          userId: DEFAULT_USER_ID,
          analysis_options: {
            confidence_threshold: 0.7,
            days_to_analyze: 7,
          },
        },
      });
      if (error) throw error;
      if (!result?.success) {
        throw new Error(result?.error || "Document analysis failed");
      }
      const recs: DocumentRecommendation[] = result.recommendations || [];
      setRecommendations(recs);
      setSelectedSpaces(
        recs.reduce<Record<string, string>>((acc, rec) => {
          const match = spaces.find(
            (space) => space.name.toLowerCase() === rec.recommended_space_name?.toLowerCase()
          );
          acc[rec.document_id] = match?.clickup_space_id || "";
          return acc;
        }, {})
      );
      onSyncComplete?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to analyze documents";
      setErrorText(message);
      console.error("Document sync analysis error", error);
    } finally {
      setIsLoading(false);
    }
  };

  const summaryText = useMemo(() => {
    if (isLoading) return "Analyzing recently added documents…";
    if (errorText) return errorText;
    if (!hasResults) return "No documents need relocation.";
    return `${recommendations.length} documents need destination review.`;
  }, [isLoading, errorText, hasResults, recommendations.length]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-x-0 bottom-24 md:bottom-28 z-40 px-3 md:px-4">
      <div className="mx-auto w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white/95 p-4 md:p-5 shadow-[0_10px_30px_rgba(15,15,15,0.12)]">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-600">Document Sync</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close document sync card"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 text-sm text-slate-700">{summaryText}</div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Working…
          </div>
        )}

        {!isLoading && hasResults && (
          <div className="space-y-3">
            {recommendations.map((rec, index) => (
              <div
                key={rec.id || `${rec.document_id}-${rec.created_at}-${index}`}
                className="rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="text-sm font-medium text-slate-900">{rec.document_title}</div>
                <div className="mt-1 text-xs text-slate-500">
                  Current: {rec.current_space_name} / {rec.current_list_name}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Suggested: {rec.recommended_space_name} / {rec.recommended_list_name}
                </div>
                <div className="mt-2">
                  <label className="mb-1 block text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    Destination space
                  </label>
                  <select
                    value={selectedSpaces[rec.document_id] || ""}
                    onChange={(event) =>
                      setSelectedSpaces((prev) => ({
                        ...prev,
                        [rec.document_id]: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <option value="">Use suggested</option>
                    {spaces.map((space) => (
                      <option key={space.clickup_space_id} value={space.clickup_space_id}>
                        {space.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="rounded-full"
          >
            Close
          </Button>
          <Button
            size="sm"
            onClick={startAnalysis}
            disabled={isLoading}
            className="rounded-full bg-slate-900 text-white hover:bg-slate-800"
          >
            Re-run
          </Button>
        </div>
      </div>
    </div>
  );
}

