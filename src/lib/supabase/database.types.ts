export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      llm_settings: {
        Row: {
          user_id: string;
          mode: "default" | "api" | "local";
          protocol: "openai" | "anthropic" | "ollama";
          base_url: string;
          model: string;
          api_key_encrypted: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          mode: "default" | "api" | "local";
          protocol: "openai" | "anthropic" | "ollama";
          base_url: string;
          model: string;
          api_key_encrypted?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["llm_settings"]["Insert"]>;
        Relationships: [];
      };
      jobs: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          company: string;
          location: string | null;
          workplace_type: Database["public"]["Enums"]["workplace_type"];
          employment_type: Database["public"]["Enums"]["employment_type"];
          description: string;
          source: Database["public"]["Enums"]["job_source"];
          source_url: string | null;
          external_id: string | null;
          salary_min: number | null;
          salary_max: number | null;
          salary_currency: string | null;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          company: string;
          location?: string | null;
          workplace_type?: Database["public"]["Enums"]["workplace_type"];
          employment_type?: Database["public"]["Enums"]["employment_type"];
          description: string;
          source?: Database["public"]["Enums"]["job_source"];
          source_url?: string | null;
          external_id?: string | null;
          salary_min?: number | null;
          salary_max?: number | null;
          salary_currency?: string | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["jobs"]["Insert"]>;
        Relationships: [];
      };
      applications: {
        Row: {
          id: string;
          user_id: string;
          job_id: string;
          status: Database["public"]["Enums"]["application_status"];
          cv_version_id: string | null;
          notes: string | null;
          applied_at: string | null;
          last_activity_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          job_id: string;
          status?: Database["public"]["Enums"]["application_status"];
          cv_version_id?: string | null;
          notes?: string | null;
          applied_at?: string | null;
          last_activity_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["applications"]["Insert"]>;
        Relationships: [];
      };
      application_events: {
        Row: {
          id: string;
          user_id: string;
          application_id: string;
          type: Database["public"]["Enums"]["application_event_type"];
          title: string;
          details: string | null;
          from_status: Database["public"]["Enums"]["application_status"] | null;
          to_status: Database["public"]["Enums"]["application_status"] | null;
          occurred_at: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          application_id: string;
          type: Database["public"]["Enums"]["application_event_type"];
          title: string;
          details?: string | null;
          from_status?: Database["public"]["Enums"]["application_status"] | null;
          to_status?: Database["public"]["Enums"]["application_status"] | null;
          occurred_at?: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["application_events"]["Insert"]>;
        Relationships: [];
      };
      cv_versions: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          summary: string | null;
          content: string;
          file_name: string | null;
          storage_path: string | null;
          mime_type: string | null;
          skills: string[];
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          summary?: string | null;
          content: string;
          file_name?: string | null;
          storage_path?: string | null;
          mime_type?: string | null;
          skills?: string[];
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cv_versions"]["Insert"]>;
        Relationships: [];
      };
      evaluations: {
        Row: {
          id: string;
          user_id: string;
          application_id: string;
          job_id: string;
          cv_version_id: string | null;
          status: Database["public"]["Enums"]["evaluation_status"];
          recommendation: Database["public"]["Enums"]["evaluation_recommendation"] | null;
          overall_score: number | null;
          summary: string | null;
          strengths: Json;
          gaps: Json;
          evidence: Json;
          suggested_edits: Json;
          model: string | null;
          prompt_version: string | null;
          provider_mode: "api" | "local" | "demo" | null;
          provider_fingerprint: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          application_id: string;
          job_id: string;
          cv_version_id?: string | null;
          status?: Database["public"]["Enums"]["evaluation_status"];
          recommendation?: Database["public"]["Enums"]["evaluation_recommendation"] | null;
          overall_score?: number | null;
          summary?: string | null;
          strengths?: Json;
          gaps?: Json;
          evidence?: Json;
          suggested_edits?: Json;
          model?: string | null;
          prompt_version?: string | null;
          provider_mode?: "api" | "local" | "demo" | null;
          provider_fingerprint?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["evaluations"]["Insert"]>;
        Relationships: [];
      };
      reminders: {
        Row: {
          id: string;
          user_id: string;
          application_id: string | null;
          title: string;
          notes: string | null;
          due_at: string;
          status: Database["public"]["Enums"]["reminder_status"];
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          application_id?: string | null;
          title: string;
          notes?: string | null;
          due_at: string;
          status?: Database["public"]["Enums"]["reminder_status"];
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reminders"]["Insert"]>;
        Relationships: [];
      };
      import_batches: {
        Row: {
          id: string;
          user_id: string;
          source: Database["public"]["Enums"]["job_source"];
          file_name: string | null;
          status: Database["public"]["Enums"]["import_batch_status"];
          total_rows: number;
          processed_rows: number;
          succeeded_rows: number;
          failed_rows: number;
          errors: Json;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          source: Database["public"]["Enums"]["job_source"];
          file_name?: string | null;
          status?: Database["public"]["Enums"]["import_batch_status"];
          total_rows?: number;
          processed_rows?: number;
          succeeded_rows?: number;
          failed_rows?: number;
          errors?: Json;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["import_batches"]["Insert"]>;
        Relationships: [];
      };
      automation_rules: {
        Row: {
          id: string;
          user_id: string;
          type: Database["public"]["Enums"]["automation_rule_type"];
          enabled: boolean;
          config: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: Database["public"]["Enums"]["automation_rule_type"];
          enabled?: boolean;
          config?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["automation_rules"]["Insert"]>;
        Relationships: [];
      };
      automation_runs: {
        Row: {
          id: string;
          user_id: string;
          rule_id: string | null;
          application_id: string | null;
          type: Database["public"]["Enums"]["automation_rule_type"];
          status: Database["public"]["Enums"]["automation_run_status"];
          idempotency_key: string;
          error_message: string | null;
          attempts: number;
          scheduled_at: string;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          rule_id?: string | null;
          application_id?: string | null;
          type: Database["public"]["Enums"]["automation_rule_type"];
          status?: Database["public"]["Enums"]["automation_run_status"];
          idempotency_key: string;
          error_message?: string | null;
          attempts?: number;
          scheduled_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["automation_runs"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      create_imported_application: {
        Args: { p_job: Json; p_application: Json; p_batch_id: string };
        Returns: Json;
      };
      create_application_with_job: {
        Args: { p_job: Json; p_application?: Json };
        Returns: string;
      };
      transition_application_status: {
        Args: {
          p_application_id: string;
          p_to_status: Database["public"]["Enums"]["application_status"];
          p_notes?: string | null;
        };
        Returns: string;
      };
    };
    Enums: {
      application_status:
        | "saved"
        | "applied"
        | "screening"
        | "interview"
        | "offer"
        | "rejected"
        | "withdrawn"
        | "archived";
      workplace_type: "remote" | "hybrid" | "onsite" | "unspecified";
      employment_type:
        | "full_time"
        | "part_time"
        | "contract"
        | "internship"
        | "temporary"
        | "unspecified";
      job_source: "manual" | "url" | "linkedin" | "indeed" | "csv" | "api";
      application_event_type:
        | "created"
        | "status_changed"
        | "note"
        | "cv_attached"
        | "evaluation_completed"
        | "interview_scheduled"
        | "follow_up"
        | "imported";
      evaluation_status: "pending" | "running" | "completed" | "failed";
      evaluation_recommendation: "apply" | "consider" | "skip";
      reminder_status: "pending" | "completed" | "dismissed";
      import_batch_status: "pending" | "processing" | "completed" | "partial" | "failed";
      automation_rule_type: "auto_evaluate" | "follow_up" | "interview_prep";
      automation_run_status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
    };
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<
  TableName extends keyof Database["public"]["Tables"],
> = Database["public"]["Tables"][TableName]["Row"];

export type TablesInsert<
  TableName extends keyof Database["public"]["Tables"],
> = Database["public"]["Tables"][TableName]["Insert"];

export type TablesUpdate<
  TableName extends keyof Database["public"]["Tables"],
> = Database["public"]["Tables"][TableName]["Update"];
