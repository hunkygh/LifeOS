export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: Database["public"]["Enums"]["action_type"]
          created_at: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["action_type"]
          created_at?: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["action_type"]
          created_at?: string | null
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      chat_history: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          metadata?: Json
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      clickup_lists: {
        Row: {
          created_at: string
          field_mapping: Json
          id: string
          is_default: boolean
          list_id: string
          reference_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          field_mapping?: Json
          id?: string
          is_default?: boolean
          list_id: string
          reference_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          field_mapping?: Json
          id?: string
          is_default?: boolean
          list_id?: string
          reference_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clickup_receipts: {
        Row: {
          clickup_task_id: string | null
          clickup_task_url: string | null
          created_at: string
          error: string | null
          fallback_used: boolean
          id: string
          list_config_id: string | null
          list_id: string
          pragmatic_end_goal: string | null
          reference_name: string | null
          request_payload: Json
          response_payload: Json
          status: string
          summary_note: string | null
          user_id: string
          why_sent: string | null
        }
        Insert: {
          clickup_task_id?: string | null
          clickup_task_url?: string | null
          created_at?: string
          error?: string | null
          fallback_used?: boolean
          id?: string
          list_config_id?: string | null
          list_id: string
          pragmatic_end_goal?: string | null
          reference_name?: string | null
          request_payload?: Json
          response_payload?: Json
          status: string
          summary_note?: string | null
          user_id: string
          why_sent?: string | null
        }
        Update: {
          clickup_task_id?: string | null
          clickup_task_url?: string | null
          created_at?: string
          error?: string | null
          fallback_used?: boolean
          id?: string
          list_config_id?: string | null
          list_id?: string
          pragmatic_end_goal?: string | null
          reference_name?: string | null
          request_payload?: Json
          response_payload?: Json
          status?: string
          summary_note?: string | null
          user_id?: string
          why_sent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clickup_receipts_list_config_id_fkey"
            columns: ["list_config_id"]
            isOneToOne: false
            referencedRelation: "clickup_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_plans: {
        Row: {
          ai_error: string | null
          committed: boolean | null
          date: string
          fallback_used: boolean | null
          generated_at: string | null
          id: string
          projected_earnings: number | null
          time_blocks: Json | null
          user_id: string
        }
        Insert: {
          ai_error?: string | null
          committed?: boolean | null
          date: string
          fallback_used?: boolean | null
          generated_at?: string | null
          id?: string
          projected_earnings?: number | null
          time_blocks?: Json | null
          user_id: string
        }
        Update: {
          ai_error?: string | null
          committed?: boolean | null
          date?: string
          fallback_used?: boolean | null
          generated_at?: string | null
          id?: string
          projected_earnings?: number | null
          time_blocks?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      deals: {
        Row: {
          attributes: Json | null
          company: string | null
          created_at: string | null
          fallback_used: boolean | null
          id: string
          last_activity_at: string | null
          missing_info: Json | null
          name: string
          needs_manual_review: boolean | null
          probability: number | null
          projected_close_date: string | null
          raw_input: string | null
          sf_id: string | null
          sf_synced_at: string | null
          source_relationship_id: string | null
          source_type: Database["public"]["Enums"]["source_type"] | null
          stage: string | null
          status: Database["public"]["Enums"]["deal_status"] | null
          updated_at: string | null
          user_id: string
          value: number | null
        }
        Insert: {
          attributes?: Json | null
          company?: string | null
          created_at?: string | null
          fallback_used?: boolean | null
          id?: string
          last_activity_at?: string | null
          missing_info?: Json | null
          name: string
          needs_manual_review?: boolean | null
          probability?: number | null
          projected_close_date?: string | null
          raw_input?: string | null
          sf_id?: string | null
          sf_synced_at?: string | null
          source_relationship_id?: string | null
          source_type?: Database["public"]["Enums"]["source_type"] | null
          stage?: string | null
          status?: Database["public"]["Enums"]["deal_status"] | null
          updated_at?: string | null
          user_id: string
          value?: number | null
        }
        Update: {
          attributes?: Json | null
          company?: string | null
          created_at?: string | null
          fallback_used?: boolean | null
          id?: string
          last_activity_at?: string | null
          missing_info?: Json | null
          name?: string
          needs_manual_review?: boolean | null
          probability?: number | null
          projected_close_date?: string | null
          raw_input?: string | null
          sf_id?: string | null
          sf_synced_at?: string | null
          source_relationship_id?: string | null
          source_type?: Database["public"]["Enums"]["source_type"] | null
          stage?: string | null
          status?: Database["public"]["Enums"]["deal_status"] | null
          updated_at?: string | null
          user_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_source_relationship_id_fkey"
            columns: ["source_relationship_id"]
            isOneToOne: false
            referencedRelation: "relationships"
            referencedColumns: ["id"]
          },
        ]
      }
      debriefs: {
        Row: {
          ai_error: string | null
          content: string
          created_at: string | null
          extracted_insights: Json | null
          fallback_used: boolean | null
          id: string
          plan_generated: boolean | null
          processed: boolean | null
          sentiment_score: number | null
          type: Database["public"]["Enums"]["debrief_type"]
          user_id: string
        }
        Insert: {
          ai_error?: string | null
          content: string
          created_at?: string | null
          extracted_insights?: Json | null
          fallback_used?: boolean | null
          id?: string
          plan_generated?: boolean | null
          processed?: boolean | null
          sentiment_score?: number | null
          type: Database["public"]["Enums"]["debrief_type"]
          user_id: string
        }
        Update: {
          ai_error?: string | null
          content?: string
          created_at?: string | null
          extracted_insights?: Json | null
          fallback_used?: boolean | null
          id?: string
          plan_generated?: boolean | null
          processed?: boolean | null
          sentiment_score?: number | null
          type?: Database["public"]["Enums"]["debrief_type"]
          user_id?: string
        }
        Relationships: []
      }
      domains: {
        Row: {
          ai_context: string
          clickup_space_id: string
          created_at: string
          id: string
          is_active: boolean
          keywords: string[]
          name: string
          user_id: string
        }
        Insert: {
          ai_context?: string
          clickup_space_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          keywords?: string[]
          name: string
          user_id: string
        }
        Update: {
          ai_context?: string
          clickup_space_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          keywords?: string[]
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      lists: {
        Row: {
          clickup_list_id: string
          created_at: string
          domain_id: string
          field_mapping: Json
          id: string
          is_active: boolean
          keywords: string[]
          name: string
          purpose: string
          user_id: string
        }
        Insert: {
          clickup_list_id: string
          created_at?: string
          domain_id: string
          field_mapping?: Json
          id?: string
          is_active?: boolean
          keywords?: string[]
          name: string
          purpose?: string
          user_id: string
        }
        Update: {
          clickup_list_id?: string
          created_at?: string
          domain_id?: string
          field_mapping?: Json
          id?: string
          is_active?: boolean
          keywords?: string[]
          name?: string
          purpose?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lists_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          action_type: string
          ai_reasoning: string
          can_undo: boolean
          changes: Json
          clickup_task_id: string | null
          clickup_task_url: string | null
          created_at: string
          domain_name: string
          id: string
          list_name: string
          user_id: string
        }
        Insert: {
          action_type: string
          ai_reasoning?: string
          can_undo?: boolean
          changes?: Json
          clickup_task_id?: string | null
          clickup_task_url?: string | null
          created_at?: string
          domain_name?: string
          id?: string
          list_name?: string
          user_id: string
        }
        Update: {
          action_type?: string
          ai_reasoning?: string
          can_undo?: boolean
          changes?: Json
          clickup_task_id?: string | null
          clickup_task_url?: string | null
          created_at?: string
          domain_name?: string
          id?: string
          list_name?: string
          user_id?: string
        }
        Relationships: []
      }
      relationships: {
        Row: {
          attributes: Json | null
          closed_referral_count: number | null
          created_at: string | null
          health_score: number | null
          id: string
          last_contact_at: string | null
          missing_info: Json | null
          name: string
          raw_input: string | null
          referral_count: number | null
          status: Database["public"]["Enums"]["relationship_status"] | null
          total_value_generated: number | null
          type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attributes?: Json | null
          closed_referral_count?: number | null
          created_at?: string | null
          health_score?: number | null
          id?: string
          last_contact_at?: string | null
          missing_info?: Json | null
          name: string
          raw_input?: string | null
          referral_count?: number | null
          status?: Database["public"]["Enums"]["relationship_status"] | null
          total_value_generated?: number | null
          type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attributes?: Json | null
          closed_referral_count?: number | null
          created_at?: string | null
          health_score?: number | null
          id?: string
          last_contact_at?: string | null
          missing_info?: Json | null
          name?: string
          raw_input?: string | null
          referral_count?: number | null
          status?: Database["public"]["Enums"]["relationship_status"] | null
          total_value_generated?: number | null
          type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      salesforce_opportunities: {
        Row: {
          account_name: string | null
          amount: number | null
          close_date: string | null
          created_at: string
          description: string | null
          id: string
          is_closed: boolean | null
          is_won: boolean | null
          last_activity_date: string | null
          lead_source: string | null
          name: string
          next_step: string | null
          owner_id: string | null
          probability: number | null
          sf_created_date: string | null
          sf_id: string
          sf_last_modified: string | null
          stage_name: string | null
          synced_at: string
          type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name?: string | null
          amount?: number | null
          close_date?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_closed?: boolean | null
          is_won?: boolean | null
          last_activity_date?: string | null
          lead_source?: string | null
          name: string
          next_step?: string | null
          owner_id?: string | null
          probability?: number | null
          sf_created_date?: string | null
          sf_id: string
          sf_last_modified?: string | null
          stage_name?: string | null
          synced_at?: string
          type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string | null
          amount?: number | null
          close_date?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_closed?: boolean | null
          is_won?: boolean | null
          last_activity_date?: string | null
          lead_source?: string | null
          name?: string
          next_step?: string | null
          owner_id?: string | null
          probability?: number | null
          sf_created_date?: string | null
          sf_id?: string
          sf_last_modified?: string | null
          stage_name?: string | null
          synced_at?: string
          type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      salesforce_sync: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          last_sync_at: string
          opportunities_synced: number | null
          sync_status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          last_sync_at?: string
          opportunities_synced?: number | null
          sync_status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          last_sync_at?: string
          opportunities_synced?: number | null
          sync_status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          context: string | null
          created_at: string | null
          deal_id: string | null
          description: string
          edited: boolean | null
          id: string
          mode: Database["public"]["Enums"]["mode_type"]
          original_description: string | null
          plan_id: string | null
          relationship_id: string | null
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          context?: string | null
          created_at?: string | null
          deal_id?: string | null
          description: string
          edited?: boolean | null
          id?: string
          mode: Database["public"]["Enums"]["mode_type"]
          original_description?: string | null
          plan_id?: string | null
          relationship_id?: string | null
          user_id: string
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          context?: string | null
          created_at?: string | null
          deal_id?: string | null
          description?: string
          edited?: boolean | null
          id?: string
          mode?: Database["public"]["Enums"]["mode_type"]
          original_description?: string | null
          plan_id?: string | null
          relationship_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "daily_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "relationships"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_health_score: {
        Args: { p_relationship_id: string }
        Returns: number
      }
      log_activity: {
        Args: {
          p_action: Database["public"]["Enums"]["action_type"]
          p_entity_id: string
          p_entity_type: Database["public"]["Enums"]["entity_type"]
          p_metadata?: Json
        }
        Returns: string
      }
    }
    Enums: {
      action_type:
        | "created"
        | "updated"
        | "completed"
        | "edited"
        | "called"
        | "emailed"
        | "noted"
      deal_status: "hot" | "stalled" | "normal"
      debrief_type: "mid_day" | "end_of_day"
      entity_type: "deal" | "relationship" | "task" | "plan" | "debrief"
      mode_type: "relationship" | "revenue"
      relationship_status: "strong" | "needs_attention" | "normal"
      source_type: "referral" | "warm_lead" | "cold" | "altabank_referral"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      action_type: [
        "created",
        "updated",
        "completed",
        "edited",
        "called",
        "emailed",
        "noted",
      ],
      deal_status: ["hot", "stalled", "normal"],
      debrief_type: ["mid_day", "end_of_day"],
      entity_type: ["deal", "relationship", "task", "plan", "debrief"],
      mode_type: ["relationship", "revenue"],
      relationship_status: ["strong", "needs_attention", "normal"],
      source_type: ["referral", "warm_lead", "cold", "altabank_referral"],
    },
  },
} as const
