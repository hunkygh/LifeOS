import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, Plus, Edit2, Trash2, List, ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { supabase } from "../integrations/supabase/client";

interface ClickUpList {
  id: string;
  clickup_list_id: string;
  title: string;
  context: string | null;
  instructions: string | null;
  goals: string[];
  life_area_id: string | null;
}

interface LifeArea {
  id: string;
  name: string;
  context: string | null;
  instructions: string | null;
  goals: string[];
  clickup_space_id: string | null;
  clickup_lists: ClickUpList[];
}

interface SlideOutPanelProps {
  isOpen: boolean;
  onClose: () => void;
  type: "settings" | "receipts";
  position: "left" | "right";
}

const SlideOutPanel = ({ isOpen, onClose, type, position }: SlideOutPanelProps) => {
  const [lifeAreas, setLifeAreas] = useState<LifeArea[]>([]);
  const [selectedArea, setSelectedArea] = useState<LifeArea | null>(null);
  const [isAddingArea, setIsAddingArea] = useState(false);
  const [isAddingList, setIsAddingList] = useState(false);
  const [editingList, setEditingList] = useState<ClickUpList | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLifeAreas = async () => {
    try {
      const { data, error } = await supabase
        .from('life_areas')
        .select(`
          *,
          clickup_lists (
            id,
            clickup_list_id,
            title,
            context,
            instructions,
            goals,
            life_area_id
          )
        `)
        .order('metadata->>priority', { ascending: true });

      if (error) throw error;
      setLifeAreas(data || []);
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

      if (selectedArea) {
        // Update existing area
        const { error } = await supabase
          .from('life_areas')
          .update({
            ...areaData,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedArea.id);

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
            user_id: user.id,
            metadata: { priority: lifeAreas.length + 1 }
          });

        if (error) throw error;
      }

      await fetchLifeAreas();
      setIsAddingArea(false);
      setSelectedArea(null);
    } catch (error) {
      console.error('Error saving life area:', error);
    }
  };

  const saveClickUpList = async (listData: Partial<ClickUpList>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !selectedArea) throw new Error('User or area not authenticated');

      if (editingList) {
        // Update existing list
        const { error } = await supabase
          .from('clickup_lists')
          .update({
            ...listData,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingList.id);

        if (error) throw error;
      } else {
        // Create new list
        const { error } = await supabase
          .from('clickup_lists')
          .insert({
            clickup_list_id: listData.clickup_list_id || '',
            title: listData.title || '',
            context: listData.context || null,
            instructions: listData.instructions || null,
            goals: listData.goals || [],
            life_area_id: selectedArea.id,
            user_id: user.id
          });

        if (error) throw error;
      }

      await fetchLifeAreas();
      setIsAddingList(false);
      setEditingList(null);
    } catch (error) {
      console.error('Error saving ClickUp list:', error);
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

  const deleteClickUpList = async (id: string) => {
    try {
      const { error } = await supabase
        .from('clickup_lists')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchLifeAreas();
    } catch (error) {
      console.error('Error deleting ClickUp list:', error);
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
        {selectedArea ? (
          <div className="space-y-6">
            {/* Area Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedArea(null)}
                  className="mb-4"
                >
                  <ArrowRight className="w-4 h-4 rotate-180" />
                  Back to Areas
                </Button>
                <h2 className="text-2xl font-bold">{selectedArea.name}</h2>
              </div>
              <Button
                onClick={() => {
                  setIsAddingArea(true);
                  setSelectedArea({
                    id: '',
                    name: '',
                    context: '',
                    instructions: '',
                    goals: [],
                    clickup_space_id: null,
                    clickup_lists: []
                  });
                }}
                className="flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Area
              </Button>
            </div>

            {/* Area Configuration */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Area Name</Label>
                <Input
                  id="name"
                  value={selectedArea.name || ''}
                  onChange={(e) => setSelectedArea(prev => prev ? { ...prev, name: e.target.value } : null)}
                  placeholder="e.g., Work, Health & Fitness"
                  disabled={!isAddingArea}
                />
              </div>
              <div>
                <Label htmlFor="context">Area Context</Label>
                <textarea
                  id="context"
                  value={selectedArea.context || ''}
                  onChange={(e) => setSelectedArea(prev => prev ? { ...prev, context: e.target.value } : null)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe the purpose and scope of this life area..."
                  disabled={!isAddingArea}
                />
              </div>
              <div>
                <Label htmlFor="instructions">Instructions for AI</Label>
                <textarea
                  id="instructions"
                  value={selectedArea.instructions || ''}
                  onChange={(e) => setSelectedArea(prev => prev ? { ...prev, instructions: e.target.value } : null)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Provide specific instructions for how the AI should handle this area..."
                  disabled={!isAddingArea}
                />
              </div>
              <div>
                <Label htmlFor="clickup_space_id">ClickUp Space ID</Label>
                <Input
                  id="clickup_space_id"
                  value={selectedArea.clickup_space_id || ''}
                  onChange={(e) => setSelectedArea(prev => prev ? { ...prev, clickup_space_id: e.target.value } : null)}
                  placeholder="e.g., 123456789"
                  disabled={!isAddingArea}
                />
              </div>
              {isAddingArea && (
                <div className="flex gap-2 pt-4">
                  <Button onClick={() => saveLifeArea(selectedArea)}>
                    {selectedArea.id ? 'Update' : 'Create'}
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setIsAddingArea(false);
                    setSelectedArea(null);
                  }}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            {/* Lists Section */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">ClickUp Lists</h3>
                <Button
                  onClick={() => {
                    setEditingList({
                      id: '',
                      clickup_list_id: '',
                      title: '',
                      context: '',
                      instructions: '',
                      goals: [],
                      life_area_id: selectedArea.id
                    });
                    setIsAddingList(true);
                  }}
                  className="flex items-center gap-2"
                  size="sm"
                >
                  <Plus className="w-4 h-4" />
                  Add List
                </Button>
              </div>

              {selectedArea.clickup_lists && selectedArea.clickup_lists.length > 0 ? (
                <div className="space-y-3">
                  {selectedArea.clickup_lists.map((list) => (
                    <div key={list.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <List className="w-4 h-4 text-blue-500" />
                            <h4 className="font-semibold text-lg">{list.title}</h4>
                          </div>
                          {list.context && (
                            <p className="text-sm text-gray-600 mb-2">{list.context}</p>
                          )}
                          {list.instructions && (
                            <p className="text-sm text-gray-600 mb-2">{list.instructions}</p>
                          )}
                          <p className="text-xs text-gray-500">ClickUp List ID: {list.clickup_list_id}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingList(list)}
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteClickUpList(list.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <List className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p>No ClickUp lists configured yet</p>
                  <p className="text-sm">Add lists to organize your tasks within this area</p>
                </div>
              )}

              {/* List Editing Form */}
              {isAddingList && (
                <div className="border border-gray-200 rounded-lg p-4 mt-4">
                  <h4 className="font-semibold mb-4">
                    {editingList?.id ? 'Edit List' : 'Add List'}
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="list_title">List Title</Label>
                      <Input
                        id="list_title"
                        value={editingList?.title || ''}
                        onChange={(e) => setEditingList(prev => prev ? { ...prev, title: e.target.value } : null)}
                        placeholder="e.g., Development Tasks, Marketing Projects"
                      />
                    </div>
                    <div>
                      <Label htmlFor="list_clickup_id">ClickUp List ID</Label>
                      <Input
                        id="list_clickup_id"
                        value={editingList?.clickup_list_id || ''}
                        onChange={(e) => setEditingList(prev => prev ? { ...prev, clickup_list_id: e.target.value } : null)}
                        placeholder="e.g., 123456789"
                      />
                    </div>
                    <div>
                      <Label htmlFor="list_context">List Context</Label>
                      <textarea
                        id="list_context"
                        value={editingList?.context || ''}
                        onChange={(e) => setEditingList(prev => prev ? { ...prev, context: e.target.value } : null)}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Describe the purpose of this specific list..."
                      />
                    </div>
                    <div>
                      <Label htmlFor="list_instructions">Instructions for AI</Label>
                      <textarea
                        id="list_instructions"
                        value={editingList?.instructions || ''}
                        onChange={(e) => setEditingList(prev => prev ? { ...prev, instructions: e.target.value } : null)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Specific instructions for handling tasks in this list..."
                      />
                    </div>
                    <div className="flex gap-2 pt-4">
                      <Button onClick={() => saveClickUpList(editingList)}>
                        {editingList?.id ? 'Update' : 'Create'}
                      </Button>
                      <Button variant="outline" onClick={() => {
                        setIsAddingList(false);
                        setEditingList(null);
                      }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-2xl font-bold mb-4">Life Areas</h2>
            <p className="text-gray-600 mb-6">
              Configure your life areas to organize tasks and provide context for AI assistance.
            </p>
            {lifeAreas.map((area) => (
              <div key={area.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-2">{area.name}</h3>
                    {area.context && (
                      <p className="text-sm text-gray-600 mb-2">{area.context}</p>
                    )}
                    {area.clickup_space_id && (
                      <p className="text-xs text-gray-500">ClickUp Space: {area.clickup_space_id}</p>
                    )}
                    {area.clickup_lists && area.clickup_lists.length > 0 && (
                      <p className="text-xs text-gray-500">
                        {area.clickup_lists.length} lists configured
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedArea(area)}
                  >
                    Configure
                  </Button>
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
            className="fixed inset-0 bg-black bg-opacity-20 z-40"
            onClick={onClose}
          />
          
          {/* Slide-out Panel */}
          <motion.div
            initial={{ x: position === "left" ? -400 : 400 }}
            animate={{ x: 0 }}
            exit={{ x: position === "left" ? -400 : 400 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className={`fixed top-4 ${position === "left" ? "left-4" : "right-4"} h-[calc(100vh-2rem)] w-[480px] bg-white shadow-2xl z-50 overflow-y-auto rounded-2xl border border-gradient-subtle`}
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
