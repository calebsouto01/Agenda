export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      appointments: {
        Row: {
          created_at: string;
          customer_id: string;
          ends_at: string;
          establishment_id: string;
          id: string;
          marketing_link_id: string | null;
          notes: string | null;
          paid: boolean;
          paid_at: string | null;
          professional_id: string | null;
          service_id: string;
          service_names: string | null;
          starts_at: string;
          status: Database["public"]["Enums"]["appointment_status"];
          total_price_cents: number | null;
          updated_at: string;
          whatsapp_reminder_opt_in: boolean | null;
          whatsapp_reminder_sent_at: string | null;
        };
        Insert: {
          created_at?: string;
          customer_id: string;
          ends_at: string;
          establishment_id: string;
          id?: string;
          marketing_link_id?: string | null;
          notes?: string | null;
          paid?: boolean;
          paid_at?: string | null;
          professional_id?: string | null;
          service_id: string;
          service_names?: string | null;
          starts_at: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          total_price_cents?: number | null;
          updated_at?: string;
          whatsapp_reminder_opt_in?: boolean | null;
          whatsapp_reminder_sent_at?: string | null;
        };
        Update: {
          created_at?: string;
          customer_id?: string;
          ends_at?: string;
          establishment_id?: string;
          id?: string;
          marketing_link_id?: string | null;
          notes?: string | null;
          paid?: boolean;
          paid_at?: string | null;
          professional_id?: string | null;
          service_id?: string;
          service_names?: string | null;
          starts_at?: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          total_price_cents?: number | null;
          updated_at?: string;
          whatsapp_reminder_opt_in?: boolean | null;
          whatsapp_reminder_sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_establishment_id_fkey";
            columns: ["establishment_id"];
            isOneToOne: false;
            referencedRelation: "establishments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_marketing_link_id_fkey";
            columns: ["marketing_link_id"];
            isOneToOne: false;
            referencedRelation: "marketing_links";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      business_hours: {
        Row: {
          break_end: string | null;
          break_start: string | null;
          closed: boolean;
          closes_at: string;
          establishment_id: string;
          id: string;
          opens_at: string;
          weekday: number;
        };
        Insert: {
          break_end?: string | null;
          break_start?: string | null;
          closed?: boolean;
          closes_at?: string;
          establishment_id: string;
          id?: string;
          opens_at?: string;
          weekday: number;
        };
        Update: {
          break_end?: string | null;
          break_start?: string | null;
          closed?: boolean;
          closes_at?: string;
          establishment_id?: string;
          id?: string;
          opens_at?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "business_hours_establishment_id_fkey";
            columns: ["establishment_id"];
            isOneToOne: false;
            referencedRelation: "establishments";
            referencedColumns: ["id"];
          },
        ];
      };
      cash_movements: {
        Row: {
          amount_cents: number;
          category: string;
          created_at: string;
          description: string | null;
          establishment_id: string;
          id: string;
          occurred_at: string;
          type: Database["public"]["Enums"]["cash_movement_type"];
        };
        Insert: {
          amount_cents: number;
          category: string;
          created_at?: string;
          description?: string | null;
          establishment_id: string;
          id?: string;
          occurred_at?: string;
          type: Database["public"]["Enums"]["cash_movement_type"];
        };
        Update: {
          amount_cents?: number;
          category?: string;
          created_at?: string;
          description?: string | null;
          establishment_id?: string;
          id?: string;
          occurred_at?: string;
          type?: Database["public"]["Enums"]["cash_movement_type"];
        };
        Relationships: [
          {
            foreignKeyName: "cash_movements_establishment_id_fkey";
            columns: ["establishment_id"];
            isOneToOne: false;
            referencedRelation: "establishments";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          created_at: string;
          current_appointment_id: string | null;
          email: string | null;
          establishment_id: string;
          id: string;
          motivo_perda: string | null;
          name: string;
          next_contact_at: string | null;
          notes: string | null;
          origem: string | null;
          phone: string;
          responsavel_id: string | null;
          stage: Database["public"]["Enums"]["crm_lead_stage"];
          valor_estimado_cents: number | null;
          whatsapp_confirmacao_sent_at: string | null;
          whatsapp_msg1_sent_at: string | null;
        };
        Insert: {
          created_at?: string;
          current_appointment_id?: string | null;
          email?: string | null;
          establishment_id: string;
          id?: string;
          motivo_perda?: string | null;
          name: string;
          next_contact_at?: string | null;
          notes?: string | null;
          origem?: string | null;
          phone: string;
          responsavel_id?: string | null;
          stage?: Database["public"]["Enums"]["crm_lead_stage"];
          valor_estimado_cents?: number | null;
          whatsapp_confirmacao_sent_at?: string | null;
          whatsapp_msg1_sent_at?: string | null;
        };
        Update: {
          created_at?: string;
          current_appointment_id?: string | null;
          email?: string | null;
          establishment_id?: string;
          id?: string;
          motivo_perda?: string | null;
          name?: string;
          next_contact_at?: string | null;
          notes?: string | null;
          origem?: string | null;
          phone?: string;
          responsavel_id?: string | null;
          stage?: Database["public"]["Enums"]["crm_lead_stage"];
          valor_estimado_cents?: number | null;
          whatsapp_confirmacao_sent_at?: string | null;
          whatsapp_msg1_sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "customers_current_appointment_id_fkey";
            columns: ["current_appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customers_establishment_id_fkey";
            columns: ["establishment_id"];
            isOneToOne: false;
            referencedRelation: "establishments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customers_responsavel_id_fkey";
            columns: ["responsavel_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id"];
          },
        ];
      };
      establishments: {
        Row: {
          accent: string | null;
          address: string | null;
          created_at: string;
          custom_domain: string | null;
          description: string | null;
          id: string;
          name: string;
          owner_id: string;
          phone: string | null;
          plan: string;
          plan_renews_at: string | null;
          plan_status: string;
          sells_products: boolean;
          slot_step_minutes: number;
          slug: string;
          timezone: string;
          updated_at: string;
          whatsapp_business_api_connected: boolean;
          whatsapp_message_1: string | null;
          whatsapp_message_atencao: string | null;
          whatsapp_message_confirmacao: string | null;
          whatsapp_message_reengajamento: string | null;
        };
        Insert: {
          accent?: string | null;
          address?: string | null;
          created_at?: string;
          custom_domain?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          owner_id: string;
          phone?: string | null;
          plan?: string;
          plan_renews_at?: string | null;
          plan_status?: string;
          sells_products?: boolean;
          slot_step_minutes?: number;
          slug: string;
          timezone?: string;
          updated_at?: string;
          whatsapp_business_api_connected?: boolean;
          whatsapp_message_1?: string | null;
          whatsapp_message_atencao?: string | null;
          whatsapp_message_confirmacao?: string | null;
          whatsapp_message_reengajamento?: string | null;
        };
        Update: {
          accent?: string | null;
          address?: string | null;
          created_at?: string;
          custom_domain?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          owner_id?: string;
          phone?: string | null;
          plan?: string;
          plan_renews_at?: string | null;
          plan_status?: string;
          sells_products?: boolean;
          slot_step_minutes?: number;
          slug?: string;
          timezone?: string;
          updated_at?: string;
          whatsapp_business_api_connected?: boolean;
          whatsapp_message_1?: string | null;
          whatsapp_message_atencao?: string | null;
          whatsapp_message_confirmacao?: string | null;
          whatsapp_message_reengajamento?: string | null;
        };
        Relationships: [];
      };
      marketing_link_clicks: {
        Row: {
          clicked_at: string;
          id: string;
          link_id: string;
        };
        Insert: {
          clicked_at?: string;
          id?: string;
          link_id: string;
        };
        Update: {
          clicked_at?: string;
          id?: string;
          link_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "marketing_link_clicks_link_id_fkey";
            columns: ["link_id"];
            isOneToOne: false;
            referencedRelation: "marketing_links";
            referencedColumns: ["id"];
          },
        ];
      };
      marketing_links: {
        Row: {
          active: boolean;
          channel: Database["public"]["Enums"]["marketing_channel"];
          code: string;
          created_at: string;
          establishment_id: string;
          id: string;
          label: string;
        };
        Insert: {
          active?: boolean;
          channel?: Database["public"]["Enums"]["marketing_channel"];
          code?: string;
          created_at?: string;
          establishment_id: string;
          id?: string;
          label: string;
        };
        Update: {
          active?: boolean;
          channel?: Database["public"]["Enums"]["marketing_channel"];
          code?: string;
          created_at?: string;
          establishment_id?: string;
          id?: string;
          label?: string;
        };
        Relationships: [
          {
            foreignKeyName: "marketing_links_establishment_id_fkey";
            columns: ["establishment_id"];
            isOneToOne: false;
            referencedRelation: "establishments";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_queue: {
        Row: {
          appointment_id: string | null;
          channel: string;
          created_at: string;
          establishment_id: string;
          event: string;
          id: string;
          payload: Json;
          status: string;
        };
        Insert: {
          appointment_id?: string | null;
          channel: string;
          created_at?: string;
          establishment_id: string;
          event: string;
          id?: string;
          payload?: Json;
          status?: string;
        };
        Update: {
          appointment_id?: string | null;
          channel?: string;
          created_at?: string;
          establishment_id?: string;
          event?: string;
          id?: string;
          payload?: Json;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_queue_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_queue_establishment_id_fkey";
            columns: ["establishment_id"];
            isOneToOne: false;
            referencedRelation: "establishments";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_entries: {
        Row: {
          amount_cents: number;
          appointment_id: string;
          created_at: string;
          establishment_id: string;
          id: string;
          method: string;
          note: string | null;
        };
        Insert: {
          amount_cents: number;
          appointment_id: string;
          created_at?: string;
          establishment_id: string;
          id?: string;
          method: string;
          note?: string | null;
        };
        Update: {
          amount_cents?: number;
          appointment_id?: string;
          created_at?: string;
          establishment_id?: string;
          id?: string;
          method?: string;
          note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payment_entries_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_entries_establishment_id_fkey";
            columns: ["establishment_id"];
            isOneToOne: false;
            referencedRelation: "establishments";
            referencedColumns: ["id"];
          },
        ];
      };
      product_movements: {
        Row: {
          created_at: string;
          establishment_id: string;
          id: string;
          note: string | null;
          product_id: string;
          qty: number;
          type: Database["public"]["Enums"]["product_movement_type"];
          unit_price_cents: number;
        };
        Insert: {
          created_at?: string;
          establishment_id: string;
          id?: string;
          note?: string | null;
          product_id: string;
          qty: number;
          type: Database["public"]["Enums"]["product_movement_type"];
          unit_price_cents?: number;
        };
        Update: {
          created_at?: string;
          establishment_id?: string;
          id?: string;
          note?: string | null;
          product_id?: string;
          qty?: number;
          type?: Database["public"]["Enums"]["product_movement_type"];
          unit_price_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_movements_establishment_id_fkey";
            columns: ["establishment_id"];
            isOneToOne: false;
            referencedRelation: "establishments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          active: boolean;
          cost_cents: number;
          created_at: string;
          establishment_id: string;
          id: string;
          min_stock_qty: number;
          name: string;
          price_cents: number;
          sku: string | null;
          stock_qty: number;
        };
        Insert: {
          active?: boolean;
          cost_cents?: number;
          created_at?: string;
          establishment_id: string;
          id?: string;
          min_stock_qty?: number;
          name: string;
          price_cents?: number;
          sku?: string | null;
          stock_qty?: number;
        };
        Update: {
          active?: boolean;
          cost_cents?: number;
          created_at?: string;
          establishment_id?: string;
          id?: string;
          min_stock_qty?: number;
          name?: string;
          price_cents?: number;
          sku?: string | null;
          stock_qty?: number;
        };
        Relationships: [
          {
            foreignKeyName: "products_establishment_id_fkey";
            columns: ["establishment_id"];
            isOneToOne: false;
            referencedRelation: "establishments";
            referencedColumns: ["id"];
          },
        ];
      };
      professionals: {
        Row: {
          active: boolean;
          created_at: string;
          establishment_id: string;
          id: string;
          name: string;
          role: string | null;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          establishment_id: string;
          id?: string;
          name: string;
          role?: string | null;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          establishment_id?: string;
          id?: string;
          name?: string;
          role?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "professionals_establishment_id_fkey";
            columns: ["establishment_id"];
            isOneToOne: false;
            referencedRelation: "establishments";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          active: boolean;
          created_at: string;
          description: string | null;
          duration_minutes: number;
          establishment_id: string;
          id: string;
          name: string;
          price_cents: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          description?: string | null;
          duration_minutes?: number;
          establishment_id: string;
          id?: string;
          name: string;
          price_cents?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          description?: string | null;
          duration_minutes?: number;
          establishment_id?: string;
          id?: string;
          name?: string;
          price_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "services_establishment_id_fkey";
            columns: ["establishment_id"];
            isOneToOne: false;
            referencedRelation: "establishments";
            referencedColumns: ["id"];
          },
        ];
      };
      time_blocks: {
        Row: {
          created_at: string;
          ends_at: string;
          establishment_id: string;
          id: string;
          professional_id: string | null;
          reason: string | null;
          starts_at: string;
        };
        Insert: {
          created_at?: string;
          ends_at: string;
          establishment_id: string;
          id?: string;
          professional_id?: string | null;
          reason?: string | null;
          starts_at: string;
        };
        Update: {
          created_at?: string;
          ends_at?: string;
          establishment_id?: string;
          id?: string;
          professional_id?: string | null;
          reason?: string | null;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "time_blocks_establishment_id_fkey";
            columns: ["establishment_id"];
            isOneToOne: false;
            referencedRelation: "establishments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_blocks_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      available_slots: {
        Args: {
          p_date: string;
          p_establishment_id: string;
          p_professional_id: string;
          p_service_id: string;
          p_service_ids?: string[];
        };
        Returns: string[];
      };
      book_appointment: {
        Args: {
          p_customer_email?: string;
          p_customer_name: string;
          p_customer_phone: string;
          p_establishment_id: string;
          p_marketing_link_code?: string;
          p_notes?: string;
          p_professional_id: string;
          p_service_id: string;
          p_service_ids?: string[];
          p_starts_at: string;
        };
        Returns: Json;
      };
      marketing_link_stats: {
        Args: { p_establishment_id: string };
        Returns: {
          agendamentos: number;
          clicks: number;
          comparecimentos: number;
          faturamento_cents: number;
          link_id: string;
        }[];
      };
      owns_establishment: {
        Args: { _establishment_id: string };
        Returns: boolean;
      };
      resolve_marketing_link: { Args: { p_code: string }; Returns: Json };
    };
    Enums: {
      appointment_status: "pending" | "confirmed" | "completed" | "cancelled";
      cash_movement_type: "entrada" | "saida";
      crm_activity_status: "pendente" | "concluida" | "cancelada";
      crm_activity_type: "ligacao" | "whatsapp" | "visita" | "email" | "outro";
      crm_lead_stage:
        | "novo"
        | "contato"
        | "agendado"
        | "convertido"
        | "perdido"
        | "mensagem_1"
        | "confirmacao_dia";
      marketing_channel: "instagram" | "facebook" | "whatsapp" | "anuncio" | "outro";
      product_movement_type: "entrada" | "saida" | "venda" | "ajuste";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      appointment_status: ["pending", "confirmed", "completed", "cancelled"],
      cash_movement_type: ["entrada", "saida"],
      crm_activity_status: ["pendente", "concluida", "cancelada"],
      crm_activity_type: ["ligacao", "whatsapp", "visita", "email", "outro"],
      crm_lead_stage: [
        "novo",
        "contato",
        "agendado",
        "convertido",
        "perdido",
        "mensagem_1",
        "confirmacao_dia",
      ],
      marketing_channel: ["instagram", "facebook", "whatsapp", "anuncio", "outro"],
      product_movement_type: ["entrada", "saida", "venda", "ajuste"],
    },
  },
} as const;
