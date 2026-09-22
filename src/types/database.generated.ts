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
      admin_bootstrap_emails: {
        Row: {
          created_at: string
          email: string
          note: string | null
        }
        Insert: {
          created_at?: string
          email: string
          note?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          note?: string | null
        }
        Relationships: []
      }
      app_users: {
        Row: {
          created_at: string
          email: string | null
          is_admin: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          is_admin?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          is_admin?: boolean
          user_id?: string
        }
        Relationships: []
      }
      backup_fpl_player_gameweeks_20260919: {
        Row: {
          assists: number | null
          bonus: number | null
          bps: number | null
          clean_sheets: number | null
          creativity: number | null
          expected_assists: number | null
          expected_goal_involvements: number | null
          expected_goals: number | null
          expected_goals_conceded: number | null
          fpl_event_id: number | null
          fpl_fixture_id: number | null
          fpl_player_id: number | null
          goals_conceded: number | null
          goals_scored: number | null
          ict_index: number | null
          influence: number | null
          kickoff_time: string | null
          minutes: number | null
          opponent_fpl_team_id: number | null
          own_goals: number | null
          penalties_missed: number | null
          penalties_saved: number | null
          red_cards: number | null
          saves: number | null
          season_id: number | null
          selected: number | null
          source_payload: Json | null
          threat: number | null
          total_points: number | null
          transfers_in: number | null
          transfers_out: number | null
          updated_at: string | null
          value: number | null
          was_home: boolean | null
          yellow_cards: number | null
        }
        Insert: {
          assists?: number | null
          bonus?: number | null
          bps?: number | null
          clean_sheets?: number | null
          creativity?: number | null
          expected_assists?: number | null
          expected_goal_involvements?: number | null
          expected_goals?: number | null
          expected_goals_conceded?: number | null
          fpl_event_id?: number | null
          fpl_fixture_id?: number | null
          fpl_player_id?: number | null
          goals_conceded?: number | null
          goals_scored?: number | null
          ict_index?: number | null
          influence?: number | null
          kickoff_time?: string | null
          minutes?: number | null
          opponent_fpl_team_id?: number | null
          own_goals?: number | null
          penalties_missed?: number | null
          penalties_saved?: number | null
          red_cards?: number | null
          saves?: number | null
          season_id?: number | null
          selected?: number | null
          source_payload?: Json | null
          threat?: number | null
          total_points?: number | null
          transfers_in?: number | null
          transfers_out?: number | null
          updated_at?: string | null
          value?: number | null
          was_home?: boolean | null
          yellow_cards?: number | null
        }
        Update: {
          assists?: number | null
          bonus?: number | null
          bps?: number | null
          clean_sheets?: number | null
          creativity?: number | null
          expected_assists?: number | null
          expected_goal_involvements?: number | null
          expected_goals?: number | null
          expected_goals_conceded?: number | null
          fpl_event_id?: number | null
          fpl_fixture_id?: number | null
          fpl_player_id?: number | null
          goals_conceded?: number | null
          goals_scored?: number | null
          ict_index?: number | null
          influence?: number | null
          kickoff_time?: string | null
          minutes?: number | null
          opponent_fpl_team_id?: number | null
          own_goals?: number | null
          penalties_missed?: number | null
          penalties_saved?: number | null
          red_cards?: number | null
          saves?: number | null
          season_id?: number | null
          selected?: number | null
          source_payload?: Json | null
          threat?: number | null
          total_points?: number | null
          transfers_in?: number | null
          transfers_out?: number | null
          updated_at?: string | null
          value?: number | null
          was_home?: boolean | null
          yellow_cards?: number | null
        }
        Relationships: []
      }
      backup_fpl_player_snapshots_20260919: {
        Row: {
          captured_at: string | null
          chance_of_playing_next_round: number | null
          chance_of_playing_this_round: number | null
          event_points: number | null
          fpl_player_id: number | null
          fpl_team_id: number | null
          news: string | null
          now_cost: number | null
          season_id: number | null
          selected_by_percent: number | null
          snapshot_date: string | null
          source_payload: Json | null
          status: string | null
          total_points: number | null
          transfers_in: number | null
          transfers_in_event: number | null
          transfers_out: number | null
          transfers_out_event: number | null
        }
        Insert: {
          captured_at?: string | null
          chance_of_playing_next_round?: number | null
          chance_of_playing_this_round?: number | null
          event_points?: number | null
          fpl_player_id?: number | null
          fpl_team_id?: number | null
          news?: string | null
          now_cost?: number | null
          season_id?: number | null
          selected_by_percent?: number | null
          snapshot_date?: string | null
          source_payload?: Json | null
          status?: string | null
          total_points?: number | null
          transfers_in?: number | null
          transfers_in_event?: number | null
          transfers_out?: number | null
          transfers_out_event?: number | null
        }
        Update: {
          captured_at?: string | null
          chance_of_playing_next_round?: number | null
          chance_of_playing_this_round?: number | null
          event_points?: number | null
          fpl_player_id?: number | null
          fpl_team_id?: number | null
          news?: string | null
          now_cost?: number | null
          season_id?: number | null
          selected_by_percent?: number | null
          snapshot_date?: string | null
          source_payload?: Json | null
          status?: string | null
          total_points?: number | null
          transfers_in?: number | null
          transfers_in_event?: number | null
          transfers_out?: number | null
          transfers_out_event?: number | null
        }
        Relationships: []
      }
      backup_fpl_players_20260919: {
        Row: {
          assists: number | null
          bonus: number | null
          bps: number | null
          canonical_team_id: number | null
          chance_of_playing_next_round: number | null
          chance_of_playing_this_round: number | null
          clean_sheets: number | null
          creativity: number | null
          element_type: number | null
          event_points: number | null
          expected_assists: number | null
          expected_goal_involvements: number | null
          expected_goals: number | null
          expected_goals_conceded: number | null
          first_name: string | null
          fpl_code: number | null
          fpl_player_id: number | null
          fpl_team_id: number | null
          goals_conceded: number | null
          goals_scored: number | null
          ict_index: number | null
          influence: number | null
          minutes: number | null
          news: string | null
          news_added: string | null
          now_cost: number | null
          own_goals: number | null
          penalties_missed: number | null
          penalties_saved: number | null
          red_cards: number | null
          saves: number | null
          season_id: number | null
          second_name: string | null
          selected_by_percent: number | null
          slug: string | null
          source_payload: Json | null
          status: string | null
          threat: number | null
          total_points: number | null
          updated_at: string | null
          web_name: string | null
          yellow_cards: number | null
        }
        Insert: {
          assists?: number | null
          bonus?: number | null
          bps?: number | null
          canonical_team_id?: number | null
          chance_of_playing_next_round?: number | null
          chance_of_playing_this_round?: number | null
          clean_sheets?: number | null
          creativity?: number | null
          element_type?: number | null
          event_points?: number | null
          expected_assists?: number | null
          expected_goal_involvements?: number | null
          expected_goals?: number | null
          expected_goals_conceded?: number | null
          first_name?: string | null
          fpl_code?: number | null
          fpl_player_id?: number | null
          fpl_team_id?: number | null
          goals_conceded?: number | null
          goals_scored?: number | null
          ict_index?: number | null
          influence?: number | null
          minutes?: number | null
          news?: string | null
          news_added?: string | null
          now_cost?: number | null
          own_goals?: number | null
          penalties_missed?: number | null
          penalties_saved?: number | null
          red_cards?: number | null
          saves?: number | null
          season_id?: number | null
          second_name?: string | null
          selected_by_percent?: number | null
          slug?: string | null
          source_payload?: Json | null
          status?: string | null
          threat?: number | null
          total_points?: number | null
          updated_at?: string | null
          web_name?: string | null
          yellow_cards?: number | null
        }
        Update: {
          assists?: number | null
          bonus?: number | null
          bps?: number | null
          canonical_team_id?: number | null
          chance_of_playing_next_round?: number | null
          chance_of_playing_this_round?: number | null
          clean_sheets?: number | null
          creativity?: number | null
          element_type?: number | null
          event_points?: number | null
          expected_assists?: number | null
          expected_goal_involvements?: number | null
          expected_goals?: number | null
          expected_goals_conceded?: number | null
          first_name?: string | null
          fpl_code?: number | null
          fpl_player_id?: number | null
          fpl_team_id?: number | null
          goals_conceded?: number | null
          goals_scored?: number | null
          ict_index?: number | null
          influence?: number | null
          minutes?: number | null
          news?: string | null
          news_added?: string | null
          now_cost?: number | null
          own_goals?: number | null
          penalties_missed?: number | null
          penalties_saved?: number | null
          red_cards?: number | null
          saves?: number | null
          season_id?: number | null
          second_name?: string | null
          selected_by_percent?: number | null
          slug?: string | null
          source_payload?: Json | null
          status?: string | null
          threat?: number | null
          total_points?: number | null
          updated_at?: string | null
          web_name?: string | null
          yellow_cards?: number | null
        }
        Relationships: []
      }
      backup_player_availability_events_20260919: {
        Row: {
          availability_category: string | null
          availability_event_id: number | null
          chance_of_playing_next_round: number | null
          chance_of_playing_this_round: number | null
          expected_return_date: string | null
          fpl_player_id: number | null
          news: string | null
          news_added: string | null
          observed_at: string | null
          season_id: number | null
          source_name: string | null
          source_payload: Json | null
          status: string | null
        }
        Insert: {
          availability_category?: string | null
          availability_event_id?: number | null
          chance_of_playing_next_round?: number | null
          chance_of_playing_this_round?: number | null
          expected_return_date?: string | null
          fpl_player_id?: number | null
          news?: string | null
          news_added?: string | null
          observed_at?: string | null
          season_id?: number | null
          source_name?: string | null
          source_payload?: Json | null
          status?: string | null
        }
        Update: {
          availability_category?: string | null
          availability_event_id?: number | null
          chance_of_playing_next_round?: number | null
          chance_of_playing_this_round?: number | null
          expected_return_date?: string | null
          fpl_player_id?: number | null
          news?: string | null
          news_added?: string | null
          observed_at?: string | null
          season_id?: number | null
          source_name?: string | null
          source_payload?: Json | null
          status?: string | null
        }
        Relationships: []
      }
      countries: {
        Row: {
          code: string | null
          country_id: number
          created_at: string
          name: string
        }
        Insert: {
          code?: string | null
          country_id?: never
          created_at?: string
          name: string
        }
        Update: {
          code?: string | null
          country_id?: never
          created_at?: string
          name?: string
        }
        Relationships: []
      }
      data_source_competitions: {
        Row: {
          competition_code: string
          competition_type: string
          country_name: string
          created_at: string
          enabled: boolean
          metadata: Json
          priority: number
          season_label: string
          source_code: string
          source_competition_id: number
          source_name: string
          source_url: string
          updated_at: string
        }
        Insert: {
          competition_code: string
          competition_type: string
          country_name: string
          created_at?: string
          enabled?: boolean
          metadata?: Json
          priority?: number
          season_label: string
          source_code: string
          source_competition_id?: number
          source_name: string
          source_url: string
          updated_at?: string
        }
        Update: {
          competition_code?: string
          competition_type?: string
          country_name?: string
          created_at?: string
          enabled?: boolean
          metadata?: Json
          priority?: number
          season_label?: string
          source_code?: string
          source_competition_id?: number
          source_name?: string
          source_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      finance_filings: {
        Row: {
          created_at: string
          document_format: string | null
          document_id: string | null
          document_sha256: string | null
          extraction_status: string
          filing_date: string
          filing_id: number
          filing_reference: string | null
          ingestion_run_id: number | null
          is_consolidated: boolean | null
          period_end: string
          period_months: number
          period_start: string
          raw_fact_count: number
          reporting_entity_id: number
          retrieval_method: string | null
          retrieval_notes: string | null
          retrieved_at: string
          source: string
          source_url: string
          supersedes_filing_id: number | null
          validation_status: string
        }
        Insert: {
          created_at?: string
          document_format?: string | null
          document_id?: string | null
          document_sha256?: string | null
          extraction_status?: string
          filing_date: string
          filing_id?: never
          filing_reference?: string | null
          ingestion_run_id?: number | null
          is_consolidated?: boolean | null
          period_end: string
          period_months: number
          period_start: string
          raw_fact_count?: number
          reporting_entity_id: number
          retrieval_method?: string | null
          retrieval_notes?: string | null
          retrieved_at?: string
          source?: string
          source_url: string
          supersedes_filing_id?: number | null
          validation_status?: string
        }
        Update: {
          created_at?: string
          document_format?: string | null
          document_id?: string | null
          document_sha256?: string | null
          extraction_status?: string
          filing_date?: string
          filing_id?: never
          filing_reference?: string | null
          ingestion_run_id?: number | null
          is_consolidated?: boolean | null
          period_end?: string
          period_months?: number
          period_start?: string
          raw_fact_count?: number
          reporting_entity_id?: number
          retrieval_method?: string | null
          retrieval_notes?: string | null
          retrieved_at?: string
          source?: string
          source_url?: string
          supersedes_filing_id?: number | null
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_filings_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "finance_ingestion_runs"
            referencedColumns: ["ingestion_run_id"]
          },
          {
            foreignKeyName: "finance_filings_reporting_entity_id_fkey"
            columns: ["reporting_entity_id"]
            isOneToOne: false
            referencedRelation: "finance_reporting_entities"
            referencedColumns: ["reporting_entity_id"]
          },
          {
            foreignKeyName: "finance_filings_supersedes_filing_id_fkey"
            columns: ["supersedes_filing_id"]
            isOneToOne: false
            referencedRelation: "finance_filings"
            referencedColumns: ["filing_id"]
          },
        ]
      }
      finance_ingestion_runs: {
        Row: {
          completed_at: string | null
          details: Json
          error_count: number
          facts_extracted: number
          facts_mapped: number
          filings_discovered: number
          filings_processed: number
          ingestion_run_id: number
          source: string
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          details?: Json
          error_count?: number
          facts_extracted?: number
          facts_mapped?: number
          filings_discovered?: number
          filings_processed?: number
          ingestion_run_id?: never
          source?: string
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          details?: Json
          error_count?: number
          facts_extracted?: number
          facts_mapped?: number
          filings_discovered?: number
          filings_processed?: number
          ingestion_run_id?: never
          source?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      finance_metric_dictionary: {
        Row: {
          created_at: string
          definition: string
          display_name: string
          expected_sign: string | null
          metric_key: string
          metric_type: string
          statement_type: string | null
          value_kind: string
        }
        Insert: {
          created_at?: string
          definition: string
          display_name: string
          expected_sign?: string | null
          metric_key: string
          metric_type: string
          statement_type?: string | null
          value_kind?: string
        }
        Update: {
          created_at?: string
          definition?: string
          display_name?: string
          expected_sign?: string | null
          metric_key?: string
          metric_type?: string
          statement_type?: string | null
          value_kind?: string
        }
        Relationships: []
      }
      finance_metric_mappings: {
        Row: {
          context_rules: Json
          created_at: string
          is_active: boolean
          mapping_id: number
          mapping_version: number
          metric_key: string
          notes: string | null
          source: string
          xbrl_concept: string
        }
        Insert: {
          context_rules?: Json
          created_at?: string
          is_active?: boolean
          mapping_id?: never
          mapping_version?: number
          metric_key: string
          notes?: string | null
          source?: string
          xbrl_concept: string
        }
        Update: {
          context_rules?: Json
          created_at?: string
          is_active?: boolean
          mapping_id?: never
          mapping_version?: number
          metric_key?: string
          notes?: string | null
          source?: string
          xbrl_concept?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_metric_mappings_metric_key_fkey"
            columns: ["metric_key"]
            isOneToOne: false
            referencedRelation: "finance_metric_dictionary"
            referencedColumns: ["metric_key"]
          },
        ]
      }
      finance_metric_values: {
        Row: {
          created_at: string
          currency: string | null
          document_id: string | null
          filing_reference: string | null
          financial_id: number
          mapping_version: number | null
          metric_key: string
          metric_value_id: number
          original_unit: string | null
          original_value: string | null
          original_xbrl_concept: string | null
          raw_fact_id: number | null
          source_url: string | null
          unit_scale: number | null
          validation_notes: string | null
          validation_status: string
          value: number | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          document_id?: string | null
          filing_reference?: string | null
          financial_id: number
          mapping_version?: number | null
          metric_key: string
          metric_value_id?: never
          original_unit?: string | null
          original_value?: string | null
          original_xbrl_concept?: string | null
          raw_fact_id?: number | null
          source_url?: string | null
          unit_scale?: number | null
          validation_notes?: string | null
          validation_status?: string
          value?: number | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          document_id?: string | null
          filing_reference?: string | null
          financial_id?: number
          mapping_version?: number | null
          metric_key?: string
          metric_value_id?: never
          original_unit?: string | null
          original_value?: string | null
          original_xbrl_concept?: string | null
          raw_fact_id?: number | null
          source_url?: string | null
          unit_scale?: number | null
          validation_notes?: string | null
          validation_status?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_metric_values_financial_id_fkey"
            columns: ["financial_id"]
            isOneToOne: false
            referencedRelation: "finance_periods"
            referencedColumns: ["financial_id"]
          },
          {
            foreignKeyName: "finance_metric_values_metric_key_fkey"
            columns: ["metric_key"]
            isOneToOne: false
            referencedRelation: "finance_metric_dictionary"
            referencedColumns: ["metric_key"]
          },
          {
            foreignKeyName: "finance_metric_values_raw_fact_id_fkey"
            columns: ["raw_fact_id"]
            isOneToOne: false
            referencedRelation: "finance_raw_facts"
            referencedColumns: ["raw_fact_id"]
          },
        ]
      }
      finance_periods: {
        Row: {
          company_number: string
          created_at: string
          currency: string
          filing_date: string
          filing_id: number
          financial_id: number
          is_comparable: boolean
          is_consolidated: boolean | null
          is_current_version: boolean
          is_latest: boolean
          period_end: string
          period_months: number
          period_start: string
          published_at: string | null
          reporting_entity: string
          season_id: number | null
          season_mapping_confidence: string | null
          season_mapping_method: string | null
          source_url: string
          supersedes_financial_id: number | null
          team_id: number
          unit_scale: number
          updated_at: string
          validation_status: string
        }
        Insert: {
          company_number: string
          created_at?: string
          currency?: string
          filing_date: string
          filing_id: number
          financial_id?: never
          is_comparable?: boolean
          is_consolidated?: boolean | null
          is_current_version?: boolean
          is_latest?: boolean
          period_end: string
          period_months: number
          period_start: string
          published_at?: string | null
          reporting_entity: string
          season_id?: number | null
          season_mapping_confidence?: string | null
          season_mapping_method?: string | null
          source_url: string
          supersedes_financial_id?: number | null
          team_id: number
          unit_scale?: number
          updated_at?: string
          validation_status?: string
        }
        Update: {
          company_number?: string
          created_at?: string
          currency?: string
          filing_date?: string
          filing_id?: number
          financial_id?: never
          is_comparable?: boolean
          is_consolidated?: boolean | null
          is_current_version?: boolean
          is_latest?: boolean
          period_end?: string
          period_months?: number
          period_start?: string
          published_at?: string | null
          reporting_entity?: string
          season_id?: number | null
          season_mapping_confidence?: string | null
          season_mapping_method?: string | null
          source_url?: string
          supersedes_financial_id?: number | null
          team_id?: number
          unit_scale?: number
          updated_at?: string
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_periods_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "finance_filings"
            referencedColumns: ["filing_id"]
          },
          {
            foreignKeyName: "finance_periods_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "finance_periods_supersedes_financial_id_fkey"
            columns: ["supersedes_financial_id"]
            isOneToOne: false
            referencedRelation: "finance_periods"
            referencedColumns: ["financial_id"]
          },
          {
            foreignKeyName: "finance_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      finance_raw_facts: {
        Row: {
          context_ref: string | null
          created_at: string
          currency: string | null
          dimensions: Json
          filing_id: number
          instant_date: string | null
          numeric_value: number | null
          original_unit: string | null
          original_value: string | null
          period_end: string | null
          period_start: string | null
          raw_fact_id: number
          source_locator: string | null
          unit_scale: number | null
          xbrl_concept: string
        }
        Insert: {
          context_ref?: string | null
          created_at?: string
          currency?: string | null
          dimensions?: Json
          filing_id: number
          instant_date?: string | null
          numeric_value?: number | null
          original_unit?: string | null
          original_value?: string | null
          period_end?: string | null
          period_start?: string | null
          raw_fact_id?: never
          source_locator?: string | null
          unit_scale?: number | null
          xbrl_concept: string
        }
        Update: {
          context_ref?: string | null
          created_at?: string
          currency?: string | null
          dimensions?: Json
          filing_id?: number
          instant_date?: string | null
          numeric_value?: number | null
          original_unit?: string | null
          original_value?: string | null
          period_end?: string | null
          period_start?: string | null
          raw_fact_id?: never
          source_locator?: string | null
          unit_scale?: number | null
          xbrl_concept?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_raw_facts_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "finance_filings"
            referencedColumns: ["filing_id"]
          },
        ]
      }
      finance_reporting_entities: {
        Row: {
          company_number: string
          created_at: string
          effective_from: string | null
          effective_to: string | null
          is_preferred: boolean
          relationship_type: string
          reporting_entity: string
          reporting_entity_id: number
          source_url: string | null
          team_id: number
        }
        Insert: {
          company_number: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          is_preferred?: boolean
          relationship_type?: string
          reporting_entity: string
          reporting_entity_id?: never
          source_url?: string | null
          team_id: number
        }
        Update: {
          company_number?: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          is_preferred?: boolean
          relationship_type?: string
          reporting_entity?: string
          reporting_entity_id?: never
          source_url?: string | null
          team_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "finance_reporting_entities_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fixture_actual_lineup_players: {
        Row: {
          captured_at: string
          fixture_id: number
          fpl_player_id: number | null
          lineup_order: number | null
          minutes: number | null
          player_name_source: string
          source_name: string
          source_url: string | null
          starter: boolean
          tactical_role: string | null
          team_id: number
          web_name: string | null
        }
        Insert: {
          captured_at?: string
          fixture_id: number
          fpl_player_id?: number | null
          lineup_order?: number | null
          minutes?: number | null
          player_name_source: string
          source_name: string
          source_url?: string | null
          starter?: boolean
          tactical_role?: string | null
          team_id: number
          web_name?: string | null
        }
        Update: {
          captured_at?: string
          fixture_id?: number
          fpl_player_id?: number | null
          lineup_order?: number | null
          minutes?: number | null
          player_name_source?: string
          source_name?: string
          source_url?: string | null
          starter?: boolean
          tactical_role?: string | null
          team_id?: number
          web_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixture_actual_lineup_players_fixture_id_team_id_fkey"
            columns: ["fixture_id", "team_id"]
            isOneToOne: false
            referencedRelation: "fixture_actual_team_lineups"
            referencedColumns: ["fixture_id", "team_id"]
          },
        ]
      }
      fixture_actual_team_lineups: {
        Row: {
          captured_at: string
          fixture_id: number
          formation: string | null
          source_is_inferred: boolean
          source_name: string
          source_url: string | null
          team_id: number
        }
        Insert: {
          captured_at?: string
          fixture_id: number
          formation?: string | null
          source_is_inferred?: boolean
          source_name: string
          source_url?: string | null
          team_id: number
        }
        Update: {
          captured_at?: string
          fixture_id?: number
          formation?: string | null
          source_is_inferred?: boolean
          source_name?: string
          source_url?: string | null
          team_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "fixture_actual_team_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_fallback"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_defensive_contribution_projection_leaguewide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fallback_start_probability_v6"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fixture_bps_projection_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_prediction_actual_start_comparison"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_data_health"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_fixture_readiness"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_allocation_v2"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_final"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_points"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_secondary_scoring"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_v4_leaguewide_inputs"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_season_fixture_feed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_adjustments_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_exposure_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fixture_changes: {
        Row: {
          change_id: number
          detected_at: string
          fixture_id: number
          new_kickoff_date: string
          new_kickoff_time: string | null
          old_kickoff_date: string
          old_kickoff_time: string | null
        }
        Insert: {
          change_id?: never
          detected_at?: string
          fixture_id: number
          new_kickoff_date: string
          new_kickoff_time?: string | null
          old_kickoff_date: string
          old_kickoff_time?: string | null
        }
        Update: {
          change_id?: never
          detected_at?: string
          fixture_id?: number
          new_kickoff_date?: string
          new_kickoff_time?: string | null
          old_kickoff_date?: string
          old_kickoff_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixture_changes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_fallback"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_changes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_changes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_changes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_changes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_defensive_contribution_projection_leaguewide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_changes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fallback_start_probability_v6"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_changes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fixture_bps_projection_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_changes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_prediction_actual_start_comparison"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_changes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_data_health"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_changes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_fixture_readiness"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_changes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_allocation_v2"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_changes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_final"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_changes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_points"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_changes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_secondary_scoring"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_changes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_v4_leaguewide_inputs"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_changes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_season_fixture_feed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_changes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_adjustments_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_changes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_exposure_v1"
            referencedColumns: ["fixture_id"]
          },
        ]
      }
      fixture_lineup_prediction_players: {
        Row: {
          fpl_player_id: number
          lineup_prediction_id: number
          lineup_prediction_player_id: number
          predicted_start: boolean
          source_start_probability: number | null
          tactical_role: string | null
        }
        Insert: {
          fpl_player_id: number
          lineup_prediction_id: number
          lineup_prediction_player_id?: number
          predicted_start?: boolean
          source_start_probability?: number | null
          tactical_role?: string | null
        }
        Update: {
          fpl_player_id?: number
          lineup_prediction_id?: number
          lineup_prediction_player_id?: number
          predicted_start?: boolean
          source_start_probability?: number | null
          tactical_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixture_lineup_prediction_players_lineup_prediction_id_fkey"
            columns: ["lineup_prediction_id"]
            isOneToOne: false
            referencedRelation: "fixture_lineup_predictions"
            referencedColumns: ["lineup_prediction_id"]
          },
        ]
      }
      fixture_lineup_predictions: {
        Row: {
          fixture_id: number
          formation: string | null
          lineup_prediction_id: number
          lineup_source_id: number
          observed_at: string
          source_reference: string | null
          team_id: number
        }
        Insert: {
          fixture_id: number
          formation?: string | null
          lineup_prediction_id?: number
          lineup_source_id: number
          observed_at?: string
          source_reference?: string | null
          team_id: number
        }
        Update: {
          fixture_id?: number
          formation?: string | null
          lineup_prediction_id?: number
          lineup_source_id?: number
          observed_at?: string
          source_reference?: string | null
          team_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "fixture_lineup_predictions_lineup_source_id_fkey"
            columns: ["lineup_source_id"]
            isOneToOne: false
            referencedRelation: "lineup_prediction_sources"
            referencedColumns: ["lineup_source_id"]
          },
        ]
      }
      fixture_refresh_runs: {
        Row: {
          competitions: string[] | null
          error_message: string | null
          finished_at: string | null
          refresh_run_id: number
          rows_seen: number
          rows_updated: number
          started_at: string
          status: string
        }
        Insert: {
          competitions?: string[] | null
          error_message?: string | null
          finished_at?: string | null
          refresh_run_id?: number
          rows_seen?: number
          rows_updated?: number
          started_at?: string
          status?: string
        }
        Update: {
          competitions?: string[] | null
          error_message?: string | null
          finished_at?: string | null
          refresh_run_id?: number
          rows_seen?: number
          rows_updated?: number
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      fixtures: {
        Row: {
          away_team_id: number
          created_at: string
          fixture_id: number
          home_team_id: number
          kickoff_date: string
          kickoff_time: string | null
          league_id: number
          matchweek: number | null
          predicted_at: string | null
          predicted_away_goals: number | null
          predicted_home_goals: number | null
          prediction_fit_run_id: number | null
          prediction_model_version: string | null
          raw_predicted_away_goals: number | null
          raw_predicted_home_goals: number | null
          round: string | null
          round_number: number | null
          season_id: number
          slug: string
          source_file: string | null
          source_name: string
          stage: string | null
          status: string
          updated_at: string
        }
        Insert: {
          away_team_id: number
          created_at?: string
          fixture_id?: never
          home_team_id: number
          kickoff_date: string
          kickoff_time?: string | null
          league_id: number
          matchweek?: number | null
          predicted_at?: string | null
          predicted_away_goals?: number | null
          predicted_home_goals?: number | null
          prediction_fit_run_id?: number | null
          prediction_model_version?: string | null
          raw_predicted_away_goals?: number | null
          raw_predicted_home_goals?: number | null
          round?: string | null
          round_number?: number | null
          season_id: number
          slug: string
          source_file?: string | null
          source_name?: string
          stage?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          away_team_id?: number
          created_at?: string
          fixture_id?: never
          home_team_id?: number
          kickoff_date?: string
          kickoff_time?: string | null
          league_id?: number
          matchweek?: number | null
          predicted_at?: string | null
          predicted_away_goals?: number | null
          predicted_home_goals?: number | null
          prediction_fit_run_id?: number | null
          prediction_model_version?: string | null
          raw_predicted_away_goals?: number | null
          raw_predicted_home_goals?: number | null
          round?: string | null
          round_number?: number | null
          season_id?: number
          slug?: string
          source_file?: string | null
          source_name?: string
          stage?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "fixtures_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "league_fit_status"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "fixtures_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "fixtures_prediction_fit_run_id_fkey"
            columns: ["prediction_fit_run_id"]
            isOneToOne: false
            referencedRelation: "fpl_team_strength_current"
            referencedColumns: ["fit_run_id"]
          },
          {
            foreignKeyName: "fixtures_prediction_fit_run_id_fkey"
            columns: ["prediction_fit_run_id"]
            isOneToOne: false
            referencedRelation: "league_fit_status"
            referencedColumns: ["accepted_fit_run_id"]
          },
          {
            foreignKeyName: "fixtures_prediction_fit_run_id_fkey"
            columns: ["prediction_fit_run_id"]
            isOneToOne: false
            referencedRelation: "league_fit_status"
            referencedColumns: ["latest_attempted_fit_run_id"]
          },
          {
            foreignKeyName: "fixtures_prediction_fit_run_id_fkey"
            columns: ["prediction_fit_run_id"]
            isOneToOne: false
            referencedRelation: "model_fit_runs"
            referencedColumns: ["fit_run_id"]
          },
          {
            foreignKeyName: "fixtures_prediction_fit_run_id_fkey"
            columns: ["prediction_fit_run_id"]
            isOneToOne: false
            referencedRelation: "team_strength_current"
            referencedColumns: ["fit_run_id"]
          },
          {
            foreignKeyName: "fixtures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      formation_code_names: {
        Row: {
          canonical_formation: string
          source_formation_code: string
        }
        Insert: {
          canonical_formation: string
          source_formation_code: string
        }
        Update: {
          canonical_formation?: string
          source_formation_code?: string
        }
        Relationships: []
      }
      formation_slot_geometry: {
        Row: {
          canonical_formation: string
          slot: number
          source_formation_code: string
          x_pct: number
          y_pct: number
        }
        Insert: {
          canonical_formation: string
          slot: number
          source_formation_code: string
          x_pct: number
          y_pct: number
        }
        Update: {
          canonical_formation?: string
          slot?: number
          source_formation_code?: string
          x_pct?: number
          y_pct?: number
        }
        Relationships: []
      }
      fpl_fixture_bonus_montecarlo_v1: {
        Row: {
          expected_bonus_points: number
          fixture_id: number
          fpl_player_id: number
          simulated_at: string
        }
        Insert: {
          expected_bonus_points: number
          fixture_id: number
          fpl_player_id: number
          simulated_at?: string
        }
        Update: {
          expected_bonus_points?: number
          fixture_id?: number
          fpl_player_id?: number
          simulated_at?: string
        }
        Relationships: []
      }
      fpl_fixtures: {
        Row: {
          canonical_fixture_id: number | null
          finished: boolean | null
          fpl_away_team_id: number | null
          fpl_event_id: number | null
          fpl_fixture_id: number
          fpl_home_team_id: number | null
          kickoff_time: string | null
          season_id: number | null
          source_payload: Json | null
          started: boolean | null
          team_a_difficulty: number | null
          team_a_score: number | null
          team_h_difficulty: number | null
          team_h_score: number | null
          updated_at: string
        }
        Insert: {
          canonical_fixture_id?: number | null
          finished?: boolean | null
          fpl_away_team_id?: number | null
          fpl_event_id?: number | null
          fpl_fixture_id: number
          fpl_home_team_id?: number | null
          kickoff_time?: string | null
          season_id?: number | null
          source_payload?: Json | null
          started?: boolean | null
          team_a_difficulty?: number | null
          team_a_score?: number | null
          team_h_difficulty?: number | null
          team_h_score?: number | null
          updated_at?: string
        }
        Update: {
          canonical_fixture_id?: number | null
          finished?: boolean | null
          fpl_away_team_id?: number | null
          fpl_event_id?: number | null
          fpl_fixture_id?: number
          fpl_home_team_id?: number | null
          kickoff_time?: string | null
          season_id?: number | null
          source_payload?: Json | null
          started?: boolean | null
          team_a_difficulty?: number | null
          team_a_score?: number | null
          team_h_difficulty?: number | null
          team_h_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fpl_fixtures_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_fallback"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_defensive_contribution_projection_leaguewide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fallback_start_probability_v6"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fixture_bps_projection_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_prediction_actual_start_comparison"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_data_health"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_fixture_readiness"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_allocation_v2"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_final"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_points"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_secondary_scoring"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_v4_leaguewide_inputs"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_season_fixture_feed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_adjustments_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_exposure_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_fpl_away_team_id_fkey"
            columns: ["fpl_away_team_id"]
            isOneToOne: false
            referencedRelation: "fpl_team_strength_current"
            referencedColumns: ["fpl_team_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_fpl_away_team_id_fkey"
            columns: ["fpl_away_team_id"]
            isOneToOne: false
            referencedRelation: "fpl_teams"
            referencedColumns: ["fpl_team_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_fpl_away_team_id_fkey"
            columns: ["fpl_away_team_id"]
            isOneToOne: false
            referencedRelation: "team_strength_current"
            referencedColumns: ["fpl_team_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_fpl_event_id_fkey"
            columns: ["fpl_event_id"]
            isOneToOne: false
            referencedRelation: "fpl_gameweeks"
            referencedColumns: ["fpl_event_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_fpl_home_team_id_fkey"
            columns: ["fpl_home_team_id"]
            isOneToOne: false
            referencedRelation: "fpl_team_strength_current"
            referencedColumns: ["fpl_team_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_fpl_home_team_id_fkey"
            columns: ["fpl_home_team_id"]
            isOneToOne: false
            referencedRelation: "fpl_teams"
            referencedColumns: ["fpl_team_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_fpl_home_team_id_fkey"
            columns: ["fpl_home_team_id"]
            isOneToOne: false
            referencedRelation: "team_strength_current"
            referencedColumns: ["fpl_team_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      fpl_gameweeks: {
        Row: {
          average_entry_score: number | null
          data_checked: boolean | null
          deadline_time: string | null
          finished: boolean | null
          fpl_event_id: number
          highest_score: number | null
          is_current: boolean | null
          is_next: boolean | null
          is_previous: boolean | null
          name: string
          season_id: number | null
          source_payload: Json | null
          updated_at: string
        }
        Insert: {
          average_entry_score?: number | null
          data_checked?: boolean | null
          deadline_time?: string | null
          finished?: boolean | null
          fpl_event_id: number
          highest_score?: number | null
          is_current?: boolean | null
          is_next?: boolean | null
          is_previous?: boolean | null
          name: string
          season_id?: number | null
          source_payload?: Json | null
          updated_at?: string
        }
        Update: {
          average_entry_score?: number | null
          data_checked?: boolean | null
          deadline_time?: string | null
          finished?: boolean | null
          fpl_event_id?: number
          highest_score?: number | null
          is_current?: boolean | null
          is_next?: boolean | null
          is_previous?: boolean | null
          name?: string
          season_id?: number | null
          source_payload?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fpl_gameweeks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      fpl_hindsight_optimal_squad: {
        Row: {
          budget: number
          computed_at: string
          from_matchweek: number
          hindsight_id: number
          league_id: number
          objective_points: number
          optimiser_version: string
          result: Json
          season_id: number
          solve_time_ms: number | null
          solver_status: string
          to_matchweek: number
        }
        Insert: {
          budget: number
          computed_at?: string
          from_matchweek: number
          hindsight_id?: never
          league_id: number
          objective_points: number
          optimiser_version: string
          result: Json
          season_id: number
          solve_time_ms?: number | null
          solver_status: string
          to_matchweek: number
        }
        Update: {
          budget?: number
          computed_at?: string
          from_matchweek?: number
          hindsight_id?: never
          league_id?: number
          objective_points?: number
          optimiser_version?: string
          result?: Json
          season_id?: number
          solve_time_ms?: number | null
          solver_status?: string
          to_matchweek?: number
        }
        Relationships: []
      }
      fpl_ingestion_runs: {
        Row: {
          completed_at: string | null
          error_message: string | null
          fixtures_upserted: number
          gameweeks_upserted: number
          player_gameweeks_upserted: number
          players_upserted: number
          run_id: number
          started_at: string
          status: string
          teams_upserted: number
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          fixtures_upserted?: number
          gameweeks_upserted?: number
          player_gameweeks_upserted?: number
          players_upserted?: number
          run_id?: number
          started_at?: string
          status?: string
          teams_upserted?: number
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          fixtures_upserted?: number
          gameweeks_upserted?: number
          player_gameweeks_upserted?: number
          players_upserted?: number
          run_id?: number
          started_at?: string
          status?: string
          teams_upserted?: number
        }
        Relationships: []
      }
      fpl_player_gameweek_history: {
        Row: {
          assists: number
          bonus: number
          bps: number
          clean_sheets: number
          expected_assists: number | null
          expected_goals: number | null
          fixture_id: number
          fpl_code: number
          gameweek: number
          goals_conceded: number
          goals_scored: number
          minutes: number
          opponent_team_num: number | null
          red_cards: number
          saves: number
          season_id: number
          selected: number | null
          starts: number
          total_points: number
          transfers_in: number | null
          transfers_out: number | null
          value: number | null
          was_home: boolean | null
          yellow_cards: number
        }
        Insert: {
          assists?: number
          bonus?: number
          bps?: number
          clean_sheets?: number
          expected_assists?: number | null
          expected_goals?: number | null
          fixture_id: number
          fpl_code: number
          gameweek: number
          goals_conceded?: number
          goals_scored?: number
          minutes?: number
          opponent_team_num?: number | null
          red_cards?: number
          saves?: number
          season_id: number
          selected?: number | null
          starts?: number
          total_points?: number
          transfers_in?: number | null
          transfers_out?: number | null
          value?: number | null
          was_home?: boolean | null
          yellow_cards?: number
        }
        Update: {
          assists?: number
          bonus?: number
          bps?: number
          clean_sheets?: number
          expected_assists?: number | null
          expected_goals?: number | null
          fixture_id?: number
          fpl_code?: number
          gameweek?: number
          goals_conceded?: number
          goals_scored?: number
          minutes?: number
          opponent_team_num?: number | null
          red_cards?: number
          saves?: number
          season_id?: number
          selected?: number | null
          starts?: number
          total_points?: number
          transfers_in?: number | null
          transfers_out?: number | null
          value?: number | null
          was_home?: boolean | null
          yellow_cards?: number
        }
        Relationships: [
          {
            foreignKeyName: "fpl_player_gameweek_history_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      fpl_player_gameweeks: {
        Row: {
          assists: number | null
          bonus: number | null
          bps: number | null
          clean_sheets: number | null
          creativity: number | null
          expected_assists: number | null
          expected_goal_involvements: number | null
          expected_goals: number | null
          expected_goals_conceded: number | null
          fpl_event_id: number
          fpl_fixture_id: number
          fpl_player_id: number
          goals_conceded: number | null
          goals_scored: number | null
          ict_index: number | null
          influence: number | null
          kickoff_time: string | null
          minutes: number | null
          opponent_fpl_team_id: number | null
          own_goals: number | null
          penalties_missed: number | null
          penalties_saved: number | null
          red_cards: number | null
          saves: number | null
          season_id: number | null
          selected: number | null
          source_payload: Json | null
          threat: number | null
          total_points: number | null
          transfers_in: number | null
          transfers_out: number | null
          updated_at: string
          value: number | null
          was_home: boolean | null
          yellow_cards: number | null
        }
        Insert: {
          assists?: number | null
          bonus?: number | null
          bps?: number | null
          clean_sheets?: number | null
          creativity?: number | null
          expected_assists?: number | null
          expected_goal_involvements?: number | null
          expected_goals?: number | null
          expected_goals_conceded?: number | null
          fpl_event_id: number
          fpl_fixture_id: number
          fpl_player_id: number
          goals_conceded?: number | null
          goals_scored?: number | null
          ict_index?: number | null
          influence?: number | null
          kickoff_time?: string | null
          minutes?: number | null
          opponent_fpl_team_id?: number | null
          own_goals?: number | null
          penalties_missed?: number | null
          penalties_saved?: number | null
          red_cards?: number | null
          saves?: number | null
          season_id?: number | null
          selected?: number | null
          source_payload?: Json | null
          threat?: number | null
          total_points?: number | null
          transfers_in?: number | null
          transfers_out?: number | null
          updated_at?: string
          value?: number | null
          was_home?: boolean | null
          yellow_cards?: number | null
        }
        Update: {
          assists?: number | null
          bonus?: number | null
          bps?: number | null
          clean_sheets?: number | null
          creativity?: number | null
          expected_assists?: number | null
          expected_goal_involvements?: number | null
          expected_goals?: number | null
          expected_goals_conceded?: number | null
          fpl_event_id?: number
          fpl_fixture_id?: number
          fpl_player_id?: number
          goals_conceded?: number | null
          goals_scored?: number | null
          ict_index?: number | null
          influence?: number | null
          kickoff_time?: string | null
          minutes?: number | null
          opponent_fpl_team_id?: number | null
          own_goals?: number | null
          penalties_missed?: number | null
          penalties_saved?: number | null
          red_cards?: number | null
          saves?: number | null
          season_id?: number | null
          selected?: number | null
          source_payload?: Json | null
          threat?: number | null
          total_points?: number | null
          transfers_in?: number | null
          transfers_out?: number | null
          updated_at?: string
          value?: number | null
          was_home?: boolean | null
          yellow_cards?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_player_gameweeks_fpl_event_id_fkey"
            columns: ["fpl_event_id"]
            isOneToOne: false
            referencedRelation: "fpl_gameweeks"
            referencedColumns: ["fpl_event_id"]
          },
          {
            foreignKeyName: "fpl_player_gameweeks_fpl_fixture_id_fkey"
            columns: ["fpl_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fixtures"
            referencedColumns: ["fpl_fixture_id"]
          },
          {
            foreignKeyName: "fpl_player_gameweeks_opponent_fpl_team_id_fkey"
            columns: ["opponent_fpl_team_id"]
            isOneToOne: false
            referencedRelation: "fpl_team_strength_current"
            referencedColumns: ["fpl_team_id"]
          },
          {
            foreignKeyName: "fpl_player_gameweeks_opponent_fpl_team_id_fkey"
            columns: ["opponent_fpl_team_id"]
            isOneToOne: false
            referencedRelation: "fpl_teams"
            referencedColumns: ["fpl_team_id"]
          },
          {
            foreignKeyName: "fpl_player_gameweeks_opponent_fpl_team_id_fkey"
            columns: ["opponent_fpl_team_id"]
            isOneToOne: false
            referencedRelation: "team_strength_current"
            referencedColumns: ["fpl_team_id"]
          },
          {
            foreignKeyName: "fpl_player_gameweeks_player_season_fkey"
            columns: ["fpl_player_id", "season_id"]
            isOneToOne: false
            referencedRelation: "fpl_player_defensive_contribution_usage"
            referencedColumns: ["fpl_player_id", "season_id"]
          },
          {
            foreignKeyName: "fpl_player_gameweeks_player_season_fkey"
            columns: ["fpl_player_id", "season_id"]
            isOneToOne: false
            referencedRelation: "fpl_player_substitution_usage"
            referencedColumns: ["fpl_player_id", "season_id"]
          },
          {
            foreignKeyName: "fpl_player_gameweeks_player_season_fkey"
            columns: ["fpl_player_id", "season_id"]
            isOneToOne: false
            referencedRelation: "fpl_players"
            referencedColumns: ["fpl_player_id", "season_id"]
          },
          {
            foreignKeyName: "fpl_player_gameweeks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      fpl_player_projections: {
        Row: {
          availability_probability: number | null
          clean_sheet_probability: number | null
          defensive_contribution_probability: number | null
          expected_assists: number | null
          expected_bonus: number | null
          expected_fpl_points: number | null
          expected_goals: number | null
          expected_minutes: number | null
          expected_saves: number | null
          fixture_id: number
          fpl_player_id: number
          generated_at: string
          lineup_confidence: number | null
          minutes_source: string | null
          model_version: string
          projection_id: number
          scenario_key: string
          season_id: number
          start_probability: number | null
          sub_appearance_probability: number | null
          tactical_role: string | null
          xpts_appearance: number | null
          xpts_assists: number | null
          xpts_bonus: number | null
          xpts_cards_own_goals: number | null
          xpts_clean_sheet: number | null
          xpts_defensive_contribution: number | null
          xpts_goals: number | null
          xpts_goals_conceded: number | null
          xpts_penalties: number | null
          xpts_saves: number | null
        }
        Insert: {
          availability_probability?: number | null
          clean_sheet_probability?: number | null
          defensive_contribution_probability?: number | null
          expected_assists?: number | null
          expected_bonus?: number | null
          expected_fpl_points?: number | null
          expected_goals?: number | null
          expected_minutes?: number | null
          expected_saves?: number | null
          fixture_id: number
          fpl_player_id: number
          generated_at?: string
          lineup_confidence?: number | null
          minutes_source?: string | null
          model_version: string
          projection_id?: never
          scenario_key?: string
          season_id: number
          start_probability?: number | null
          sub_appearance_probability?: number | null
          tactical_role?: string | null
          xpts_appearance?: number | null
          xpts_assists?: number | null
          xpts_bonus?: number | null
          xpts_cards_own_goals?: number | null
          xpts_clean_sheet?: number | null
          xpts_defensive_contribution?: number | null
          xpts_goals?: number | null
          xpts_goals_conceded?: number | null
          xpts_penalties?: number | null
          xpts_saves?: number | null
        }
        Update: {
          availability_probability?: number | null
          clean_sheet_probability?: number | null
          defensive_contribution_probability?: number | null
          expected_assists?: number | null
          expected_bonus?: number | null
          expected_fpl_points?: number | null
          expected_goals?: number | null
          expected_minutes?: number | null
          expected_saves?: number | null
          fixture_id?: number
          fpl_player_id?: number
          generated_at?: string
          lineup_confidence?: number | null
          minutes_source?: string | null
          model_version?: string
          projection_id?: never
          scenario_key?: string
          season_id?: number
          start_probability?: number | null
          sub_appearance_probability?: number | null
          tactical_role?: string | null
          xpts_appearance?: number | null
          xpts_assists?: number | null
          xpts_bonus?: number | null
          xpts_cards_own_goals?: number | null
          xpts_clean_sheet?: number | null
          xpts_defensive_contribution?: number | null
          xpts_goals?: number | null
          xpts_goals_conceded?: number | null
          xpts_penalties?: number | null
          xpts_saves?: number | null
        }
        Relationships: []
      }
      fpl_player_return_assumptions: {
        Row: {
          created_at: string
          expected_return_date: string | null
          fpl_player_id: number
          id: number
          is_active: boolean
          post_return_availability: number
          post_return_start_probability: number | null
          pre_return_availability: number
          reason: string | null
          return_uncertainty_days: number
          season_id: number
          source_name: string | null
          source_reference: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          expected_return_date?: string | null
          fpl_player_id: number
          id?: never
          is_active?: boolean
          post_return_availability?: number
          post_return_start_probability?: number | null
          pre_return_availability?: number
          reason?: string | null
          return_uncertainty_days?: number
          season_id: number
          source_name?: string | null
          source_reference?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          expected_return_date?: string | null
          fpl_player_id?: number
          id?: never
          is_active?: boolean
          post_return_availability?: number
          post_return_start_probability?: number | null
          pre_return_availability?: number
          reason?: string | null
          return_uncertainty_days?: number
          season_id?: number
          source_name?: string | null
          source_reference?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fpl_player_season_totals: {
        Row: {
          assists: number
          bonus: number
          bps: number
          clean_sheets: number
          element_type: number
          end_cost: number
          fpl_code: number
          fpl_element_id: number | null
          full_name: string | null
          goals_conceded: number
          goals_scored: number
          imported_at: string
          minutes: number
          own_goals: number
          penalties_missed: number
          penalties_saved: number
          red_cards: number
          saves: number
          season_id: number
          selected_by_percent: number | null
          source_name: string
          start_cost: number
          team_name: string | null
          total_points: number
          web_name: string
          yellow_cards: number
        }
        Insert: {
          assists?: number
          bonus?: number
          bps?: number
          clean_sheets?: number
          element_type: number
          end_cost: number
          fpl_code: number
          fpl_element_id?: number | null
          full_name?: string | null
          goals_conceded?: number
          goals_scored?: number
          imported_at?: string
          minutes?: number
          own_goals?: number
          penalties_missed?: number
          penalties_saved?: number
          red_cards?: number
          saves?: number
          season_id: number
          selected_by_percent?: number | null
          source_name?: string
          start_cost: number
          team_name?: string | null
          total_points?: number
          web_name: string
          yellow_cards?: number
        }
        Update: {
          assists?: number
          bonus?: number
          bps?: number
          clean_sheets?: number
          element_type?: number
          end_cost?: number
          fpl_code?: number
          fpl_element_id?: number | null
          full_name?: string | null
          goals_conceded?: number
          goals_scored?: number
          imported_at?: string
          minutes?: number
          own_goals?: number
          penalties_missed?: number
          penalties_saved?: number
          red_cards?: number
          saves?: number
          season_id?: number
          selected_by_percent?: number | null
          source_name?: string
          start_cost?: number
          team_name?: string | null
          total_points?: number
          web_name?: string
          yellow_cards?: number
        }
        Relationships: [
          {
            foreignKeyName: "fpl_player_season_totals_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      fpl_player_snapshots: {
        Row: {
          captured_at: string
          chance_of_playing_next_round: number | null
          chance_of_playing_this_round: number | null
          event_points: number | null
          fpl_player_id: number
          fpl_team_id: number | null
          news: string | null
          now_cost: number | null
          season_id: number | null
          selected_by_percent: number | null
          snapshot_date: string
          source_payload: Json | null
          status: string | null
          total_points: number | null
          transfers_in: number | null
          transfers_in_event: number | null
          transfers_out: number | null
          transfers_out_event: number | null
        }
        Insert: {
          captured_at?: string
          chance_of_playing_next_round?: number | null
          chance_of_playing_this_round?: number | null
          event_points?: number | null
          fpl_player_id: number
          fpl_team_id?: number | null
          news?: string | null
          now_cost?: number | null
          season_id?: number | null
          selected_by_percent?: number | null
          snapshot_date: string
          source_payload?: Json | null
          status?: string | null
          total_points?: number | null
          transfers_in?: number | null
          transfers_in_event?: number | null
          transfers_out?: number | null
          transfers_out_event?: number | null
        }
        Update: {
          captured_at?: string
          chance_of_playing_next_round?: number | null
          chance_of_playing_this_round?: number | null
          event_points?: number | null
          fpl_player_id?: number
          fpl_team_id?: number | null
          news?: string | null
          now_cost?: number | null
          season_id?: number | null
          selected_by_percent?: number | null
          snapshot_date?: string
          source_payload?: Json | null
          status?: string | null
          total_points?: number | null
          transfers_in?: number | null
          transfers_in_event?: number | null
          transfers_out?: number | null
          transfers_out_event?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_player_snapshots_player_season_fkey"
            columns: ["fpl_player_id", "season_id"]
            isOneToOne: false
            referencedRelation: "fpl_player_defensive_contribution_usage"
            referencedColumns: ["fpl_player_id", "season_id"]
          },
          {
            foreignKeyName: "fpl_player_snapshots_player_season_fkey"
            columns: ["fpl_player_id", "season_id"]
            isOneToOne: false
            referencedRelation: "fpl_player_substitution_usage"
            referencedColumns: ["fpl_player_id", "season_id"]
          },
          {
            foreignKeyName: "fpl_player_snapshots_player_season_fkey"
            columns: ["fpl_player_id", "season_id"]
            isOneToOne: false
            referencedRelation: "fpl_players"
            referencedColumns: ["fpl_player_id", "season_id"]
          },
          {
            foreignKeyName: "fpl_player_snapshots_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      fpl_player_squad_state: {
        Row: {
          availability_probability: number | null
          effective_from: string
          effective_to: string | null
          evidence: string | null
          fpl_player_id: number
          season_id: number
          source_name: string | null
          source_reference: string | null
          start_probability_override: number | null
          state: string
          team_id: number | null
          updated_at: string
        }
        Insert: {
          availability_probability?: number | null
          effective_from?: string
          effective_to?: string | null
          evidence?: string | null
          fpl_player_id: number
          season_id: number
          source_name?: string | null
          source_reference?: string | null
          start_probability_override?: number | null
          state?: string
          team_id?: number | null
          updated_at?: string
        }
        Update: {
          availability_probability?: number | null
          effective_from?: string
          effective_to?: string | null
          evidence?: string | null
          fpl_player_id?: number
          season_id?: number
          source_name?: string | null
          source_reference?: string | null
          start_probability_override?: number | null
          state?: string
          team_id?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      fpl_players: {
        Row: {
          assists: number | null
          bonus: number | null
          bps: number | null
          canonical_team_id: number | null
          chance_of_playing_next_round: number | null
          chance_of_playing_this_round: number | null
          clean_sheets: number | null
          creativity: number | null
          element_type: number | null
          event_points: number | null
          expected_assists: number | null
          expected_goal_involvements: number | null
          expected_goals: number | null
          expected_goals_conceded: number | null
          first_name: string | null
          fpl_code: number | null
          fpl_player_id: number
          fpl_team_id: number | null
          goals_conceded: number | null
          goals_scored: number | null
          ict_index: number | null
          influence: number | null
          minutes: number | null
          news: string | null
          news_added: string | null
          now_cost: number | null
          own_goals: number | null
          penalties_missed: number | null
          penalties_saved: number | null
          red_cards: number | null
          saves: number | null
          season_id: number
          second_name: string | null
          selected_by_percent: number | null
          slug: string | null
          source_payload: Json | null
          status: string | null
          threat: number | null
          total_points: number | null
          updated_at: string
          web_name: string | null
          yellow_cards: number | null
        }
        Insert: {
          assists?: number | null
          bonus?: number | null
          bps?: number | null
          canonical_team_id?: number | null
          chance_of_playing_next_round?: number | null
          chance_of_playing_this_round?: number | null
          clean_sheets?: number | null
          creativity?: number | null
          element_type?: number | null
          event_points?: number | null
          expected_assists?: number | null
          expected_goal_involvements?: number | null
          expected_goals?: number | null
          expected_goals_conceded?: number | null
          first_name?: string | null
          fpl_code?: number | null
          fpl_player_id: number
          fpl_team_id?: number | null
          goals_conceded?: number | null
          goals_scored?: number | null
          ict_index?: number | null
          influence?: number | null
          minutes?: number | null
          news?: string | null
          news_added?: string | null
          now_cost?: number | null
          own_goals?: number | null
          penalties_missed?: number | null
          penalties_saved?: number | null
          red_cards?: number | null
          saves?: number | null
          season_id: number
          second_name?: string | null
          selected_by_percent?: number | null
          slug?: string | null
          source_payload?: Json | null
          status?: string | null
          threat?: number | null
          total_points?: number | null
          updated_at?: string
          web_name?: string | null
          yellow_cards?: number | null
        }
        Update: {
          assists?: number | null
          bonus?: number | null
          bps?: number | null
          canonical_team_id?: number | null
          chance_of_playing_next_round?: number | null
          chance_of_playing_this_round?: number | null
          clean_sheets?: number | null
          creativity?: number | null
          element_type?: number | null
          event_points?: number | null
          expected_assists?: number | null
          expected_goal_involvements?: number | null
          expected_goals?: number | null
          expected_goals_conceded?: number | null
          first_name?: string | null
          fpl_code?: number | null
          fpl_player_id?: number
          fpl_team_id?: number | null
          goals_conceded?: number | null
          goals_scored?: number | null
          ict_index?: number | null
          influence?: number | null
          minutes?: number | null
          news?: string | null
          news_added?: string | null
          now_cost?: number | null
          own_goals?: number | null
          penalties_missed?: number | null
          penalties_saved?: number | null
          red_cards?: number | null
          saves?: number | null
          season_id?: number
          second_name?: string | null
          selected_by_percent?: number | null
          slug?: string | null
          source_payload?: Json | null
          status?: string | null
          threat?: number | null
          total_points?: number | null
          updated_at?: string
          web_name?: string | null
          yellow_cards?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["canonical_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "fpl_players_fpl_team_id_fkey"
            columns: ["fpl_team_id"]
            isOneToOne: false
            referencedRelation: "fpl_team_strength_current"
            referencedColumns: ["fpl_team_id"]
          },
          {
            foreignKeyName: "fpl_players_fpl_team_id_fkey"
            columns: ["fpl_team_id"]
            isOneToOne: false
            referencedRelation: "fpl_teams"
            referencedColumns: ["fpl_team_id"]
          },
          {
            foreignKeyName: "fpl_players_fpl_team_id_fkey"
            columns: ["fpl_team_id"]
            isOneToOne: false
            referencedRelation: "team_strength_current"
            referencedColumns: ["fpl_team_id"]
          },
          {
            foreignKeyName: "fpl_players_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      fpl_projection_model_parameters: {
        Row: {
          model_version: string
          notes: string | null
          parameter_id: number
          parameter_name: string
          parameter_value: number
          player_position: string | null
          season_id: number
          updated_at: string
        }
        Insert: {
          model_version: string
          notes?: string | null
          parameter_id?: number
          parameter_name: string
          parameter_value: number
          player_position?: string | null
          season_id: number
          updated_at?: string
        }
        Update: {
          model_version?: string
          notes?: string | null
          parameter_id?: number
          parameter_name?: string
          parameter_value?: number
          player_position?: string | null
          season_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      fpl_scoring_rules: {
        Row: {
          notes: string | null
          player_position: string | null
          points: number
          rule_code: string
          rule_id: number
          season_id: number
          source_name: string
          threshold: number | null
          updated_at: string
        }
        Insert: {
          notes?: string | null
          player_position?: string | null
          points: number
          rule_code: string
          rule_id?: never
          season_id: number
          source_name: string
          threshold?: number | null
          updated_at?: string
        }
        Update: {
          notes?: string | null
          player_position?: string | null
          points?: number
          rule_code?: string
          rule_id?: never
          season_id?: number
          source_name?: string
          threshold?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      fpl_teams: {
        Row: {
          canonical_team_id: number | null
          code: number | null
          fpl_team_id: number
          name: string
          season_id: number | null
          short_name: string | null
          source_payload: Json | null
          strength: number | null
          strength_attack_away: number | null
          strength_attack_home: number | null
          strength_defence_away: number | null
          strength_defence_home: number | null
          strength_overall_away: number | null
          strength_overall_home: number | null
          updated_at: string
        }
        Insert: {
          canonical_team_id?: number | null
          code?: number | null
          fpl_team_id: number
          name: string
          season_id?: number | null
          short_name?: string | null
          source_payload?: Json | null
          strength?: number | null
          strength_attack_away?: number | null
          strength_attack_home?: number | null
          strength_defence_away?: number | null
          strength_defence_home?: number | null
          strength_overall_away?: number | null
          strength_overall_home?: number | null
          updated_at?: string
        }
        Update: {
          canonical_team_id?: number | null
          code?: number | null
          fpl_team_id?: number
          name?: string
          season_id?: number | null
          short_name?: string | null
          source_payload?: Json | null
          strength?: number | null
          strength_attack_away?: number | null
          strength_attack_home?: number | null
          strength_defence_away?: number | null
          strength_defence_home?: number | null
          strength_overall_away?: number | null
          strength_overall_home?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fpl_teams_canonical_team_id_fkey"
            columns: ["canonical_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "fpl_teams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      leagues: {
        Row: {
          code: string
          competition_type: string | null
          confederation: string | null
          country_id: number
          created_at: string
          league_id: number
          name: string
          scope: string | null
          slug: string
          tier: number | null
        }
        Insert: {
          code: string
          competition_type?: string | null
          confederation?: string | null
          country_id: number
          created_at?: string
          league_id?: never
          name: string
          scope?: string | null
          slug: string
          tier?: number | null
        }
        Update: {
          code?: string
          competition_type?: string | null
          confederation?: string | null
          country_id?: number
          created_at?: string
          league_id?: never
          name?: string
          scope?: string | null
          slug?: string
          tier?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leagues_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["country_id"]
          },
        ]
      }
      lineup_prediction_sources: {
        Row: {
          active: boolean
          created_at: string
          lineup_source_id: number
          source_name: string
          source_type: string
          source_weight: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          lineup_source_id?: number
          source_name: string
          source_type?: string
          source_weight?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          lineup_source_id?: number
          source_name?: string
          source_type?: string
          source_weight?: number
        }
        Relationships: []
      }
      match_import_runs: {
        Row: {
          error_message: string | null
          finished_at: string | null
          import_run_id: number
          league_code: string
          rows_seen: number | null
          rows_upserted: number | null
          started_at: string
          status: string
        }
        Insert: {
          error_message?: string | null
          finished_at?: string | null
          import_run_id?: never
          league_code: string
          rows_seen?: number | null
          rows_upserted?: number | null
          started_at: string
          status: string
        }
        Update: {
          error_message?: string | null
          finished_at?: string | null
          import_run_id?: never
          league_code?: string
          rows_seen?: number | null
          rows_upserted?: number | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      match_odds: {
        Row: {
          bookmaker: string
          is_closing: boolean
          line: number | null
          market: string
          match_id: number
          match_odds_id: number
          observed_at: string
          price_away: number | null
          price_draw: number | null
          price_home: number | null
          price_over: number | null
          price_under: number | null
          raw_data: Json
          source_name: string
        }
        Insert: {
          bookmaker?: string
          is_closing?: boolean
          line?: number | null
          market: string
          match_id: number
          match_odds_id?: number
          observed_at?: string
          price_away?: number | null
          price_draw?: number | null
          price_home?: number | null
          price_over?: number | null
          price_under?: number | null
          raw_data?: Json
          source_name: string
        }
        Update: {
          bookmaker?: string
          is_closing?: boolean
          line?: number | null
          market?: string
          match_id?: number
          match_odds_id?: number
          observed_at?: string
          price_away?: number | null
          price_draw?: number | null
          price_home?: number | null
          price_over?: number | null
          price_under?: number | null
          raw_data?: Json
          source_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["match_id"]
          },
        ]
      }
      meta_flow_nodes: {
        Row: {
          commentary: string | null
          definition_hash: string
          first_seen: string
          is_present: boolean
          kind: string
          last_seen: string
          layer: string | null
          node_key: string
          obj_name: string
          purpose: string | null
          refresh_note: string | null
          row_estimate: number | null
        }
        Insert: {
          commentary?: string | null
          definition_hash: string
          first_seen?: string
          is_present?: boolean
          kind: string
          last_seen?: string
          layer?: string | null
          node_key: string
          obj_name: string
          purpose?: string | null
          refresh_note?: string | null
          row_estimate?: number | null
        }
        Update: {
          commentary?: string | null
          definition_hash?: string
          first_seen?: string
          is_present?: boolean
          kind?: string
          last_seen?: string
          layer?: string | null
          node_key?: string
          obj_name?: string
          purpose?: string | null
          refresh_note?: string | null
          row_estimate?: number | null
        }
        Relationships: []
      }
      meta_flow_edges: {
        Row: { child_key: string; parent_key: string; source: string }
        Insert: { child_key: string; parent_key: string; source?: string }
        Update: { child_key?: string; parent_key?: string; source?: string }
        Relationships: []
      }
      meta_flow_history: {
        Row: {
          author: string
          change: string
          changed_at: string
          detail: string | null
          history_id: number
          node_key: string
        }
        Insert: {
          author?: string
          change: string
          changed_at?: string
          detail?: string | null
          history_id?: number
          node_key: string
        }
        Update: {
          author?: string
          change?: string
          changed_at?: string
          detail?: string | null
          history_id?: number
          node_key?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          attendance: number | null
          away_corners: number | null
          away_fouls: number | null
          away_penalty_goals: number | null
          away_red_cards: number
          away_shots: number | null
          away_shots_on_target: number | null
          away_team_id: number
          away_xg: number | null
          away_yellow_cards: number
          created_at: string
          decided_by: string | null
          full_time_away_goals: number
          full_time_home_goals: number
          full_time_result: string
          half_time_away_goals: number | null
          half_time_home_goals: number | null
          half_time_result: string | null
          home_corners: number | null
          home_fouls: number | null
          home_penalty_goals: number | null
          home_red_cards: number
          home_shots: number | null
          home_shots_on_target: number | null
          home_team_id: number
          home_xg: number | null
          home_yellow_cards: number
          kickoff_time: string | null
          league_id: number
          match_date: string
          match_id: number
          referee: string | null
          round: string | null
          round_number: number | null
          season_id: number
          source_file: string
          source_match_id: string | null
          source_name: string
          stage: string | null
          updated_at: string
          winner_team_id: number | null
        }
        Insert: {
          attendance?: number | null
          away_corners?: number | null
          away_fouls?: number | null
          away_penalty_goals?: number | null
          away_red_cards?: number
          away_shots?: number | null
          away_shots_on_target?: number | null
          away_team_id: number
          away_xg?: number | null
          away_yellow_cards?: number
          created_at?: string
          decided_by?: string | null
          full_time_away_goals: number
          full_time_home_goals: number
          full_time_result: string
          half_time_away_goals?: number | null
          half_time_home_goals?: number | null
          half_time_result?: string | null
          home_corners?: number | null
          home_fouls?: number | null
          home_penalty_goals?: number | null
          home_red_cards?: number
          home_shots?: number | null
          home_shots_on_target?: number | null
          home_team_id: number
          home_xg?: number | null
          home_yellow_cards?: number
          kickoff_time?: string | null
          league_id: number
          match_date: string
          match_id?: never
          referee?: string | null
          round?: string | null
          round_number?: number | null
          season_id: number
          source_file: string
          source_match_id?: string | null
          source_name?: string
          stage?: string | null
          updated_at?: string
          winner_team_id?: number | null
        }
        Update: {
          attendance?: number | null
          away_corners?: number | null
          away_fouls?: number | null
          away_penalty_goals?: number | null
          away_red_cards?: number
          away_shots?: number | null
          away_shots_on_target?: number | null
          away_team_id?: number
          away_xg?: number | null
          away_yellow_cards?: number
          created_at?: string
          decided_by?: string | null
          full_time_away_goals?: number
          full_time_home_goals?: number
          full_time_result?: string
          half_time_away_goals?: number | null
          half_time_home_goals?: number | null
          half_time_result?: string | null
          home_corners?: number | null
          home_fouls?: number | null
          home_penalty_goals?: number | null
          home_red_cards?: number
          home_shots?: number | null
          home_shots_on_target?: number | null
          home_team_id?: number
          home_xg?: number | null
          home_yellow_cards?: number
          kickoff_time?: string | null
          league_id?: number
          match_date?: string
          match_id?: never
          referee?: string | null
          round?: string | null
          round_number?: number | null
          season_id?: number
          source_file?: string
          source_match_id?: string | null
          source_name?: string
          stage?: string | null
          updated_at?: string
          winner_team_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "matches_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "league_fit_status"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "matches_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "matches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      model_fit_runs: {
        Row: {
          converged: boolean
          decay_half_life_days: number
          fit_run_id: number
          fitted_at: string
          home_advantage: number
          league_id: number
          log_likelihood: number | null
          matches_used: number
          rejection_reason: string | null
          rho: number
          status: string
          validation_checks: Json
          validation_warnings: Json
          window_end_date: string
          window_start_date: string
        }
        Insert: {
          converged?: boolean
          decay_half_life_days: number
          fit_run_id?: never
          fitted_at?: string
          home_advantage: number
          league_id: number
          log_likelihood?: number | null
          matches_used: number
          rejection_reason?: string | null
          rho: number
          status?: string
          validation_checks?: Json
          validation_warnings?: Json
          window_end_date: string
          window_start_date: string
        }
        Update: {
          converged?: boolean
          decay_half_life_days?: number
          fit_run_id?: never
          fitted_at?: string
          home_advantage?: number
          league_id?: number
          log_likelihood?: number | null
          matches_used?: number
          rejection_reason?: string | null
          rho?: number
          status?: string
          validation_checks?: Json
          validation_warnings?: Json
          window_end_date?: string
          window_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_fit_runs_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "league_fit_status"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "model_fit_runs_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
        ]
      }
      opta_player_match: {
        Row: {
          assist_corner: number | null
          assist_free_kick: number | null
          assist_set_piece: number | null
          assist_throw_in: number | null
          assists: number | null
          big_chances: number | null
          corners_taken: number | null
          formation_code: string | null
          formation_slot: number | null
          goals: number | null
          goals_from_corners: number | null
          goals_from_direct_fk: number | null
          goals_from_penalties: number | null
          goals_from_set_play: number | null
          goals_open_play: number | null
          key_passes: number | null
          match_date: string
          minutes: number | null
          opposition_name: string | null
          opta_player_id: number
          opta_row_id: number
          opta_team_id: number | null
          penalties_taken: number | null
          penalty_goals: number | null
          player_name: string
          position_id: number | null
          shots_off_target: number | null
          shots_on_target: number | null
          starts: number | null
          team_name: string
          touches_opp_box: number | null
          venue: string | null
        }
        Insert: {
          assist_corner?: number | null
          assist_free_kick?: number | null
          assist_set_piece?: number | null
          assist_throw_in?: number | null
          assists?: number | null
          big_chances?: number | null
          corners_taken?: number | null
          formation_code?: string | null
          formation_slot?: number | null
          goals?: number | null
          goals_from_corners?: number | null
          goals_from_direct_fk?: number | null
          goals_from_penalties?: number | null
          goals_from_set_play?: number | null
          goals_open_play?: number | null
          key_passes?: number | null
          match_date: string
          minutes?: number | null
          opposition_name?: string | null
          opta_player_id: number
          opta_row_id?: never
          opta_team_id?: number | null
          penalties_taken?: number | null
          penalty_goals?: number | null
          player_name: string
          position_id?: number | null
          shots_off_target?: number | null
          shots_on_target?: number | null
          starts?: number | null
          team_name: string
          touches_opp_box?: number | null
          venue?: string | null
        }
        Update: {
          assist_corner?: number | null
          assist_free_kick?: number | null
          assist_set_piece?: number | null
          assist_throw_in?: number | null
          assists?: number | null
          big_chances?: number | null
          corners_taken?: number | null
          formation_code?: string | null
          formation_slot?: number | null
          goals?: number | null
          goals_from_corners?: number | null
          goals_from_direct_fk?: number | null
          goals_from_penalties?: number | null
          goals_from_set_play?: number | null
          goals_open_play?: number | null
          key_passes?: number | null
          match_date?: string
          minutes?: number | null
          opposition_name?: string | null
          opta_player_id?: number
          opta_row_id?: never
          opta_team_id?: number | null
          penalties_taken?: number | null
          penalty_goals?: number | null
          player_name?: string
          position_id?: number | null
          shots_off_target?: number | null
          shots_on_target?: number | null
          starts?: number | null
          team_name?: string
          touches_opp_box?: number | null
          venue?: string | null
        }
        Relationships: []
      }
      opta_slot_breakdown: {
        Row: {
          assist_corner: number
          assist_free_kick: number
          assist_set_piece: number
          assist_throw_in: number
          assists: number
          big_chances: number
          corners_taken: number
          formation_code: string
          goals: number
          goals_from_corners: number
          goals_from_direct_fk: number
          goals_from_penalties: number
          goals_from_set_play: number
          goals_open_play: number
          key_passes: number
          minutes: number
          penalties_taken: number
          penalty_goals: number
          shots_off_target: number
          shots_on_target: number
          slot: number
          starts: number
          touches_opp_box: number
        }
        Insert: {
          assist_corner?: number
          assist_free_kick?: number
          assist_set_piece?: number
          assist_throw_in?: number
          assists?: number
          big_chances?: number
          corners_taken?: number
          formation_code: string
          goals?: number
          goals_from_corners?: number
          goals_from_direct_fk?: number
          goals_from_penalties?: number
          goals_from_set_play?: number
          goals_open_play?: number
          key_passes?: number
          minutes?: number
          penalties_taken?: number
          penalty_goals?: number
          shots_off_target?: number
          shots_on_target?: number
          slot: number
          starts?: number
          touches_opp_box?: number
        }
        Update: {
          assist_corner?: number
          assist_free_kick?: number
          assist_set_piece?: number
          assist_throw_in?: number
          assists?: number
          big_chances?: number
          corners_taken?: number
          formation_code?: string
          goals?: number
          goals_from_corners?: number
          goals_from_direct_fk?: number
          goals_from_penalties?: number
          goals_from_set_play?: number
          goals_open_play?: number
          key_passes?: number
          minutes?: number
          penalties_taken?: number
          penalty_goals?: number
          shots_off_target?: number
          shots_on_target?: number
          slot?: number
          starts?: number
          touches_opp_box?: number
        }
        Relationships: []
      }
      pipeline_runs: {
        Row: {
          error_message: string | null
          finished_at: string | null
          job_name: string
          run_id: number
          started_at: string
          status: string
          summary: string | null
        }
        Insert: {
          error_message?: string | null
          finished_at?: string | null
          job_name: string
          run_id?: never
          started_at?: string
          status?: string
          summary?: string | null
        }
        Update: {
          error_message?: string | null
          finished_at?: string | null
          job_name?: string
          run_id?: never
          started_at?: string
          status?: string
          summary?: string | null
        }
        Relationships: []
      }
      player_availability_events: {
        Row: {
          availability_category: string | null
          availability_event_id: number
          chance_of_playing_next_round: number | null
          chance_of_playing_this_round: number | null
          expected_return_date: string | null
          fpl_player_id: number
          news: string | null
          news_added: string | null
          observed_at: string
          season_id: number
          source_name: string
          source_payload: Json | null
          status: string | null
        }
        Insert: {
          availability_category?: string | null
          availability_event_id?: never
          chance_of_playing_next_round?: number | null
          chance_of_playing_this_round?: number | null
          expected_return_date?: string | null
          fpl_player_id: number
          news?: string | null
          news_added?: string | null
          observed_at?: string
          season_id: number
          source_name?: string
          source_payload?: Json | null
          status?: string | null
        }
        Update: {
          availability_category?: string | null
          availability_event_id?: never
          chance_of_playing_next_round?: number | null
          chance_of_playing_this_round?: number | null
          expected_return_date?: string | null
          fpl_player_id?: number
          news?: string | null
          news_added?: string | null
          observed_at?: string
          season_id?: number
          source_name?: string
          source_payload?: Json | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_availability_events_player_season_fkey"
            columns: ["fpl_player_id", "season_id"]
            isOneToOne: false
            referencedRelation: "fpl_player_defensive_contribution_usage"
            referencedColumns: ["fpl_player_id", "season_id"]
          },
          {
            foreignKeyName: "player_availability_events_player_season_fkey"
            columns: ["fpl_player_id", "season_id"]
            isOneToOne: false
            referencedRelation: "fpl_player_substitution_usage"
            referencedColumns: ["fpl_player_id", "season_id"]
          },
          {
            foreignKeyName: "player_availability_events_player_season_fkey"
            columns: ["fpl_player_id", "season_id"]
            isOneToOne: false
            referencedRelation: "fpl_players"
            referencedColumns: ["fpl_player_id", "season_id"]
          },
          {
            foreignKeyName: "player_availability_events_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      player_identity: {
        Row: {
          canonical_name: string
          created_at: string
          first_seen_season_id: number | null
          fpl_code: number
          last_seen_season_id: number | null
          slug: string
          updated_at: string
        }
        Insert: {
          canonical_name: string
          created_at?: string
          first_seen_season_id?: number | null
          fpl_code: number
          last_seen_season_id?: number | null
          slug: string
          updated_at?: string
        }
        Update: {
          canonical_name?: string
          created_at?: string
          first_seen_season_id?: number | null
          fpl_code?: number
          last_seen_season_id?: number | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_identity_first_seen_season_id_fkey"
            columns: ["first_seen_season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "player_identity_last_seen_season_id_fkey"
            columns: ["last_seen_season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      player_lineup_predictions: {
        Row: {
          evidence: Json | null
          expected_minutes: number | null
          fixture_id: number
          generated_at: string
          lineup_prediction_id: number
          model_version: string
          player_name: string | null
          predicted_role: string | null
          prob_60_plus: number | null
          prob_appearance: number | null
          prob_start: number | null
          season_id: number
          source_name: string
          source_player_id: string
        }
        Insert: {
          evidence?: Json | null
          expected_minutes?: number | null
          fixture_id: number
          generated_at?: string
          lineup_prediction_id?: never
          model_version: string
          player_name?: string | null
          predicted_role?: string | null
          prob_60_plus?: number | null
          prob_appearance?: number | null
          prob_start?: number | null
          season_id: number
          source_name?: string
          source_player_id: string
        }
        Update: {
          evidence?: Json | null
          expected_minutes?: number | null
          fixture_id?: number
          generated_at?: string
          lineup_prediction_id?: never
          model_version?: string
          player_name?: string | null
          predicted_role?: string | null
          prob_60_plus?: number | null
          prob_appearance?: number | null
          prob_start?: number | null
          season_id?: number
          source_name?: string
          source_player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_lineup_predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_fallback"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_lineup_predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_lineup_predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_lineup_predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_lineup_predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_defensive_contribution_projection_leaguewide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_lineup_predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fallback_start_probability_v6"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_lineup_predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fixture_bps_projection_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_lineup_predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_prediction_actual_start_comparison"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_lineup_predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_data_health"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_lineup_predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_fixture_readiness"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_lineup_predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_allocation_v2"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_lineup_predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_final"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_lineup_predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_points"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_lineup_predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_secondary_scoring"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_lineup_predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_v4_leaguewide_inputs"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_lineup_predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_season_fixture_feed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_lineup_predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_adjustments_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_lineup_predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_exposure_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_lineup_predictions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      player_match_roles: {
        Row: {
          fixture_id: number
          formation_slot: string | null
          minutes: number | null
          nominal_position: string | null
          observed_at: string
          player_match_role_id: number
          player_name: string | null
          season_id: number
          source_name: string
          source_payload: Json | null
          source_player_id: string
          started: boolean | null
          tactical_role: string | null
          team_id: number
        }
        Insert: {
          fixture_id: number
          formation_slot?: string | null
          minutes?: number | null
          nominal_position?: string | null
          observed_at?: string
          player_match_role_id?: never
          player_name?: string | null
          season_id: number
          source_name: string
          source_payload?: Json | null
          source_player_id: string
          started?: boolean | null
          tactical_role?: string | null
          team_id: number
        }
        Update: {
          fixture_id?: number
          formation_slot?: string | null
          minutes?: number | null
          nominal_position?: string | null
          observed_at?: string
          player_match_role_id?: never
          player_name?: string | null
          season_id?: number
          source_name?: string
          source_payload?: Json | null
          source_player_id?: string
          started?: boolean | null
          tactical_role?: string | null
          team_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_match_roles_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_fallback"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_match_roles_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_match_roles_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_match_roles_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_match_roles_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_defensive_contribution_projection_leaguewide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_match_roles_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fallback_start_probability_v6"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_match_roles_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fixture_bps_projection_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_match_roles_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_prediction_actual_start_comparison"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_match_roles_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_data_health"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_match_roles_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_fixture_readiness"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_match_roles_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_allocation_v2"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_match_roles_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_final"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_match_roles_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_points"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_match_roles_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_secondary_scoring"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_match_roles_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_v4_leaguewide_inputs"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_match_roles_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_season_fixture_feed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_match_roles_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_adjustments_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_match_roles_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_exposure_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_match_roles_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "player_match_roles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      player_squad_hierarchy: {
        Row: {
          evidence: Json
          fpl_player_id: number
          hierarchy_score: number | null
          player_squad_hierarchy_id: number
          season_id: number
          squad_status: string
          team_id: number
          updated_at: string
        }
        Insert: {
          evidence?: Json
          fpl_player_id: number
          hierarchy_score?: number | null
          player_squad_hierarchy_id?: number
          season_id: number
          squad_status: string
          team_id: number
          updated_at?: string
        }
        Update: {
          evidence?: Json
          fpl_player_id?: number
          hierarchy_score?: number | null
          player_squad_hierarchy_id?: number
          season_id?: number
          squad_status?: string
          team_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      player_tactical_profiles: {
        Row: {
          evidence: Json
          expected_minutes: number | null
          expected_minutes_if_start: number | null
          expected_minutes_if_sub: number | null
          fpl_position: string | null
          player_name: string
          player_tactical_profile_id: number
          prob_60_plus: number | null
          prob_appearance: number | null
          prob_start: number | null
          prob_starting_xi: number | null
          prob_sub_appearance: number | null
          role_confidence: number | null
          season_id: number
          source_name: string
          source_player_id: string
          tactical_role: string | null
          team_id: number
          updated_at: string
        }
        Insert: {
          evidence?: Json
          expected_minutes?: number | null
          expected_minutes_if_start?: number | null
          expected_minutes_if_sub?: number | null
          fpl_position?: string | null
          player_name: string
          player_tactical_profile_id?: never
          prob_60_plus?: number | null
          prob_appearance?: number | null
          prob_start?: number | null
          prob_starting_xi?: number | null
          prob_sub_appearance?: number | null
          role_confidence?: number | null
          season_id: number
          source_name: string
          source_player_id: string
          tactical_role?: string | null
          team_id: number
          updated_at?: string
        }
        Update: {
          evidence?: Json
          expected_minutes?: number | null
          expected_minutes_if_start?: number | null
          expected_minutes_if_sub?: number | null
          fpl_position?: string | null
          player_name?: string
          player_tactical_profile_id?: never
          prob_60_plus?: number | null
          prob_appearance?: number | null
          prob_start?: number | null
          prob_starting_xi?: number | null
          prob_sub_appearance?: number | null
          role_confidence?: number | null
          season_id?: number
          source_name?: string
          source_player_id?: string
          tactical_role?: string | null
          team_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      point_deductions: {
        Row: {
          created_at: string
          deduction_id: number
          effective_date: string | null
          league_id: number
          points: number
          reason: string | null
          season_id: number
          team_id: number
        }
        Insert: {
          created_at?: string
          deduction_id?: never
          effective_date?: string | null
          league_id: number
          points: number
          reason?: string | null
          season_id: number
          team_id: number
        }
        Update: {
          created_at?: string
          deduction_id?: never
          effective_date?: string | null
          league_id?: number
          points?: number
          reason?: string | null
          season_id?: number
          team_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "point_deductions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "league_fit_status"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "point_deductions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "point_deductions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "point_deductions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      projection_scenario_players: {
        Row: {
          corner_left_rank: number | null
          corner_right_rank: number | null
          direct_free_kick_rank: number | null
          expected_minutes: number | null
          fpl_player_id: number
          penalty_rank: number | null
          scenario_id: number
          scenario_player_id: number
          selected_start: boolean | null
          tactical_role: string | null
          updated_at: string
        }
        Insert: {
          corner_left_rank?: number | null
          corner_right_rank?: number | null
          direct_free_kick_rank?: number | null
          expected_minutes?: number | null
          fpl_player_id: number
          penalty_rank?: number | null
          scenario_id: number
          scenario_player_id?: number
          selected_start?: boolean | null
          tactical_role?: string | null
          updated_at?: string
        }
        Update: {
          corner_left_rank?: number | null
          corner_right_rank?: number | null
          direct_free_kick_rank?: number | null
          expected_minutes?: number | null
          fpl_player_id?: number
          penalty_rank?: number | null
          scenario_id?: number
          scenario_player_id?: number
          selected_start?: boolean | null
          tactical_role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projection_scenario_players_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "projection_scenarios"
            referencedColumns: ["scenario_id"]
          },
        ]
      }
      projection_scenario_teams: {
        Row: {
          formation: string | null
          formation_overridden: boolean
          scenario_id: number
          scenario_team_id: number
          team_id: number
          updated_at: string
        }
        Insert: {
          formation?: string | null
          formation_overridden?: boolean
          scenario_id: number
          scenario_team_id?: number
          team_id: number
          updated_at?: string
        }
        Update: {
          formation?: string | null
          formation_overridden?: boolean
          scenario_id?: number
          scenario_team_id?: number
          team_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projection_scenario_teams_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "projection_scenarios"
            referencedColumns: ["scenario_id"]
          },
        ]
      }
      projection_scenarios: {
        Row: {
          created_at: string
          created_by: string | null
          fixture_id: number
          is_model_default: boolean
          scenario_id: number
          scenario_name: string
          season_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fixture_id: number
          is_model_default?: boolean
          scenario_id?: number
          scenario_name?: string
          season_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fixture_id?: number
          is_model_default?: boolean
          scenario_id?: number
          scenario_name?: string
          season_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      raw_match_files: {
        Row: {
          column_names: Json | null
          competition_code: string | null
          content_hash: string
          file_metadata: Json
          raw_file_id: number
          retrieved_at: string
          row_count: number | null
          season_label: string | null
          source_code: string | null
          source_name: string
          source_url: string
        }
        Insert: {
          column_names?: Json | null
          competition_code?: string | null
          content_hash: string
          file_metadata?: Json
          raw_file_id?: number
          retrieved_at?: string
          row_count?: number | null
          season_label?: string | null
          source_code?: string | null
          source_name: string
          source_url: string
        }
        Update: {
          column_names?: Json | null
          competition_code?: string | null
          content_hash?: string
          file_metadata?: Json
          raw_file_id?: number
          retrieved_at?: string
          row_count?: number | null
          season_label?: string | null
          source_code?: string | null
          source_name?: string
          source_url?: string
        }
        Relationships: []
      }
      result_ingestion_runs: {
        Row: {
          competitions_attempted: number
          details: Json
          error_message: string | null
          finished_at: string | null
          ingestion_run_id: number
          matches_changed: number
          matches_inserted: number
          matches_unchanged: number
          matches_upserted: number
          rows_seen: number
          rows_stored: number
          source_name: string
          started_at: string
          status: string
          unmatched_rows: number
        }
        Insert: {
          competitions_attempted?: number
          details?: Json
          error_message?: string | null
          finished_at?: string | null
          ingestion_run_id?: number
          matches_changed?: number
          matches_inserted?: number
          matches_unchanged?: number
          matches_upserted?: number
          rows_seen?: number
          rows_stored?: number
          source_name: string
          started_at?: string
          status?: string
          unmatched_rows?: number
        }
        Update: {
          competitions_attempted?: number
          details?: Json
          error_message?: string | null
          finished_at?: string | null
          ingestion_run_id?: number
          matches_changed?: number
          matches_inserted?: number
          matches_unchanged?: number
          matches_upserted?: number
          rows_seen?: number
          rows_stored?: number
          source_name?: string
          started_at?: string
          status?: string
          unmatched_rows?: number
        }
        Relationships: []
      }
      season_best_xi: {
        Row: {
          element_type: number
          fpl_code: number
          season_id: number
          start_cost: number
          team_name: string | null
          total_points: number
          web_name: string
        }
        Insert: {
          element_type: number
          fpl_code: number
          season_id: number
          start_cost: number
          team_name?: string | null
          total_points: number
          web_name: string
        }
        Update: {
          element_type?: number
          fpl_code?: number
          season_id?: number
          start_cost?: number
          team_name?: string | null
          total_points?: number
          web_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_best_xi_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          end_year: number
          label: string
          season_id: number
          slug: string
          start_year: number
        }
        Insert: {
          created_at?: string
          end_year: number
          label: string
          season_id?: never
          slug: string
          start_year: number
        }
        Update: {
          created_at?: string
          end_year?: number
          label?: string
          season_id?: never
          slug?: string
          start_year?: number
        }
        Relationships: []
      }
      set_piece_hierarchies: {
        Row: {
          confidence: number | null
          evidence_count: number | null
          player_name: string | null
          rank: number
          season_id: number
          set_piece_hierarchy_id: number
          set_piece_type: string
          source_name: string
          source_payload: Json | null
          source_player_id: string
          team_id: number
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          confidence?: number | null
          evidence_count?: number | null
          player_name?: string | null
          rank: number
          season_id: number
          set_piece_hierarchy_id?: never
          set_piece_type: string
          source_name: string
          source_payload?: Json | null
          source_player_id: string
          team_id: number
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          confidence?: number | null
          evidence_count?: number | null
          player_name?: string | null
          rank?: number
          season_id?: number
          set_piece_hierarchy_id?: never
          set_piece_type?: string
          source_name?: string
          source_payload?: Json | null
          source_player_id?: string
          team_id?: number
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "set_piece_hierarchies_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "set_piece_hierarchies_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      source_match_rows: {
        Row: {
          first_seen_at: string
          last_seen_at: string
          raw_data: Json
          raw_file_id: number | null
          raw_hash: string
          source_away_team: string | null
          source_competition_id: number | null
          source_home_team: string | null
          source_kickoff_time: string | null
          source_match_date: string | null
          source_match_row_id: number
          source_row_key: string
          source_row_number: number | null
        }
        Insert: {
          first_seen_at?: string
          last_seen_at?: string
          raw_data: Json
          raw_file_id?: number | null
          raw_hash: string
          source_away_team?: string | null
          source_competition_id?: number | null
          source_home_team?: string | null
          source_kickoff_time?: string | null
          source_match_date?: string | null
          source_match_row_id?: number
          source_row_key: string
          source_row_number?: number | null
        }
        Update: {
          first_seen_at?: string
          last_seen_at?: string
          raw_data?: Json
          raw_file_id?: number | null
          raw_hash?: string
          source_away_team?: string | null
          source_competition_id?: number | null
          source_home_team?: string | null
          source_kickoff_time?: string | null
          source_match_date?: string | null
          source_match_row_id?: number
          source_row_key?: string
          source_row_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "source_match_rows_raw_file_id_fkey"
            columns: ["raw_file_id"]
            isOneToOne: false
            referencedRelation: "raw_match_files"
            referencedColumns: ["raw_file_id"]
          },
          {
            foreignKeyName: "source_match_rows_source_competition_id_fkey"
            columns: ["source_competition_id"]
            isOneToOne: false
            referencedRelation: "data_source_competitions"
            referencedColumns: ["source_competition_id"]
          },
        ]
      }
      tactical_data_sources: {
        Row: {
          competition_name: string | null
          created_at: string
          provider: string | null
          source_date_from: string | null
          source_date_to: string | null
          source_name: string
          source_notes: string | null
          source_season_label: string
          tactical_source_id: number
        }
        Insert: {
          competition_name?: string | null
          created_at?: string
          provider?: string | null
          source_date_from?: string | null
          source_date_to?: string | null
          source_name: string
          source_notes?: string | null
          source_season_label: string
          tactical_source_id?: number
        }
        Update: {
          competition_name?: string | null
          created_at?: string
          provider?: string | null
          source_date_from?: string | null
          source_date_to?: string | null
          source_name?: string
          source_notes?: string | null
          source_season_label?: string
          tactical_source_id?: number
        }
        Relationships: []
      }
      tactical_formation_mappings: {
        Row: {
          canonical_formation: string | null
          created_at: string
          mapping_confidence: number | null
          mapping_method: string | null
          notes: string | null
          source_formation_code: string
          tactical_source_id: number
        }
        Insert: {
          canonical_formation?: string | null
          created_at?: string
          mapping_confidence?: number | null
          mapping_method?: string | null
          notes?: string | null
          source_formation_code: string
          tactical_source_id: number
        }
        Update: {
          canonical_formation?: string | null
          created_at?: string
          mapping_confidence?: number | null
          mapping_method?: string | null
          notes?: string | null
          source_formation_code?: string
          tactical_source_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tactical_formation_mappings_tactical_source_id_fkey"
            columns: ["tactical_source_id"]
            isOneToOne: false
            referencedRelation: "tactical_data_sources"
            referencedColumns: ["tactical_source_id"]
          },
        ]
      }
      tactical_formation_slot_aggregates: {
        Row: {
          assists: number
          big_chances: number
          created_at: string
          goals: number
          key_passes: number
          minutes: number
          open_play_goals: number
          opp_box_touches: number
          set_piece_assists: number
          shots: number
          shots_on_target: number
          source_formation_code: string
          source_formation_slot: string
          starts: number
          tactical_source_id: number
          venue_scope: string
        }
        Insert: {
          assists?: number
          big_chances?: number
          created_at?: string
          goals?: number
          key_passes?: number
          minutes?: number
          open_play_goals?: number
          opp_box_touches?: number
          set_piece_assists?: number
          shots?: number
          shots_on_target?: number
          source_formation_code: string
          source_formation_slot: string
          starts?: number
          tactical_source_id: number
          venue_scope: string
        }
        Update: {
          assists?: number
          big_chances?: number
          created_at?: string
          goals?: number
          key_passes?: number
          minutes?: number
          open_play_goals?: number
          opp_box_touches?: number
          set_piece_assists?: number
          shots?: number
          shots_on_target?: number
          source_formation_code?: string
          source_formation_slot?: string
          starts?: number
          tactical_source_id?: number
          venue_scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "tactical_formation_slot_aggregates_tactical_source_id_fkey"
            columns: ["tactical_source_id"]
            isOneToOne: false
            referencedRelation: "tactical_data_sources"
            referencedColumns: ["tactical_source_id"]
          },
        ]
      }
      tactical_player_match_observations: {
        Row: {
          assists: number | null
          big_chances: number | null
          canonical_player_id: number | null
          canonical_role: string | null
          created_at: string
          goals: number | null
          is_starter: boolean
          key_passes: number | null
          minutes: number | null
          open_play_goals: number | null
          opp_box_touches: number | null
          raw_metadata: Json
          role_mapping_confidence: number | null
          role_mapping_method: string | null
          set_piece_assists: number | null
          shots: number | null
          shots_on_target: number | null
          source_formation_slot: string | null
          source_player_id: string | null
          source_player_name: string | null
          source_position_code: string | null
          source_unique_player_ref: string | null
          tactical_player_match_id: number
          tactical_team_match_id: number
        }
        Insert: {
          assists?: number | null
          big_chances?: number | null
          canonical_player_id?: number | null
          canonical_role?: string | null
          created_at?: string
          goals?: number | null
          is_starter?: boolean
          key_passes?: number | null
          minutes?: number | null
          open_play_goals?: number | null
          opp_box_touches?: number | null
          raw_metadata?: Json
          role_mapping_confidence?: number | null
          role_mapping_method?: string | null
          set_piece_assists?: number | null
          shots?: number | null
          shots_on_target?: number | null
          source_formation_slot?: string | null
          source_player_id?: string | null
          source_player_name?: string | null
          source_position_code?: string | null
          source_unique_player_ref?: string | null
          tactical_player_match_id?: number
          tactical_team_match_id: number
        }
        Update: {
          assists?: number | null
          big_chances?: number | null
          canonical_player_id?: number | null
          canonical_role?: string | null
          created_at?: string
          goals?: number | null
          is_starter?: boolean
          key_passes?: number | null
          minutes?: number | null
          open_play_goals?: number | null
          opp_box_touches?: number | null
          raw_metadata?: Json
          role_mapping_confidence?: number | null
          role_mapping_method?: string | null
          set_piece_assists?: number | null
          shots?: number | null
          shots_on_target?: number | null
          source_formation_slot?: string | null
          source_player_id?: string | null
          source_player_name?: string | null
          source_position_code?: string | null
          source_unique_player_ref?: string | null
          tactical_player_match_id?: number
          tactical_team_match_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tactical_player_match_observations_tactical_team_match_id_fkey"
            columns: ["tactical_team_match_id"]
            isOneToOne: false
            referencedRelation: "tactical_team_match_observations"
            referencedColumns: ["tactical_team_match_id"]
          },
        ]
      }
      tactical_role_priors: {
        Row: {
          assist_weight: number
          evidence_basis: string
          goal_weight: number
          role_group: string
          tactical_role: string
          updated_at: string
        }
        Insert: {
          assist_weight: number
          evidence_basis: string
          goal_weight: number
          role_group: string
          tactical_role: string
          updated_at?: string
        }
        Update: {
          assist_weight?: number
          evidence_basis?: string
          goal_weight?: number
          role_group?: string
          tactical_role?: string
          updated_at?: string
        }
        Relationships: []
      }
      tactical_team_match_observations: {
        Row: {
          canonical_fixture_id: number | null
          canonical_formation: string | null
          canonical_team_id: number | null
          created_at: string
          formation_mapping_confidence: number | null
          formation_mapping_method: string | null
          match_date: string | null
          raw_metadata: Json
          source_formation_code: string | null
          source_match_ref: string
          source_opponent_id: string | null
          source_opponent_name: string | null
          source_team_id: string
          source_team_name: string | null
          tactical_source_id: number
          tactical_team_match_id: number
          venue: string | null
        }
        Insert: {
          canonical_fixture_id?: number | null
          canonical_formation?: string | null
          canonical_team_id?: number | null
          created_at?: string
          formation_mapping_confidence?: number | null
          formation_mapping_method?: string | null
          match_date?: string | null
          raw_metadata?: Json
          source_formation_code?: string | null
          source_match_ref: string
          source_opponent_id?: string | null
          source_opponent_name?: string | null
          source_team_id: string
          source_team_name?: string | null
          tactical_source_id: number
          tactical_team_match_id?: number
          venue?: string | null
        }
        Update: {
          canonical_fixture_id?: number | null
          canonical_formation?: string | null
          canonical_team_id?: number | null
          created_at?: string
          formation_mapping_confidence?: number | null
          formation_mapping_method?: string | null
          match_date?: string | null
          raw_metadata?: Json
          source_formation_code?: string | null
          source_match_ref?: string
          source_opponent_id?: string | null
          source_opponent_name?: string | null
          source_team_id?: string
          source_team_name?: string | null
          tactical_source_id?: number
          tactical_team_match_id?: number
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tactical_team_match_observations_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_fallback"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_defensive_contribution_projection_leaguewide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fallback_start_probability_v6"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fixture_bps_projection_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_prediction_actual_start_comparison"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_data_health"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_fixture_readiness"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_allocation_v2"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_final"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_points"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_secondary_scoring"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_v4_leaguewide_inputs"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_season_fixture_feed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_adjustments_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_exposure_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_team_id_fkey"
            columns: ["canonical_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_tactical_source_id_fkey"
            columns: ["tactical_source_id"]
            isOneToOne: false
            referencedRelation: "tactical_data_sources"
            referencedColumns: ["tactical_source_id"]
          },
        ]
      }
      team_aliases: {
        Row: {
          created_at: string
          raw_name: string
          source_name: string
          team_alias_id: number
          team_id: number
        }
        Insert: {
          created_at?: string
          raw_name: string
          source_name: string
          team_alias_id?: never
          team_id: number
        }
        Update: {
          created_at?: string
          raw_name?: string
          source_name?: string
          team_alias_id?: never
          team_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_aliases_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      team_categories: {
        Row: {
          category_id: number
          created_at: string
          description: string | null
          display_color: string | null
          name: string
          slug: string
        }
        Insert: {
          category_id?: never
          created_at?: string
          description?: string | null
          display_color?: string | null
          name: string
          slug: string
        }
        Update: {
          category_id?: never
          created_at?: string
          description?: string | null
          display_color?: string | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
      team_category_memberships: {
        Row: {
          category_id: number
          created_at: string
          membership_id: number
          season_id: number
          team_id: number
        }
        Insert: {
          category_id: number
          created_at?: string
          membership_id?: never
          season_id: number
          team_id: number
        }
        Update: {
          category_id?: number
          created_at?: string
          membership_id?: never
          season_id?: number
          team_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_category_memberships_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "team_categories"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "team_category_memberships_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "team_category_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      team_finishing_position_projection: {
        Row: {
          current_actual_points: number
          current_played: number
          league_id: number
          n_simulations: number
          position_distribution: Json
          projected_points_mean: number
          projected_position_mean: number
          projected_position_median: number
          season_id: number
          simulated_at: string
          team_id: number
        }
        Insert: {
          current_actual_points: number
          current_played: number
          league_id: number
          n_simulations: number
          position_distribution: Json
          projected_points_mean: number
          projected_position_mean: number
          projected_position_median: number
          season_id: number
          simulated_at?: string
          team_id: number
        }
        Update: {
          current_actual_points?: number
          current_played?: number
          league_id?: number
          n_simulations?: number
          position_distribution?: Json
          projected_points_mean?: number
          projected_position_mean?: number
          projected_position_median?: number
          season_id?: number
          simulated_at?: string
          team_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_finishing_position_projection_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      team_match_tactics: {
        Row: {
          confidence: number | null
          fixture_id: number
          formation: string | null
          observed_at: string
          season_id: number
          source_name: string
          source_payload: Json | null
          team_id: number
          team_match_tactic_id: number
        }
        Insert: {
          confidence?: number | null
          fixture_id: number
          formation?: string | null
          observed_at?: string
          season_id: number
          source_name: string
          source_payload?: Json | null
          team_id: number
          team_match_tactic_id?: never
        }
        Update: {
          confidence?: number | null
          fixture_id?: number
          formation?: string | null
          observed_at?: string
          season_id?: number
          source_name?: string
          source_payload?: Json | null
          team_id?: number
          team_match_tactic_id?: never
        }
        Relationships: [
          {
            foreignKeyName: "team_match_tactics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_fallback"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_match_tactics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_match_tactics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_match_tactics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_match_tactics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_defensive_contribution_projection_leaguewide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_match_tactics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fallback_start_probability_v6"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_match_tactics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fixture_bps_projection_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_match_tactics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_prediction_actual_start_comparison"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_match_tactics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_data_health"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_match_tactics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_fixture_readiness"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_match_tactics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_allocation_v2"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_match_tactics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_final"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_match_tactics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_points"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_match_tactics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_secondary_scoring"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_match_tactics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_v4_leaguewide_inputs"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_match_tactics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_season_fixture_feed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_match_tactics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_adjustments_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_match_tactics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_exposure_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_match_tactics_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "team_match_tactics_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      team_player_tactical_defaults: {
        Row: {
          confidence: number
          depth_rank: number | null
          depth_rank_source: string | null
          fpl_player_id: number
          manual_status: string | null
          manual_status_note: string | null
          season_id: number
          source_name: string
          tactical_role: string
          team_id: number
          updated_at: string
        }
        Insert: {
          confidence?: number
          depth_rank?: number | null
          depth_rank_source?: string | null
          fpl_player_id: number
          manual_status?: string | null
          manual_status_note?: string | null
          season_id: number
          source_name?: string
          tactical_role: string
          team_id: number
          updated_at?: string
        }
        Update: {
          confidence?: number
          depth_rank?: number | null
          depth_rank_source?: string | null
          fpl_player_id?: number
          manual_status?: string | null
          manual_status_note?: string | null
          season_id?: number
          source_name?: string
          tactical_role?: string
          team_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      team_ratings: {
        Row: {
          attack_strength: number
          created_at: string
          defence_strength: number
          estimated_from_fit_run_id: number | null
          estimated_from_team_id: number | null
          estimation_note: string | null
          fit_run_id: number
          is_estimated: boolean
          team_id: number
          team_rating_id: number
        }
        Insert: {
          attack_strength: number
          created_at?: string
          defence_strength: number
          estimated_from_fit_run_id?: number | null
          estimated_from_team_id?: number | null
          estimation_note?: string | null
          fit_run_id: number
          is_estimated?: boolean
          team_id: number
          team_rating_id?: never
        }
        Update: {
          attack_strength?: number
          created_at?: string
          defence_strength?: number
          estimated_from_fit_run_id?: number | null
          estimated_from_team_id?: number | null
          estimation_note?: string | null
          fit_run_id?: number
          is_estimated?: boolean
          team_id?: number
          team_rating_id?: never
        }
        Relationships: [
          {
            foreignKeyName: "team_ratings_estimated_from_fit_run_id_fkey"
            columns: ["estimated_from_fit_run_id"]
            isOneToOne: false
            referencedRelation: "fpl_team_strength_current"
            referencedColumns: ["fit_run_id"]
          },
          {
            foreignKeyName: "team_ratings_estimated_from_fit_run_id_fkey"
            columns: ["estimated_from_fit_run_id"]
            isOneToOne: false
            referencedRelation: "league_fit_status"
            referencedColumns: ["accepted_fit_run_id"]
          },
          {
            foreignKeyName: "team_ratings_estimated_from_fit_run_id_fkey"
            columns: ["estimated_from_fit_run_id"]
            isOneToOne: false
            referencedRelation: "league_fit_status"
            referencedColumns: ["latest_attempted_fit_run_id"]
          },
          {
            foreignKeyName: "team_ratings_estimated_from_fit_run_id_fkey"
            columns: ["estimated_from_fit_run_id"]
            isOneToOne: false
            referencedRelation: "model_fit_runs"
            referencedColumns: ["fit_run_id"]
          },
          {
            foreignKeyName: "team_ratings_estimated_from_fit_run_id_fkey"
            columns: ["estimated_from_fit_run_id"]
            isOneToOne: false
            referencedRelation: "team_strength_current"
            referencedColumns: ["fit_run_id"]
          },
          {
            foreignKeyName: "team_ratings_estimated_from_team_id_fkey"
            columns: ["estimated_from_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "team_ratings_fit_run_id_fkey"
            columns: ["fit_run_id"]
            isOneToOne: false
            referencedRelation: "fpl_team_strength_current"
            referencedColumns: ["fit_run_id"]
          },
          {
            foreignKeyName: "team_ratings_fit_run_id_fkey"
            columns: ["fit_run_id"]
            isOneToOne: false
            referencedRelation: "league_fit_status"
            referencedColumns: ["accepted_fit_run_id"]
          },
          {
            foreignKeyName: "team_ratings_fit_run_id_fkey"
            columns: ["fit_run_id"]
            isOneToOne: false
            referencedRelation: "league_fit_status"
            referencedColumns: ["latest_attempted_fit_run_id"]
          },
          {
            foreignKeyName: "team_ratings_fit_run_id_fkey"
            columns: ["fit_run_id"]
            isOneToOne: false
            referencedRelation: "model_fit_runs"
            referencedColumns: ["fit_run_id"]
          },
          {
            foreignKeyName: "team_ratings_fit_run_id_fkey"
            columns: ["fit_run_id"]
            isOneToOne: false
            referencedRelation: "team_strength_current"
            referencedColumns: ["fit_run_id"]
          },
          {
            foreignKeyName: "team_ratings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      team_slug_history: {
        Row: {
          old_slug: string
          replaced_at: string
          team_id: number
          team_slug_history_id: number
        }
        Insert: {
          old_slug: string
          replaced_at?: string
          team_id: number
          team_slug_history_id?: never
        }
        Update: {
          old_slug?: string
          replaced_at?: string
          team_id?: number
          team_slug_history_id?: never
        }
        Relationships: [
          {
            foreignKeyName: "team_slug_history_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      team_strength_forward_adjustments: {
        Row: {
          attack_log_adjustment: number
          created_at: string
          decay_fixtures: number | null
          defence_log_adjustment: number
          effective_from: string
          effective_to: string | null
          id: number
          is_active: boolean
          reason: string | null
          scenario_key: string
          scope: string
          season_id: number
          source_name: string | null
          source_reference: string | null
          team_id: number
          updated_at: string
        }
        Insert: {
          attack_log_adjustment?: number
          created_at?: string
          decay_fixtures?: number | null
          defence_log_adjustment?: number
          effective_from: string
          effective_to?: string | null
          id?: never
          is_active?: boolean
          reason?: string | null
          scenario_key?: string
          scope?: string
          season_id: number
          source_name?: string | null
          source_reference?: string | null
          team_id: number
          updated_at?: string
        }
        Update: {
          attack_log_adjustment?: number
          created_at?: string
          decay_fixtures?: number | null
          defence_log_adjustment?: number
          effective_from?: string
          effective_to?: string | null
          id?: never
          is_active?: boolean
          reason?: string | null
          scenario_key?: string
          scope?: string
          season_id?: number
          source_name?: string | null
          source_reference?: string | null
          team_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      team_strength_manual_override: {
        Row: {
          attack_adjustment: number
          defence_adjustment: number
          note: string | null
          team_id: number
          updated_at: string
        }
        Insert: {
          attack_adjustment?: number
          defence_adjustment?: number
          note?: string | null
          team_id: number
          updated_at?: string
        }
        Update: {
          attack_adjustment?: number
          defence_adjustment?: number
          note?: string | null
          team_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_strength_manual_override_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      team_tactical_defaults: {
        Row: {
          confidence: number
          formation: string
          season_id: number
          source_name: string
          team_id: number
          team_tactical_default_id: number
          updated_at: string
        }
        Insert: {
          confidence: number
          formation: string
          season_id: number
          source_name: string
          team_id: number
          team_tactical_default_id?: never
          updated_at?: string
        }
        Update: {
          confidence?: number
          formation?: string
          season_id?: number
          source_name?: string
          team_id?: number
          team_tactical_default_id?: never
          updated_at?: string
        }
        Relationships: []
      }
      team_tactical_review_log: {
        Row: {
          reviewed_at: string
          season_id: number
          team_id: number
        }
        Insert: {
          reviewed_at?: string
          season_id: number
          team_id: number
        }
        Update: {
          reviewed_at?: string
          season_id?: number
          team_id?: number
        }
        Relationships: []
      }
      teams: {
        Row: {
          canonical_name: string
          country_id: number
          created_at: string
          display_name: string
          slug: string
          team_id: number
        }
        Insert: {
          canonical_name: string
          country_id: number
          created_at?: string
          display_name: string
          slug: string
          team_id?: never
        }
        Update: {
          canonical_name?: string
          country_id?: number
          created_at?: string
          display_name?: string
          slug?: string
          team_id?: never
        }
        Relationships: [
          {
            foreignKeyName: "teams_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["country_id"]
          },
        ]
      }
    }
    Views: {
      data_health: {
        Row: {
          component: string | null
          details: string | null
          health_status: string | null
          last_attempt_at: string | null
          last_success_at: string | null
          rows_changed: number | null
          rows_inserted: number | null
          rows_seen: number | null
          rows_unchanged: number | null
          run_status: string | null
          unmatched_rows: number | null
        }
        Relationships: []
      }
      finance_derived_metrics: {
        Row: {
          calculation_version: number | null
          definition: string | null
          metric_key: string | null
          period_end: string | null
          team_id: number | null
          value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      finance_published_periods: {
        Row: {
          average_employees: number | null
          borrowings: number | null
          cash: number | null
          company_number: string | null
          currency: string | null
          filing_date: string | null
          is_comparable: boolean | null
          is_consolidated: boolean | null
          is_latest: boolean | null
          net_assets: number | null
          operating_profit: number | null
          period_end: string | null
          period_months: number | null
          period_start: string | null
          player_amortisation: number | null
          player_impairment: number | null
          profit_after_tax: number | null
          profit_before_tax: number | null
          profit_on_player_disposals: number | null
          reporting_entity: string | null
          revenue_broadcast: number | null
          revenue_commercial: number | null
          revenue_matchday: number | null
          revenue_other: number | null
          revenue_total: number | null
          season_id: number | null
          source_url: string | null
          staff_costs: number | null
          team_id: number | null
          total_assets: number | null
          total_liabilities: number | null
          unit_scale: number | null
          validation_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_periods_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "finance_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      finance_published_provenance: {
        Row: {
          document_id: string | null
          filing_reference: string | null
          mapping_version: number | null
          metric_key: string | null
          original_unit: string | null
          original_value: string | null
          original_xbrl_concept: string | null
          period_end: string | null
          source_url: string | null
          team_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_metric_values_metric_key_fkey"
            columns: ["metric_key"]
            isOneToOne: false
            referencedRelation: "finance_metric_dictionary"
            referencedColumns: ["metric_key"]
          },
          {
            foreignKeyName: "finance_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fixture_player_expected_minutes: {
        Row: {
          availability_probability: number | null
          element_type: number | null
          expected_minutes: number | null
          expected_minutes_if_start: number | null
          expected_minutes_if_sub: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          hierarchy_score: number | null
          prob_starting_xi: number | null
          prob_sub_appearance: number | null
          source_consensus_probability: number | null
          squad_status: string | null
          tactical_role: string | null
          team_id: number | null
          web_name: string | null
        }
        Relationships: []
      }
      fixture_player_expected_minutes_fallback: {
        Row: {
          availability: number | null
          element_type: number | null
          expected_minutes: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          minutes_source: string | null
          prob_starting_xi: number | null
          prob_sub_appearance: number | null
          tactical_role: string | null
          team_id: number | null
          web_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fixture_player_expected_minutes_resolved: {
        Row: {
          availability_probability: number | null
          element_type: number | null
          expected_minutes: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          minutes_source: string | null
          prob_starting_xi: number | null
          prob_sub_appearance: number | null
          tactical_role: string | null
          team_id: number | null
          web_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fixture_player_expected_minutes_resolved_v3: {
        Row: {
          availability_probability: number | null
          element_type: number | null
          expected_minutes: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          minutes_source: string | null
          prob_starting_xi: number | null
          prob_sub_appearance: number | null
          tactical_role: string | null
          team_id: number | null
          web_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fixture_player_expected_minutes_v2: {
        Row: {
          availability_probability: number | null
          element_type: number | null
          expected_minutes: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          hierarchy_score: number | null
          hist_sub_mins: number | null
          hist_subs: number | null
          mins_if_start: number | null
          mins_if_sub: number | null
          prob_starting_xi: number | null
          prob_sub_appearance: number | null
          source_consensus_probability: number | null
          squad_status: string | null
          tactical_role: string | null
          team_id: number | null
          web_name: string | null
        }
        Relationships: []
      }
      fixture_player_expected_minutes_v3: {
        Row: {
          availability_probability: number | null
          element_type: number | null
          expected_minutes: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          hierarchy_score: number | null
          hist_sub_mins: number | null
          hist_subs: number | null
          mins_if_start: number | null
          mins_if_sub: number | null
          prob_starting_xi: number | null
          prob_sub_appearance: number | null
          source_consensus_probability: number | null
          squad_status: string | null
          tactical_role: string | null
          team_id: number | null
          web_name: string | null
        }
        Relationships: []
      }
      fixture_player_lineup_consensus: {
        Row: {
          availability_probability: number | null
          available_weight: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          positive_sources: number | null
          positive_weight: number | null
          source_consensus_probability: number | null
          source_count: number | null
          tactical_role: string | null
          team_id: number | null
          web_name: string | null
        }
        Relationships: []
      }
      fixture_player_tactical_consensus: {
        Row: {
          fixture_id: number | null
          fpl_player_id: number | null
          role_weight: number | null
          sources: number | null
          tactical_role: string | null
          team_id: number | null
        }
        Relationships: []
      }
      fixture_team_tactical_consensus: {
        Row: {
          consensus_weight: number | null
          fixture_id: number | null
          formation: string | null
          sources: number | null
          team_id: number | null
        }
        Relationships: []
      }
      fpl_defensive_contribution_projection_leaguewide: {
        Row: {
          defensive_contribution_probability: number | null
          element_type: number | null
          expected_minutes: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          prob_starting_xi: number | null
          shrunk_events90: number | null
          team_id: number | null
          threshold: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fpl_fallback_start_probability_v6: {
        Row: {
          apps: number | null
          availability: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          probability_source: string | null
          start_probability: number | null
          starts: number | null
          subs: number | null
          team_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fpl_fixture_bps_projection_v1: {
        Row: {
          bps_rank: number | null
          clean_sheet_probability: number | null
          deterministic_bonus: number | null
          element_type: number | null
          expected_assists: number | null
          expected_bps_score: number | null
          expected_goals: number | null
          expected_minutes: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          team_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fpl_full_season_projection_health_v1: {
        Row: {
          fixtures: number | null
          full_player_coverage: boolean | null
          matchweek: number | null
          player_projection_rows: number | null
          projected_fixtures: number | null
          team_predictions: number | null
        }
        Relationships: []
      }
      fpl_optimizer_candidate_feed_v1: {
        Row: {
          expected_fpl_points: number | null
          expected_minutes: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          fpl_position: number | null
          generated_at: string | null
          lineup_confidence: number | null
          matchweek: number | null
          model_version: string | null
          now_cost: number | null
          price_m: number | null
          start_probability: number | null
          sub_appearance_probability: number | null
          team_id: number | null
          team_name: string | null
          web_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fpl_optimizer_candidate_feed_v2: {
        Row: {
          expected_fpl_points: number | null
          expected_minutes: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          fpl_position: number | null
          generated_at: string | null
          is_home: boolean | null
          lineup_confidence: number | null
          matchweek: number | null
          model_version: string | null
          now_cost: number | null
          opponent_team_name: string | null
          price_m: number | null
          start_probability: number | null
          sub_appearance_probability: number | null
          team_id: number | null
          team_name: string | null
          web_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fpl_player_defensive_contribution_usage: {
        Row: {
          appearances: number | null
          cbi: number | null
          element_type: number | null
          fpl_player_id: number | null
          minutes: number | null
          recoveries: number | null
          season_id: number | null
          tackles: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_players_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      fpl_player_squad_state_current: {
        Row: {
          availability_probability: number | null
          effective_from: string | null
          effective_to: string | null
          evidence: string | null
          fpl_player_id: number | null
          season_id: number | null
          source_name: string | null
          source_reference: string | null
          start_probability_override: number | null
          state: string | null
          team_id: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      fpl_player_substitution_usage: {
        Row: {
          appearances: number | null
          avg_sub_minutes: number | null
          fpl_player_id: number | null
          likely_starts: number | null
          season_id: number | null
          sub_appearances: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_players_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      fpl_prediction_actual_start_comparison: {
        Row: {
          actual_minutes: number | null
          actual_started: boolean | null
          fixture_id: number | null
          fpl_player_id: number | null
          generated_at: string | null
          generated_pre_kickoff: boolean | null
          kickoff_date: string | null
          kickoff_time: string | null
          matchweek: number | null
          model_version: string | null
          player_name_source: string | null
          predicted_minutes: number | null
          predicted_start_probability: number | null
          team_id: number | null
          web_name: string | null
        }
        Relationships: []
      }
      fpl_projection_data_health: {
        Row: {
          fixture_id: number | null
          kickoff_date: string | null
          lineup_player_rows: number | null
          lineup_sources: number | null
          projection_rows: number | null
          projection_status: string | null
          team_forecast_ready: boolean | null
        }
        Relationships: []
      }
      fpl_projection_fixture_readiness: {
        Row: {
          away_team_id: number | null
          fixture_id: number | null
          has_team_xg: boolean | null
          home_team_id: number | null
          kickoff_date: string | null
          lineup_player_rows: number | null
          lineup_sources: number | null
          predicted_away_goals: number | null
          predicted_home_goals: number | null
          projection_rows: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fpl_projection_frontend_feed: {
        Row: {
          clean_sheet_probability: number | null
          defensive_contribution_probability: number | null
          expected_assists: number | null
          expected_bonus: number | null
          expected_fpl_points: number | null
          expected_goals: number | null
          expected_minutes: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          fpl_position: number | null
          generated_at: string | null
          kickoff_date: string | null
          lineup_confidence: number | null
          minutes_source: string | null
          model_version: string | null
          start_probability: number | null
          sub_appearance_probability: number | null
          tactical_role: string | null
          team_id: number | null
          web_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fpl_projection_frontend_feed_v6: {
        Row: {
          clean_sheet_probability: number | null
          defensive_contribution_probability: number | null
          expected_assists: number | null
          expected_bonus: number | null
          expected_fpl_points: number | null
          expected_goals: number | null
          expected_minutes: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          fpl_position: number | null
          generated_at: string | null
          kickoff_date: string | null
          lineup_confidence: number | null
          minutes_source: string | null
          model_version: string | null
          start_probability: number | null
          sub_appearance_probability: number | null
          tactical_role: string | null
          team_id: number | null
          web_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fpl_projection_leaguewide_allocation_v2: {
        Row: {
          availability_probability: number | null
          direct_fk_exposure: number | null
          element_type: number | null
          expected_assists: number | null
          expected_goals: number | null
          expected_minutes: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          penalty_exposure: number | null
          prob_starting_xi: number | null
          prob_sub_appearance: number | null
          real_tactical_role: string | null
          shrunk_xa90: number | null
          shrunk_xg90: number | null
          team_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fpl_projection_leaguewide_final: {
        Row: {
          clean_sheet_probability: number | null
          defensive_contribution_probability: number | null
          element_type: number | null
          expected_assists: number | null
          expected_bonus: number | null
          expected_fpl_points: number | null
          expected_goals: number | null
          expected_minutes: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          prob_starting_xi: number | null
          prob_sub_appearance: number | null
          real_tactical_role: string | null
          team_id: number | null
          web_name: string | null
          xpts_appearance: number | null
          xpts_assists: number | null
          xpts_bonus: number | null
          xpts_cards_own_goals: number | null
          xpts_clean_sheet: number | null
          xpts_defensive_contribution: number | null
          xpts_goals: number | null
          xpts_goals_conceded: number | null
          xpts_penalties: number | null
          xpts_saves: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fpl_projection_leaguewide_points: {
        Row: {
          clean_sheet_probability: number | null
          defensive_contribution_probability: number | null
          element_type: number | null
          expected_assists: number | null
          expected_bonus: number | null
          expected_goals: number | null
          expected_minutes: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          prob_starting_xi: number | null
          prob_sub_appearance: number | null
          real_tactical_role: string | null
          team_id: number | null
          web_name: string | null
          xpts_appearance: number | null
          xpts_assists: number | null
          xpts_bonus: number | null
          xpts_clean_sheet: number | null
          xpts_defensive_contribution: number | null
          xpts_goals: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fpl_projection_secondary_scoring: {
        Row: {
          fixture_id: number | null
          fpl_player_id: number | null
          team_id: number | null
          xpts_cards_own_goals: number | null
          xpts_goals_conceded: number | null
          xpts_penalties: number | null
          xpts_saves: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fpl_projection_v4_leaguewide_inputs: {
        Row: {
          availability_probability: number | null
          element_type: number | null
          expected_minutes: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          prob_starting_xi: number | null
          prob_sub_appearance: number | null
          raw_xa90: number | null
          raw_xg90: number | null
          real_tactical_role: string | null
          season_minutes: number | null
          team_id: number | null
          web_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fpl_season_fixture_feed: {
        Row: {
          away_team: string | null
          away_team_id: number | null
          fixture_id: number | null
          has_projection: boolean | null
          home_team: string | null
          home_team_id: number | null
          kickoff_date: string | null
          kickoff_time: string | null
          matchweek: number | null
          predicted_at: string | null
          predicted_away_goals: number | null
          predicted_home_goals: number | null
          round: string | null
          round_number: number | null
          season_id: number | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "fixtures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      fpl_season_player_projection_feed: {
        Row: {
          clean_sheet_probability: number | null
          defensive_contribution_probability: number | null
          expected_assists: number | null
          expected_goals: number | null
          expected_minutes: number | null
          experimental_expected_bonus: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          fpl_position: number | null
          kickoff_date: string | null
          matchweek: number | null
          shrunk_xa90: number | null
          shrunk_xg90: number | null
          start_probability: number | null
          sub_appearance_probability: number | null
          tactical_role: string | null
          team_id: number | null
          web_name: string | null
        }
        Relationships: []
      }
      fpl_set_piece_fixture_adjustments_v1: {
        Row: {
          creation_exposure: number | null
          direct_fk_exposure: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          penalty_exposure: number | null
          team_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fpl_set_piece_fixture_exposure_v1: {
        Row: {
          expected_minutes: number | null
          fixture_id: number | null
          fpl_player_id: number | null
          prob_starting_xi: number | null
          rank: number | null
          set_piece_type: string | null
          team_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fpl_team_strength_current: {
        Row: {
          attack_rank: number | null
          attack_score: number | null
          attack_strength: number | null
          canonical_name: string | null
          decay_half_life_days: number | null
          defence_rank: number | null
          defence_score: number | null
          defence_strength: number | null
          fit_run_id: number | null
          fitted_at: string | null
          fpl_short_name: string | null
          fpl_team_id: number | null
          fpl_team_name: string | null
          home_advantage: number | null
          is_estimated: boolean | null
          league_id: number | null
          matches_used: number | null
          overall_score: number | null
          rho: number | null
          team_id: number | null
          window_end_date: string | null
          window_start_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_fit_runs_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "league_fit_status"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "model_fit_runs_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "team_ratings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      league_fit_status: {
        Row: {
          accepted_fit_run_id: number | null
          accepted_fitted_at: string | null
          accepted_home_advantage: number | null
          accepted_matches_used: number | null
          accepted_rho: number | null
          latest_attempted_converged: boolean | null
          latest_attempted_fit_run_id: number | null
          latest_attempted_fitted_at: string | null
          latest_attempted_matches_used: number | null
          latest_attempted_rejection_reason: string | null
          latest_attempted_status: string | null
          latest_attempted_validation_warnings: Json | null
          league_code: string | null
          league_id: number | null
          league_name: string | null
        }
        Relationships: []
      }
      tactical_formation_slot_priors: {
        Row: {
          assist_share: number | null
          assists: number | null
          assists_per90: number | null
          big_chances: number | null
          big_chances_per90: number | null
          canonical_formation: string | null
          competition_name: string | null
          goal_share: number | null
          goals: number | null
          goals_per90: number | null
          key_passes: number | null
          key_passes_per90: number | null
          mapping_confidence: number | null
          minutes: number | null
          open_play_goal_share: number | null
          open_play_goals: number | null
          open_play_goals_per90: number | null
          opp_box_touches: number | null
          opp_box_touches_per90: number | null
          set_piece_assists: number | null
          shots: number | null
          shots_on_target: number | null
          shots_on_target_per90: number | null
          shots_per90: number | null
          source_formation_code: string | null
          source_formation_slot: string | null
          source_name: string | null
          source_season_label: string | null
          starts: number | null
          tactical_source_id: number | null
          venue_scope: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tactical_formation_slot_aggregates_tactical_source_id_fkey"
            columns: ["tactical_source_id"]
            isOneToOne: false
            referencedRelation: "tactical_data_sources"
            referencedColumns: ["tactical_source_id"]
          },
        ]
      }
      team_home_away_adjustment_experimental_v1: {
        Row: {
          as_of_date: string | null
          away_attack_dev: number | null
          away_defence_dev: number | null
          away_ga: number | null
          away_gf: number | null
          away_matches: number | null
          away_weight: number | null
          half_life_days: number | null
          home_attack_dev: number | null
          home_defence_dev: number | null
          home_ga: number | null
          home_gf: number | null
          home_matches: number | null
          home_weight: number | null
          overall_ga: number | null
          overall_gf: number | null
          shrink_matches: number | null
          team_id: number | null
          team_name: string | null
        }
        Relationships: []
      }
      meta_flow_summary: {
        Row: {
          commentary: string | null
          definition_changes: number | null
          feeds_from: number | null
          feeds_into: number | null
          first_seen: string | null
          is_present: boolean | null
          kind: string | null
          last_definition_change: string | null
          last_seen: string | null
          layer: string | null
          node_key: string | null
          obj_name: string | null
          purpose: string | null
          reads_from: string | null
          refresh_note: string | null
          row_estimate: number | null
        }
        Relationships: []
      }
      team_home_away_adjustment_v1: {
        Row: {
          as_of_date: string | null
          away_attack_dev: number | null
          away_defence_dev: number | null
          away_ga: number | null
          away_gf: number | null
          away_matches: number | null
          away_weight: number | null
          centered_away_attack_dev: number | null
          centered_away_defence_dev: number | null
          centered_home_attack_dev: number | null
          centered_home_defence_dev: number | null
          half_life_days: number | null
          home_attack_dev: number | null
          home_defence_dev: number | null
          home_ga: number | null
          home_gf: number | null
          home_matches: number | null
          home_weight: number | null
          overall_ga: number | null
          overall_gf: number | null
          shrink_matches: number | null
          team_id: number | null
          team_name: string | null
        }
        Relationships: []
      }
      team_strength_current: {
        Row: {
          attack_rank: number | null
          attack_score: number | null
          attack_strength: number | null
          canonical_name: string | null
          decay_half_life_days: number | null
          defence_rank: number | null
          defence_score: number | null
          defence_strength: number | null
          fit_run_id: number | null
          fitted_at: string | null
          fpl_short_name: string | null
          fpl_team_id: number | null
          fpl_team_name: string | null
          home_advantage: number | null
          is_estimated: boolean | null
          league_id: number | null
          matches_used: number | null
          overall_score: number | null
          rho: number | null
          team_id: number | null
          window_end_date: string | null
          window_start_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_fit_runs_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "league_fit_status"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "model_fit_runs_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "team_ratings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
    }
    Functions: {
      backfill_fixture_predictions: { Args: never; Returns: number }
      backfill_historic_fixture_predictions: {
        Args: { target_season_id: number }
        Returns: number
      }
      backfill_match_odds: { Args: never; Returns: number }
      check_auth_user_token_nulls: {
        Args: never
        Returns: {
          bad_rows: number
        }[]
      }
      check_fpl_history_integrity: {
        Args: { p_season_id: number }
        Returns: {
          assists_mismatch: number
          goals_mismatch: number
          minutes_mismatch: number
          players_checked: number
          points_mismatch: number
          worst_points_gap: number
        }[]
      }
      fixture_derived_markets: {
        Args: { p_lambda_away: number; p_lambda_home: number; p_rho: number }
        Returns: {
          away_clean_sheet: number
          away_win: number
          btts: number
          draw: number
          home_clean_sheet: number
          home_win: number
          over_2_5: number
          under_2_5: number
        }[]
      }
      fpl_gameweek_for_date: {
        Args: { p_date: string; p_season_id: number }
        Returns: number
      }
      get_actual_value_table: {
        Args: { p_season_id?: number }
        Returns: {
          assists: number
          bonus: number
          clean_sheets: number
          fpl_player_id: number
          goals: number
          minutes: number
          ownership: number
          points_per_million: number
          position_label: string
          price: number
          slug: string
          team_name: string
          total_points: number
          web_name: string
        }[]
      }
      get_all_time_top_scorers: {
        Args: never
        Returns: {
          display_name: string
          goals: number
        }[]
      }
      get_best_defence_rating: {
        Args: { p_league_id: number }
        Returns: {
          canonical_name: string
          goals_against_per_game: number
        }[]
      }
      get_biggest_comebacks: {
        Args: never
        Returns: {
          away: string
          deficit: number
          ft_away: number
          ft_home: number
          home: string
          ht_away: number
          ht_home: number
          league_code: string
          match_date: string
        }[]
      }
      get_completed_gameweeks: {
        Args: { p_season_id?: number }
        Returns: {
          best_score: number
          fpl_event_id: number
          players: number
          total_points: number
        }[]
      }
      get_cross_league_summary: {
        Args: never
        Returns: {
          away_goals_per_game: number
          away_win_pct: number
          both_scored_pct: number
          comeback_pct: number
          draw_pct: number
          goals_per_game: number
          home_goals_per_game: number
          home_win_pct: number
          league_code: string
          league_name: string
          matches: number
          nil_nil_pct: number
          over_two_five_pct: number
          reds_per_game: number
          season_label: string
          yellows_per_game: number
        }[]
      }
      get_daily_digest: {
        Args: { p_season_id?: number }
        Returns: {
          change_type: string
          detail: string
          fpl_player_id: number
          from_date: string
          new_value: string
          old_value: string
          ownership: number
          position_label: string
          slug: string
          team_name: string
          to_date: string
          web_name: string
        }[]
      }
      get_data_integrity_report: {
        Args: never
        Returns: {
          check_name: string
          detail: string
          status: string
        }[]
      }
      get_digest_gameweeks: {
        Args: { p_season_id?: number }
        Returns: {
          days: number
          first_date: string
          gameweek: number
          last_date: string
        }[]
      }
      get_fpl_default_matchweek: {
        Args: { p_league_id: number; p_season_id: number }
        Returns: number
      }
      get_fpl_fixture_bonus_v4: {
        Args: { p_fixture_id: number }
        Returns: {
          expected_bonus_points: number
          fpl_player_id: number
        }[]
      }
      get_fpl_market_movers: {
        Args: { p_days?: number }
        Returns: {
          fpl_player_id: number
          from_date: string
          news: string
          ownership_change: number
          ownership_now: number
          position_label: string
          price_change: number
          price_now: number
          slug: string
          status: string
          team_name: string
          to_date: string
          transfers_in_event: number
          transfers_out_event: number
          web_name: string
        }[]
      }
      get_fpl_optimizer_candidates: {
        Args: { p_from_matchweek: number; p_to_matchweek: number }
        Returns: {
          expected_fpl_points: number
          expected_minutes: number
          fpl_player_id: number
          fpl_position: number
          matchweek: number
          price_m: number
          start_probability: number
          sub_appearance_probability: number
          team_id: number
          team_name: string
          web_name: string
        }[]
      }
      get_fpl_optimizer_candidates_json: {
        Args: { p_from_matchweek: number; p_to_matchweek: number }
        Returns: Json
      }
      get_fpl_optimizer_candidates_scenario_json: {
        Args: {
          p_from_matchweek: number
          p_league_id: number
          p_model_version: string
          p_scenario_key: string
          p_season_id: number
          p_to_matchweek: number
        }
        Returns: Json
      }
      get_fpl_optimizer_earliest_matchweek: { Args: never; Returns: number }
      get_fpl_played_matchweeks: {
        Args: { p_league_id: number; p_season_id: number }
        Returns: number[]
      }
      get_fpl_projection_available_matchweeks: {
        Args: {
          p_league_id: number
          p_model_version: string
          p_scenario_key: string
          p_season_id: number
        }
        Returns: number[]
      }
      get_fpl_projection_snapshot: {
        Args: {
          p_from_matchweek: number
          p_league_id: number
          p_model_version: string
          p_scenario_key: string
          p_season_id: number
          p_to_matchweek: number
        }
        Returns: {
          matchweeks_covered: number
          max_generated_at: string
          row_count: number
        }[]
      }
      get_gameweek_digest: {
        Args: { p_gameweek?: number; p_season_id?: number }
        Returns: {
          change_type: string
          detail: string
          event_date: string
          fpl_player_id: number
          gameweek: number
          new_value: string
          old_value: string
          ownership: number
          position_label: string
          slug: string
          team_name: string
          web_name: string
        }[]
      }
      get_injury_report: {
        Args: { p_season_id?: number }
        Returns: {
          chance_next_round: number
          fixtures_missed: number
          fpl_player_id: number
          news: string
          next_fixture_date: string
          ownership: number
          position_label: string
          price: number
          return_date: string
          slug: string
          status: string
          team_id: number
          team_name: string
          total_points: number
          web_name: string
        }[]
      }
      get_market_efficiency: {
        Args: { p_bookmaker?: string; p_closing?: boolean }
        Returns: {
          league_code: string
          league_name: string
          market: string
          matches: number
          overround: number
          roi_away: number
          roi_draw: number
          roi_favourite: number
          roi_home: number
          roi_outsider: number
        }[]
      }
      get_matchweek_head_to_head: {
        Args: { p_league_id: number; p_matchweek?: number; p_season_id: number }
        Returns: {
          away_wins: number
          draws: number
          fixture_id: number
          home_wins: number
          last_away_goals: number
          last_home_goals: number
          last_home_was_fixture_home: boolean
          last_meeting_date: string
          meetings: number
        }[]
      }
      get_model_accuracy: {
        Args: { p_league_id?: number }
        Returns: {
          actual: string
          away_team: string
          brier: number
          correct: boolean
          fixture_id: number
          home_team: string
          kickoff_date: string
          league_code: string
          p_actual: number
          p_away: number
          p_draw: number
          p_home: number
          picked: string
        }[]
      }
      get_model_accuracy_summary: {
        Args: { p_league_id?: number }
        Returns: {
          always_home_hit_rate: number
          correct: number
          fixtures: number
          hit_rate: number
          mean_p_actual: number
          model_brier: number
          uniform_brier: number
        }[]
      }
      get_model_calibration: {
        Args: { p_league_id?: number }
        Returns: {
          actual_rate: number
          band: string
          forecasts: number
          gap: number
          mean_predicted: number
        }[]
      }
      get_most_common_scoreline: {
        Args: { p_league_id: number }
        Returns: {
          away_goals: number
          home_goals: number
          occurrences: number
          total_matches: number
        }[]
      }
      get_overround_trend: {
        Args: { p_bookmaker?: string }
        Returns: {
          league_code: string
          matches: number
          overround: number
          season_label: string
        }[]
      }
      get_player_by_slug: {
        Args: { p_slug: string }
        Returns: {
          canonical_name: string
          career_minutes: number
          career_points: number
          current_assists: number
          current_bonus: number
          current_fpl_player_id: number
          current_goals: number
          current_minutes: number
          current_now_cost: number
          current_slug: string
          current_total_points: number
          element_type: number
          first_season: string
          fpl_code: number
          last_season: string
          latest_team: string
          latest_web_name: string
          seasons_played: number
          slug: string
        }[]
      }
      get_player_career: {
        Args: { p_fpl_code: number }
        Returns: {
          assists: number
          bonus: number
          clean_sheets: number
          element_type: number
          end_cost: number
          goals_scored: number
          minutes: number
          points_early: number
          points_late: number
          points_mid: number
          points_per_start_million: number
          season_id: number
          season_slug: string
          start_cost: number
          team_name: string
          total_points: number
          web_name: string
        }[]
      }
      get_player_gameweek_breakdown: {
        Args: { p_fpl_player_id: number; p_season_id?: number }
        Returns: {
          assists: number
          bonus: number
          bps: number
          clean_sheets: number
          defensive_contribution: number
          gameweek: number
          goals_conceded: number
          goals_scored: number
          kickoff_date: string
          minutes: number
          opponent: string
          own_goals: number
          penalties_missed: number
          penalties_saved: number
          projected_points: number
          red_cards: number
          saves: number
          total_points: number
          was_home: boolean
          yellow_cards: number
        }[]
      }
      get_player_season_gameweeks: {
        Args: { p_fpl_code: number; p_season_id: number }
        Returns: {
          assists: number
          bonus: number
          clean_sheets: number
          defensive_contribution: number
          gameweek: number
          goals_conceded: number
          goals_scored: number
          minutes: number
          opponent: string
          own_goals: number
          penalties_missed: number
          penalties_saved: number
          price: number
          red_cards: number
          saves: number
          total_points: number
          was_home: boolean
          yellow_cards: number
        }[]
      }
      get_player_seasons: {
        Args: { p_fpl_code: number }
        Returns: {
          is_current: boolean
          season_id: number
          season_slug: string
          total_points: number
        }[]
      }
      get_price_change_risk: {
        Args: { p_season_id?: number }
        Returns: {
          direction: string
          fpl_player_id: number
          net_transfers: number
          ownership: number
          position_label: string
          pressure: number
          price: number
          slug: string
          team_name: string
          transfers_in: number
          transfers_out: number
          web_name: string
        }[]
      }
      get_public_read_audit: {
        Args: never
        Returns: {
          anon_can_read: boolean
          anon_has_select_grant: boolean
          has_select_policy: boolean
          object_kind: string
          object_name: string
          rls_enabled: boolean
        }[]
      }
      get_rolling_xi_candidates: {
        Args: { p_season_id?: number }
        Returns: {
          august_cost: number
          element_type: number
          fpl_code: number
          minutes: number
          now_cost: number
          team_name: string
          total_points: number
          web_name: string
        }[]
      }
      get_scout_vs_model: {
        Args: never
        Returns: {
          model_better: number
          model_mae: number
          scored_fixtures: number
          scout_better: number
          scout_mae: number
          ties: number
        }[]
      }
      get_season_player_projections_json: {
        Args: { p_matchweek: number }
        Returns: Json
      }
      get_set_piece_index: {
        Args: { p_season_id?: number }
        Returns: {
          detail: string
          duties: number
          index_score: number
          player_name: string
          team_id: number
          team_name: string
        }[]
      }
      get_set_piece_takers: {
        Args: { p_season_id?: number }
        Returns: {
          confidence: number
          player_name: string
          rank: number
          set_piece_type: string
          source_name: string
          team_id: number
          team_name: string
          team_slug: string
          updated_at: string
        }[]
      }
      get_strictest_referees: {
        Args: never
        Returns: {
          matches: number
          red_cards: number
          referee: string
        }[]
      }
      get_tactical_role_worklist: {
        Args: { p_season_id?: number }
        Returns: {
          assigned_role: string
          confidence: number
          fpl_player_id: number
          minutes: number
          ownership: number
          position_label: string
          priority: string
          slug: string
          team_id: number
          team_name: string
          total_points: number
          web_name: string
        }[]
      }
      get_team_of_the_week: {
        Args: { p_event_id?: number; p_season_id?: number }
        Returns: {
          assists: number
          bonus: number
          clean_sheets: number
          fpl_event_id: number
          fpl_player_id: number
          goals: number
          is_mandatory: boolean
          minutes: number
          points: number
          position_label: string
          slug: string
          team_name: string
          web_name: string
        }[]
      }
      get_top_actual_fpl_scorer: {
        Args: { p_season_id: number }
        Returns: {
          total_points: number
          web_name: string
        }[]
      }
      get_totw_vs_model: {
        Args: { p_event_id?: number; p_season_id?: number }
        Returns: {
          actual_xi_points: number
          fpl_event_id: number
          model_xi_actual_points: number
          model_xi_projected: number
          overlap_count: number
          overlap_names: string[]
        }[]
      }
      import_fpl_gameweeks: {
        Args: { p_folder: string; p_season_id: number }
        Returns: Json
      }
      import_fpl_season: {
        Args: { p_folder: string; p_season_id: number }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      get_xi_weekly_by_codes: {
        Args: { p_season_id: number; p_codes: number[] }
        Returns: { gameweek: number; total_points: number; players_returning: number; blanks: number }[]
      }
      get_model_xi_players: {
        Args: { p_event_id: number; p_season_id?: number }
        Returns: {
          fpl_player_id: number
          web_name: string
          team_name: string
          position_label: string
          element_type: number
          projected_points: number
          actual_points: number
          minutes: number
          in_perfect_xi: boolean
        }[]
      }
      get_model_xi_history: {
        Args: { p_season_id?: number; p_league_id?: number }
        Returns: {
          fpl_event_id: number
          actual_xi_points: number
          model_xi_actual_points: number
          model_xi_projected: number
          overlap_count: number
          players_projected: number
          generated_before_deadline: boolean
          deadline_time: string
        }[]
      }
      meta_refresh_flow: {
        Args: never
        Returns: { nodes: number; edges: number; changes: number }[]
      }
      list_scout_players: {
        Args: {
          p_limit?: number
          p_min_minutes?: number
          p_position?: number
          p_search?: string
          p_season_id?: number
          p_team_id?: number
        }
        Returns: {
          assists: number
          bonus: number
          clean_sheets: number
          element_type: number
          fpl_code: number
          fpl_player_id: number
          full_name: string
          goals_scored: number
          minutes: number
          now_cost: number
          points_per_million: number
          price_direction: string
          price_pressure: number
          seasons_played: number
          selected_by_percent: number
          slug: string
          team_id: number
          team_name: string
          total_points: number
          web_name: string
        }[]
      }
      list_scout_teams: {
        Args: { p_season_id?: number }
        Returns: {
          players: number
          team_id: number
          team_name: string
        }[]
      }
      list_scoutable_players: {
        Args: never
        Returns: {
          canonical_name: string
          career_points: number
          seasons_played: number
          slug: string
        }[]
      }
      refresh_fixture_feeds: { Args: never; Returns: undefined }
      refresh_fpl: { Args: never; Returns: Json }
      refresh_fpl_bonus_v3_for_fixture: {
        Args: { p_fixture_id: number }
        Returns: number
      }
      refresh_fpl_projection_fixture_v6: {
        Args: { p_allow_played?: boolean; p_fixture_id: number }
        Returns: number
      }
      refresh_fpl_projection_fixture_v6_impl: {
        Args: { p_fixture_id: number }
        Returns: number
      }
      refresh_fpl_projections_range: {
        Args: {
          p_from_matchweek: number
          p_league_id?: number
          p_season_id?: number
          p_to_matchweek: number
        }
        Returns: number
      }
      safe_numeric: { Args: { p_text: string }; Returns: number }
      search_players: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          canonical_name: string
          career_points: number
          current_slug: string
          element_type: number
          first_season: string
          fpl_code: number
          last_season: string
          latest_team: string
          latest_web_name: string
          seasons_played: number
          slug: string
        }[]
      }
      slugify: { Args: { input: string }; Returns: string }
      slugify_player_name: { Args: { p_name: string }; Returns: string }
      unaccent: { Args: { "": string }; Returns: string }
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
