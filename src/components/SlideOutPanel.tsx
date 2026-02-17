import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, Plus, Edit2, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { supabase } from "../integrations/supabase/client";

interface LifeArea {
  id: string;
  name: string;
  context: string | null;
  instructions: string | null;
  goals: string[];
  clickup_space_id: string | null;
  default_list_ids: string[] | null;
}

interface SlideOutPanelProps {
  isOpen: boolean;
  onClose: () => void;
  type: "settings" | "receipts";
  position: "left" | "right";
}

const SlideOutPanel = ({ isOpen, onClose, type, position }: SlideOutPanelProps) => {
  const [lifeAreas, setLifeAreas] = useState<LifeArea[]>([]);
  const [isAddingArea, setIsAddingArea] = useState(false);
  const [editingArea, setEditingArea] = useState<LifeArea | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLifeAreas = async () => {
    try {
      const { data, error } = await supabase
        .from('life_areas')
        .select('*')
        .order('metadata->>priority', { ascending: true });

      if (error) throw error;
      setLifeAreas((data || []).map(area => ({
        ...area,
        goals: (Array.isArray(area.goals) ? area.goals.filter(g => typeof g === 'string') : []) as string[]
      })));
    } catch (error) {
      console.error('Error fetching life areas:', error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      fetchLifeAreas();
    }
  }, [isOpen]);

  const saveLifeArea = async (areaData: Partial<LifeArea>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (editingArea) {
        // Update existing area
        const { error } = await supabase
          .from('life_areas')
          .update({
            ...areaData,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingArea.id);

        if (error) throw error;
      } else {
        // Create new area
        const { error } = await supabase
          .from('life_areas')
          .insert({
            name: areaData.name || '',
            context: areaData.context || null,
            instructions: areaData.instructions || null,
            goals: areaData.goals || [],
            clickup_space_id: areaData.clickup_space_id || null,
            default_list_ids: areaData.default_list_ids || null,
            user_id: user.id,
            metadata: { priority: lifeAreas.length + 1 }
          });

        if (error) throw error;
      }

      await fetchLifeAreas();
      setIsAddingArea(false);
      setEditingArea(null);
    } catch (error) {
      console.error('Error saving life area:', error);
    }
  };

  const deleteLifeArea = async (id: string) => {
    try {
      const { error } = await supabase
        .from('life_areas')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchLifeAreas();
    } catch (error) {
      console.error('Error deleting life area:', error);
    }
  };

  const panelContent = () => {
    if (type === "receipts") {
      return (
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4">Receipts</h2>
          <p className="text-gray-600">Receipt management coming soon...</p>
        </div>
      );
    }

    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Life Areas</h2>
          <Button
            onClick={() => {
              setEditingArea({
                id: '',
                name: '',
                context: '',
                instructions: '',
                goals: [],
                clickup_space_id: null,
                default_list_ids: null
              });
              setIsAddingArea(true);
            }}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Area
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : isAddingArea || editingArea ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={editingArea?.name || ''}
                onChange={(e) => setEditingArea(prev => prev ? { ...prev, name: e.target.value } : null)}
                placeholder="e.g., Work, Health & Fitness"
              />
            </div>
            <div>
              <Label htmlFor="context">Context</Label>
              <textarea
                id="context"
                value={editingArea?.context || ''}
                onChange={(e) => setEditingArea(prev => prev ? { ...prev, context: e.target.value } : null)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Describe the purpose and scope of this life area..."
              />
            </div>
            <div>
              <Label htmlFor="instructions">Instructions for AI</Label>
              <textarea
                id="instructions"
                value={editingArea?.instructions || ''}
                onChange={(e) => setEditingArea(prev => prev ? { ...prev, instructions: e.target.value } : null)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Provide specific instructions for how the AI should handle this area..."
              />
            </div>
            <div>
              <Label htmlFor="clickup_space_id">ClickUp Space ID</Label>
              <Input
                id="clickup_space_id"
                value={editingArea?.clickup_space_id || ''}
                onChange={(e) => setEditingArea(prev => prev ? { ...prev, clickup_space_id: e.target.value } : null)}
                placeholder="e.g., 123456789"
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={() => saveLifeArea(editingArea)}>
                {editingArea?.id ? 'Update' : 'Create'}
              </Button>
              <Button variant="outline" onClick={() => {
                setIsAddingArea(false);
                setEditingArea(null);
              }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {lifeAreas.map((area) => (
              <div key={area.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-2">{area.name}</h3>
                    {area.context && (
                      <p className="text-sm text-gray-600 mb-2">{area.context}</p>
                    )}
                    {area.clickup_space_id && (
                      <p className="text-xs text-gray-500">ClickUp: {area.clickup_space_id}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingArea(area)}
                    >
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteLifeArea(area.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={onClose}
          />
          
          {/* Slide-out Panel */}
          <motion.div
            initial={{ x: position === "left" ? -400 : 400 }}
            animate={{ x: 0 }}
            exit={{ x: position === "left" ? -400 : 400 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className={`fixed top-0 ${position === "left" ? "left-0" : "right-0"} h-full w-96 bg-white shadow-2xl z-50 overflow-y-auto`}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h1 className="text-lg font-semibold capitalize">{type}</h1>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="p-2"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            {/* Content */}
            {panelContent()}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SlideOutPanel;
