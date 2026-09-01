export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17";
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
        };
        Insert: {
          created_at?: string;
          customer_id: string;
          ends_at: string;
          establishment_id: string;
          id?: string;
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
        };
        Update: {
          created_at?: string;
          customer_id?: string;
          ends_at?: string;
          establishment_id?: string;
          id?: string;
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
      customers: {
        Row: {
          created_at: string;
          email: string | null;
          establishment_id: string;
          id: string;
          name: string;
          phone: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          establishment_id: string;
          id?: string;
          name: string;
          phone: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          establishment_id?: string;
          id?: string;
          name?: string;
          phone?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customers_establishment_id_fkey";
            columns: ["establishment_id"];
            isOneToOne: false;
            referencedRelation: "establishments";
            referencedColumns: ["id"];
          },
        ];
      };
      establishments: {
        Row: {
          accent: string | null;
          address: string | null;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          owner_id: string;
          phone: string | null;
          slot_step_minutes: number;
          slug: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          accent?: string | null;
          address?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          owner_id: string;
          phone?: string | null;
          slot_step_minutes?: number;
          slug: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          accent?: string | null;
          address?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          owner_id?: string;
          phone?: string | null;
          slot_step_minutes?: number;
          slug?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
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
          p_notes?: string;
          p_professional_id: string;
          p_service_id: string;
          p_service_ids?: string[];
          p_starts_at: string;
        };
        Returns: Json;
      };
      owns_establishment: {
        Args: { _establishment_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      appointment_status: "pending" | "confirmed" | "completed" | "cancelled";
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
    },
  },
} as const;
