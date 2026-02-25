import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Settings, Briefcase, Users, Calendar, CheckSquare } from "lucide-react";
import { Button } from "./ui/button";
import { supabase } from "../integrations/supabase/client";
import { DEFAULT_USER_ID } from "../config/defaultUser";

interface Workflow {
  id: string;
  name: string;
  description?: string;
  workflow_type: string;
  clickup_space_id: string;
  leads_list_id?: string;
  opportunities_list_id?: string;
  tasks_list_id?: string;
  events_list_id?: string;
  is_active: boolean;
  priority_rank: number;
}

interface ClickUpList {
  id: string;
  clickup_list_id: string;
  title: string;
  space_id?: string;
}

interface WorkflowPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WorkflowPanel({ isOpen, onClose }: WorkflowPanelProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [lists, setLists] = useState<ClickUpList[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [workflowEnabled, setWorkflowEnabled] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      
      // Check if workflow system is enabled
      const { data: flagData } = await supabase
        .from('feature_flags')
        .select('is_enabled')
        .eq('flag_name', 'workflow_system_enabled')
        .eq('user_id', DEFAULT_USER_ID)
        .single();
      
      setWorkflowEnabled(flagData?.is_enabled || false);

      // Load workflows
      const { data: workflowData } = await supabase
        .from('workflows')
        .select('*')
        .eq('user_id', DEFAULT_USER_ID)
        .eq('is_active', true)
        .order('priority_rank', { ascending: true });
      
      setWorkflows(workflowData || []);

      // Load ClickUp lists for configuration
      const { data: listData } = await supabase
        .from('clickup_lists')
        .select('id, clickup_list_id, title, space_id')
        .eq('user_id', DEFAULT_USER_ID)
        .order('title', { ascending: true });
      
      setLists(listData || []);

      // Select first workflow by default
      if (workflowData && workflowData.length > 0) {
        setSelectedWorkflow(workflowData[0]);
      }

    } catch (error) {
      console.error('Error loading workflow data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveWorkflow = async () => {
    if (!selectedWorkflow) return;

    try {
      setIsSaving(true);
      
      const { error } = await supabase
        .from('workflows')
        .upsert({
          ...selectedWorkflow,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error saving workflow:', error);
      }

    } catch (error) {
      console.error('Error saving workflow:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleWorkflowSystem = async () => {
    try {
      const { error } = await supabase
        .from('feature_flags')
        .upsert({
          flag_name: 'workflow_system_enabled',
          is_enabled: !workflowEnabled,
          user_id: DEFAULT_USER_ID,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error toggling workflow system:', error);
      } else {
        setWorkflowEnabled(!workflowEnabled);
      }

    } catch (error) {
      console.error('Error toggling workflow system:', error);
    }
  };

  const updateWorkflowField = (field: keyof Workflow, value: any) => {
    if (!selectedWorkflow) return;
    
    setSelectedWorkflow({
      ...selectedWorkflow,
      [field]: value
    });
  };

  const getListsForSpace = (spaceId: string) => {
    return lists.filter(list => list.space_id === spaceId);
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl p-6 max-w-2xl w-full mx-4 border border-blue-pink-gradient-subtle">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-pink-gradient"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: -400 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -400 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="bg-white rounded-2xl p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto border border-blue-pink-gradient-subtle"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Briefcase className="h-5 w-5 text-blue-pink-gradient" />
                <h2 className="text-xl font-semibold">Workflow Configuration</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleWorkflowSystem}
                  className={`${
                    workflowEnabled 
                      ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' 
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {workflowEnabled ? 'Enabled' : 'Disabled'}
                </Button>
                <Button variant="ghost" size="sm" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Workflow System Status */}
            <div className={`p-4 rounded-lg mb-6 ${
              workflowEnabled 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-yellow-50 border border-yellow-200'
            }`}>
              <div className="flex items-center gap-2">
                <CheckSquare className={`h-4 w-4 ${workflowEnabled ? 'text-green-600' : 'text-yellow-600'}`} />
                <span className={`text-sm font-medium ${workflowEnabled ? 'text-green-700' : 'text-yellow-700'}`}>
                  {workflowEnabled 
                    ? 'Workflow system is enabled - using deterministic routing'
                    : 'Workflow system is disabled - using legacy life areas'
                  }
                </span>
              </div>
            </div>

            {/* Workflow Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Active Workflow</label>
              <select
                value={selectedWorkflow?.id || ''}
                onChange={(e) => {
                  const workflow = workflows.find(w => w.id === e.target.value);
                  setSelectedWorkflow(workflow || null);
                }}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-pink-gradient focus:border-transparent"
              >
                {workflows.map(workflow => (
                  <option key={workflow.id} value={workflow.id}>
                    {workflow.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Configuration */}
            {selectedWorkflow && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Leads List */}
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      <Users className="h-4 w-4" />
                      Leads List
                    </label>
                    <select
                      value={selectedWorkflow.leads_list_id || ''}
                      onChange={(e) => updateWorkflowField('leads_list_id', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-pink-gradient focus:border-transparent"
                    >
                      <option value="">Select Leads List</option>
                      {getListsForSpace(selectedWorkflow.clickup_space_id).map(list => (
                        <option key={list.id} value={list.clickup_list_id}>
                          {list.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Opportunities List */}
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      <Briefcase className="h-4 w-4" />
                      Opportunities List
                    </label>
                    <select
                      value={selectedWorkflow.opportunities_list_id || ''}
                      onChange={(e) => updateWorkflowField('opportunities_list_id', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-pink-gradient focus:border-transparent"
                    >
                      <option value="">Select Opportunities List</option>
                      {getListsForSpace(selectedWorkflow.clickup_space_id).map(list => (
                        <option key={list.id} value={list.clickup_list_id}>
                          {list.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Tasks List */}
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      <CheckSquare className="h-4 w-4" />
                      Tasks List
                    </label>
                    <select
                      value={selectedWorkflow.tasks_list_id || ''}
                      onChange={(e) => updateWorkflowField('tasks_list_id', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-pink-gradient focus:border-transparent"
                    >
                      <option value="">Select Tasks List</option>
                      {getListsForSpace(selectedWorkflow.clickup_space_id).map(list => (
                        <option key={list.id} value={list.clickup_list_id}>
                          {list.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Events List */}
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      <Calendar className="h-4 w-4" />
                      Events List
                    </label>
                    <select
                      value={selectedWorkflow.events_list_id || ''}
                      onChange={(e) => updateWorkflowField('events_list_id', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-pink-gradient focus:border-transparent"
                    >
                      <option value="">Select Events List</option>
                      {getListsForSpace(selectedWorkflow.clickup_space_id).map(list => (
                        <option key={list.id} value={list.clickup_list_id}>
                          {list.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={saveWorkflow}
                    disabled={isSaving}
                    className="bg-blue-pink-gradient text-white hover:opacity-90"
                  >
                    {isSaving ? 'Saving...' : 'Save Configuration'}
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
