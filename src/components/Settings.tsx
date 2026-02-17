import React, { useState, useEffect } from 'react';
import { supabase } from '../integrations/supabase/client';

interface LifeArea {
  id: string;
  name: string;
  context: string;
  goals: string[];
  instructions: string;
  clickup_space_id?: string;
  default_list_ids: string[];
  metadata: any;
}

const Settings: React.FC = () => {
  const [lifeAreas, setLifeAreas] = useState<LifeArea[]>([]);
  const [selectedArea, setSelectedArea] = useState<LifeArea | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLifeAreas();
  }, []);

  const initializeDefaultLifeAreas = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Call the database function to initialize default life areas
      const { error } = await supabase.rpc('initialize_user_life_areas', { 
        user_uuid: user.id 
      });

      if (error) throw error;
      
      // Refresh the life areas list
      await fetchLifeAreas();
    } catch (error) {
      console.error('Error initializing life areas:', error);
    }
  };

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
      if (data && data.length > 0) {
        setSelectedArea({
          ...data[0],
          goals: (Array.isArray(data[0].goals) ? data[0].goals.filter(g => typeof g === 'string') : []) as string[]
        });
      }
    } catch (error) {
      console.error('Error fetching life areas:', error);
    } finally {
      setLoading(false);
    }
  };

  const createDefaultLifeAreas = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const defaultAreas = [
        {
          name: 'General',
          context: 'General tasks and activities that don\'t fit into specific categories',
          goals: [],
          instructions: 'Handle general tasks and miscellaneous items that don\'t require specialized context',
          metadata: { is_default: true, priority: 1 },
          user_id: user.id
        },
        {
          name: 'Health & Fitness',
          context: 'Physical health, exercise routines, medical appointments, wellness activities',
          goals: [],
          instructions: 'Focus on maintaining physical health through regular exercise, proper nutrition, and preventive care',
          metadata: { is_default: true, priority: 2 },
          user_id: user.id
        },
        {
          name: 'Finance',
          context: 'Financial planning, budgeting, investments, bills, and financial goals',
          goals: [],
          instructions: 'Manage financial resources effectively, track expenses, and work toward financial stability',
          metadata: { is_default: true, priority: 3 },
          user_id: user.id
        },
        {
          name: 'Work - Global Payments',
          context: 'Professional responsibilities, projects, meetings, and career development at Global Payments',
          goals: [],
          instructions: 'Focus on work responsibilities, project deliverables, and professional growth',
          metadata: { is_default: true, priority: 4 },
          user_id: user.id
        },
        {
          name: 'Meal Planning',
          context: 'Meal preparation, grocery shopping, nutrition planning, and dietary goals',
          goals: [],
          instructions: 'Plan nutritious meals, manage grocery shopping, and maintain healthy eating habits',
          metadata: { is_default: true, priority: 5 },
          user_id: user.id
        },
        {
          name: 'Workouts',
          context: 'Exercise routines, fitness goals, training schedules, and workout planning',
          goals: [],
          instructions: 'Plan and execute effective workout routines to achieve fitness objectives',
          metadata: { is_default: true, priority: 6 },
          user_id: user.id
        }
      ];

      const { error } = await supabase
        .from('life_areas')
        .insert(defaultAreas);

      if (error) throw error;
      
      // Refresh the life areas list
      await fetchLifeAreas();
    } catch (error) {
      console.error('Error creating default life areas:', error);
    }
  };

  const updateLifeArea = async (updates: Partial<LifeArea>) => {
    if (!selectedArea) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('life_areas')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedArea.id);

      if (error) throw error;

      // Update local state
      setSelectedArea({ ...selectedArea, ...updates });
      setLifeAreas(prev => 
        prev.map(area => 
          area.id === selectedArea.id 
            ? { ...area, ...updates }
            : area
        )
      );
    } catch (error) {
      console.error('Error updating life area:', error);
    } finally {
      setSaving(false);
    }
  };

  const updateGoals = (newGoals: string[]) => {
    updateLifeArea({ goals: newGoals });
  };

  const addGoal = () => {
    if (!selectedArea) return;
    const newGoals = [...(selectedArea.goals || []), ''];
    updateGoals(newGoals);
  };

  const updateGoal = (index: number, value: string) => {
    if (!selectedArea) return;
    const newGoals = [...(selectedArea.goals || [])];
    newGoals[index] = value;
    updateGoals(newGoals);
  };

  const removeGoal = (index: number) => {
    if (!selectedArea) return;
    const newGoals = (selectedArea.goals || []).filter((_, i) => i !== index);
    updateGoals(newGoals);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Life Area Settings</h1>
        <p className="text-gray-600">
          Configure the context, goals, and instructions for each life area. This helps the AI provide more relevant and personalized assistance.
        </p>
      </div>

      {lifeAreas.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">No Life Areas Configured</h2>
          <p className="text-gray-600 mb-6">
            Get started by creating your default life areas. These will help organize your tasks and conversations.
          </p>
          <button
            onClick={createDefaultLifeAreas}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Default Life Areas
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Life Areas List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Categories</h2>
              <div className="space-y-2">
                {lifeAreas.map((area) => (
                  <button
                    key={area.id}
                    onClick={() => setSelectedArea(area)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedArea?.id === area.id
                        ? 'bg-blue-50 border border-blue-200'
                        : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <div className="font-medium text-gray-900">{area.name}</div>
                    {area.clickup_space_id && (
                      <div className="text-sm text-gray-500 mt-1">
                        ClickUp: {area.clickup_space_id}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Configuration Panel */}
          <div className="lg:col-span-2">
            {selectedArea ? (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedArea.name}</h2>
                  <p className="text-gray-600">
                    Configure how the AI should handle tasks and conversations in this life area.
                  </p>
                </div>

                {/* ClickUp Integration */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ClickUp Space ID
                  </label>
                  <input
                    type="text"
                    value={selectedArea.clickup_space_id || ''}
                    onChange={(e) => updateLifeArea({ clickup_space_id: e.target.value })}
                    placeholder="e.g., 123456789"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Connect this life area to a specific ClickUp space for task management.
                  </p>
                </div>

                {/* Context */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Context
                  </label>
                  <textarea
                    value={selectedArea.context || ''}
                    onChange={(e) => updateLifeArea({ context: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Describe the purpose and scope of this life area..."
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    This context helps the AI understand what this life area encompasses.
                  </p>
                </div>

                {/* Instructions */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Instructions for AI
                  </label>
                  <textarea
                    value={selectedArea.instructions || ''}
                    onChange={(e) => updateLifeArea({ instructions: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Provide specific instructions for how the AI should handle this area..."
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Specific guidance for the AI when working with tasks in this area.
                  </p>
                </div>

                {/* Goals */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Goals
                    </label>
                    <button
                      onClick={addGoal}
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Add Goal
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(selectedArea.goals || []).map((goal, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={goal}
                          onChange={(e) => updateGoal(index, e.target.value)}
                          placeholder="Enter a goal..."
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => removeGoal(index)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Define specific goals that the AI should help you achieve in this area.
                  </p>
                </div>

                {/* Save Status */}
                {saving && (
                  <div className="flex items-center text-sm text-blue-600">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
                <p className="text-gray-500">Select a life area to configure its settings.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
