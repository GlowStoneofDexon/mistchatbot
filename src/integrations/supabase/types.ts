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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bot_rate_limits: {
        Row: {
          cmd_count: number
          msg_count: number
          telegram_id: number
          updated_at: string
          warned_at: string | null
          window_start: string
        }
        Insert: {
          cmd_count?: number
          msg_count?: number
          telegram_id: number
          updated_at?: string
          warned_at?: string | null
          window_start?: string
        }
        Update: {
          cmd_count?: number
          msg_count?: number
          telegram_id?: number
          updated_at?: string
          warned_at?: string | null
          window_start?: string
        }
        Relationships: []
      }
      bot_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      bot_users: {
        Row: {
          banned: boolean
          blocked_until: string | null
          chats_completed: number
          created_at: string
          dialog_id: string | null
          dialog_started_at: string | null
          dislikes: number
          first_name: string | null
          language_code: string | null
          last_rated_dialog: string | null
          last_seen: string
          likes: number
          partner_id: number | null
          report_count: number
          state: string
          telegram_id: number
          total_ratings: number
          username: string | null
        }
        Insert: {
          banned?: boolean
          blocked_until?: string | null
          chats_completed?: number
          created_at?: string
          dialog_id?: string | null
          dialog_started_at?: string | null
          dislikes?: number
          first_name?: string | null
          language_code?: string | null
          last_rated_dialog?: string | null
          last_seen?: string
          likes?: number
          partner_id?: number | null
          report_count?: number
          state?: string
          telegram_id: number
          total_ratings?: number
          username?: string | null
        }
        Update: {
          banned?: boolean
          blocked_until?: string | null
          chats_completed?: number
          created_at?: string
          dialog_id?: string | null
          dialog_started_at?: string | null
          dislikes?: number
          first_name?: string | null
          language_code?: string | null
          last_rated_dialog?: string | null
          last_seen?: string
          likes?: number
          partner_id?: number | null
          report_count?: number
          state?: string
          telegram_id?: number
          total_ratings?: number
          username?: string | null
        }
        Relationships: []
      }
      dialog_messages: {
        Row: {
          content: string | null
          created_at: string
          dialog_id: string
          id: string
          kind: string
          partner_id: number | null
          sender_id: number
          side: number
          telegram_message_id: number | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          dialog_id: string
          id?: string
          kind?: string
          partner_id?: number | null
          sender_id: number
          side?: number
          telegram_message_id?: number | null
        }
        Update: {
          content?: string | null
          created_at?: string
          dialog_id?: string
          id?: string
          kind?: string
          partner_id?: number | null
          sender_id?: number
          side?: number
          telegram_message_id?: number | null
        }
        Relationships: []
      }
      ratings: {
        Row: {
          created_at: string
          dialog_id: string
          id: string
          rated_id: number
          rater_id: number
          value: number
        }
        Insert: {
          created_at?: string
          dialog_id: string
          id?: string
          rated_id: number
          rater_id: number
          value: number
        }
        Update: {
          created_at?: string
          dialog_id?: string
          id?: string
          rated_id?: number
          rater_id?: number
          value?: number
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          dialog_id: string | null
          id: string
          reason: string
          reported_id: number
          reporter_id: number
        }
        Insert: {
          created_at?: string
          dialog_id?: string | null
          id?: string
          reason: string
          reported_id: number
          reporter_id: number
        }
        Update: {
          created_at?: string
          dialog_id?: string | null
          id?: string
          reason?: string
          reported_id?: number
          reporter_id?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bot_public_stats: {
        Args: never
        Returns: {
          active_dialogs: number
          chats_completed: number
          total_users: number
          waiting: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      match_partner: {
        Args: { p_user: number }
        Returns: {
          dialog: string
          partner: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
