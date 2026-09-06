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
          account_status: string
          age_confirmed_at: string | null
          banned: boolean
          blocked_until: string | null
          chats_completed: number
          country_code: string | null
          created_at: string
          dialog_id: string | null
          dialog_started_at: string | null
          dislikes: number
          display_name: string | null
          first_name: string | null
          flagged_for_review: boolean
          gender: string | null
          language_code: string | null
          last_link_at: string | null
          last_next_at: string | null
          last_rated_dialog: string | null
          last_search_at: string | null
          last_seen: string
          likes: number
          onboarding_status: string
          partner_id: number | null
          pref_age_max: number | null
          pref_age_min: number | null
          pref_country: string | null
          pref_language: string | null
          report_count: number
          restricted_until: string | null
          self_age: number | null
          state: string
          telegram_id: number
          terms_accepted_at: string | null
          terms_version: string | null
          total_ratings: number
          username: string | null
          vip_expires_at: string | null
          vip_started_at: string | null
          warnings: number
        }
        Insert: {
          account_status?: string
          age_confirmed_at?: string | null
          banned?: boolean
          blocked_until?: string | null
          chats_completed?: number
          country_code?: string | null
          created_at?: string
          dialog_id?: string | null
          dialog_started_at?: string | null
          dislikes?: number
          display_name?: string | null
          first_name?: string | null
          flagged_for_review?: boolean
          gender?: string | null
          language_code?: string | null
          last_link_at?: string | null
          last_next_at?: string | null
          last_rated_dialog?: string | null
          last_search_at?: string | null
          last_seen?: string
          likes?: number
          onboarding_status?: string
          partner_id?: number | null
          pref_age_max?: number | null
          pref_age_min?: number | null
          pref_country?: string | null
          pref_language?: string | null
          report_count?: number
          restricted_until?: string | null
          self_age?: number | null
          state?: string
          telegram_id: number
          terms_accepted_at?: string | null
          terms_version?: string | null
          total_ratings?: number
          username?: string | null
          vip_expires_at?: string | null
          vip_started_at?: string | null
          warnings?: number
        }
        Update: {
          account_status?: string
          age_confirmed_at?: string | null
          banned?: boolean
          blocked_until?: string | null
          chats_completed?: number
          country_code?: string | null
          created_at?: string
          dialog_id?: string | null
          dialog_started_at?: string | null
          dislikes?: number
          display_name?: string | null
          first_name?: string | null
          flagged_for_review?: boolean
          gender?: string | null
          language_code?: string | null
          last_link_at?: string | null
          last_next_at?: string | null
          last_rated_dialog?: string | null
          last_search_at?: string | null
          last_seen?: string
          likes?: number
          onboarding_status?: string
          partner_id?: number | null
          pref_age_max?: number | null
          pref_age_min?: number | null
          pref_country?: string | null
          pref_language?: string | null
          report_count?: number
          restricted_until?: string | null
          self_age?: number | null
          state?: string
          telegram_id?: number
          terms_accepted_at?: string | null
          terms_version?: string | null
          total_ratings?: number
          username?: string | null
          vip_expires_at?: string | null
          vip_started_at?: string | null
          warnings?: number
        }
        Relationships: []
      }
      chat_invites: {
        Row: {
          created_at: string
          expires_at: string
          from_id: number
          id: string
          responded_at: string | null
          status: string
          to_id: number
        }
        Insert: {
          created_at?: string
          expires_at?: string
          from_id: number
          id?: string
          responded_at?: string | null
          status?: string
          to_id: number
        }
        Update: {
          created_at?: string
          expires_at?: string
          from_id?: number
          id?: string
          responded_at?: string | null
          status?: string
          to_id?: number
        }
        Relationships: []
      }
      join_requests: {
        Row: {
          chat_id: number | null
          chat_username: string | null
          created_at: string
          id: string
          status: string
          telegram_id: number
          updated_at: string
        }
        Insert: {
          chat_id?: number | null
          chat_username?: string | null
          created_at?: string
          id?: string
          status?: string
          telegram_id: number
          updated_at?: string
        }
        Update: {
          chat_id?: number | null
          chat_username?: string | null
          created_at?: string
          id?: string
          status?: string
          telegram_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      match_sessions: {
        Row: {
          end_reason: string | null
          ended_at: string | null
          ended_by: number | null
          id: string
          report_id: string | null
          started_at: string
          status: string
          user_a: number
          user_b: number
        }
        Insert: {
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: number | null
          id?: string
          report_id?: string | null
          started_at?: string
          status?: string
          user_a: number
          user_b: number
        }
        Update: {
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: number | null
          id?: string
          report_id?: string | null
          started_at?: string
          status?: string
          user_a?: number
          user_b?: number
        }
        Relationships: []
      }
      moderation_actions: {
        Row: {
          action_type: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          reason: string | null
          report_id: string | null
          telegram_id: number
        }
        Insert: {
          action_type: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          reason?: string | null
          report_id?: string | null
          telegram_id: number
        }
        Update: {
          action_type?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          reason?: string | null
          report_id?: string | null
          telegram_id?: number
        }
        Relationships: []
      }
      partner_interactions: {
        Row: {
          id: string
          match_id: string | null
          partner_id: number
          started_at: string
          user_id: number
        }
        Insert: {
          id?: string
          match_id?: string | null
          partner_id: number
          started_at?: string
          user_id: number
        }
        Update: {
          id?: string
          match_id?: string | null
          partner_id?: number
          started_at?: string
          user_id?: number
        }
        Relationships: []
      }
      payments: {
        Row: {
          expires_at: string | null
          id: string
          invoice_payload: string | null
          product: string
          purchased_at: string
          refund_status: string | null
          stars_amount: number
          status: string
          telegram_id: number
          telegram_payment_charge_id: string | null
        }
        Insert: {
          expires_at?: string | null
          id?: string
          invoice_payload?: string | null
          product?: string
          purchased_at?: string
          refund_status?: string | null
          stars_amount?: number
          status?: string
          telegram_id: number
          telegram_payment_charge_id?: string | null
        }
        Update: {
          expires_at?: string | null
          id?: string
          invoice_payload?: string | null
          product?: string
          purchased_at?: string
          refund_status?: string | null
          stars_amount?: number
          status?: string
          telegram_id?: number
          telegram_payment_charge_id?: string | null
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
      report_evidence: {
        Row: {
          created_at: string
          evidence_type: string
          expires_at: string
          id: string
          metadata: Json | null
          report_id: string
          telegram_message_id: number | null
          text_content: string | null
        }
        Insert: {
          created_at?: string
          evidence_type?: string
          expires_at?: string
          id?: string
          metadata?: Json | null
          report_id: string
          telegram_message_id?: number | null
          text_content?: string | null
        }
        Update: {
          created_at?: string
          evidence_type?: string
          expires_at?: string
          id?: string
          metadata?: Json | null
          report_id?: string
          telegram_message_id?: number | null
          text_content?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_evidence_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          admin_action: string | null
          admin_notes: string | null
          category: string | null
          created_at: string
          description: string | null
          dialog_id: string | null
          id: string
          reason: string
          reported_id: number
          reporter_id: number
          resolved_at: string | null
          severity: string | null
          status: string
        }
        Insert: {
          admin_action?: string | null
          admin_notes?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          dialog_id?: string | null
          id?: string
          reason: string
          reported_id: number
          reporter_id: number
          resolved_at?: string | null
          severity?: string | null
          status?: string
        }
        Update: {
          admin_action?: string | null
          admin_notes?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          dialog_id?: string | null
          id?: string
          reason?: string
          reported_id?: number
          reporter_id?: number
          resolved_at?: string | null
          severity?: string | null
          status?: string
        }
        Relationships: []
      }
      saved_partners: {
        Row: {
          alias: string | null
          created_at: string
          dialog_id: string | null
          id: string
          owner_id: number
          partner_id: number
        }
        Insert: {
          alias?: string | null
          created_at?: string
          dialog_id?: string | null
          id?: string
          owner_id: number
          partner_id: number
        }
        Update: {
          alias?: string | null
          created_at?: string
          dialog_id?: string | null
          id?: string
          owner_id?: number
          partner_id?: number
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          category: string
          created_at: string
          id: string
          message: string
          payment_id: string | null
          resolved_at: string | null
          status: string
          telegram_id: number
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          message: string
          payment_id?: string | null
          resolved_at?: string | null
          status?: string
          telegram_id: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          message?: string
          payment_id?: string | null
          resolved_at?: string | null
          status?: string
          telegram_id?: number
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
      bot_admin_stats: {
        Args: never
        Returns: {
          active_chats: number
          banned: number
          open_reports: number
          restricted: number
          searching: number
          stars_revenue: number
          total_users: number
          vip_active: number
        }[]
      }
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
      partner_slots_used: { Args: { p_user: number }; Returns: number }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
