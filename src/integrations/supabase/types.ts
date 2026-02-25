export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      chat_conversations: {
        Row: {
          created_at: string | null
          id: string
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          action_needed: Json | null
          content: string
          conversation_id: string | null
          created_at: string | null
          id: string
          meta_response: string | null
          role: string
          updated_at: string | null
        }
        Insert: {
          action_needed?: Json | null
          content: string
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          meta_response?: string | null
          role: string
          updated_at?: string | null
        }
        Update: {
          action_needed?: Json | null
          content?: string
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          meta_response?: string | null
          role?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      clickup_lists: {
        Row: {
          clickup_list_id: string
          context: string | null
          created_at: string | null
          goals: Json | null
          id: string
          instructions: string | null
          life_area_id: string | null
          metadata: Json | null
          preferences: string | null
          space_id: string | null
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          clickup_list_id: string
          context?: string | null
          created_at?: string | null
          goals?: Json | null
          id?: string
          instructions?: string | null
          life_area_id?: string | null
          metadata?: Json | null
          preferences?: string | null
          space_id?: string | null
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          clickup_list_id?: string
          context?: string | null
          created_at?: string | null
          goals?: Json | null
          id?: string
          instructions?: string | null
          life_area_id?: string | null
          metadata?: Json | null
          preferences?: string | null
          space_id?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clickup_lists_life_area_id_fkey"
            columns: ["life_area_id"]
            isOneToOne: false
            referencedRelation: "life_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clickup_lists_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "clickup_spaces"
            referencedColumns: ["clickup_space_id"]
          },
        ]
      }
      clickup_spaces: {
        Row: {
          clickup_space_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          name: string | null
          updated_at: string | null
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          clickup_space_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          updated_at?: string | null
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          clickup_space_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clickup_spaces_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "clickup_workspaces"
            referencedColumns: ["clickup_workspace_id"]
          },
        ]
      }
      clickup_workspaces: {
        Row: {
          api_key_vault: string | null
          clickup_workspace_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          name: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          api_key_vault?: string | null
          clickup_workspace_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          api_key_vault?: string | null
          clickup_workspace_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      life_areas: {
        Row: {
          clickup_lists: Json | null
          clickup_space_id: string | null
          context: string | null
          created_at: string | null
          default_list_ids: string[] | null
          goals: Json | null
          id: string
          instructions: string | null
          metadata: Json | null
          name: string
          preferences: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          clickup_lists?: Json | null
          clickup_space_id?: string | null
          context?: string | null
          created_at?: string | null
          default_list_ids?: string[] | null
          goals?: Json | null
          id?: string
          instructions?: string | null
          metadata?: Json | null
          name: string
          preferences?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          clickup_lists?: Json | null
          clickup_space_id?: string | null
          context?: string | null
          created_at?: string | null
          default_list_ids?: string[] | null
          goals?: Json | null
          id?: string
          instructions?: string | null
          metadata?: Json | null
          name?: string
          preferences?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      initialize_user_life_areas: {
        Args: { user_uuid: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

