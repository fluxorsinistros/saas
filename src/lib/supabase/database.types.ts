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
      activity_instances: {
        Row: {
          assigned_at: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          group_id: string | null
          id: string
          result: Json | null
          stage_instance_id: string
          started_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          result?: Json | null
          stage_instance_id: string
          started_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          result?: Json | null
          stage_instance_id?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_instances_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_instances_stage_instance_id_fkey"
            columns: ["stage_instance_id"]
            isOneToOne: false
            referencedRelation: "stage_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_instances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          context: Json
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          new_value: Json | null
          origin: string
          previous_value: Json | null
          reason: string | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          context?: Json
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          new_value?: Json | null
          origin?: string
          previous_value?: Json | null
          reason?: string | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          context?: Json
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          new_value?: Json | null
          origin?: string
          previous_value?: Json | null
          reason?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          amount: number | null
          claim_cycle_id: string | null
          claim_id: string | null
          competence_date: string | null
          created_at: string
          details: Json
          event_type: string
          id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          claim_cycle_id?: string | null
          claim_id?: string | null
          competence_date?: string | null
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          claim_cycle_id?: string | null
          claim_id?: string | null
          competence_date?: string | null
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_claim_cycle_id_fkey"
            columns: ["claim_cycle_id"]
            isOneToOne: false
            referencedRelation: "claim_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_instances: {
        Row: {
          branch_id: string
          created_at: string
          edge_id: string | null
          id: string
          is_required: boolean
          status: string
          target_node_id: string
          tenant_id: string
          updated_at: string
          waived_at: string | null
          waived_by: string | null
          waived_reason: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          edge_id?: string | null
          id?: string
          is_required?: boolean
          status?: string
          target_node_id: string
          tenant_id: string
          updated_at?: string
          waived_at?: string | null
          waived_by?: string | null
          waived_reason?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          edge_id?: string | null
          id?: string
          is_required?: boolean
          status?: string
          target_node_id?: string
          tenant_id?: string
          updated_at?: string
          waived_at?: string | null
          waived_by?: string | null
          waived_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_instances_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_instances_edge_id_fkey"
            columns: ["edge_id"]
            isOneToOne: false
            referencedRelation: "workflow_edges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_instances_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "workflow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_instances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          branch_mode: string
          claim_cycle_id: string
          created_at: string
          id: string
          source_node_id: string
          tenant_id: string
        }
        Insert: {
          branch_mode: string
          claim_cycle_id: string
          created_at?: string
          id?: string
          source_node_id: string
          tenant_id: string
        }
        Update: {
          branch_mode?: string
          claim_cycle_id?: string
          created_at?: string
          id?: string
          source_node_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_claim_cycle_id_fkey"
            columns: ["claim_cycle_id"]
            isOneToOne: false
            referencedRelation: "claim_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "workflow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_cycles: {
        Row: {
          claim_id: string
          claim_type_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          cycle_number: number
          discard_reason: string | null
          discarded_at: string | null
          discarded_by: string | null
          formalized_at: string | null
          id: string
          previous_cycle_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          workflow_version_id: string
        }
        Insert: {
          claim_id: string
          claim_type_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          cycle_number: number
          discard_reason?: string | null
          discarded_at?: string | null
          discarded_by?: string | null
          formalized_at?: string | null
          id?: string
          previous_cycle_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          workflow_version_id: string
        }
        Update: {
          claim_id?: string
          claim_type_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          cycle_number?: number
          discard_reason?: string | null
          discarded_at?: string | null
          discarded_by?: string | null
          formalized_at?: string | null
          id?: string
          previous_cycle_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          workflow_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_cycles_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_cycles_claim_type_id_fkey"
            columns: ["claim_type_id"]
            isOneToOne: false
            referencedRelation: "claim_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_cycles_previous_cycle_id_fkey"
            columns: ["previous_cycle_id"]
            isOneToOne: false
            referencedRelation: "claim_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_cycles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_cycles_workflow_version_id_fkey"
            columns: ["workflow_version_id"]
            isOneToOne: false
            referencedRelation: "workflow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_types: {
        Row: {
          claim_category_id: string
          created_at: string
          default_workflow_id: string | null
          id: string
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          claim_category_id: string
          created_at?: string
          default_workflow_id?: string | null
          id?: string
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          claim_category_id?: string
          created_at?: string
          default_workflow_id?: string | null
          id?: string
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_types_claim_category_id_fkey"
            columns: ["claim_category_id"]
            isOneToOne: false
            referencedRelation: "claim_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_types_default_workflow_id_fkey"
            columns: ["default_workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      claims: {
        Row: {
          claim_category_id: string
          claim_number: string
          created_at: string
          created_by: string | null
          custom_fields: Json
          declared_value: number | null
          external_reference: string | null
          id: string
          location: Json | null
          occurred_at: string | null
          primary_organization_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          claim_category_id: string
          claim_number: string
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          declared_value?: number | null
          external_reference?: string | null
          id?: string
          location?: Json | null
          occurred_at?: string | null
          primary_organization_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          claim_category_id?: string
          claim_number?: string
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          declared_value?: number | null
          external_reference?: string | null
          id?: string
          location?: Json | null
          occurred_at?: string | null
          primary_organization_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_claim_category_id_fkey"
            columns: ["claim_category_id"]
            isOneToOne: false
            referencedRelation: "claim_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_primary_organization_id_fkey"
            columns: ["primary_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          activity_instance_id: string | null
          author_id: string | null
          body: string
          claim_cycle_id: string
          created_at: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activity_instance_id?: string | null
          author_id?: string | null
          body: string
          claim_cycle_id: string
          created_at?: string
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activity_instance_id?: string | null
          author_id?: string | null
          body?: string
          claim_cycle_id?: string
          created_at?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_activity_instance_id_fkey"
            columns: ["activity_instance_id"]
            isOneToOne: false
            referencedRelation: "activity_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_claim_cycle_id_fkey"
            columns: ["claim_cycle_id"]
            isOneToOne: false
            referencedRelation: "claim_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_configuration_snapshots: {
        Row: {
          claim_cycle_id: string
          created_at: string
          id: string
          snapshot: Json
          tenant_id: string
          workflow_version_id: string
        }
        Insert: {
          claim_cycle_id: string
          created_at?: string
          id?: string
          snapshot: Json
          tenant_id: string
          workflow_version_id: string
        }
        Update: {
          claim_cycle_id?: string
          created_at?: string
          id?: string
          snapshot?: Json
          tenant_id?: string
          workflow_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycle_configuration_snapshots_claim_cycle_id_fkey"
            columns: ["claim_cycle_id"]
            isOneToOne: true
            referencedRelation: "claim_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_configuration_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_configuration_snapshots_workflow_version_id_fkey"
            columns: ["workflow_version_id"]
            isOneToOne: false
            referencedRelation: "workflow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_financial_entries: {
        Row: {
          amount: number
          claim_cycle_id: string
          created_at: string
          created_by: string | null
          description: string
          entry_date: string
          entry_type: string
          id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          claim_cycle_id: string
          created_at?: string
          created_by?: string | null
          description: string
          entry_date?: string
          entry_type: string
          id?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          claim_cycle_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          entry_date?: string
          entry_type?: string
          id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycle_financial_entries_claim_cycle_id_fkey"
            columns: ["claim_cycle_id"]
            isOneToOne: false
            referencedRelation: "claim_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_financial_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          claim_cycle_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          justification: string | null
          node_id: string | null
          options: Json
          question: string
          requires_approval: boolean
          selected_option: string | null
          stage_instance_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          claim_cycle_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          justification?: string | null
          node_id?: string | null
          options?: Json
          question: string
          requires_approval?: boolean
          selected_option?: string | null
          stage_instance_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          claim_cycle_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          justification?: string | null
          node_id?: string | null
          options?: Json
          question?: string
          requires_approval?: boolean
          selected_option?: string | null
          stage_instance_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_claim_cycle_id_fkey"
            columns: ["claim_cycle_id"]
            isOneToOne: false
            referencedRelation: "claim_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "workflow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_stage_instance_id_fkey"
            columns: ["stage_instance_id"]
            isOneToOne: false
            referencedRelation: "stage_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          created_at: string
          document_id: string
          file_name: string
          id: string
          mime_type: string | null
          rejection_reason: string | null
          size_bytes: number
          storage_path: string
          tenant_id: string
          uploaded_at: string
          uploaded_by: string | null
          validated_at: string | null
          validated_by: string | null
          version_number: number
        }
        Insert: {
          created_at?: string
          document_id: string
          file_name: string
          id?: string
          mime_type?: string | null
          rejection_reason?: string | null
          size_bytes: number
          storage_path: string
          tenant_id: string
          uploaded_at?: string
          uploaded_by?: string | null
          validated_at?: string | null
          validated_by?: string | null
          version_number: number
        }
        Update: {
          created_at?: string
          document_id?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          rejection_reason?: string | null
          size_bytes?: number
          storage_path?: string
          tenant_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          validated_at?: string | null
          validated_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          claim_cycle_id: string
          created_at: string
          document_type_id: string
          id: string
          is_required: boolean
          node_id: string | null
          requested_at: string | null
          requested_by: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          claim_cycle_id: string
          created_at?: string
          document_type_id: string
          id?: string
          is_required?: boolean
          node_id?: string | null
          requested_at?: string | null
          requested_by?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          claim_cycle_id?: string
          created_at?: string
          document_type_id?: string
          id?: string
          is_required?: boolean
          node_id?: string | null
          requested_at?: string | null
          requested_by?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_claim_cycle_id_fkey"
            columns: ["claim_cycle_id"]
            isOneToOne: false
            referencedRelation: "claim_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "workflow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      duplicate_candidates: {
        Row: {
          candidate_claim_id: string
          confidence: number | null
          created_at: string
          duplicate_check_id: string
          id: string
          matched_fields: Json | null
          tenant_id: string
        }
        Insert: {
          candidate_claim_id: string
          confidence?: number | null
          created_at?: string
          duplicate_check_id: string
          id?: string
          matched_fields?: Json | null
          tenant_id: string
        }
        Update: {
          candidate_claim_id?: string
          confidence?: number | null
          created_at?: string
          duplicate_check_id?: string
          id?: string
          matched_fields?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "duplicate_candidates_candidate_claim_id_fkey"
            columns: ["candidate_claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_candidates_duplicate_check_id_fkey"
            columns: ["duplicate_check_id"]
            isOneToOne: false
            referencedRelation: "duplicate_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_candidates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      duplicate_checks: {
        Row: {
          claim_id: string
          confidence: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision: string | null
          evidence: Json
          id: string
          justification: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          claim_id: string
          confidence?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          evidence: Json
          id?: string
          justification?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          claim_id?: string
          confidence?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          evidence?: Json
          id?: string
          justification?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "duplicate_checks_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_checks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          membership_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          membership_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "tenant_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          description: string | null
          disabled_actions: string[]
          hidden_screens: string[]
          id: string
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          disabled_actions?: string[]
          hidden_screens?: string[]
          id?: string
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          disabled_actions?: string[]
          hidden_screens?: string[]
          id?: string
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          created_at: string
          created_claim_id: string | null
          errors: Json | null
          id: string
          import_id: string
          raw_data: Json
          row_number: number
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_claim_id?: string | null
          errors?: Json | null
          id?: string
          import_id: string
          raw_data: Json
          row_number: number
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_claim_id?: string | null
          errors?: Json | null
          id?: string
          import_id?: string
          raw_data?: Json
          row_number?: number
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_created_claim_id_fkey"
            columns: ["created_claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          created_at: string
          created_by: string | null
          created_rows: number | null
          duplicate_rows: number | null
          error_rows: number | null
          file_name: string
          id: string
          ignored_rows: number | null
          status: string
          storage_path: string | null
          tenant_id: string
          total_rows: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_rows?: number | null
          duplicate_rows?: number | null
          error_rows?: number | null
          file_name: string
          id?: string
          ignored_rows?: number | null
          status?: string
          storage_path?: string | null
          tenant_id: string
          total_rows?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_rows?: number | null
          duplicate_rows?: number | null
          error_rows?: number | null
          file_name?: string
          id?: string
          ignored_rows?: number | null
          status?: string
          storage_path?: string | null
          tenant_id?: string
          total_rows?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_connections: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          provider: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          provider: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          provider?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      join_instances: {
        Row: {
          branch_instance_id: string
          created_at: string
          id: string
          join_id: string
          satisfied: boolean
          satisfied_at: string | null
          tenant_id: string
        }
        Insert: {
          branch_instance_id: string
          created_at?: string
          id?: string
          join_id: string
          satisfied?: boolean
          satisfied_at?: string | null
          tenant_id: string
        }
        Update: {
          branch_instance_id?: string
          created_at?: string
          id?: string
          join_id?: string
          satisfied?: boolean
          satisfied_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_instances_branch_instance_id_fkey"
            columns: ["branch_instance_id"]
            isOneToOne: false
            referencedRelation: "branch_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_instances_join_id_fkey"
            columns: ["join_id"]
            isOneToOne: false
            referencedRelation: "joins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_instances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      joins: {
        Row: {
          branch_id: string | null
          claim_cycle_id: string
          condition: Json | null
          created_at: string
          id: string
          min_count: number | null
          node_id: string
          released_at: string | null
          rule_type: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          claim_cycle_id: string
          condition?: Json | null
          created_at?: string
          id?: string
          min_count?: number | null
          node_id: string
          released_at?: string | null
          rule_type: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          claim_cycle_id?: string
          condition?: Json | null
          created_at?: string
          id?: string
          min_count?: number | null
          node_id?: string
          released_at?: string | null
          rule_type?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "joins_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "joins_claim_cycle_id_fkey"
            columns: ["claim_cycle_id"]
            isOneToOne: false
            referencedRelation: "claim_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "joins_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "workflow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "joins_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_roles: {
        Row: {
          membership_id: string
          role_id: string
        }
        Insert: {
          membership_id: string
          role_id: string
        }
        Update: {
          membership_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_roles_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "tenant_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          channel: string
          created_at: string
          id: string
          notification_id: string
          read_at: string | null
          recipient_group_id: string | null
          recipient_user_id: string | null
          sent_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          notification_id: string
          read_at?: string | null
          recipient_group_id?: string | null
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          notification_id?: string
          read_at?: string | null
          recipient_group_id?: string | null
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_recipient_group_id_fkey"
            columns: ["recipient_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          claim_cycle_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          tenant_id: string
        }
        Insert: {
          claim_cycle_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          tenant_id: string
        }
        Update: {
          claim_cycle_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_claim_cycle_id_fkey"
            columns: ["claim_cycle_id"]
            isOneToOne: false
            referencedRelation: "claim_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          legal_name: string | null
          name: string
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          legal_name?: string | null
          name: string
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          legal_name?: string | null
          name?: string
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pending_items: {
        Row: {
          activity_instance_id: string | null
          claim_cycle_id: string
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          requested_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          responsible_group_id: string | null
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          activity_instance_id?: string | null
          claim_cycle_id: string
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          requested_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          responsible_group_id?: string | null
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          activity_instance_id?: string | null
          claim_cycle_id?: string
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          requested_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          responsible_group_id?: string | null
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_items_activity_instance_id_fkey"
            columns: ["activity_instance_id"]
            isOneToOne: false
            referencedRelation: "activity_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_items_claim_cycle_id_fkey"
            columns: ["claim_cycle_id"]
            isOneToOne: false
            referencedRelation: "claim_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_items_responsible_group_id_fkey"
            columns: ["responsible_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          category: string | null
          code: string
          description: string | null
          id: string
        }
        Insert: {
          category?: string | null
          code: string
          description?: string | null
          id?: string
        }
        Update: {
          category?: string | null
          code?: string
          description?: string | null
          id?: string
        }
        Relationships: []
      }
      plan_limits: {
        Row: {
          created_at: string
          id: string
          limit_key: string
          limit_value: number | null
          plan_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          limit_key: string
          limit_value?: number | null
          plan_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          limit_key?: string
          limit_value?: number | null
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_limits_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          claim_price: number
          id: string
          monthly_fee: number
          name: string
          setup_fee: number
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          claim_price?: number
          id?: string
          monthly_fee?: number
          name: string
          setup_fee?: number
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          claim_price?: number
          id?: string
          monthly_fee?: number
          name?: string
          setup_fee?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          id: boolean
          logo_path: string | null
          product_name: string
          tagline: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          logo_path?: string | null
          product_name?: string
          tagline?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          logo_path?: string | null
          product_name?: string
          tagline?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          granted_at: string
          granted_by: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_calendar_exceptions: {
        Row: {
          calendar_id: string
          exception_date: string
          id: string
          is_working_day: boolean
          note: string | null
          tenant_id: string
        }
        Insert: {
          calendar_id: string
          exception_date: string
          id?: string
          is_working_day?: boolean
          note?: string | null
          tenant_id: string
        }
        Update: {
          calendar_id?: string
          exception_date?: string
          id?: string
          is_working_day?: boolean
          note?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_calendar_exceptions_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "sla_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_calendar_exceptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_calendars: {
        Row: {
          business_days: number[]
          business_end: string | null
          business_start: string | null
          created_at: string
          id: string
          name: string
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          business_days?: number[]
          business_end?: string | null
          business_start?: string | null
          created_at?: string
          id?: string
          name: string
          tenant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          business_days?: number[]
          business_end?: string | null
          business_start?: string | null
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_calendars_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_pauses: {
        Row: {
          authorized_by: string | null
          created_at: string
          id: string
          pause_type: string
          paused_at: string
          reason: string
          requires_authorization: boolean
          resumed_at: string | null
          sla_tracking_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          authorized_by?: string | null
          created_at?: string
          id?: string
          pause_type: string
          paused_at?: string
          reason: string
          requires_authorization?: boolean
          resumed_at?: string | null
          sla_tracking_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          authorized_by?: string | null
          created_at?: string
          id?: string
          pause_type?: string
          paused_at?: string
          reason?: string
          requires_authorization?: boolean
          resumed_at?: string | null
          sla_tracking_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_pauses_sla_tracking_id_fkey"
            columns: ["sla_tracking_id"]
            isOneToOne: false
            referencedRelation: "sla_tracking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_pauses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_tracking: {
        Row: {
          activity_instance_id: string | null
          claim_cycle_id: string
          completed_at: string | null
          created_at: string
          id: string
          last_alert_threshold: number
          paused_minutes: number
          stage_instance_id: string | null
          started_at: string
          status: string
          target_at: string
          tenant_id: string
          updated_at: string
          workflow_sla_id: string
        }
        Insert: {
          activity_instance_id?: string | null
          claim_cycle_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          last_alert_threshold?: number
          paused_minutes?: number
          stage_instance_id?: string | null
          started_at?: string
          status?: string
          target_at: string
          tenant_id: string
          updated_at?: string
          workflow_sla_id: string
        }
        Update: {
          activity_instance_id?: string | null
          claim_cycle_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          last_alert_threshold?: number
          paused_minutes?: number
          stage_instance_id?: string | null
          started_at?: string
          status?: string
          target_at?: string
          tenant_id?: string
          updated_at?: string
          workflow_sla_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_tracking_activity_instance_id_fkey"
            columns: ["activity_instance_id"]
            isOneToOne: false
            referencedRelation: "activity_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_tracking_claim_cycle_id_fkey"
            columns: ["claim_cycle_id"]
            isOneToOne: false
            referencedRelation: "claim_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_tracking_stage_instance_id_fkey"
            columns: ["stage_instance_id"]
            isOneToOne: false
            referencedRelation: "stage_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_tracking_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_tracking_workflow_sla_id_fkey"
            columns: ["workflow_sla_id"]
            isOneToOne: false
            referencedRelation: "workflow_slas"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_instances: {
        Row: {
          branch_instance_id: string | null
          claim_cycle_id: string
          created_at: string
          entered_at: string
          entry_reason: string | null
          exited_at: string | null
          id: string
          node_id: string
          pass_number: number
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_instance_id?: string | null
          claim_cycle_id: string
          created_at?: string
          entered_at?: string
          entry_reason?: string | null
          exited_at?: string | null
          id?: string
          node_id: string
          pass_number: number
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_instance_id?: string | null
          claim_cycle_id?: string
          created_at?: string
          entered_at?: string
          entry_reason?: string | null
          exited_at?: string | null
          id?: string
          node_id?: string
          pass_number?: number
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_instances_branch_instance_id_fkey"
            columns: ["branch_instance_id"]
            isOneToOne: false
            referencedRelation: "branch_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_instances_claim_cycle_id_fkey"
            columns: ["claim_cycle_id"]
            isOneToOne: false
            referencedRelation: "claim_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_instances_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "workflow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_instances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_usage: {
        Row: {
          bytes_used: number
          claim_cycle_id: string | null
          claim_id: string | null
          id: string
          measured_at: string
          overage_bytes: number
          quota_bytes: number | null
          tenant_id: string
        }
        Insert: {
          bytes_used?: number
          claim_cycle_id?: string | null
          claim_id?: string | null
          id?: string
          measured_at?: string
          overage_bytes?: number
          quota_bytes?: number | null
          tenant_id: string
        }
        Update: {
          bytes_used?: number
          claim_cycle_id?: string | null
          claim_id?: string | null
          id?: string
          measured_at?: string
          overage_bytes?: number
          quota_bytes?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_usage_claim_cycle_id_fkey"
            columns: ["claim_cycle_id"]
            isOneToOne: false
            referencedRelation: "claim_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_contracts: {
        Row: {
          billing_organization_id: string | null
          created_at: string
          ended_at: string | null
          id: string
          overrides: Json
          plan_id: string
          started_at: string
          status: string
          tenant_id: string
          updated_at: string
          white_label_enabled: boolean
          white_label_surcharge_pct: number
        }
        Insert: {
          billing_organization_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          overrides?: Json
          plan_id: string
          started_at?: string
          status?: string
          tenant_id: string
          updated_at?: string
          white_label_enabled?: boolean
          white_label_surcharge_pct?: number
        }
        Update: {
          billing_organization_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          overrides?: Json
          plan_id?: string
          started_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          white_label_enabled?: boolean
          white_label_surcharge_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_contracts_billing_organization_id_fkey"
            columns: ["billing_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_contracts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_effective_limits: {
        Row: {
          computed_at: string
          limits: Json
          tenant_id: string
        }
        Insert: {
          computed_at?: string
          limits?: Json
          tenant_id: string
        }
        Update: {
          computed_at?: string
          limits?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_effective_limits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_memberships: {
        Row: {
          created_at: string
          id: string
          invited_at: string | null
          joined_at: string | null
          left_at: string | null
          organization_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          left_at?: string | null
          organization_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          left_at?: string | null
          organization_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_organizations: {
        Row: {
          created_at: string
          id: string
          is_owner: boolean
          organization_id: string
          role_kind: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_owner?: boolean
          organization_id: string
          role_kind: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_owner?: boolean
          organization_id?: string
          role_kind?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_organizations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          onboarding_completed_at: string | null
          onboarding_step: number
          operating_model: string | null
          settings: Json
          slug: string
          status: string
          suspended_at: string | null
          suspension_reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          onboarding_completed_at?: string | null
          onboarding_step?: number
          operating_model?: string | null
          settings?: Json
          slug: string
          status?: string
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          onboarding_completed_at?: string | null
          onboarding_step?: number
          operating_model?: string | null
          settings?: Json
          slug?: string
          status?: string
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          cpf: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cpf?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          attempt_count: number
          created_at: string
          id: string
          last_attempt_at: string | null
          last_response_code: number | null
          next_retry_at: string | null
          notification_id: string | null
          payload: Json
          status: string
          tenant_id: string
          updated_at: string
          webhook_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_response_code?: number | null
          next_retry_at?: string | null
          notification_id?: string | null
          payload: Json
          status?: string
          tenant_id: string
          updated_at?: string
          webhook_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_response_code?: number | null
          next_retry_at?: string | null
          notification_id?: string | null
          payload?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string
          created_by: string | null
          event_types: string[]
          id: string
          name: string
          secret: string
          status: string
          target_url: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_types: string[]
          id?: string
          name: string
          secret: string
          status?: string
          target_url: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_types?: string[]
          id?: string
          name?: string
          secret?: string
          status?: string
          target_url?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_document_requirements: {
        Row: {
          created_at: string
          document_type_id: string
          id: string
          is_required: boolean
          node_id: string | null
          tenant_id: string
          updated_at: string
          workflow_version_id: string
        }
        Insert: {
          created_at?: string
          document_type_id: string
          id?: string
          is_required?: boolean
          node_id?: string | null
          tenant_id: string
          updated_at?: string
          workflow_version_id: string
        }
        Update: {
          created_at?: string
          document_type_id?: string
          id?: string
          is_required?: boolean
          node_id?: string | null
          tenant_id?: string
          updated_at?: string
          workflow_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_document_requirements_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_document_requirements_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "workflow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_document_requirements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_document_requirements_workflow_version_id_fkey"
            columns: ["workflow_version_id"]
            isOneToOne: false
            referencedRelation: "workflow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_edges: {
        Row: {
          condition: Json | null
          config: Json
          created_at: string
          edge_type: string
          from_node_id: string
          id: string
          is_required: boolean
          label: string | null
          order_index: number
          tenant_id: string
          to_node_id: string
          updated_at: string
          workflow_version_id: string
        }
        Insert: {
          condition?: Json | null
          config?: Json
          created_at?: string
          edge_type: string
          from_node_id: string
          id?: string
          is_required?: boolean
          label?: string | null
          order_index?: number
          tenant_id: string
          to_node_id: string
          updated_at?: string
          workflow_version_id: string
        }
        Update: {
          condition?: Json | null
          config?: Json
          created_at?: string
          edge_type?: string
          from_node_id?: string
          id?: string
          is_required?: boolean
          label?: string | null
          order_index?: number
          tenant_id?: string
          to_node_id?: string
          updated_at?: string
          workflow_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_edges_from_node_id_fkey"
            columns: ["from_node_id"]
            isOneToOne: false
            referencedRelation: "workflow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_edges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_edges_to_node_id_fkey"
            columns: ["to_node_id"]
            isOneToOne: false
            referencedRelation: "workflow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_edges_workflow_version_id_fkey"
            columns: ["workflow_version_id"]
            isOneToOne: false
            referencedRelation: "workflow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_fields: {
        Row: {
          created_at: string
          default_value: string | null
          field_type: string
          id: string
          is_unique: boolean
          key: string
          label: string
          options: Json | null
          required: boolean
          tenant_id: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          default_value?: string | null
          field_type: string
          id?: string
          is_unique?: boolean
          key: string
          label: string
          options?: Json | null
          required?: boolean
          tenant_id: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          default_value?: string | null
          field_type?: string
          id?: string
          is_unique?: boolean
          key?: string
          label?: string
          options?: Json | null
          required?: boolean
          tenant_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_fields_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_fields_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_nodes: {
        Row: {
          config: Json
          created_at: string
          group_id: string | null
          id: string
          name: string
          node_key: string
          node_type: string
          position: Json | null
          tenant_id: string
          updated_at: string
          workflow_version_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          group_id?: string | null
          id?: string
          name: string
          node_key: string
          node_type: string
          position?: Json | null
          tenant_id: string
          updated_at?: string
          workflow_version_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          group_id?: string | null
          id?: string
          name?: string
          node_key?: string
          node_type?: string
          position?: Json | null
          tenant_id?: string
          updated_at?: string
          workflow_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_nodes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_nodes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_nodes_workflow_version_id_fkey"
            columns: ["workflow_version_id"]
            isOneToOne: false
            referencedRelation: "workflow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_rules: {
        Row: {
          config: Json
          created_at: string
          id: string
          node_id: string | null
          rule_type: string
          tenant_id: string
          updated_at: string
          workflow_version_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          node_id?: string | null
          rule_type: string
          tenant_id: string
          updated_at?: string
          workflow_version_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          node_id?: string | null
          rule_type?: string
          tenant_id?: string
          updated_at?: string
          workflow_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_rules_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "workflow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_rules_workflow_version_id_fkey"
            columns: ["workflow_version_id"]
            isOneToOne: false
            referencedRelation: "workflow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_slas: {
        Row: {
          alert_thresholds: number[]
          calendar_id: string | null
          created_at: string
          duration_minutes: number
          escalation_target_group_id: string | null
          escalation_target_type: string | null
          id: string
          node_id: string | null
          sla_scope: string
          tenant_id: string
          updated_at: string
          workflow_version_id: string
        }
        Insert: {
          alert_thresholds?: number[]
          calendar_id?: string | null
          created_at?: string
          duration_minutes: number
          escalation_target_group_id?: string | null
          escalation_target_type?: string | null
          id?: string
          node_id?: string | null
          sla_scope: string
          tenant_id: string
          updated_at?: string
          workflow_version_id: string
        }
        Update: {
          alert_thresholds?: number[]
          calendar_id?: string | null
          created_at?: string
          duration_minutes?: number
          escalation_target_group_id?: string | null
          escalation_target_type?: string | null
          id?: string
          node_id?: string | null
          sla_scope?: string
          tenant_id?: string
          updated_at?: string
          workflow_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_slas_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "sla_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_slas_escalation_target_group_id_fkey"
            columns: ["escalation_target_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_slas_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "workflow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_slas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_slas_workflow_version_id_fkey"
            columns: ["workflow_version_id"]
            isOneToOne: false
            referencedRelation: "workflow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_versions: {
        Row: {
          created_at: string
          id: string
          published_at: string | null
          published_by: string | null
          release_note: string | null
          status: string
          tenant_id: string
          updated_at: string
          validation_errors: Json | null
          version_number: number
          workflow_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          release_note?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          validation_errors?: Json | null
          version_number: number
          workflow_id: string
        }
        Update: {
          created_at?: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          release_note?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          validation_errors?: Json | null
          version_number?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_versions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          claim_type_id: string | null
          created_at: string
          description: string | null
          id: string
          is_template: boolean
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          claim_type_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_template?: boolean
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          claim_type_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_template?: boolean
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_claim_type_id_fkey"
            columns: ["claim_type_id"]
            isOneToOne: false
            referencedRelation: "claim_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_tenant_member: {
        Args: { p_email: string; p_tenant_id: string }
        Returns: string
      }
      create_draft_from_version: {
        Args: { p_version_id: string }
        Returns: string
      }
      create_partner_organization: {
        Args: { p_name: string; p_role_kind: string; p_tenant_id: string }
        Returns: string
      }
      create_tenant: { Args: { p_name: string }; Returns: string }
      tenant_add_user: {
        Args: {
          p_tenant_id: string
          p_email: string
          p_role_id: string
          p_group_id?: string | null
          p_full_name?: string | null
          p_phone?: string | null
          p_cpf?: string | null
        }
        Returns: string
      }
      create_user_with_password: {
        Args: {
          p_tenant_id: string
          p_email: string
          p_password: string
          p_role_id: string
          p_group_id?: string | null
          p_full_name?: string | null
          p_phone?: string | null
          p_cpf?: string | null
        }
        Returns: string
      }
      admin_set_user_password: { Args: { p_user_id: string; p_password: string }; Returns: undefined }
      admin_add_person: {
        Args: {
          p_tenant_id: string
          p_email: string
          p_role_id: string
          p_group_id?: string | null
          p_full_name?: string | null
          p_phone?: string | null
          p_cpf?: string | null
        }
        Returns: string
      }
      tenant_cancel_invite: { Args: { p_invite_id: string }; Returns: undefined }
      tenant_search_users: {
        Args: {
          p_tenant_id: string
          p_q?: string
          p_role_name?: string
          p_status?: string
          p_group_name?: string
          p_limit?: number
          p_offset?: number
          p_organization_name?: string
        }
        Returns: {
          organization_name: string | null
          total: number
          membership_id: string | null
          invite_id: string | null
          user_id: string | null
          email: string
          full_name: string | null
          role_name: string | null
          groups: string | null
          pending: boolean
          status: string
        }[]
      }
      tenant_update_member: {
        Args: { p_membership_id: string; p_role_id: string; p_group_id?: string | null; p_active: boolean }
        Returns: undefined
      }
      admin_create_tenant: { Args: { p_name: string; p_admin_email?: string }; Returns: string }
      admin_grant_tenant_admin: { Args: { p_tenant_id: string; p_email: string }; Returns: string }
      admin_add_tenant_user: { Args: { p_tenant_id: string; p_email: string; p_role_id: string }; Returns: string }
      admin_can_manage_user: { Args: { p_user_id: string }; Returns: boolean }
      admin_list_tenant_users: {
        Args: { p_tenant_ids: string[] }
        Returns: {
          tenant_id: string
          membership_id: string | null
          invite_id: string | null
          user_id: string | null
          email: string
          full_name: string | null
          role_name: string | null
          pending: boolean
          status: string
        }[]
      }
      admin_search_users: {
        Args: {
          p_q?: string
          p_tenant_id?: string
          p_role_name?: string
          p_status?: string
          p_group_name?: string
          p_limit?: number
          p_offset?: number
          p_organization_name?: string
        }
        Returns: {
          organization_name: string | null
          total: number
          tenant_id: string | null
          tenant_name: string
          membership_id: string | null
          invite_id: string | null
          user_id: string | null
          email: string
          full_name: string | null
          role_id: string | null
          role_name: string | null
          groups: string | null
          pending: boolean
          status: string
        }[]
      }
      admin_group_names: { Args: Record<PropertyKey, never>; Returns: string[] }
      admin_get_person: {
        Args: { p_id: string }
        Returns: {
          kind: string
          membership_id: string | null
          tenant_id: string | null
          user_id: string
          email: string
          full_name: string | null
          phone: string | null
          cpf: string | null
          role_name: string | null
          status: string
          group_id: string | null
        }[]
      }
      admin_all_organizations: {
        Args: Record<PropertyKey, never>
        Returns: { id: string; tenant_id: string; name: string; is_owner: boolean }[]
      }
      set_person_organization: { Args: { p_tenant_id: string; p_email: string; p_organization_id: string }; Returns: undefined }
      admin_all_groups: { Args: Record<PropertyKey, never>; Returns: { id: string; tenant_id: string; name: string }[] }
      admin_save_person: {
        Args: {
          p_id: string
          p_full_name: string
          p_phone: string
          p_cpf: string
          p_kind: string
          p_tenant_id?: string | null
          p_role_name: string
          p_active: boolean
          p_group_id?: string | null
        }
        Returns: string
      }
      admin_tenant_audit: {
        Args: { p_tenant_id: string; p_limit?: number }
        Returns: {
          id: string
          created_at: string
          action: string
          actor_email: string | null
          entity_type: string
          new_value: Json | null
          reason: string | null
        }[]
      }
      admin_set_member_active: { Args: { p_membership_id: string; p_active: boolean }; Returns: undefined }
      admin_revoke_tenant_access: { Args: { p_membership_id?: string; p_invite_id?: string }; Returns: undefined }
      claim_pending_invites: { Args: Record<PropertyKey, never>; Returns: number }
      my_blocked_tenants: {
        Args: Record<PropertyKey, never>
        Returns: { id: string; name: string; status: string; suspension_reason: string | null }[]
      }
      publish_workflow_version: {
        Args: {
          p_release_note?: string
          p_validation: Json
          p_version_id: string
        }
        Returns: undefined
      }
      save_workflow_draft: {
        Args: { p_edges: Json; p_nodes: Json; p_version_id: string }
        Returns: undefined
      }
      set_membership_role: {
        Args: { p_membership_id: string; p_role_id: string }
        Returns: undefined
      }
      write_audit: {
        Args: {
          p_action: string
          p_entity_id: string
          p_entity_type: string
          p_new?: Json
          p_previous?: Json
          p_reason?: string
          p_tenant_id: string
        }
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
    Enums: {},
  },
} as const
