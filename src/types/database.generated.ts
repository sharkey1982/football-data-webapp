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
      affiliate_partners: {
        Row: {
          active: boolean
          affiliate_url_template: string | null
          canonical_domain: string
          category: string
          created_at: string
          last_verified: string | null
          market: string
          name: string
          network: string | null
          notes: string | null
          partner_id: number
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          active?: boolean
          affiliate_url_template?: string | null
          canonical_domain: string
          category: string
          created_at?: string
          last_verified?: string | null
          market?: string
          name: string
          network?: string | null
          notes?: string | null
          partner_id?: number
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          active?: boolean
          affiliate_url_template?: string | null
          canonical_domain?: string
          category?: string
          created_at?: string
          last_verified?: string | null
          market?: string
          name?: string
          network?: string | null
          notes?: string | null
          partner_id?: number
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      ai_auto_grades: {
        Row: {
          checks: Json
          created_at: string
          grader: string
          passed: number
          run_id: number
          total: number
        }
        Insert: {
          checks: Json
          created_at?: string
          grader: string
          passed: number
          run_id: number
          total: number
        }
        Update: {
          checks?: Json
          created_at?: string
          grader?: string
          passed?: number
          run_id?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_auto_grades_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      ai_batch_items: {
        Row: {
          attempts: number
          batch_id: number
          question_id: string
          run_id: number | null
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          batch_id: number
          question_id: string
          run_id?: number | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          batch_id?: number
          question_id?: string
          run_id?: number | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "ai_batches"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "ai_batch_items_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "ai_benchmark_questions"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "ai_batch_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      ai_batches: {
        Row: {
          as_of: string
          batch_id: number
          created_by: string | null
          finished_at: string | null
          model: string
          name: string
          notes: string | null
          prompt_id: string
          provider: string
          question_ids: string[]
          status: string
          toolset_version: string
        }
        Insert: {
          as_of?: string
          batch_id?: number
          created_by?: string | null
          finished_at?: string | null
          model: string
          name: string
          notes?: string | null
          prompt_id: string
          provider: string
          question_ids?: string[]
          status?: string
          toolset_version: string
        }
        Update: {
          as_of?: string
          batch_id?: number
          created_by?: string | null
          finished_at?: string | null
          model?: string
          name?: string
          notes?: string | null
          prompt_id?: string
          provider?: string
          question_ids?: string[]
          status?: string
          toolset_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_batches_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "ai_prompt_versions"
            referencedColumns: ["prompt_id"]
          },
        ]
      }
      ai_benchmark_questions: {
        Row: {
          answerability_note: string | null
          answerable_now: boolean
          category: string
          created_at: string
          difficulty: number
          expected_behaviour: string
          expected_entities: string[]
          expected_objects: string[]
          experiments: string[]
          ground_truth_sql: string | null
          is_active: boolean
          must_include: string[]
          must_not_claim: string[]
          notes: string | null
          question: string
          question_id: string
          updated_at: string
          version: number
          volatility: string
        }
        Insert: {
          answerability_note?: string | null
          answerable_now?: boolean
          category: string
          created_at?: string
          difficulty: number
          expected_behaviour: string
          expected_entities?: string[]
          expected_objects?: string[]
          experiments?: string[]
          ground_truth_sql?: string | null
          is_active?: boolean
          must_include?: string[]
          must_not_claim?: string[]
          notes?: string | null
          question: string
          question_id: string
          updated_at?: string
          version?: number
          volatility?: string
        }
        Update: {
          answerability_note?: string | null
          answerable_now?: boolean
          category?: string
          created_at?: string
          difficulty?: number
          expected_behaviour?: string
          expected_entities?: string[]
          expected_objects?: string[]
          experiments?: string[]
          ground_truth_sql?: string | null
          is_active?: boolean
          must_include?: string[]
          must_not_claim?: string[]
          notes?: string | null
          question?: string
          question_id?: string
          updated_at?: string
          version?: number
          volatility?: string
        }
        Relationships: []
      }
      ai_credit_checks: {
        Row: {
          balance_usd: number
          check_id: number
          checked_at: string
          created_by: string | null
          note: string | null
        }
        Insert: {
          balance_usd: number
          check_id?: number
          checked_at?: string
          created_by?: string | null
          note?: string | null
        }
        Update: {
          balance_usd?: number
          check_id?: number
          checked_at?: string
          created_by?: string | null
          note?: string | null
        }
        Relationships: []
      }
      ai_external_spend: {
        Row: {
          cost_usd: number
          note: string | null
          ref: string
          source: string
          spent_at: string
        }
        Insert: {
          cost_usd: number
          note?: string | null
          ref: string
          source: string
          spent_at?: string
        }
        Update: {
          cost_usd?: number
          note?: string | null
          ref?: string
          source?: string
          spent_at?: string
        }
        Relationships: []
      }
      ai_human_reviews: {
        Row: {
          comment: string | null
          created_at: string
          factually_correct: string | null
          ideal_answer: string | null
          review_id: number
          reviewer_id: string
          run_id: number
          unsupported_claims: string | null
          usefulness: number | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          factually_correct?: string | null
          ideal_answer?: string | null
          review_id?: number
          reviewer_id?: string
          run_id: number
          unsupported_claims?: string | null
          usefulness?: number | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          factually_correct?: string | null
          ideal_answer?: string | null
          review_id?: number
          reviewer_id?: string
          run_id?: number
          unsupported_claims?: string | null
          usefulness?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_human_reviews_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      ai_lab_settings: {
        Row: {
          key: string
          note: string | null
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          note?: string | null
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          note?: string | null
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      ai_prompt_versions: {
        Row: {
          body: string
          created_at: string
          notes: string | null
          prompt_id: string
        }
        Insert: {
          body: string
          created_at?: string
          notes?: string | null
          prompt_id: string
        }
        Update: {
          body?: string
          created_at?: string
          notes?: string | null
          prompt_id?: string
        }
        Relationships: []
      }
      ai_run_steps: {
        Row: {
          arguments: Json | null
          error: string | null
          latency_ms: number | null
          result: Json | null
          run_id: number
          step_no: number
          tool_name: string
        }
        Insert: {
          arguments?: Json | null
          error?: string | null
          latency_ms?: number | null
          result?: Json | null
          run_id: number
          step_no: number
          tool_name: string
        }
        Update: {
          arguments?: Json | null
          error?: string | null
          latency_ms?: number | null
          result?: Json | null
          run_id?: number
          step_no?: number
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      ai_run_truth: {
        Row: {
          computed_at: string
          run_id: number
          truth: Json | null
        }
        Insert: {
          computed_at?: string
          run_id: number
          truth?: Json | null
        }
        Update: {
          computed_at?: string
          run_id?: number
          truth?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_run_truth_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "ai_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      ai_runs: {
        Row: {
          answer: string | null
          answer_type: string | null
          batch_id: number | null
          cache_read_tokens: number | null
          cache_write_tokens: number | null
          cost_usd: number | null
          created_at: string
          created_by: string | null
          error: string | null
          facts_used: Json | null
          input_tokens: number | null
          latency_ms: number | null
          model: string
          output_tokens: number | null
          prompt_id: string
          provider: string
          question: string
          question_id: string | null
          question_version: number | null
          rounds: number | null
          run_id: number
          stop_reason: string | null
          toolset_version: string
        }
        Insert: {
          answer?: string | null
          answer_type?: string | null
          batch_id?: number | null
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          cost_usd?: number | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          facts_used?: Json | null
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          output_tokens?: number | null
          prompt_id: string
          provider: string
          question: string
          question_id?: string | null
          question_version?: number | null
          rounds?: number | null
          run_id?: number
          stop_reason?: string | null
          toolset_version: string
        }
        Update: {
          answer?: string | null
          answer_type?: string | null
          batch_id?: number | null
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          cost_usd?: number | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          facts_used?: Json | null
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          output_tokens?: number | null
          prompt_id?: string
          provider?: string
          question?: string
          question_id?: string | null
          question_version?: number | null
          rounds?: number | null
          run_id?: number
          stop_reason?: string | null
          toolset_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "ai_batches"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "ai_runs_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "ai_prompt_versions"
            referencedColumns: ["prompt_id"]
          },
          {
            foreignKeyName: "ai_runs_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "ai_benchmark_questions"
            referencedColumns: ["question_id"]
          },
        ]
      }
      analysis_results: {
        Row: {
          analysis_id: string
          code_ref: string | null
          created_at: string
          result: Json
        }
        Insert: {
          analysis_id: string
          code_ref?: string | null
          created_at?: string
          result: Json
        }
        Update: {
          analysis_id?: string
          code_ref?: string | null
          created_at?: string
          result?: Json
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
      broadcast_competition_coverage: {
        Row: {
          label: string
          note: string
          status: string
        }
        Insert: {
          label: string
          note: string
          status?: string
        }
        Update: {
          label?: string
          note?: string
          status?: string
        }
        Relationships: []
      }
      broadcast_competition_map: {
        Row: {
          label: string
          league_code: string
        }
        Insert: {
          label: string
          league_code: string
        }
        Update: {
          label?: string
          league_code?: string
        }
        Relationships: []
      }
      broadcast_sync_runs: {
        Row: {
          inserted: number
          kept_stronger: number
          label: string | null
          notes: string | null
          ran_at: string
          records_seen: number
          removed: number
          run_id: number
          source: string
          unchanged: number
          unmatched: number
          updated: number
        }
        Insert: {
          inserted?: number
          kept_stronger?: number
          label?: string | null
          notes?: string | null
          ran_at?: string
          records_seen?: number
          removed?: number
          run_id?: never
          source?: string
          unchanged?: number
          unmatched?: number
          updated?: number
        }
        Update: {
          inserted?: number
          kept_stronger?: number
          label?: string | null
          notes?: string | null
          ran_at?: string
          records_seen?: number
          removed?: number
          run_id?: never
          source?: string
          unchanged?: number
          unmatched?: number
          updated?: number
        }
        Relationships: []
      }
      broadcast_sync_unmatched: {
        Row: {
          airtable_record_id: string
          away_raw: string | null
          competition_label: string | null
          first_seen_at: string
          home_raw: string | null
          kickoff_date: string | null
          last_seen_at: string
          match_label: string | null
          reason: string
          record: Json
          resolved_at: string | null
        }
        Insert: {
          airtable_record_id: string
          away_raw?: string | null
          competition_label?: string | null
          first_seen_at?: string
          home_raw?: string | null
          kickoff_date?: string | null
          last_seen_at?: string
          match_label?: string | null
          reason: string
          record: Json
          resolved_at?: string | null
        }
        Update: {
          airtable_record_id?: string
          away_raw?: string | null
          competition_label?: string | null
          first_seen_at?: string
          home_raw?: string | null
          kickoff_date?: string | null
          last_seen_at?: string
          match_label?: string | null
          reason?: string
          record?: Json
          resolved_at?: string | null
        }
        Relationships: []
      }
      club_grounds: {
        Row: {
          arrangement: string | null
          ground_name: string
          ground_postcode: string
          latitude: number
          longitude: number
          notes: string | null
          postcode_checked_at: string | null
          postcode_distance_m: number | null
          postcode_far_reason: string | null
          postcode_latitude: number | null
          postcode_longitude: number | null
          source_url: string | null
          team_id: number
          updated_at: string
        }
        Insert: {
          arrangement?: string | null
          ground_name: string
          ground_postcode: string
          latitude: number
          longitude: number
          notes?: string | null
          postcode_checked_at?: string | null
          postcode_distance_m?: number | null
          postcode_far_reason?: string | null
          postcode_latitude?: number | null
          postcode_longitude?: number | null
          source_url?: string | null
          team_id: number
          updated_at?: string
        }
        Update: {
          arrangement?: string | null
          ground_name?: string
          ground_postcode?: string
          latitude?: number
          longitude?: number
          notes?: string | null
          postcode_checked_at?: string | null
          postcode_distance_m?: number | null
          postcode_far_reason?: string | null
          postcode_latitude?: number | null
          postcode_longitude?: number | null
          source_url?: string | null
          team_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_grounds_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "club_grounds_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "club_grounds_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "club_grounds_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "club_grounds_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
        ]
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
      cup_lineup_players: {
        Row: {
          captain: boolean
          entered_at: string
          fixture_id: number
          fpl_player_id: number | null
          off_minute: number | null
          on_minute: number | null
          player_name: string
          red_minute: number | null
          replaced: string | null
          row_id: number
          shirt: number | null
          source: string
          started: boolean
          team_id: number
          yellow_minute: number | null
        }
        Insert: {
          captain?: boolean
          entered_at?: string
          fixture_id: number
          fpl_player_id?: number | null
          off_minute?: number | null
          on_minute?: number | null
          player_name: string
          red_minute?: number | null
          replaced?: string | null
          row_id?: never
          shirt?: number | null
          source: string
          started: boolean
          team_id: number
          yellow_minute?: number | null
        }
        Update: {
          captain?: boolean
          entered_at?: string
          fixture_id?: number
          fpl_player_id?: number | null
          off_minute?: number | null
          on_minute?: number | null
          player_name?: string
          red_minute?: number | null
          replaced?: string | null
          row_id?: never
          shirt?: number | null
          source?: string
          started?: boolean
          team_id?: number
          yellow_minute?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_changes_net"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_fallback"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3_raw"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures_reported_unconfirmed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_defensive_contribution_projection_leaguewide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fallback_start_probability_v6"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fixture_bps_projection_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_player_fixture_availability"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_prediction_actual_start_comparison"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_data_health"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_fixture_readiness"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_allocation_v2"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_final"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_points"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_secondary_scoring"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_v4_leaguewide_inputs"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_season_fixture_feed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_adjustments_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_exposure_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "cup_lineup_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
        ]
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
      derived_markets_memo: {
        Row: {
          away_clean_sheet: number | null
          away_win: number | null
          btts: number | null
          draw: number | null
          home_clean_sheet: number | null
          home_win: number | null
          lambda_away: number
          lambda_home: number
          over_2_5: number | null
          rho: number
          under_2_5: number | null
        }
        Insert: {
          away_clean_sheet?: number | null
          away_win?: number | null
          btts?: number | null
          draw?: number | null
          home_clean_sheet?: number | null
          home_win?: number | null
          lambda_away: number
          lambda_home: number
          over_2_5?: number | null
          rho: number
          under_2_5?: number | null
        }
        Update: {
          away_clean_sheet?: number | null
          away_win?: number | null
          btts?: number | null
          draw?: number | null
          home_clean_sheet?: number | null
          home_win?: number | null
          lambda_away?: number
          lambda_home?: number
          over_2_5?: number | null
          rho?: number
          under_2_5?: number | null
        }
        Relationships: []
      }
      fantasy_game_rules: {
        Row: {
          budget_m: number
          captain_multiplier: number
          format: string
          max_per_club: number
          notes: string | null
          provider: string
          rules_id: number
          safety_net: string
          scoring_version: string
          season_label: string
          source_url: string
          squad_quota: Json | null
          squad_size: number
          stacking_penalty: Json | null
          starting_size: number
          transfer_rules: Json | null
          verified_at: string
          vice_rule: string
          xi_max: Json
          xi_min: Json
        }
        Insert: {
          budget_m: number
          captain_multiplier: number
          format: string
          max_per_club: number
          notes?: string | null
          provider: string
          rules_id?: number
          safety_net?: string
          scoring_version: string
          season_label: string
          source_url: string
          squad_quota?: Json | null
          squad_size: number
          stacking_penalty?: Json | null
          starting_size: number
          transfer_rules?: Json | null
          verified_at: string
          vice_rule: string
          xi_max: Json
          xi_min: Json
        }
        Update: {
          budget_m?: number
          captain_multiplier?: number
          format?: string
          max_per_club?: number
          notes?: string | null
          provider?: string
          rules_id?: number
          safety_net?: string
          scoring_version?: string
          season_label?: string
          source_url?: string
          squad_quota?: Json | null
          squad_size?: number
          stacking_penalty?: Json | null
          starting_size?: number
          transfer_rules?: Json | null
          verified_at?: string
          vice_rule?: string
          xi_max?: Json
          xi_min?: Json
        }
        Relationships: []
      }
      fantasy_scoring_rules: {
        Row: {
          notes: string | null
          per_n: number | null
          points: number
          position: string | null
          provider: string
          rule_code: string
          rule_id: number
          scoring_version: string
          source_url: string
          threshold_minutes: number | null
          verified_at: string
        }
        Insert: {
          notes?: string | null
          per_n?: number | null
          points: number
          position?: string | null
          provider: string
          rule_code: string
          rule_id?: number
          scoring_version: string
          source_url: string
          threshold_minutes?: number | null
          verified_at: string
        }
        Update: {
          notes?: string | null
          per_n?: number | null
          points?: number
          position?: string | null
          provider?: string
          rule_code?: string
          rule_id?: number
          scoring_version?: string
          source_url?: string
          threshold_minutes?: number | null
          verified_at?: string
        }
        Relationships: []
      }
      fanteam_club_map: {
        Row: {
          club_key: string
          set_at: string
          team_id: number
        }
        Insert: {
          club_key: string
          set_at?: string
          team_id: number
        }
        Update: {
          club_key?: string
          set_at?: string
          team_id?: number
        }
        Relationships: []
      }
      fanteam_my_teams: {
        Row: {
          captain_key: string | null
          created_at: string
          label: string
          my_team_id: number
          player_keys: string[]
          tournament_id: string
          updated_at: string
          vice_key: string | null
        }
        Insert: {
          captain_key?: string | null
          created_at?: string
          label: string
          my_team_id?: number
          player_keys: string[]
          tournament_id: string
          updated_at?: string
          vice_key?: string | null
        }
        Update: {
          captain_key?: string | null
          created_at?: string
          label?: string
          my_team_id?: number
          player_keys?: string[]
          tournament_id?: string
          updated_at?: string
          vice_key?: string | null
        }
        Relationships: []
      }
      fanteam_player_map: {
        Row: {
          fpl_code: number | null
          name_key: string
          set_at: string
          team_id: number
        }
        Insert: {
          fpl_code?: number | null
          name_key: string
          set_at?: string
          team_id: number
        }
        Update: {
          fpl_code?: number | null
          name_key?: string
          set_at?: string
          team_id?: number
        }
        Relationships: []
      }
      fanteam_player_prices: {
        Row: {
          club_raw: string
          fanteam_player_id: number | null
          first_name: string | null
          fpl_code: number | null
          lineup_status: string | null
          match_method: string | null
          name_raw: string
          paste_id: number
          position: string
          price_m: number
          row_no: number
          surname: string | null
          team_id: number | null
        }
        Insert: {
          club_raw: string
          fanteam_player_id?: number | null
          first_name?: string | null
          fpl_code?: number | null
          lineup_status?: string | null
          match_method?: string | null
          name_raw: string
          paste_id: number
          position: string
          price_m: number
          row_no: number
          surname?: string | null
          team_id?: number | null
        }
        Update: {
          club_raw?: string
          fanteam_player_id?: number | null
          first_name?: string | null
          fpl_code?: number | null
          lineup_status?: string | null
          match_method?: string | null
          name_raw?: string
          paste_id?: number
          position?: string
          price_m?: number
          row_no?: number
          surname?: string | null
          team_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fanteam_player_prices_paste_id_fkey"
            columns: ["paste_id"]
            isOneToOne: false
            referencedRelation: "fanteam_price_pastes"
            referencedColumns: ["paste_id"]
          },
        ]
      }
      fanteam_price_pastes: {
        Row: {
          budget_m: number
          contest_name: string | null
          matchweek: number
          parser_version: string
          paste_id: number
          pasted_at: string
          pasted_by: string | null
          raw_text: string
          row_count: number
          rules_id: number
          safety_net: boolean
          season_id: number
          stacking_penalty: boolean
          tournament_id: string | null
        }
        Insert: {
          budget_m: number
          contest_name?: string | null
          matchweek: number
          parser_version: string
          paste_id?: number
          pasted_at?: string
          pasted_by?: string | null
          raw_text: string
          row_count: number
          rules_id: number
          safety_net: boolean
          season_id: number
          stacking_penalty: boolean
          tournament_id?: string | null
        }
        Update: {
          budget_m?: number
          contest_name?: string | null
          matchweek?: number
          parser_version?: string
          paste_id?: number
          pasted_at?: string
          pasted_by?: string | null
          raw_text?: string
          row_count?: number
          rules_id?: number
          safety_net?: boolean
          season_id?: number
          stacking_penalty?: boolean
          tournament_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fanteam_price_pastes_rules_id_fkey"
            columns: ["rules_id"]
            isOneToOne: false
            referencedRelation: "fantasy_game_rules"
            referencedColumns: ["rules_id"]
          },
        ]
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
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
          {
            foreignKeyName: "finance_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "finance_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "finance_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "finance_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
          {
            foreignKeyName: "finance_reporting_entities_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "finance_reporting_entities_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "finance_reporting_entities_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "finance_reporting_entities_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
            referencedRelation: "fixture_changes_net"
            referencedColumns: ["fixture_id"]
          },
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
            referencedRelation: "fixture_player_expected_minutes_resolved_v3_raw"
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
            referencedRelation: "fixtures_reported_unconfirmed"
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
            referencedRelation: "fpl_player_fixture_availability"
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
            foreignKeyName: "fixture_actual_team_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixture_actual_team_lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
        ]
      }
      fixture_broadcasts: {
        Row: {
          access_type: string | null
          airtable_record_id: string | null
          availability_notes: string | null
          broadcast_id: number
          broadcaster: string | null
          channel: string | null
          competition_label: string | null
          confidence: string | null
          created_at: string
          delivery_methods: string[]
          fixture_id: number
          is_fast: boolean
          is_free_to_air: boolean
          is_live: boolean | null
          is_ppv: boolean
          is_subscription: boolean
          last_synced_at: string | null
          market: string
          platform_device: string | null
          service_product: string | null
          source: string
          source_url: string | null
          status: string
          streaming_service: string | null
          uk_available: boolean | null
          updated_at: string
          verified_at: string
          watch_url: string | null
        }
        Insert: {
          access_type?: string | null
          airtable_record_id?: string | null
          availability_notes?: string | null
          broadcast_id?: never
          broadcaster?: string | null
          channel?: string | null
          competition_label?: string | null
          confidence?: string | null
          created_at?: string
          delivery_methods?: string[]
          fixture_id: number
          is_fast?: boolean
          is_free_to_air?: boolean
          is_live?: boolean | null
          is_ppv?: boolean
          is_subscription?: boolean
          last_synced_at?: string | null
          market?: string
          platform_device?: string | null
          service_product?: string | null
          source: string
          source_url?: string | null
          status: string
          streaming_service?: string | null
          uk_available?: boolean | null
          updated_at?: string
          verified_at?: string
          watch_url?: string | null
        }
        Update: {
          access_type?: string | null
          airtable_record_id?: string | null
          availability_notes?: string | null
          broadcast_id?: never
          broadcaster?: string | null
          channel?: string | null
          competition_label?: string | null
          confidence?: string | null
          created_at?: string
          delivery_methods?: string[]
          fixture_id?: number
          is_fast?: boolean
          is_free_to_air?: boolean
          is_live?: boolean | null
          is_ppv?: boolean
          is_subscription?: boolean
          last_synced_at?: string | null
          market?: string
          platform_device?: string | null
          service_product?: string | null
          source?: string
          source_url?: string | null
          status?: string
          streaming_service?: string | null
          uk_available?: boolean | null
          updated_at?: string
          verified_at?: string
          watch_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_changes_net"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_fallback"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3_raw"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures_reported_unconfirmed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_defensive_contribution_projection_leaguewide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fallback_start_probability_v6"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fixture_bps_projection_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_player_fixture_availability"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_prediction_actual_start_comparison"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_data_health"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_fixture_readiness"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_allocation_v2"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_final"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_points"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_secondary_scoring"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_v4_leaguewide_inputs"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_season_fixture_feed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_adjustments_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_exposure_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_broadcasts_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["fixture_id"]
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
            referencedRelation: "fixture_changes_net"
            referencedColumns: ["fixture_id"]
          },
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
            referencedRelation: "fixture_player_expected_minutes_resolved_v3_raw"
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
            referencedRelation: "fixtures_reported_unconfirmed"
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
            referencedRelation: "fpl_player_fixture_availability"
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
          {
            foreignKeyName: "fixture_changes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_changes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["fixture_id"]
          },
        ]
      }
      fixture_lineup_positions: {
        Row: {
          captured_at: string
          fixture_id: number
          fpl_player_id: number
          name_source: string | null
          source_name: string
          tactical_role: string
          team_id: number
        }
        Insert: {
          captured_at?: string
          fixture_id: number
          fpl_player_id: number
          name_source?: string | null
          source_name: string
          tactical_role: string
          team_id: number
        }
        Update: {
          captured_at?: string
          fixture_id?: number
          fpl_player_id?: number
          name_source?: string | null
          source_name?: string
          tactical_role?: string
          team_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_changes_net"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_fallback"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3_raw"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures_reported_unconfirmed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_defensive_contribution_projection_leaguewide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fallback_start_probability_v6"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fixture_bps_projection_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_player_fixture_availability"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_prediction_actual_start_comparison"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_data_health"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_fixture_readiness"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_allocation_v2"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_final"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_points"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_secondary_scoring"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_v4_leaguewide_inputs"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_season_fixture_feed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_adjustments_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_exposure_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixture_lineup_positions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
      fixture_lineup_sub_coverage: {
        Row: {
          complete: boolean
          fixture_id: number
          source_name: string
          team_id: number
        }
        Insert: {
          complete: boolean
          fixture_id: number
          source_name: string
          team_id: number
        }
        Update: {
          complete?: boolean
          fixture_id?: number
          source_name?: string
          team_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_changes_net"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_fallback"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3_raw"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures_reported_unconfirmed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_defensive_contribution_projection_leaguewide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fallback_start_probability_v6"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fixture_bps_projection_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_player_fixture_availability"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_prediction_actual_start_comparison"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_data_health"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_fixture_readiness"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_allocation_v2"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_final"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_points"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_secondary_scoring"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_v4_leaguewide_inputs"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_season_fixture_feed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_adjustments_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_exposure_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixture_lineup_sub_coverage_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
        ]
      }
      fixture_lineup_substitutions: {
        Row: {
          captured_at: string
          fixture_id: number
          minute: number
          name_off: string | null
          name_on: string | null
          player_off_fpl_id: number
          player_on_fpl_id: number
          source_name: string
          team_id: number
        }
        Insert: {
          captured_at?: string
          fixture_id: number
          minute: number
          name_off?: string | null
          name_on?: string | null
          player_off_fpl_id: number
          player_on_fpl_id: number
          source_name: string
          team_id: number
        }
        Update: {
          captured_at?: string
          fixture_id?: number
          minute?: number
          name_off?: string | null
          name_on?: string | null
          player_off_fpl_id?: number
          player_on_fpl_id?: number
          source_name?: string
          team_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_changes_net"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_fallback"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3_raw"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures_reported_unconfirmed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_defensive_contribution_projection_leaguewide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fallback_start_probability_v6"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fixture_bps_projection_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_player_fixture_availability"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_prediction_actual_start_comparison"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_data_health"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_fixture_readiness"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_allocation_v2"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_final"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_points"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_secondary_scoring"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_v4_leaguewide_inputs"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_season_fixture_feed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_adjustments_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_exposure_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixture_lineup_substitutions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
        ]
      }
      fixture_odds_snapshots: {
        Row: {
          bookmaker: string
          captured_at: string
          fixture_id: number
          is_closing: boolean
          line: number | null
          market: string
          price_away: number | null
          price_draw: number | null
          price_home: number | null
          price_over: number | null
          price_under: number | null
          snapshot_id: number
          source_name: string
        }
        Insert: {
          bookmaker: string
          captured_at?: string
          fixture_id: number
          is_closing?: boolean
          line?: number | null
          market: string
          price_away?: number | null
          price_draw?: number | null
          price_home?: number | null
          price_over?: number | null
          price_under?: number | null
          snapshot_id?: never
          source_name?: string
        }
        Update: {
          bookmaker?: string
          captured_at?: string
          fixture_id?: number
          is_closing?: boolean
          line?: number | null
          market?: string
          price_away?: number | null
          price_draw?: number | null
          price_home?: number | null
          price_over?: number | null
          price_under?: number | null
          snapshot_id?: never
          source_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_changes_net"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_fallback"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3_raw"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures_reported_unconfirmed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_defensive_contribution_projection_leaguewide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fallback_start_probability_v6"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fixture_bps_projection_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_player_fixture_availability"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_prediction_actual_start_comparison"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_data_health"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_fixture_readiness"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_allocation_v2"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_final"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_points"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_secondary_scoring"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_v4_leaguewide_inputs"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_season_fixture_feed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_adjustments_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_exposure_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["fixture_id"]
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
          market_away_goals: number | null
          market_home_goals: number | null
          market_rated_at: string | null
          matchweek: number | null
          predicted_at: string | null
          predicted_away_goals: number | null
          predicted_home_goals: number | null
          prediction_fit_run_id: number | null
          prediction_model_version: string | null
          raw_predicted_away_goals: number | null
          raw_predicted_home_goals: number | null
          reported_at: string | null
          reported_away_goals: number | null
          reported_home_goals: number | null
          reported_source: string | null
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
          market_away_goals?: number | null
          market_home_goals?: number | null
          market_rated_at?: string | null
          matchweek?: number | null
          predicted_at?: string | null
          predicted_away_goals?: number | null
          predicted_home_goals?: number | null
          prediction_fit_run_id?: number | null
          prediction_model_version?: string | null
          raw_predicted_away_goals?: number | null
          raw_predicted_home_goals?: number | null
          reported_at?: string | null
          reported_away_goals?: number | null
          reported_home_goals?: number | null
          reported_source?: string | null
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
          market_away_goals?: number | null
          market_home_goals?: number | null
          market_rated_at?: string | null
          matchweek?: number | null
          predicted_at?: string | null
          predicted_away_goals?: number | null
          predicted_home_goals?: number | null
          prediction_fit_run_id?: number | null
          prediction_model_version?: string | null
          raw_predicted_away_goals?: number | null
          raw_predicted_home_goals?: number | null
          reported_at?: string | null
          reported_away_goals?: number | null
          reported_home_goals?: number | null
          reported_source?: string | null
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
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
            referencedRelation: "league_season_display_names"
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
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
      fpl_deadline_fixture_horizon: {
        Row: {
          away_team_id: number | null
          fixture_event_id: number | null
          fixture_id: number
          fpl_event_id: number
          home_team_id: number | null
          market_away_goals: number | null
          market_home_goals: number | null
          predicted_away_goals: number | null
          predicted_home_goals: number | null
          season_id: number
          snapshot_at: string
          snapshot_kind: string
        }
        Insert: {
          away_team_id?: number | null
          fixture_event_id?: number | null
          fixture_id: number
          fpl_event_id: number
          home_team_id?: number | null
          market_away_goals?: number | null
          market_home_goals?: number | null
          predicted_away_goals?: number | null
          predicted_home_goals?: number | null
          season_id: number
          snapshot_at?: string
          snapshot_kind: string
        }
        Update: {
          away_team_id?: number | null
          fixture_event_id?: number | null
          fixture_id?: number
          fpl_event_id?: number
          home_team_id?: number | null
          market_away_goals?: number | null
          market_home_goals?: number | null
          predicted_away_goals?: number | null
          predicted_home_goals?: number | null
          season_id?: number
          snapshot_at?: string
          snapshot_kind?: string
        }
        Relationships: []
      }
      fpl_deadline_player_horizon: {
        Row: {
          expected_fpl_points: number | null
          expected_minutes: number | null
          fixture_event_id: number | null
          fixture_id: number
          fpl_event_id: number
          fpl_player_id: number
          minutes_source: string | null
          model_version: string | null
          season_id: number
          snapshot_at: string
          snapshot_kind: string
          start_probability: number | null
          tactical_role: string | null
        }
        Insert: {
          expected_fpl_points?: number | null
          expected_minutes?: number | null
          fixture_event_id?: number | null
          fixture_id: number
          fpl_event_id: number
          fpl_player_id: number
          minutes_source?: string | null
          model_version?: string | null
          season_id: number
          snapshot_at?: string
          snapshot_kind: string
          start_probability?: number | null
          tactical_role?: string | null
        }
        Update: {
          expected_fpl_points?: number | null
          expected_minutes?: number | null
          fixture_event_id?: number | null
          fixture_id?: number
          fpl_event_id?: number
          fpl_player_id?: number
          minutes_source?: string | null
          model_version?: string | null
          season_id?: number
          snapshot_at?: string
          snapshot_kind?: string
          start_probability?: number | null
          tactical_role?: string | null
        }
        Relationships: []
      }
      fpl_deadline_player_state: {
        Row: {
          chance_of_playing_next_round: number | null
          chance_of_playing_this_round: number | null
          deadline_time: string
          element_type: number | null
          ep_next: number | null
          ep_this: number | null
          form: number | null
          fpl_code: number | null
          fpl_event_id: number
          fpl_player_id: number
          fpl_team_id: number | null
          minutes: number | null
          news: string | null
          news_added: string | null
          now_cost: number | null
          season_id: number
          selected_by_percent: number | null
          snapshot_at: string
          snapshot_kind: string
          source_payload: Json | null
          source_updated_at: string | null
          state_row_id: number
          status: string | null
          total_points: number | null
          transfers_in_event: number | null
          transfers_out_event: number | null
        }
        Insert: {
          chance_of_playing_next_round?: number | null
          chance_of_playing_this_round?: number | null
          deadline_time: string
          element_type?: number | null
          ep_next?: number | null
          ep_this?: number | null
          form?: number | null
          fpl_code?: number | null
          fpl_event_id: number
          fpl_player_id: number
          fpl_team_id?: number | null
          minutes?: number | null
          news?: string | null
          news_added?: string | null
          now_cost?: number | null
          season_id: number
          selected_by_percent?: number | null
          snapshot_at?: string
          snapshot_kind: string
          source_payload?: Json | null
          source_updated_at?: string | null
          state_row_id?: never
          status?: string | null
          total_points?: number | null
          transfers_in_event?: number | null
          transfers_out_event?: number | null
        }
        Update: {
          chance_of_playing_next_round?: number | null
          chance_of_playing_this_round?: number | null
          deadline_time?: string
          element_type?: number | null
          ep_next?: number | null
          ep_this?: number | null
          form?: number | null
          fpl_code?: number | null
          fpl_event_id?: number
          fpl_player_id?: number
          fpl_team_id?: number | null
          minutes?: number | null
          news?: string | null
          news_added?: string | null
          now_cost?: number | null
          season_id?: number
          selected_by_percent?: number | null
          snapshot_at?: string
          snapshot_kind?: string
          source_payload?: Json | null
          source_updated_at?: string | null
          state_row_id?: never
          status?: string | null
          total_points?: number | null
          transfers_in_event?: number | null
          transfers_out_event?: number | null
        }
        Relationships: []
      }
      fpl_depth_start_store: {
        Row: {
          depth_group: string | null
          depth_rank: number | null
          fixture_id: number
          fpl_player_id: number
          group_shares: Json | null
          refreshed_at: string
          start_probability: number
          team_id: number
        }
        Insert: {
          depth_group?: string | null
          depth_rank?: number | null
          fixture_id: number
          fpl_player_id: number
          group_shares?: Json | null
          refreshed_at?: string
          start_probability: number
          team_id: number
        }
        Update: {
          depth_group?: string | null
          depth_rank?: number | null
          fixture_id?: number
          fpl_player_id?: number
          group_shares?: Json | null
          refreshed_at?: string
          start_probability?: number
          team_id?: number
        }
        Relationships: []
      }
      fpl_external_lineup_runs: {
        Row: {
          fetched_at: string
          fpl_event_id: number
          matched: number
          names_read: number
          run_row_id: number
          saved: boolean
          season_id: number
          source: string
          source_updated: string | null
          team_id: number
          unmatched: string[]
        }
        Insert: {
          fetched_at?: string
          fpl_event_id: number
          matched: number
          names_read: number
          run_row_id?: number
          saved: boolean
          season_id: number
          source: string
          source_updated?: string | null
          team_id: number
          unmatched?: string[]
        }
        Update: {
          fetched_at?: string
          fpl_event_id?: number
          matched?: number
          names_read?: number
          run_row_id?: number
          saved?: boolean
          season_id?: number
          source?: string
          source_updated?: string | null
          team_id?: number
          unmatched?: string[]
        }
        Relationships: []
      }
      fpl_external_lineups: {
        Row: {
          entered_at: string
          entered_by: string | null
          external_lineup_id: number
          fpl_event_id: number
          fpl_player_id: number
          season_id: number
          source: string
          team_id: number
        }
        Insert: {
          entered_at?: string
          entered_by?: string | null
          external_lineup_id?: number
          fpl_event_id: number
          fpl_player_id: number
          season_id?: number
          source?: string
          team_id: number
        }
        Update: {
          entered_at?: string
          entered_by?: string | null
          external_lineup_id?: number
          fpl_event_id?: number
          fpl_player_id?: number
          season_id?: number
          source?: string
          team_id?: number
        }
        Relationships: []
      }
      fpl_fixture_availability_store: {
        Row: {
          availability: number | null
          chance_of_playing_next_round: number | null
          fixture_id: number
          fpl_event_id: number | null
          fpl_player_id: number
          gameweeks_ahead: number | null
          kickoff_date: string | null
          refreshed_at: string | null
          return_date: string | null
          rule: string | null
          status: string | null
          team_id: number | null
        }
        Insert: {
          availability?: number | null
          chance_of_playing_next_round?: number | null
          fixture_id: number
          fpl_event_id?: number | null
          fpl_player_id: number
          gameweeks_ahead?: number | null
          kickoff_date?: string | null
          refreshed_at?: string | null
          return_date?: string | null
          rule?: string | null
          status?: string | null
          team_id?: number | null
        }
        Update: {
          availability?: number | null
          chance_of_playing_next_round?: number | null
          fixture_id?: number
          fpl_event_id?: number | null
          fpl_player_id?: number
          gameweeks_ahead?: number | null
          kickoff_date?: string | null
          refreshed_at?: string | null
          return_date?: string | null
          rule?: string | null
          status?: string | null
          team_id?: number | null
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
      fpl_fixture_changes: {
        Row: {
          candidate_id: number | null
          change_id: number
          detected_at: string
          fpl_fixture_id: number
          new_event: number | null
          new_kickoff: string | null
          old_event: number | null
          old_kickoff: string | null
          season_id: number
        }
        Insert: {
          candidate_id?: number | null
          change_id?: never
          detected_at?: string
          fpl_fixture_id: number
          new_event?: number | null
          new_kickoff?: string | null
          old_event?: number | null
          old_kickoff?: string | null
          season_id: number
        }
        Update: {
          candidate_id?: number | null
          change_id?: never
          detected_at?: string
          fpl_fixture_id?: number
          new_event?: number | null
          new_kickoff?: string | null
          old_event?: number | null
          old_kickoff?: string | null
          season_id?: number
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
          season_id: number
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
          season_id: number
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
          season_id?: number
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
            referencedRelation: "fixture_changes_net"
            referencedColumns: ["fixture_id"]
          },
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
            referencedRelation: "fixture_player_expected_minutes_resolved_v3_raw"
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
            referencedRelation: "fixtures_reported_unconfirmed"
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
            referencedRelation: "fpl_player_fixture_availability"
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
            foreignKeyName: "fpl_fixtures_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_fpl_away_team_season_fkey"
            columns: ["fpl_away_team_id", "season_id"]
            isOneToOne: false
            referencedRelation: "fpl_teams"
            referencedColumns: ["fpl_team_id", "season_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_fpl_event_season_fkey"
            columns: ["fpl_event_id", "season_id"]
            isOneToOne: false
            referencedRelation: "fpl_gameweeks"
            referencedColumns: ["fpl_event_id", "season_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_fpl_home_team_season_fkey"
            columns: ["fpl_home_team_id", "season_id"]
            isOneToOne: false
            referencedRelation: "fpl_teams"
            referencedColumns: ["fpl_team_id", "season_id"]
          },
          {
            foreignKeyName: "fpl_fixtures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
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
      fpl_gameweek_reports: {
        Row: {
          code_ref: string | null
          fpl_event_id: number
          frozen: boolean
          generated_at: string
          kind: string
          payload: Json
          published_at: string | null
          reddit_md: string | null
          report_id: number
          season_id: number
          season_label: string
          status: string
          summary: string | null
          title: string
          version: number
          x_thread: Json | null
        }
        Insert: {
          code_ref?: string | null
          fpl_event_id: number
          frozen?: boolean
          generated_at?: string
          kind: string
          payload: Json
          published_at?: string | null
          reddit_md?: string | null
          report_id?: never
          season_id: number
          season_label: string
          status?: string
          summary?: string | null
          title: string
          version: number
          x_thread?: Json | null
        }
        Update: {
          code_ref?: string | null
          fpl_event_id?: number
          frozen?: boolean
          generated_at?: string
          kind?: string
          payload?: Json
          published_at?: string | null
          reddit_md?: string | null
          report_id?: never
          season_id?: number
          season_label?: string
          status?: string
          summary?: string | null
          title?: string
          version?: number
          x_thread?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_gameweek_reports_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "fpl_gameweek_reports_season_id_fkey"
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
          season_id: number
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
          season_id: number
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
          season_id?: number
          source_payload?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fpl_gameweeks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
          },
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
      fpl_live_elements: {
        Row: {
          bps: number | null
          explain: Json
          fpl_event_id: number
          fpl_player_id: number
          minutes: number
          season_id: number
          stats: Json
          total_points: number
          updated_at: string
        }
        Insert: {
          bps?: number | null
          explain?: Json
          fpl_event_id: number
          fpl_player_id: number
          minutes?: number
          season_id: number
          stats?: Json
          total_points?: number
          updated_at?: string
        }
        Update: {
          bps?: number | null
          explain?: Json
          fpl_event_id?: number
          fpl_player_id?: number
          minutes?: number
          season_id?: number
          stats?: Json
          total_points?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fpl_live_elements_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "fpl_live_elements_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      fpl_live_fixtures: {
        Row: {
          bonus: Json
          bps: Json
          fetched_at: string
          finished: boolean
          finished_provisional: boolean
          fpl_event_id: number | null
          fpl_fixture_id: number
          kickoff_time: string | null
          minutes: number
          season_id: number
          started: boolean
          team_a: number | null
          team_a_score: number | null
          team_h: number | null
          team_h_score: number | null
        }
        Insert: {
          bonus?: Json
          bps?: Json
          fetched_at?: string
          finished?: boolean
          finished_provisional?: boolean
          fpl_event_id?: number | null
          fpl_fixture_id: number
          kickoff_time?: string | null
          minutes?: number
          season_id: number
          started?: boolean
          team_a?: number | null
          team_a_score?: number | null
          team_h?: number | null
          team_h_score?: number | null
        }
        Update: {
          bonus?: Json
          bps?: Json
          fetched_at?: string
          finished?: boolean
          finished_provisional?: boolean
          fpl_event_id?: number | null
          fpl_fixture_id?: number
          kickoff_time?: string | null
          minutes?: number
          season_id?: number
          started?: boolean
          team_a?: number | null
          team_a_score?: number | null
          team_h?: number | null
          team_h_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_live_fixtures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "fpl_live_fixtures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      fpl_live_runs: {
        Row: {
          duration_ms: number | null
          elements_changed: number | null
          error: string | null
          fixtures: number | null
          fixtures_http: number | null
          fpl_event_id: number | null
          live_http: number | null
          run_at: string
          run_id: number
          status: string
        }
        Insert: {
          duration_ms?: number | null
          elements_changed?: number | null
          error?: string | null
          fixtures?: number | null
          fixtures_http?: number | null
          fpl_event_id?: number | null
          live_http?: number | null
          run_at?: string
          run_id?: number
          status: string
        }
        Update: {
          duration_ms?: number | null
          elements_changed?: number | null
          error?: string | null
          fixtures?: number | null
          fixtures_http?: number | null
          fpl_event_id?: number | null
          live_http?: number | null
          run_at?: string
          run_id?: number
          status?: string
        }
        Relationships: []
      }
      fpl_pecking_order_snapshots: {
        Row: {
          depth_rank: number | null
          fpl_player_id: number
          label: string
          season_id: number
          tactical_role: string | null
          taken_at: string
          team_id: number
        }
        Insert: {
          depth_rank?: number | null
          fpl_player_id: number
          label: string
          season_id: number
          tactical_role?: string | null
          taken_at?: string
          team_id: number
        }
        Update: {
          depth_rank?: number | null
          fpl_player_id?: number
          label?: string
          season_id?: number
          tactical_role?: string | null
          taken_at?: string
          team_id?: number
        }
        Relationships: []
      }
      fpl_player_exit_bands: {
        Row: {
          fpl_player_id: number
          p_full: number
          p_off_60_84: number
          p_off_before_60: number
          season_id: number
          starts_seen: number
          updated_at: string
        }
        Insert: {
          fpl_player_id: number
          p_full: number
          p_off_60_84: number
          p_off_before_60: number
          season_id: number
          starts_seen?: number
          updated_at?: string
        }
        Update: {
          fpl_player_id?: number
          p_full?: number
          p_off_60_84?: number
          p_off_before_60?: number
          season_id?: number
          starts_seen?: number
          updated_at?: string
        }
        Relationships: []
      }
      fpl_player_first_choice: {
        Row: {
          effective_from: string
          effective_to: string | null
          first_choice_id: number
          fpl_player_id: number
          note: string | null
          removed_at: string | null
          season_id: number
          set_at: string
          set_by: string | null
          start_if_fit: number
        }
        Insert: {
          effective_from?: string
          effective_to?: string | null
          first_choice_id?: number
          fpl_player_id: number
          note?: string | null
          removed_at?: string | null
          season_id?: number
          set_at?: string
          set_by?: string | null
          start_if_fit: number
        }
        Update: {
          effective_from?: string
          effective_to?: string | null
          first_choice_id?: number
          fpl_player_id?: number
          note?: string | null
          removed_at?: string | null
          season_id?: number
          set_at?: string
          set_by?: string | null
          start_if_fit?: number
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
          },
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
          season_id: number
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
          season_id: number
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
          season_id?: number
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
            foreignKeyName: "fpl_player_gameweeks_fpl_event_season_fkey"
            columns: ["fpl_event_id", "season_id"]
            isOneToOne: false
            referencedRelation: "fpl_gameweeks"
            referencedColumns: ["fpl_event_id", "season_id"]
          },
          {
            foreignKeyName: "fpl_player_gameweeks_fpl_fixture_season_fkey"
            columns: ["fpl_fixture_id", "season_id"]
            isOneToOne: false
            referencedRelation: "fpl_fixtures"
            referencedColumns: ["fpl_fixture_id", "season_id"]
          },
          {
            foreignKeyName: "fpl_player_gameweeks_opponent_team_season_fkey"
            columns: ["opponent_fpl_team_id", "season_id"]
            isOneToOne: false
            referencedRelation: "fpl_teams"
            referencedColumns: ["fpl_team_id", "season_id"]
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
          },
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
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
      fpl_player_start_record: {
        Row: {
          appearances: number
          available_matches: number
          available_recent: number | null
          fpl_player_id: number
          prior_rate: number | null
          refreshed_at: string
          season_id: number
          starts: number
          starts_recent: number | null
        }
        Insert: {
          appearances: number
          available_matches: number
          available_recent?: number | null
          fpl_player_id: number
          prior_rate?: number | null
          refreshed_at?: string
          season_id: number
          starts: number
          starts_recent?: number | null
        }
        Update: {
          appearances?: number
          available_matches?: number
          available_recent?: number | null
          fpl_player_id?: number
          prior_rate?: number | null
          refreshed_at?: string
          season_id?: number
          starts?: number
          starts_recent?: number | null
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
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["canonical_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["canonical_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["canonical_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["canonical_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_fpl_team_season_fkey"
            columns: ["fpl_team_id", "season_id"]
            isOneToOne: false
            referencedRelation: "fpl_teams"
            referencedColumns: ["fpl_team_id", "season_id"]
          },
          {
            foreignKeyName: "fpl_players_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
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
      fpl_projection_fixture_snapshots: {
        Row: {
          deadline_time: string
          fixture_id: number
          fpl_event_id: number
          kickoff_date: string | null
          kickoff_time: string | null
          market_away_goals: number | null
          market_home_goals: number | null
          predicted_away_goals: number | null
          predicted_home_goals: number | null
          season_id: number
          snapshot_at: string
          snapshot_kind: string
          snapshot_row_id: number
        }
        Insert: {
          deadline_time: string
          fixture_id: number
          fpl_event_id: number
          kickoff_date?: string | null
          kickoff_time?: string | null
          market_away_goals?: number | null
          market_home_goals?: number | null
          predicted_away_goals?: number | null
          predicted_home_goals?: number | null
          season_id: number
          snapshot_at?: string
          snapshot_kind: string
          snapshot_row_id?: never
        }
        Update: {
          deadline_time?: string
          fixture_id?: number
          fpl_event_id?: number
          kickoff_date?: string | null
          kickoff_time?: string | null
          market_away_goals?: number | null
          market_home_goals?: number | null
          predicted_away_goals?: number | null
          predicted_home_goals?: number | null
          season_id?: number
          snapshot_at?: string
          snapshot_kind?: string
          snapshot_row_id?: never
        }
        Relationships: []
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
      fpl_projection_snapshots: {
        Row: {
          availability_probability: number | null
          clean_sheet_probability: number | null
          deadline_time: string
          defensive_contribution_probability: number | null
          expected_assists: number | null
          expected_bonus: number | null
          expected_fpl_points: number | null
          expected_goals: number | null
          expected_minutes: number | null
          expected_saves: number | null
          fixture_id: number
          fpl_event_id: number
          fpl_player_id: number
          lineup_confidence: number | null
          minutes_source: string | null
          model_version: string
          projection_generated_at: string | null
          season_id: number
          snapshot_at: string
          snapshot_kind: string
          snapshot_row_id: number
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
          deadline_time: string
          defensive_contribution_probability?: number | null
          expected_assists?: number | null
          expected_bonus?: number | null
          expected_fpl_points?: number | null
          expected_goals?: number | null
          expected_minutes?: number | null
          expected_saves?: number | null
          fixture_id: number
          fpl_event_id: number
          fpl_player_id: number
          lineup_confidence?: number | null
          minutes_source?: string | null
          model_version: string
          projection_generated_at?: string | null
          season_id: number
          snapshot_at?: string
          snapshot_kind: string
          snapshot_row_id?: never
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
          deadline_time?: string
          defensive_contribution_probability?: number | null
          expected_assists?: number | null
          expected_bonus?: number | null
          expected_fpl_points?: number | null
          expected_goals?: number | null
          expected_minutes?: number | null
          expected_saves?: number | null
          fixture_id?: number
          fpl_event_id?: number
          fpl_player_id?: number
          lineup_confidence?: number | null
          minutes_source?: string | null
          model_version?: string
          projection_generated_at?: string | null
          season_id?: number
          snapshot_at?: string
          snapshot_kind?: string
          snapshot_row_id?: never
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
          season_id: number
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
          season_id: number
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
          season_id?: number
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
            foreignKeyName: "fpl_teams_canonical_team_id_fkey"
            columns: ["canonical_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_teams_canonical_team_id_fkey"
            columns: ["canonical_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_teams_canonical_team_id_fkey"
            columns: ["canonical_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_teams_canonical_team_id_fkey"
            columns: ["canonical_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_teams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
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
      historic_source_rows: {
        Row: {
          away_goals: number | null
          away_name: string
          has_odds: boolean
          has_stats: boolean
          historic_source_row_id: number
          home_goals: number | null
          home_name: string
          ht_away_goals: number | null
          ht_home_goals: number | null
          league_code: string
          loaded_at: string
          match_date: string | null
          result: string | null
          row_number: number
          season_start_year: number
          source_name: string
        }
        Insert: {
          away_goals?: number | null
          away_name: string
          has_odds?: boolean
          has_stats?: boolean
          historic_source_row_id?: never
          home_goals?: number | null
          home_name: string
          ht_away_goals?: number | null
          ht_home_goals?: number | null
          league_code: string
          loaded_at?: string
          match_date?: string | null
          result?: string | null
          row_number: number
          season_start_year: number
          source_name: string
        }
        Update: {
          away_goals?: number | null
          away_name?: string
          has_odds?: boolean
          has_stats?: boolean
          historic_source_row_id?: never
          home_goals?: number | null
          home_name?: string
          ht_away_goals?: number | null
          ht_home_goals?: number | null
          league_code?: string
          loaded_at?: string
          match_date?: string | null
          result?: string | null
          row_number?: number
          season_start_year?: number
          source_name?: string
        }
        Relationships: []
      }
      historic_source_rows_europe: {
        Row: {
          away_goals: number | null
          away_name: string
          has_odds: boolean | null
          has_stats: boolean | null
          historic_source_row_id: number
          home_goals: number | null
          home_name: string
          ht_away_goals: number | null
          ht_home_goals: number | null
          kickoff_time: string | null
          league_code: string
          loaded_at: string
          match_date: string | null
          note: string | null
          result: string | null
          row_number: number
          season_raw: string | null
          season_start_year: number
          source_name: string
        }
        Insert: {
          away_goals?: number | null
          away_name: string
          has_odds?: boolean | null
          has_stats?: boolean | null
          historic_source_row_id?: never
          home_goals?: number | null
          home_name: string
          ht_away_goals?: number | null
          ht_home_goals?: number | null
          kickoff_time?: string | null
          league_code: string
          loaded_at?: string
          match_date?: string | null
          note?: string | null
          result?: string | null
          row_number: number
          season_raw?: string | null
          season_start_year: number
          source_name: string
        }
        Update: {
          away_goals?: number | null
          away_name?: string
          has_odds?: boolean | null
          has_stats?: boolean | null
          historic_source_row_id?: never
          home_goals?: number | null
          home_name?: string
          ht_away_goals?: number | null
          ht_home_goals?: number | null
          kickoff_time?: string | null
          league_code?: string
          loaded_at?: string
          match_date?: string | null
          note?: string | null
          result?: string | null
          row_number?: number
          season_raw?: string | null
          season_start_year?: number
          source_name?: string
        }
        Relationships: []
      }
      job_registry: {
        Row: {
          active: boolean
          area: string
          expected_interval: string | null
          job_key: string
          location: string
          max_duration: string
          notes: string | null
          outcome_is_check: boolean
          output_check: string | null
          registered_at: string
          run_key: string | null
          run_log: string
          schedule: string | null
          upstream: string | null
        }
        Insert: {
          active?: boolean
          area: string
          expected_interval?: string | null
          job_key: string
          location: string
          max_duration?: string
          notes?: string | null
          outcome_is_check?: boolean
          output_check?: string | null
          registered_at?: string
          run_key?: string | null
          run_log: string
          schedule?: string | null
          upstream?: string | null
        }
        Update: {
          active?: boolean
          area?: string
          expected_interval?: string | null
          job_key?: string
          location?: string
          max_duration?: string
          notes?: string | null
          outcome_is_check?: boolean
          output_check?: string | null
          registered_at?: string
          run_key?: string | null
          run_log?: string
          schedule?: string | null
          upstream?: string | null
        }
        Relationships: []
      }
      lab_experiments: {
        Row: {
          benchmark: string
          concluded_at: string | null
          conclusion: string | null
          data_notes: string | null
          decision_rule: string
          experiment_id: string
          holdout_opened_at: string | null
          holdout_seasons: number[]
          primary_metric: string
          question: string
          registered_at: string
          status: string
          title: string
          tuning_seasons: number[]
          validation_seasons: number[]
          variants_tried: number
        }
        Insert: {
          benchmark: string
          concluded_at?: string | null
          conclusion?: string | null
          data_notes?: string | null
          decision_rule: string
          experiment_id: string
          holdout_opened_at?: string | null
          holdout_seasons: number[]
          primary_metric?: string
          question: string
          registered_at?: string
          status?: string
          title: string
          tuning_seasons: number[]
          validation_seasons: number[]
          variants_tried?: number
        }
        Update: {
          benchmark?: string
          concluded_at?: string | null
          conclusion?: string | null
          data_notes?: string | null
          decision_rule?: string
          experiment_id?: string
          holdout_opened_at?: string | null
          holdout_seasons?: number[]
          primary_metric?: string
          question?: string
          registered_at?: string
          status?: string
          title?: string
          tuning_seasons?: number[]
          validation_seasons?: number[]
          variants_tried?: number
        }
        Relationships: []
      }
      lab_scorings: {
        Row: {
          code_ref: string | null
          experiment_id: string
          metrics: Json
          n_matches: number
          scored_at: string
          scoring_id: number
          split: string
          variant: string
        }
        Insert: {
          code_ref?: string | null
          experiment_id: string
          metrics: Json
          n_matches: number
          scored_at?: string
          scoring_id?: never
          split: string
          variant: string
        }
        Update: {
          code_ref?: string | null
          experiment_id?: string
          metrics?: Json
          n_matches?: number
          scored_at?: string
          scoring_id?: never
          split?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_scorings_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "lab_experiments"
            referencedColumns: ["experiment_id"]
          },
        ]
      }
      lab_sealed_seasons: {
        Row: {
          note: string | null
          sealed_at: string
          season_id: number
        }
        Insert: {
          note?: string | null
          sealed_at?: string
          season_id: number
        }
        Update: {
          note?: string | null
          sealed_at?: string
          season_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "lab_sealed_seasons_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: true
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "lab_sealed_seasons_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: true
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      league_season_formats: {
        Row: {
          curtailed_on_ppg: boolean | null
          format: string
          group_games: number[] | null
          group_sizes: number[] | null
          halved_groups: number[] | null
          halving_rounding: string | null
          league_id: number
          notes: string
          regular_meetings: number | null
          season_id: number
          source_url: string | null
          tiebreak: string | null
        }
        Insert: {
          curtailed_on_ppg?: boolean | null
          format: string
          group_games?: number[] | null
          group_sizes?: number[] | null
          halved_groups?: number[] | null
          halving_rounding?: string | null
          league_id: number
          notes: string
          regular_meetings?: number | null
          season_id: number
          source_url?: string | null
          tiebreak?: string | null
        }
        Update: {
          curtailed_on_ppg?: boolean | null
          format?: string
          group_games?: number[] | null
          group_sizes?: number[] | null
          halved_groups?: number[] | null
          halving_rounding?: string | null
          league_id?: number
          notes?: string
          regular_meetings?: number | null
          season_id?: number
          source_url?: string | null
          tiebreak?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_season_formats_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "league_fit_status"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "league_season_formats_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "league_season_display_names"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "league_season_formats_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "league_season_formats_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "league_season_formats_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      league_season_names: {
        Row: {
          from_season_start_year: number
          league_id: number
          name: string
          to_season_start_year: number | null
        }
        Insert: {
          from_season_start_year: number
          league_id: number
          name: string
          to_season_start_year?: number | null
        }
        Update: {
          from_season_start_year?: number
          league_id?: number
          name?: string
          to_season_start_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "league_season_names_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "league_fit_status"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "league_season_names_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "league_season_display_names"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "league_season_names_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
        ]
      }
      league_standings_cache: {
        Row: {
          away_clean_sheets: number | null
          away_drawn: number | null
          away_goals_against: number | null
          away_goals_for: number | null
          away_lost: number | null
          away_played: number | null
          away_points: number | null
          away_won: number | null
          clean_sheets: number | null
          curtailed: boolean | null
          deduction: number | null
          drawn: number | null
          failed_to_score: number | null
          goals_against: number | null
          goals_for: number | null
          home_clean_sheets: number | null
          home_drawn: number | null
          home_goals_against: number | null
          home_goals_for: number | null
          home_lost: number | null
          home_played: number | null
          home_points: number | null
          home_won: number | null
          is_final: boolean | null
          league_code: string | null
          league_id: number | null
          league_name: string | null
          lost: number | null
          played: number | null
          points: number | null
          points_won: number | null
          position: number | null
          ppg: number | null
          pyramid_position: number | null
          ranked_on: string | null
          season_id: number | null
          season_label: string | null
          season_start_year: number | null
          split_adjustment: number | null
          split_group: number | null
          team_id: number | null
          teams: number | null
          tier: number | null
          won: number | null
        }
        Insert: {
          away_clean_sheets?: number | null
          away_drawn?: number | null
          away_goals_against?: number | null
          away_goals_for?: number | null
          away_lost?: number | null
          away_played?: number | null
          away_points?: number | null
          away_won?: number | null
          clean_sheets?: number | null
          curtailed?: boolean | null
          deduction?: number | null
          drawn?: number | null
          failed_to_score?: number | null
          goals_against?: number | null
          goals_for?: number | null
          home_clean_sheets?: number | null
          home_drawn?: number | null
          home_goals_against?: number | null
          home_goals_for?: number | null
          home_lost?: number | null
          home_played?: number | null
          home_points?: number | null
          home_won?: number | null
          is_final?: boolean | null
          league_code?: string | null
          league_id?: number | null
          league_name?: string | null
          lost?: number | null
          played?: number | null
          points?: number | null
          points_won?: number | null
          position?: number | null
          ppg?: number | null
          pyramid_position?: number | null
          ranked_on?: string | null
          season_id?: number | null
          season_label?: string | null
          season_start_year?: number | null
          split_adjustment?: number | null
          split_group?: number | null
          team_id?: number | null
          teams?: number | null
          tier?: number | null
          won?: number | null
        }
        Update: {
          away_clean_sheets?: number | null
          away_drawn?: number | null
          away_goals_against?: number | null
          away_goals_for?: number | null
          away_lost?: number | null
          away_played?: number | null
          away_points?: number | null
          away_won?: number | null
          clean_sheets?: number | null
          curtailed?: boolean | null
          deduction?: number | null
          drawn?: number | null
          failed_to_score?: number | null
          goals_against?: number | null
          goals_for?: number | null
          home_clean_sheets?: number | null
          home_drawn?: number | null
          home_goals_against?: number | null
          home_goals_for?: number | null
          home_lost?: number | null
          home_played?: number | null
          home_points?: number | null
          home_won?: number | null
          is_final?: boolean | null
          league_code?: string | null
          league_id?: number | null
          league_name?: string | null
          lost?: number | null
          played?: number | null
          points?: number | null
          points_won?: number | null
          position?: number | null
          ppg?: number | null
          pyramid_position?: number | null
          ranked_on?: string | null
          season_id?: number | null
          season_label?: string | null
          season_start_year?: number | null
          split_adjustment?: number | null
          split_group?: number | null
          team_id?: number | null
          teams?: number | null
          tier?: number | null
          won?: number | null
        }
        Relationships: []
      }
      league_standings_cache_state: {
        Row: {
          duration_ms: number | null
          fingerprint: string | null
          id: number
          refreshed_at: string | null
          rows_cached: number | null
        }
        Insert: {
          duration_ms?: number | null
          fingerprint?: string | null
          id?: number
          refreshed_at?: string | null
          rows_cached?: number | null
        }
        Update: {
          duration_ms?: number | null
          fingerprint?: string | null
          id?: number
          refreshed_at?: string | null
          rows_cached?: number | null
        }
        Relationships: []
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
            referencedRelation: "lab_f1_dataset"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "match_odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "lab_f4_lines"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "match_odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "market_closing_lines"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "match_odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["match_id"]
          },
        ]
      }
      match_predictions: {
        Row: {
          fit_as_of_date: string
          fit_run_id: number
          match_id: number
          predicted_at: string
          predicted_away_goals: number
          predicted_home_goals: number
        }
        Insert: {
          fit_as_of_date: string
          fit_run_id: number
          match_id: number
          predicted_at?: string
          predicted_away_goals: number
          predicted_home_goals: number
        }
        Update: {
          fit_as_of_date?: string
          fit_run_id?: number
          match_id?: number
          predicted_at?: string
          predicted_away_goals?: number
          predicted_home_goals?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_predictions_fit_run_id_fkey"
            columns: ["fit_run_id"]
            isOneToOne: false
            referencedRelation: "fpl_team_strength_current"
            referencedColumns: ["fit_run_id"]
          },
          {
            foreignKeyName: "match_predictions_fit_run_id_fkey"
            columns: ["fit_run_id"]
            isOneToOne: false
            referencedRelation: "league_fit_status"
            referencedColumns: ["accepted_fit_run_id"]
          },
          {
            foreignKeyName: "match_predictions_fit_run_id_fkey"
            columns: ["fit_run_id"]
            isOneToOne: false
            referencedRelation: "league_fit_status"
            referencedColumns: ["latest_attempted_fit_run_id"]
          },
          {
            foreignKeyName: "match_predictions_fit_run_id_fkey"
            columns: ["fit_run_id"]
            isOneToOne: false
            referencedRelation: "model_fit_runs"
            referencedColumns: ["fit_run_id"]
          },
          {
            foreignKeyName: "match_predictions_fit_run_id_fkey"
            columns: ["fit_run_id"]
            isOneToOne: false
            referencedRelation: "team_strength_current"
            referencedColumns: ["fit_run_id"]
          },
          {
            foreignKeyName: "match_predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "lab_f1_dataset"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "match_predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "lab_f4_lines"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "match_predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "market_closing_lines"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "match_predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["match_id"]
          },
        ]
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
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
            referencedRelation: "league_season_display_names"
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
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
          {
            foreignKeyName: "matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
        ]
      }
      meta_flow_edges: {
        Row: {
          child_key: string
          parent_key: string
          source: string
        }
        Insert: {
          child_key: string
          parent_key: string
          source?: string
        }
        Update: {
          child_key?: string
          parent_key?: string
          source?: string
        }
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
      meta_flow_nodes: {
        Row: {
          ai_relevant: boolean | null
          commentary: string | null
          definition_hash: string
          first_seen: string
          is_present: boolean
          is_public: boolean | null
          kind: string
          last_seen: string
          layer: string | null
          node_key: string
          obj_name: string
          purpose: string | null
          purpose_reviewed_at: string | null
          refresh_note: string | null
          row_estimate: number | null
          status: string | null
        }
        Insert: {
          ai_relevant?: boolean | null
          commentary?: string | null
          definition_hash: string
          first_seen?: string
          is_present?: boolean
          is_public?: boolean | null
          kind: string
          last_seen?: string
          layer?: string | null
          node_key: string
          obj_name: string
          purpose?: string | null
          purpose_reviewed_at?: string | null
          refresh_note?: string | null
          row_estimate?: number | null
          status?: string | null
        }
        Update: {
          ai_relevant?: boolean | null
          commentary?: string | null
          definition_hash?: string
          first_seen?: string
          is_present?: boolean
          is_public?: boolean | null
          kind?: string
          last_seen?: string
          layer?: string | null
          node_key?: string
          obj_name?: string
          purpose?: string | null
          purpose_reviewed_at?: string | null
          refresh_note?: string | null
          row_estimate?: number | null
          status?: string | null
        }
        Relationships: []
      }
      model_change_log: {
        Row: {
          after_metrics: Json | null
          area: string
          before_metrics: Json | null
          change_id: number
          changed_at: string
          detail: string | null
          reason: string
          reference: string | null
          title: string
          version_from: string | null
          version_to: string | null
        }
        Insert: {
          after_metrics?: Json | null
          area: string
          before_metrics?: Json | null
          change_id?: never
          changed_at: string
          detail?: string | null
          reason: string
          reference?: string | null
          title: string
          version_from?: string | null
          version_to?: string | null
        }
        Update: {
          after_metrics?: Json | null
          area?: string
          before_metrics?: Json | null
          change_id?: never
          changed_at?: string
          detail?: string | null
          reason?: string
          reference?: string | null
          title?: string
          version_from?: string | null
          version_to?: string | null
        }
        Relationships: []
      }
      model_experiment_predictions: {
        Row: {
          as_of_date: string
          created_at: string
          experiment: string
          half_life_days: number
          match_id: number
          p_away: number
          p_draw: number
          p_home: number
          pred_away_goals: number
          pred_home_goals: number
          rho: number
          shrinkage: number
          variant: string
        }
        Insert: {
          as_of_date: string
          created_at?: string
          experiment: string
          half_life_days: number
          match_id: number
          p_away: number
          p_draw: number
          p_home: number
          pred_away_goals: number
          pred_home_goals: number
          rho: number
          shrinkage: number
          variant: string
        }
        Update: {
          as_of_date?: string
          created_at?: string
          experiment?: string
          half_life_days?: number
          match_id?: number
          p_away?: number
          p_draw?: number
          p_home?: number
          pred_away_goals?: number
          pred_home_goals?: number
          rho?: number
          shrinkage?: number
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_experiment_predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "lab_f1_dataset"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "model_experiment_predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "lab_f4_lines"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "model_experiment_predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "market_closing_lines"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "model_experiment_predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["match_id"]
          },
        ]
      }
      model_fit_runs: {
        Row: {
          as_of_date: string | null
          converged: boolean
          decay_half_life_days: number
          fit_run_id: number
          fitted_at: string
          home_advantage: number
          is_retrofit: boolean
          league_id: number
          log_likelihood: number | null
          matches_used: number
          model_version: string | null
          rejection_reason: string | null
          rho: number
          status: string
          validation_checks: Json
          validation_warnings: Json
          window_end_date: string
          window_start_date: string
        }
        Insert: {
          as_of_date?: string | null
          converged?: boolean
          decay_half_life_days: number
          fit_run_id?: never
          fitted_at?: string
          home_advantage: number
          is_retrofit?: boolean
          league_id: number
          log_likelihood?: number | null
          matches_used: number
          model_version?: string | null
          rejection_reason?: string | null
          rho: number
          status?: string
          validation_checks?: Json
          validation_warnings?: Json
          window_end_date: string
          window_start_date: string
        }
        Update: {
          as_of_date?: string | null
          converged?: boolean
          decay_half_life_days?: number
          fit_run_id?: never
          fitted_at?: string
          home_advantage?: number
          is_retrofit?: boolean
          league_id?: number
          log_likelihood?: number | null
          matches_used?: number
          model_version?: string | null
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
            referencedRelation: "league_season_display_names"
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
            foreignKeyName: "model_fit_runs_model_version_fkey"
            columns: ["model_version"]
            isOneToOne: false
            referencedRelation: "model_versions"
            referencedColumns: ["version"]
          },
        ]
      }
      model_versions: {
        Row: {
          component: string
          description: string
          introduced_at: string | null
          params: Json
          retired_at: string | null
          version: string
        }
        Insert: {
          component: string
          description: string
          introduced_at?: string | null
          params?: Json
          retired_at?: string | null
          version: string
        }
        Update: {
          component?: string
          description?: string
          introduced_at?: string | null
          params?: Json
          retired_at?: string | null
          version?: string
        }
        Relationships: []
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
          rows_changed: number | null
          rows_inserted: number | null
          rows_read: number | null
          rows_unchanged: number | null
          run_id: number
          started_at: string
          status: string
          summary: string | null
        }
        Insert: {
          error_message?: string | null
          finished_at?: string | null
          job_name: string
          rows_changed?: number | null
          rows_inserted?: number | null
          rows_read?: number | null
          rows_unchanged?: number | null
          run_id?: never
          started_at?: string
          status?: string
          summary?: string | null
        }
        Update: {
          error_message?: string | null
          finished_at?: string | null
          job_name?: string
          rows_changed?: number | null
          rows_inserted?: number | null
          rows_read?: number | null
          rows_unchanged?: number | null
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
          },
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
            referencedRelation: "league_season_display_names"
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
            referencedRelation: "fixture_changes_net"
            referencedColumns: ["fixture_id"]
          },
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
            referencedRelation: "fixture_player_expected_minutes_resolved_v3_raw"
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
            referencedRelation: "fixtures_reported_unconfirmed"
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
            referencedRelation: "fpl_player_fixture_availability"
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
            foreignKeyName: "player_lineup_predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_lineup_predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_lineup_predictions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
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
            referencedRelation: "fixture_changes_net"
            referencedColumns: ["fixture_id"]
          },
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
            referencedRelation: "fixture_player_expected_minutes_resolved_v3_raw"
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
            referencedRelation: "fixtures_reported_unconfirmed"
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
            referencedRelation: "fpl_player_fixture_availability"
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
            foreignKeyName: "player_match_roles_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_match_roles_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_match_roles_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
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
          {
            foreignKeyName: "player_match_roles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "player_match_roles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "player_match_roles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "player_match_roles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
            referencedRelation: "league_season_display_names"
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
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
          {
            foreignKeyName: "point_deductions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "point_deductions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "point_deductions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "point_deductions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
        ]
      }
      prediction_corrections: {
        Row: {
          corrected_at: string
          correction_id: number
          fixture_id: number
          new_fit_run_id: number | null
          new_model_version: string | null
          new_predicted_away_goals: number | null
          new_predicted_home_goals: number | null
          old_fit_run_id: number | null
          old_model_version: string | null
          old_predicted_at: string | null
          old_predicted_away_goals: number | null
          old_predicted_home_goals: number | null
          reason: string
        }
        Insert: {
          corrected_at?: string
          correction_id?: never
          fixture_id: number
          new_fit_run_id?: number | null
          new_model_version?: string | null
          new_predicted_away_goals?: number | null
          new_predicted_home_goals?: number | null
          old_fit_run_id?: number | null
          old_model_version?: string | null
          old_predicted_at?: string | null
          old_predicted_away_goals?: number | null
          old_predicted_home_goals?: number | null
          reason: string
        }
        Update: {
          corrected_at?: string
          correction_id?: never
          fixture_id?: number
          new_fit_run_id?: number | null
          new_model_version?: string | null
          new_predicted_away_goals?: number | null
          new_predicted_home_goals?: number | null
          old_fit_run_id?: number | null
          old_model_version?: string | null
          old_predicted_at?: string | null
          old_predicted_away_goals?: number | null
          old_predicted_home_goals?: number | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_changes_net"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_fallback"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3_raw"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures_reported_unconfirmed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_defensive_contribution_projection_leaguewide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fallback_start_probability_v6"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fixture_bps_projection_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_player_fixture_availability"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_prediction_actual_start_comparison"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_data_health"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_fixture_readiness"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_allocation_v2"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_final"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_points"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_secondary_scoring"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_v4_leaguewide_inputs"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_season_fixture_feed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_adjustments_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_exposure_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "prediction_corrections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["fixture_id"]
          },
        ]
      }
      production_models: {
        Row: {
          component: string
          model_version: string
          notes: string | null
          since: string
        }
        Insert: {
          component: string
          model_version: string
          notes?: string | null
          since?: string
        }
        Update: {
          component?: string
          model_version?: string
          notes?: string | null
          since?: string
        }
        Relationships: []
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
      repo_migrations: {
        Row: {
          applied_at: string
          commit_sha: string | null
          filename: string
          how: string
        }
        Insert: {
          applied_at?: string
          commit_sha?: string | null
          filename: string
          how: string
        }
        Update: {
          applied_at?: string
          commit_sha?: string | null
          filename?: string
          how?: string
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
          },
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
          },
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
          {
            foreignKeyName: "set_piece_hierarchies_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "set_piece_hierarchies_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "set_piece_hierarchies_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "set_piece_hierarchies_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
        ]
      }
      smoke_page_results: {
        Row: {
          api_calls: number | null
          api_kb: number | null
          cls: number | null
          cls_sources: Json | null
          errors: Json
          fcp_ms: number | null
          http_status: number | null
          js_kb: number | null
          largest_api: Json | null
          lcp_element: string | null
          lcp_ms: number | null
          load_ms: number | null
          ok: boolean
          page_type: string
          requests: number | null
          slowest_api_ms: number | null
          slowest_api_url: string | null
          smoke_run_id: number
          tbt_ms: number | null
          transfer_kb: number | null
          ttfb_ms: number | null
          url: string | null
          warnings: Json
        }
        Insert: {
          api_calls?: number | null
          api_kb?: number | null
          cls?: number | null
          cls_sources?: Json | null
          errors?: Json
          fcp_ms?: number | null
          http_status?: number | null
          js_kb?: number | null
          largest_api?: Json | null
          lcp_element?: string | null
          lcp_ms?: number | null
          load_ms?: number | null
          ok: boolean
          page_type: string
          requests?: number | null
          slowest_api_ms?: number | null
          slowest_api_url?: string | null
          smoke_run_id: number
          tbt_ms?: number | null
          transfer_kb?: number | null
          ttfb_ms?: number | null
          url?: string | null
          warnings?: Json
        }
        Update: {
          api_calls?: number | null
          api_kb?: number | null
          cls?: number | null
          cls_sources?: Json | null
          errors?: Json
          fcp_ms?: number | null
          http_status?: number | null
          js_kb?: number | null
          largest_api?: Json | null
          lcp_element?: string | null
          lcp_ms?: number | null
          load_ms?: number | null
          ok?: boolean
          page_type?: string
          requests?: number | null
          slowest_api_ms?: number | null
          slowest_api_url?: string | null
          smoke_run_id?: number
          tbt_ms?: number | null
          transfer_kb?: number | null
          ttfb_ms?: number | null
          url?: string | null
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "smoke_page_results_smoke_run_id_fkey"
            columns: ["smoke_run_id"]
            isOneToOne: false
            referencedRelation: "smoke_latest"
            referencedColumns: ["smoke_run_id"]
          },
          {
            foreignKeyName: "smoke_page_results_smoke_run_id_fkey"
            columns: ["smoke_run_id"]
            isOneToOne: false
            referencedRelation: "smoke_runs"
            referencedColumns: ["smoke_run_id"]
          },
        ]
      }
      smoke_runs: {
        Row: {
          base_url: string
          finished_at: string | null
          kind: string
          median_js_kb: number | null
          median_lcp_ms: number | null
          median_ttfb_ms: number | null
          mode: string
          pages_failed: number
          pages_tested: number
          pages_warned: number
          smoke_run_id: number
          started_at: string
          summary: string | null
          workflow_run_id: number | null
        }
        Insert: {
          base_url: string
          finished_at?: string | null
          kind: string
          median_js_kb?: number | null
          median_lcp_ms?: number | null
          median_ttfb_ms?: number | null
          mode: string
          pages_failed: number
          pages_tested: number
          pages_warned: number
          smoke_run_id?: never
          started_at: string
          summary?: string | null
          workflow_run_id?: number | null
        }
        Update: {
          base_url?: string
          finished_at?: string | null
          kind?: string
          median_js_kb?: number | null
          median_lcp_ms?: number | null
          median_ttfb_ms?: number | null
          mode?: string
          pages_failed?: number
          pages_tested?: number
          pages_warned?: number
          smoke_run_id?: never
          started_at?: string
          summary?: string | null
          workflow_run_id?: number | null
        }
        Relationships: []
      }
      social_audit_log: {
        Row: {
          action: string
          actor: string | null
          at: string
          audit_id: number
          candidate_id: number | null
          detail: Json
        }
        Insert: {
          action: string
          actor?: string | null
          at?: string
          audit_id?: never
          candidate_id?: number | null
          detail?: Json
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string
          audit_id?: never
          candidate_id?: number | null
          detail?: Json
        }
        Relationships: []
      }
      social_detector_runs: {
        Row: {
          candidates_created: number
          error: string | null
          finished_at: string | null
          results: Json
          run_id: number
          started_at: string
          triggered_by: string
        }
        Insert: {
          candidates_created?: number
          error?: string | null
          finished_at?: string | null
          results?: Json
          run_id?: never
          started_at?: string
          triggered_by?: string
        }
        Update: {
          candidates_created?: number
          error?: string | null
          finished_at?: string | null
          results?: Json
          run_id?: never
          started_at?: string
          triggered_by?: string
        }
        Relationships: []
      }
      social_fixture_forecast_obs: {
        Row: {
          away_goals: number
          away_team_id: number
          fixture_id: number
          home_goals: number
          home_team_id: number
          kickoff_date: string | null
          method: string
          model_version: string
          obs_id: number
          observed_at: string
          source_at: string | null
        }
        Insert: {
          away_goals: number
          away_team_id: number
          fixture_id: number
          home_goals: number
          home_team_id: number
          kickoff_date?: string | null
          method: string
          model_version: string
          obs_id?: never
          observed_at?: string
          source_at?: string | null
        }
        Update: {
          away_goals?: number
          away_team_id?: number
          fixture_id?: number
          home_goals?: number
          home_team_id?: number
          kickoff_date?: string | null
          method?: string
          model_version?: string
          obs_id?: never
          observed_at?: string
          source_at?: string | null
        }
        Relationships: []
      }
      social_post_candidates: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          auto: boolean
          candidate_id: number
          created_at: string
          dedupe_key: string
          detector_run_id: number | null
          expires_at: string
          generated_text: string
          held: boolean
          hold_until: string | null
          last_error: string | null
          model_version: string | null
          notified_at: string | null
          post_type: string
          publication_status: string
          publish_attempts: number
          published_at: string | null
          rejected_reason: string | null
          scheduled_for: string | null
          snapshot_at: string
          source_data: Json
          sport: string
          text: string
          thread: Json | null
          updated_at: string
          validated_at: string
          validation_errors: Json
          validation_status: string
          x_post_id: string | null
          x_post_ids: Json | null
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          auto?: boolean
          candidate_id?: never
          created_at?: string
          dedupe_key: string
          detector_run_id?: number | null
          expires_at: string
          generated_text: string
          held?: boolean
          hold_until?: string | null
          last_error?: string | null
          model_version?: string | null
          notified_at?: string | null
          post_type: string
          publication_status?: string
          publish_attempts?: number
          published_at?: string | null
          rejected_reason?: string | null
          scheduled_for?: string | null
          snapshot_at: string
          source_data: Json
          sport?: string
          text: string
          thread?: Json | null
          updated_at?: string
          validated_at?: string
          validation_errors?: Json
          validation_status: string
          x_post_id?: string | null
          x_post_ids?: Json | null
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          auto?: boolean
          candidate_id?: never
          created_at?: string
          dedupe_key?: string
          detector_run_id?: number | null
          expires_at?: string
          generated_text?: string
          held?: boolean
          hold_until?: string | null
          last_error?: string | null
          model_version?: string | null
          notified_at?: string | null
          post_type?: string
          publication_status?: string
          publish_attempts?: number
          published_at?: string | null
          rejected_reason?: string | null
          scheduled_for?: string | null
          snapshot_at?: string
          source_data?: Json
          sport?: string
          text?: string
          thread?: Json | null
          updated_at?: string
          validated_at?: string
          validation_errors?: Json
          validation_status?: string
          x_post_id?: string | null
          x_post_ids?: Json | null
        }
        Relationships: []
      }
      social_publish_attempts: {
        Row: {
          attempt_id: number
          blocked_reasons: Json
          candidate_id: number
          error: string | null
          estimated_cost_usd: number
          finished_at: string | null
          has_url: boolean
          http_status: number | null
          mode: string
          outcome: string | null
          posts: number
          request_text: string | null
          requested_by: string | null
          started_at: string
          x_post_id: string | null
        }
        Insert: {
          attempt_id?: never
          blocked_reasons?: Json
          candidate_id: number
          error?: string | null
          estimated_cost_usd?: number
          finished_at?: string | null
          has_url?: boolean
          http_status?: number | null
          mode: string
          outcome?: string | null
          posts?: number
          request_text?: string | null
          requested_by?: string | null
          started_at?: string
          x_post_id?: string | null
        }
        Update: {
          attempt_id?: never
          blocked_reasons?: Json
          candidate_id?: number
          error?: string | null
          estimated_cost_usd?: number
          finished_at?: string | null
          has_url?: boolean
          http_status?: number | null
          mode?: string
          outcome?: string | null
          posts?: number
          request_text?: string | null
          requested_by?: string | null
          started_at?: string
          x_post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_publish_attempts_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "social_post_candidates"
            referencedColumns: ["candidate_id"]
          },
        ]
      }
      social_settings: {
        Row: {
          allow_urls: boolean
          allowed_x_user_id: string | null
          allowed_x_username: string
          auto_post_types: string[]
          auto_publish_enabled: boolean
          breaker_reason: string | null
          breaker_tripped_at: string | null
          cost_per_post_usd: number
          cost_per_post_with_url_usd: number
          detector_enabled: boolean
          hold_minutes: number
          id: boolean
          kill_switch: boolean
          live_enabled: boolean
          max_links_per_week: number
          max_live_attempts: number
          max_posts_per_day: number
          max_posts_per_month: number
          min_minutes_between_posts: number
          monthly_budget_usd: number
          notify_email: string | null
          post_hours_from: number
          post_hours_to: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_urls?: boolean
          allowed_x_user_id?: string | null
          allowed_x_username?: string
          auto_post_types?: string[]
          auto_publish_enabled?: boolean
          breaker_reason?: string | null
          breaker_tripped_at?: string | null
          cost_per_post_usd?: number
          cost_per_post_with_url_usd?: number
          detector_enabled?: boolean
          hold_minutes?: number
          id?: boolean
          kill_switch?: boolean
          live_enabled?: boolean
          max_links_per_week?: number
          max_live_attempts?: number
          max_posts_per_day?: number
          max_posts_per_month?: number
          min_minutes_between_posts?: number
          monthly_budget_usd?: number
          notify_email?: string | null
          post_hours_from?: number
          post_hours_to?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_urls?: boolean
          allowed_x_user_id?: string | null
          allowed_x_username?: string
          auto_post_types?: string[]
          auto_publish_enabled?: boolean
          breaker_reason?: string | null
          breaker_tripped_at?: string | null
          cost_per_post_usd?: number
          cost_per_post_with_url_usd?: number
          detector_enabled?: boolean
          hold_minutes?: number
          id?: boolean
          kill_switch?: boolean
          live_enabled?: boolean
          max_links_per_week?: number
          max_live_attempts?: number
          max_posts_per_day?: number
          max_posts_per_month?: number
          min_minutes_between_posts?: number
          monthly_budget_usd?: number
          notify_email?: string | null
          post_hours_from?: number
          post_hours_to?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      social_x_connection: {
        Row: {
          access_expires_at: string | null
          connected_at: string | null
          connected_by: string | null
          id: boolean
          last_error: string | null
          last_refreshed_at: string | null
          scopes: string | null
          status: string
          token_version: number
          updated_at: string
          vault_secret_id: string | null
          x_user_id: string | null
          x_username: string | null
        }
        Insert: {
          access_expires_at?: string | null
          connected_at?: string | null
          connected_by?: string | null
          id?: boolean
          last_error?: string | null
          last_refreshed_at?: string | null
          scopes?: string | null
          status?: string
          token_version?: number
          updated_at?: string
          vault_secret_id?: string | null
          x_user_id?: string | null
          x_username?: string | null
        }
        Update: {
          access_expires_at?: string | null
          connected_at?: string | null
          connected_by?: string | null
          id?: boolean
          last_error?: string | null
          last_refreshed_at?: string | null
          scopes?: string | null
          status?: string
          token_version?: number
          updated_at?: string
          vault_secret_id?: string | null
          x_user_id?: string | null
          x_username?: string | null
        }
        Relationships: []
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
            referencedRelation: "fixture_changes_net"
            referencedColumns: ["fixture_id"]
          },
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
            referencedRelation: "fixture_player_expected_minutes_resolved_v3_raw"
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
            referencedRelation: "fixtures_reported_unconfirmed"
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
            referencedRelation: "fpl_player_fixture_availability"
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
            foreignKeyName: "tactical_team_match_observations_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_fixture_id_fkey"
            columns: ["canonical_fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
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
            foreignKeyName: "tactical_team_match_observations_canonical_team_id_fkey"
            columns: ["canonical_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_team_id_fkey"
            columns: ["canonical_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_team_id_fkey"
            columns: ["canonical_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "tactical_team_match_observations_canonical_team_id_fkey"
            columns: ["canonical_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
          {
            foreignKeyName: "team_aliases_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "team_aliases_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "team_aliases_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "team_aliases_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
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
          {
            foreignKeyName: "team_category_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "team_category_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "team_category_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "team_category_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
        ]
      }
      team_finishing_position_projection: {
        Row: {
          current_actual_points: number
          current_played: number
          league_id: number
          method: string
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
          method?: string
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
          method?: string
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
          {
            foreignKeyName: "team_finishing_position_projection_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "team_finishing_position_projection_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "team_finishing_position_projection_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "team_finishing_position_projection_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
        ]
      }
      team_match_snapshot: {
        Row: {
          cum_goals_against: number
          cum_goals_for: number
          deduction: number
          drawn: number
          goal_difference: number
          goals_against: number
          goals_for: number
          league_id: number
          lost: number
          match_date: string
          match_id: number
          matches_played: number
          opponent_team_id: number
          points: number
          points_won: number
          position_at_played: number
          position_on_date: number
          refreshed_at: string
          result: string
          season_id: number
          team_id: number
          teams_at_played: number
          teams_in_league: number
          venue: string
          won: number
        }
        Insert: {
          cum_goals_against: number
          cum_goals_for: number
          deduction: number
          drawn: number
          goal_difference: number
          goals_against: number
          goals_for: number
          league_id: number
          lost: number
          match_date: string
          match_id: number
          matches_played: number
          opponent_team_id: number
          points: number
          points_won: number
          position_at_played: number
          position_on_date: number
          refreshed_at?: string
          result: string
          season_id: number
          team_id: number
          teams_at_played: number
          teams_in_league: number
          venue: string
          won: number
        }
        Update: {
          cum_goals_against?: number
          cum_goals_for?: number
          deduction?: number
          drawn?: number
          goal_difference?: number
          goals_against?: number
          goals_for?: number
          league_id?: number
          lost?: number
          match_date?: string
          match_id?: number
          matches_played?: number
          opponent_team_id?: number
          points?: number
          points_won?: number
          position_at_played?: number
          position_on_date?: number
          refreshed_at?: string
          result?: string
          season_id?: number
          team_id?: number
          teams_at_played?: number
          teams_in_league?: number
          venue?: string
          won?: number
        }
        Relationships: []
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
            referencedRelation: "fixture_changes_net"
            referencedColumns: ["fixture_id"]
          },
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
            referencedRelation: "fixture_player_expected_minutes_resolved_v3_raw"
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
            referencedRelation: "fixtures_reported_unconfirmed"
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
            referencedRelation: "fpl_player_fixture_availability"
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
            foreignKeyName: "team_match_tactics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_match_tactics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_match_tactics_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
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
          {
            foreignKeyName: "team_match_tactics_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "team_match_tactics_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "team_match_tactics_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "team_match_tactics_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
        ]
      }
      team_player_other_positions: {
        Row: {
          depth_rank: number
          fpl_player_id: number
          season_id: number
          set_at: string
          tactical_role: string
          team_id: number
        }
        Insert: {
          depth_rank: number
          fpl_player_id: number
          season_id?: number
          set_at?: string
          tactical_role: string
          team_id: number
        }
        Update: {
          depth_rank?: number
          fpl_player_id?: number
          season_id?: number
          set_at?: string
          tactical_role?: string
          team_id?: number
        }
        Relationships: []
      }
      team_player_tactical_defaults: {
        Row: {
          confidence: number
          depth_rank: number | null
          depth_rank_source: string | null
          fpl_player_id: number
          manual_return_date: string | null
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
          manual_return_date?: string | null
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
          manual_return_date?: string | null
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
      team_player_tactical_defaults_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          fpl_player_id: number
          id: number
          new_rank: number | null
          new_rank_source: string | null
          new_role: string | null
          new_source: string | null
          old_rank: number | null
          old_role: string | null
          old_source: string | null
          season_id: number
          team_id: number
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          fpl_player_id: number
          id?: number
          new_rank?: number | null
          new_rank_source?: string | null
          new_role?: string | null
          new_source?: string | null
          old_rank?: number | null
          old_role?: string | null
          old_source?: string | null
          season_id: number
          team_id: number
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          fpl_player_id?: number
          id?: number
          new_rank?: number | null
          new_rank_source?: string | null
          new_role?: string | null
          new_source?: string | null
          old_rank?: number | null
          old_role?: string | null
          old_source?: string | null
          season_id?: number
          team_id?: number
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
            foreignKeyName: "team_ratings_estimated_from_team_id_fkey"
            columns: ["estimated_from_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "team_ratings_estimated_from_team_id_fkey"
            columns: ["estimated_from_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "team_ratings_estimated_from_team_id_fkey"
            columns: ["estimated_from_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "team_ratings_estimated_from_team_id_fkey"
            columns: ["estimated_from_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
          {
            foreignKeyName: "team_ratings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "team_ratings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "team_ratings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "team_ratings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
          {
            foreignKeyName: "team_slug_history_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "team_slug_history_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "team_slug_history_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "team_slug_history_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
          {
            foreignKeyName: "team_strength_manual_override_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "team_strength_manual_override_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "team_strength_manual_override_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "team_strength_manual_override_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
          official_website_url: string | null
          slug: string
          team_id: number
        }
        Insert: {
          canonical_name: string
          country_id: number
          created_at?: string
          display_name: string
          official_website_url?: string | null
          slug: string
          team_id?: never
        }
        Update: {
          canonical_name?: string
          country_id?: number
          created_at?: string
          display_name?: string
          official_website_url?: string | null
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
      broadcast_unmatched_classified: {
        Row: {
          airtable_record_id: string | null
          away_raw: string | null
          category: string | null
          competition_label: string | null
          first_seen_at: string | null
          home_raw: string | null
          is_past: boolean | null
          kickoff_date: string | null
          last_seen_at: string | null
          reason: string | null
        }
        Insert: {
          airtable_record_id?: string | null
          away_raw?: string | null
          category?: never
          competition_label?: string | null
          first_seen_at?: string | null
          home_raw?: string | null
          is_past?: never
          kickoff_date?: string | null
          last_seen_at?: string | null
          reason?: string | null
        }
        Update: {
          airtable_record_id?: string | null
          away_raw?: string | null
          category?: never
          competition_label?: string | null
          first_seen_at?: string | null
          home_raw?: string | null
          is_past?: never
          kickoff_date?: string | null
          last_seen_at?: string | null
          reason?: string | null
        }
        Relationships: []
      }
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
          {
            foreignKeyName: "finance_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "finance_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "finance_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "finance_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
          },
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
          {
            foreignKeyName: "finance_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "finance_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "finance_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "finance_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
          {
            foreignKeyName: "finance_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "finance_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "finance_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "finance_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
        ]
      }
      fixture_changes_net: {
        Row: {
          away_team_name: string | null
          changed_at: string | null
          changes_logged: number | null
          fixture_id: number | null
          home_team_name: string | null
          league_code: string | null
          league_id: number | null
          league_name: string | null
          now_date: string | null
          now_time: string | null
          slug: string | null
          status: string | null
          was_date: string | null
          was_time: string | null
        }
        Relationships: [
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "fixtures_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
        ]
      }
      fixture_market_latest: {
        Row: {
          captured_at: string | null
          fixture_id: number | null
          market_away: number | null
          market_draw: number | null
          market_home: number | null
          price_away: number | null
          price_draw: number | null
          price_home: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_changes_net"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_fallback"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixture_player_expected_minutes_resolved_v3_raw"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures_reported_unconfirmed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_defensive_contribution_projection_leaguewide"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fallback_start_probability_v6"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_fixture_bps_projection_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_player_fixture_availability"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_prediction_actual_start_comparison"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_data_health"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_fixture_readiness"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_allocation_v2"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_final"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_leaguewide_points"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_secondary_scoring"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_projection_v4_leaguewide_inputs"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_season_fixture_feed"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_adjustments_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fpl_set_piece_fixture_exposure_v1"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "fixture_odds_snapshots_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["fixture_id"]
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
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
        ]
      }
      fixture_player_expected_minutes_resolved_v3_raw: {
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
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
      fixtures_reported_unconfirmed: {
        Row: {
          away_team_id: number | null
          fixture_id: number | null
          home_team_id: number | null
          kickoff_date: string | null
          league_id: number | null
          reported_at: string | null
          reported_away_goals: number | null
          reported_home_goals: number | null
          reported_source: string | null
          season_id: number | null
          slug: string | null
        }
        Insert: {
          away_team_id?: number | null
          fixture_id?: number | null
          home_team_id?: number | null
          kickoff_date?: string | null
          league_id?: number | null
          reported_at?: string | null
          reported_away_goals?: number | null
          reported_home_goals?: number | null
          reported_source?: string | null
          season_id?: number | null
          slug?: string | null
        }
        Update: {
          away_team_id?: number | null
          fixture_id?: number | null
          home_team_id?: number | null
          kickoff_date?: string | null
          league_id?: number | null
          reported_at?: string | null
          reported_away_goals?: number | null
          reported_home_goals?: number | null
          reported_source?: string | null
          season_id?: number | null
          slug?: string | null
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
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
            referencedRelation: "league_season_display_names"
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
            foreignKeyName: "fixtures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
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
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
      fpl_gameweek_reports_latest: {
        Row: {
          fpl_event_id: number | null
          frozen: boolean | null
          generated_at: string | null
          kind: string | null
          payload: Json | null
          published_at: string | null
          reddit_md: string | null
          report_id: number | null
          season_id: number | null
          season_label: string | null
          summary: string | null
          title: string | null
          version: number | null
          x_thread: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fpl_gameweek_reports_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "fpl_gameweek_reports_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
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
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
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
      fpl_player_fixture_availability: {
        Row: {
          availability: number | null
          chance_of_playing_next_round: number | null
          fixture_id: number | null
          fpl_event_id: number | null
          fpl_player_id: number | null
          gameweeks_ahead: number | null
          kickoff_date: string | null
          return_date: string | null
          rule: string | null
          status: string | null
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
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
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
          fpl_event_id: number | null
          kickoff_date: string | null
          lineup_player_rows: number | null
          lineup_sources: number | null
          production_model: string | null
          projection_rows: number | null
          projection_status: string | null
          readiness_status: string | null
          team_forecast_ready: boolean | null
        }
        Relationships: []
      }
      fpl_projection_fixture_readiness: {
        Row: {
          away_team_id: number | null
          fixture_id: number | null
          fpl_event_id: number | null
          generated_at: string | null
          has_team_xg: boolean | null
          home_team_id: number | null
          in_horizon: boolean | null
          kickoff_date: string | null
          lineup_player_rows: number | null
          lineup_sources: number | null
          other_model_rows: number | null
          predicted_away_goals: number | null
          predicted_home_goals: number | null
          production_model: string | null
          projected_players: number | null
          projection_rows: number | null
          readiness_status: string | null
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
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
        ]
      }
      fpl_review_projections_v6: {
        Row: {
          expected_fpl_points: number | null
          expected_minutes: number | null
          fixture_id: number | null
          fpl_event_id: number | null
          fpl_player_id: number | null
          generated_at: string | null
          season_id: number | null
          source: string | null
          start_probability: number | null
        }
        Relationships: []
      }
      fpl_scoring_regression: {
        Row: {
          level: string | null
          mismatches: number | null
          note: string | null
          rows_tested: number | null
          season_id: number | null
          start_year: number | null
        }
        Relationships: []
      }
      fpl_scoring_rule_sets: {
        Row: {
          appearance_min: number | null
          appearance_pts: number | null
          assist_pts: number | null
          clean_sheet_min: number | null
          clean_sheet_pts: number | null
          conceded_per: number | null
          conceded_pts: number | null
          defcon_min: number | null
          defcon_pts: number | null
          element_type: number | null
          full_min: number | null
          full_pts: number | null
          goal_pts: number | null
          own_goal_pts: number | null
          penalty_miss_pts: number | null
          penalty_save_pts: number | null
          position: string | null
          red_pts: number | null
          save_pts: number | null
          saves_per: number | null
          season_id: number | null
          yellow_pts: number | null
        }
        Relationships: []
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
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fixtures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
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
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "fpl_players_canonical_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
            referencedRelation: "league_season_display_names"
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
          {
            foreignKeyName: "team_ratings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "team_ratings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "team_ratings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "team_ratings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
        ]
      }
      history_league_matches: {
        Row: {
          away_goals: number | null
          away_team_id: number | null
          home_goals: number | null
          home_team_id: number | null
          league_id: number | null
          margin: number | null
          match_date: string | null
          match_id: number | null
          season_id: number | null
          start_year: number | null
          total_goals: number | null
        }
        Relationships: []
      }
      history_streaks: {
        Row: {
          end_date: string | null
          end_match_id: number | null
          end_season_id: number | null
          league_id: number | null
          length: number | null
          ongoing: boolean | null
          start_date: string | null
          start_match_id: number | null
          start_season_id: number | null
          streak_type: string | null
          team_id: number | null
          truncated_start: boolean | null
        }
        Relationships: []
      }
      intl_club_callups: {
        Row: {
          callups: Json | null
          club: string | null
          club_elo: number | null
          club_elo_rank: number | null
          club_key: string | null
          club_slug: string | null
          league_country: string | null
          nations: number | null
          players: number | null
        }
        Relationships: []
      }
      intl_club_elo: {
        Row: {
          club: string | null
          club_slug: string | null
          country: string | null
          elo: number | null
          fetched_on: string | null
          internationals: number | null
          level: number | null
          rank: number | null
        }
        Insert: {
          club?: string | null
          club_slug?: string | null
          country?: string | null
          elo?: number | null
          fetched_on?: string | null
          internationals?: never
          level?: number | null
          rank?: number | null
        }
        Update: {
          club?: string | null
          club_slug?: string | null
          country?: string | null
          elo?: number | null
          fetched_on?: string | null
          internationals?: never
          level?: number | null
          rank?: number | null
        }
        Relationships: []
      }
      intl_competitions: {
        Row: {
          confederation: string | null
          kind: string | null
          matches: number | null
          name: string | null
          slug: string | null
        }
        Insert: {
          confederation?: string | null
          kind?: string | null
          matches?: number | null
          name?: string | null
          slug?: string | null
        }
        Update: {
          confederation?: string | null
          kind?: string | null
          matches?: number | null
          name?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      intl_edition_summary: {
        Row: {
          competition: string | null
          competition_slug: string | null
          edition_key: string | null
          final_key: string | null
          first_match: string | null
          goals: number | null
          hosts: string[] | null
          label: string | null
          last_match: string | null
          matches: number | null
          runner_up: string | null
          runner_up_slug: string | null
          season_start: number | null
          teams: number | null
          winner: string | null
          winner_slug: string | null
        }
        Relationships: []
      }
      intl_editions: {
        Row: {
          competition: string | null
          competition_slug: string | null
          edition_key: string | null
          first_match: string | null
          hosts: string[] | null
          label: string | null
          last_match: string | null
          matches: number | null
          season_start: number | null
          stage_source: string | null
          teams: number | null
        }
        Relationships: []
      }
      intl_fixtures: {
        Row: {
          away_score: number | null
          away_slug: string | null
          away_team: string | null
          edition_key: string | null
          fixture_key: string | null
          group_label: string | null
          home_score: number | null
          home_slug: string | null
          home_team: string | null
          kickoff_utc: string | null
          match_key: string | null
          p_away: number | null
          p_draw: number | null
          p_home: number | null
          round_number: number | null
          scores: Json | null
          venue: string | null
          xg_away: number | null
          xg_home: number | null
        }
        Relationships: []
      }
      intl_goals: {
        Row: {
          match_key: string | null
          minute: number | null
          own_goal: boolean | null
          penalty: boolean | null
          scorer: string | null
          seq: number | null
          team: string | null
        }
        Insert: {
          match_key?: string | null
          minute?: number | null
          own_goal?: boolean | null
          penalty?: boolean | null
          scorer?: string | null
          seq?: number | null
          team?: string | null
        }
        Update: {
          match_key?: string | null
          minute?: number | null
          own_goal?: boolean | null
          penalty?: boolean | null
          scorer?: string | null
          seq?: number | null
          team?: string | null
        }
        Relationships: []
      }
      intl_group_odds: {
        Row: {
          edition_key: string | null
          exp_points: number | null
          gd: number | null
          gf: number | null
          group_label: string | null
          p_pos: number[] | null
          played: number | null
          points: number | null
          sims: number | null
          slug: string | null
          team: string | null
          updated_at: string | null
          zones: Json | null
        }
        Relationships: []
      }
      intl_groups: {
        Row: {
          edition_key: string | null
          group_key: string | null
          label: string | null
          league: string | null
          size: number | null
          stage_code: string | null
          teams: string[] | null
        }
        Relationships: []
      }
      intl_league_exports: {
        Row: {
          clubs: number | null
          foreign_players: number | null
          league_country: string | null
          nations: number | null
          players: number | null
        }
        Relationships: []
      }
      intl_matches: {
        Row: {
          away_name: string | null
          away_score: number | null
          away_score_90: number | null
          away_slug: string | null
          away_team: string | null
          city: string | null
          competition: string | null
          competition_kind: string | null
          competition_slug: string | null
          country: string | null
          edition_key: string | null
          elo_away_pre: number | null
          elo_change: number | null
          elo_home_pre: number | null
          group_label: string | null
          home_name: string | null
          home_score: number | null
          home_score_90: number | null
          home_slug: string | null
          home_team: string | null
          match_date: string | null
          match_key: string | null
          matchday: number | null
          neutral: boolean | null
          shootout_winner: string | null
          stage_code: string | null
          stage_name: string | null
          stage_type: string | null
          went_extra_time: boolean | null
        }
        Relationships: []
      }
      intl_model_info: {
        Row: {
          fitted_through: number | null
          model: string | null
          params: Json | null
          updated_at: string | null
        }
        Insert: {
          fitted_through?: number | null
          model?: string | null
          params?: Json | null
          updated_at?: string | null
        }
        Update: {
          fitted_through?: number | null
          model?: string | null
          params?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      intl_pair_records: {
        Row: {
          a_goals: number | null
          a_won: number | null
          b_goals: number | null
          b_won: number | null
          drawn: number | null
          first_meeting: string | null
          last_meeting: string | null
          played: number | null
          team_a: string | null
          team_b: string | null
        }
        Insert: {
          a_goals?: number | null
          a_won?: number | null
          b_goals?: number | null
          b_won?: number | null
          drawn?: number | null
          first_meeting?: string | null
          last_meeting?: string | null
          played?: number | null
          team_a?: string | null
          team_b?: string | null
        }
        Update: {
          a_goals?: number | null
          a_won?: number | null
          b_goals?: number | null
          b_won?: number | null
          drawn?: number | null
          first_meeting?: string | null
          last_meeting?: string | null
          played?: number | null
          team_a?: string | null
          team_b?: string | null
        }
        Relationships: []
      }
      intl_squad_club_strength: {
        Row: {
          abroad: number | null
          at_home: number | null
          avg_club_elo: number | null
          confederation: string | null
          league_countries: number | null
          players: number | null
          rated: number | null
          slug: string | null
          team: string | null
        }
        Relationships: []
      }
      intl_squad_players: {
        Row: {
          birth_date: string | null
          caps: number | null
          club: string | null
          club_country: string | null
          club_elo: number | null
          club_elo_rank: number | null
          club_league_country: string | null
          club_slug: string | null
          club_wiki: string | null
          clubelo_name: string | null
          goals: number | null
          latest_date: string | null
          latest_text: string | null
          list: string | null
          number: number | null
          player: string | null
          position: string | null
          seq: number | null
          slug: string | null
          status: string | null
          team: string | null
          wiki_title: string | null
        }
        Relationships: []
      }
      intl_squad_snapshot_players: {
        Row: {
          caps: number | null
          club: string | null
          club_slug: string | null
          goals: number | null
          latest_date: string | null
          latest_text: string | null
          list: string | null
          number: number | null
          player: string | null
          player_key: string | null
          position: string | null
          slug: string | null
          status: string | null
          team: string | null
          version_at: string | null
          wiki_title: string | null
        }
        Relationships: []
      }
      intl_squad_versions: {
        Row: {
          intro: string | null
          intro_signature: string | null
          players: number | null
          slug: string | null
          team: string | null
          version_at: string | null
        }
        Relationships: []
      }
      intl_squads: {
        Row: {
          caps_as_of: string | null
          fetched_at: string | null
          intro: string | null
          players: number | null
          revision_at: string | null
          slug: string | null
          team: string | null
          wiki_title: string | null
        }
        Relationships: []
      }
      intl_stages: {
        Row: {
          code: string | null
          edition_key: string | null
          name: string | null
          stage_key: string | null
          stage_order: number | null
          type: string | null
        }
        Insert: {
          code?: string | null
          edition_key?: string | null
          name?: string | null
          stage_key?: string | null
          stage_order?: number | null
          type?: string | null
        }
        Update: {
          code?: string | null
          edition_key?: string | null
          name?: string | null
          stage_key?: string | null
          stage_order?: number | null
          type?: string | null
        }
        Relationships: []
      }
      intl_team_competition_totals: {
        Row: {
          competition: string | null
          competition_kind: string | null
          drawn: number | null
          first_match: string | null
          goals_against: number | null
          goals_for: number | null
          last_match: string | null
          lost: number | null
          played: number | null
          team: string | null
          won: number | null
        }
        Relationships: []
      }
      intl_team_names: {
        Row: {
          name: string | null
          team: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          name?: string | null
          team?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          name?: string | null
          team?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      intl_team_summary: {
        Row: {
          confederation: string | null
          drawn: number | null
          elo: number | null
          elo_peak: number | null
          elo_peak_date: string | null
          elo_rank: number | null
          euro_titles: number | null
          first_match: string | null
          goals_against: number | null
          goals_for: number | null
          last_match: string | null
          lost: number | null
          played: number | null
          slug: string | null
          team: string | null
          titles: Json | null
          unl_titles: number | null
          wc_titles: number | null
          won: number | null
        }
        Insert: {
          confederation?: string | null
          drawn?: number | null
          elo?: number | null
          elo_peak?: number | null
          elo_peak_date?: string | null
          elo_rank?: number | null
          euro_titles?: number | null
          first_match?: string | null
          goals_against?: number | null
          goals_for?: number | null
          last_match?: string | null
          lost?: number | null
          played?: number | null
          slug?: string | null
          team?: string | null
          titles?: Json | null
          unl_titles?: number | null
          wc_titles?: number | null
          won?: number | null
        }
        Update: {
          confederation?: string | null
          drawn?: number | null
          elo?: number | null
          elo_peak?: number | null
          elo_peak_date?: string | null
          elo_rank?: number | null
          euro_titles?: number | null
          first_match?: string | null
          goals_against?: number | null
          goals_for?: number | null
          last_match?: string | null
          lost?: number | null
          played?: number | null
          slug?: string | null
          team?: string | null
          titles?: Json | null
          unl_titles?: number | null
          wc_titles?: number | null
          won?: number | null
        }
        Relationships: []
      }
      intl_team_year_elo: {
        Row: {
          confederation: string | null
          elo: number | null
          name: string | null
          played: number | null
          rank: number | null
          slug: string | null
          team: string | null
          year: number | null
        }
        Relationships: []
      }
      intl_teams: {
        Row: {
          confederation: string | null
          first_match: string | null
          is_confederation_member: boolean | null
          last_match: string | null
          matches: number | null
          slug: string | null
          team: string | null
        }
        Insert: {
          confederation?: string | null
          first_match?: string | null
          is_confederation_member?: never
          last_match?: string | null
          matches?: number | null
          slug?: string | null
          team?: string | null
        }
        Update: {
          confederation?: string | null
          first_match?: string | null
          is_confederation_member?: never
          last_match?: string | null
          matches?: number | null
          slug?: string | null
          team?: string | null
        }
        Relationships: []
      }
      intl_upsets: {
        Row: {
          away_name: string | null
          away_score: number | null
          away_score_90: number | null
          away_slug: string | null
          away_team: string | null
          city: string | null
          competition: string | null
          competition_kind: string | null
          competition_slug: string | null
          country: string | null
          edition_key: string | null
          elo_away_pre: number | null
          elo_change: number | null
          elo_home_pre: number | null
          expectation: number | null
          group_label: string | null
          home_name: string | null
          home_score: number | null
          home_score_90: number | null
          home_slug: string | null
          home_team: string | null
          kind: string | null
          match_date: string | null
          match_key: string | null
          matchday: number | null
          neutral: boolean | null
          shootout_winner: string | null
          stage_code: string | null
          stage_name: string | null
          stage_type: string | null
          went_extra_time: boolean | null
        }
        Relationships: []
      }
      intlw_club_callups: {
        Row: {
          callups: Json | null
          club: string | null
          club_elo: number | null
          club_elo_rank: number | null
          club_key: string | null
          club_slug: string | null
          league_country: string | null
          nations: number | null
          players: number | null
        }
        Relationships: []
      }
      intlw_club_elo: {
        Row: {
          club: string | null
          club_slug: string | null
          country: string | null
          elo: number | null
          fetched_on: string | null
          internationals: number | null
          level: number | null
          rank: number | null
        }
        Insert: {
          club?: string | null
          club_slug?: string | null
          country?: string | null
          elo?: number | null
          fetched_on?: string | null
          internationals?: never
          level?: number | null
          rank?: number | null
        }
        Update: {
          club?: string | null
          club_slug?: string | null
          country?: string | null
          elo?: number | null
          fetched_on?: string | null
          internationals?: never
          level?: number | null
          rank?: number | null
        }
        Relationships: []
      }
      intlw_competitions: {
        Row: {
          confederation: string | null
          kind: string | null
          matches: number | null
          name: string | null
          slug: string | null
        }
        Insert: {
          confederation?: string | null
          kind?: string | null
          matches?: number | null
          name?: string | null
          slug?: string | null
        }
        Update: {
          confederation?: string | null
          kind?: string | null
          matches?: number | null
          name?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      intlw_edition_summary: {
        Row: {
          competition: string | null
          competition_slug: string | null
          edition_key: string | null
          final_key: string | null
          first_match: string | null
          goals: number | null
          hosts: string[] | null
          label: string | null
          last_match: string | null
          matches: number | null
          runner_up: string | null
          runner_up_slug: string | null
          season_start: number | null
          teams: number | null
          winner: string | null
          winner_slug: string | null
        }
        Relationships: []
      }
      intlw_editions: {
        Row: {
          competition: string | null
          competition_slug: string | null
          edition_key: string | null
          first_match: string | null
          hosts: string[] | null
          label: string | null
          last_match: string | null
          matches: number | null
          season_start: number | null
          stage_source: string | null
          teams: number | null
        }
        Relationships: []
      }
      intlw_fixtures: {
        Row: {
          away_score: number | null
          away_slug: string | null
          away_team: string | null
          edition_key: string | null
          fixture_key: string | null
          group_label: string | null
          home_score: number | null
          home_slug: string | null
          home_team: string | null
          kickoff_utc: string | null
          match_key: string | null
          p_away: number | null
          p_draw: number | null
          p_home: number | null
          round_number: number | null
          scores: Json | null
          venue: string | null
          xg_away: number | null
          xg_home: number | null
        }
        Relationships: []
      }
      intlw_goals: {
        Row: {
          match_key: string | null
          minute: number | null
          own_goal: boolean | null
          penalty: boolean | null
          scorer: string | null
          seq: number | null
          team: string | null
        }
        Insert: {
          match_key?: string | null
          minute?: number | null
          own_goal?: boolean | null
          penalty?: boolean | null
          scorer?: string | null
          seq?: number | null
          team?: string | null
        }
        Update: {
          match_key?: string | null
          minute?: number | null
          own_goal?: boolean | null
          penalty?: boolean | null
          scorer?: string | null
          seq?: number | null
          team?: string | null
        }
        Relationships: []
      }
      intlw_group_odds: {
        Row: {
          edition_key: string | null
          exp_points: number | null
          gd: number | null
          gf: number | null
          group_label: string | null
          p_pos: number[] | null
          played: number | null
          points: number | null
          sims: number | null
          slug: string | null
          team: string | null
          updated_at: string | null
          zones: Json | null
        }
        Relationships: []
      }
      intlw_groups: {
        Row: {
          edition_key: string | null
          group_key: string | null
          label: string | null
          league: string | null
          size: number | null
          stage_code: string | null
          teams: string[] | null
        }
        Relationships: []
      }
      intlw_league_exports: {
        Row: {
          clubs: number | null
          foreign_players: number | null
          league_country: string | null
          nations: number | null
          players: number | null
        }
        Relationships: []
      }
      intlw_matches: {
        Row: {
          away_name: string | null
          away_score: number | null
          away_score_90: number | null
          away_slug: string | null
          away_team: string | null
          city: string | null
          competition: string | null
          competition_kind: string | null
          competition_slug: string | null
          country: string | null
          edition_key: string | null
          elo_away_pre: number | null
          elo_change: number | null
          elo_home_pre: number | null
          group_label: string | null
          home_name: string | null
          home_score: number | null
          home_score_90: number | null
          home_slug: string | null
          home_team: string | null
          match_date: string | null
          match_key: string | null
          matchday: number | null
          neutral: boolean | null
          shootout_winner: string | null
          stage_code: string | null
          stage_name: string | null
          stage_type: string | null
          went_extra_time: boolean | null
        }
        Relationships: []
      }
      intlw_model_info: {
        Row: {
          fitted_through: number | null
          model: string | null
          params: Json | null
          updated_at: string | null
        }
        Insert: {
          fitted_through?: number | null
          model?: string | null
          params?: Json | null
          updated_at?: string | null
        }
        Update: {
          fitted_through?: number | null
          model?: string | null
          params?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      intlw_pair_records: {
        Row: {
          a_goals: number | null
          a_won: number | null
          b_goals: number | null
          b_won: number | null
          drawn: number | null
          first_meeting: string | null
          last_meeting: string | null
          played: number | null
          team_a: string | null
          team_b: string | null
        }
        Insert: {
          a_goals?: number | null
          a_won?: number | null
          b_goals?: number | null
          b_won?: number | null
          drawn?: number | null
          first_meeting?: string | null
          last_meeting?: string | null
          played?: number | null
          team_a?: string | null
          team_b?: string | null
        }
        Update: {
          a_goals?: number | null
          a_won?: number | null
          b_goals?: number | null
          b_won?: number | null
          drawn?: number | null
          first_meeting?: string | null
          last_meeting?: string | null
          played?: number | null
          team_a?: string | null
          team_b?: string | null
        }
        Relationships: []
      }
      intlw_squad_club_strength: {
        Row: {
          abroad: number | null
          at_home: number | null
          avg_club_elo: number | null
          confederation: string | null
          league_countries: number | null
          players: number | null
          rated: number | null
          slug: string | null
          team: string | null
        }
        Relationships: []
      }
      intlw_squad_players: {
        Row: {
          birth_date: string | null
          caps: number | null
          club: string | null
          club_country: string | null
          club_elo: number | null
          club_elo_rank: number | null
          club_league_country: string | null
          club_slug: string | null
          club_wiki: string | null
          clubelo_name: string | null
          goals: number | null
          latest_date: string | null
          latest_text: string | null
          list: string | null
          number: number | null
          player: string | null
          position: string | null
          seq: number | null
          slug: string | null
          status: string | null
          team: string | null
          wiki_title: string | null
        }
        Relationships: []
      }
      intlw_squad_snapshot_players: {
        Row: {
          caps: number | null
          club: string | null
          club_slug: string | null
          goals: number | null
          latest_date: string | null
          latest_text: string | null
          list: string | null
          number: number | null
          player: string | null
          player_key: string | null
          position: string | null
          slug: string | null
          status: string | null
          team: string | null
          version_at: string | null
          wiki_title: string | null
        }
        Relationships: []
      }
      intlw_squad_versions: {
        Row: {
          intro: string | null
          intro_signature: string | null
          players: number | null
          slug: string | null
          team: string | null
          version_at: string | null
        }
        Relationships: []
      }
      intlw_squads: {
        Row: {
          caps_as_of: string | null
          fetched_at: string | null
          intro: string | null
          players: number | null
          revision_at: string | null
          slug: string | null
          team: string | null
          wiki_title: string | null
        }
        Relationships: []
      }
      intlw_stages: {
        Row: {
          code: string | null
          edition_key: string | null
          name: string | null
          stage_key: string | null
          stage_order: number | null
          type: string | null
        }
        Insert: {
          code?: string | null
          edition_key?: string | null
          name?: string | null
          stage_key?: string | null
          stage_order?: number | null
          type?: string | null
        }
        Update: {
          code?: string | null
          edition_key?: string | null
          name?: string | null
          stage_key?: string | null
          stage_order?: number | null
          type?: string | null
        }
        Relationships: []
      }
      intlw_team_competition_totals: {
        Row: {
          competition: string | null
          competition_kind: string | null
          drawn: number | null
          first_match: string | null
          goals_against: number | null
          goals_for: number | null
          last_match: string | null
          lost: number | null
          played: number | null
          team: string | null
          won: number | null
        }
        Relationships: []
      }
      intlw_team_names: {
        Row: {
          name: string | null
          team: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          name?: string | null
          team?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          name?: string | null
          team?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      intlw_team_summary: {
        Row: {
          confederation: string | null
          drawn: number | null
          elo: number | null
          elo_peak: number | null
          elo_peak_date: string | null
          elo_rank: number | null
          euro_titles: number | null
          first_match: string | null
          goals_against: number | null
          goals_for: number | null
          last_match: string | null
          lost: number | null
          played: number | null
          slug: string | null
          team: string | null
          titles: Json | null
          unl_titles: number | null
          wc_titles: number | null
          won: number | null
        }
        Insert: {
          confederation?: string | null
          drawn?: number | null
          elo?: number | null
          elo_peak?: number | null
          elo_peak_date?: string | null
          elo_rank?: number | null
          euro_titles?: number | null
          first_match?: string | null
          goals_against?: number | null
          goals_for?: number | null
          last_match?: string | null
          lost?: number | null
          played?: number | null
          slug?: string | null
          team?: string | null
          titles?: Json | null
          unl_titles?: number | null
          wc_titles?: number | null
          won?: number | null
        }
        Update: {
          confederation?: string | null
          drawn?: number | null
          elo?: number | null
          elo_peak?: number | null
          elo_peak_date?: string | null
          elo_rank?: number | null
          euro_titles?: number | null
          first_match?: string | null
          goals_against?: number | null
          goals_for?: number | null
          last_match?: string | null
          lost?: number | null
          played?: number | null
          slug?: string | null
          team?: string | null
          titles?: Json | null
          unl_titles?: number | null
          wc_titles?: number | null
          won?: number | null
        }
        Relationships: []
      }
      intlw_team_year_elo: {
        Row: {
          confederation: string | null
          elo: number | null
          name: string | null
          played: number | null
          rank: number | null
          slug: string | null
          team: string | null
          year: number | null
        }
        Relationships: []
      }
      intlw_teams: {
        Row: {
          confederation: string | null
          first_match: string | null
          is_confederation_member: boolean | null
          last_match: string | null
          matches: number | null
          slug: string | null
          team: string | null
        }
        Insert: {
          confederation?: string | null
          first_match?: string | null
          is_confederation_member?: never
          last_match?: string | null
          matches?: number | null
          slug?: string | null
          team?: string | null
        }
        Update: {
          confederation?: string | null
          first_match?: string | null
          is_confederation_member?: never
          last_match?: string | null
          matches?: number | null
          slug?: string | null
          team?: string | null
        }
        Relationships: []
      }
      intlw_upsets: {
        Row: {
          away_name: string | null
          away_score: number | null
          away_score_90: number | null
          away_slug: string | null
          away_team: string | null
          city: string | null
          competition: string | null
          competition_kind: string | null
          competition_slug: string | null
          country: string | null
          edition_key: string | null
          elo_away_pre: number | null
          elo_change: number | null
          elo_home_pre: number | null
          expectation: number | null
          group_label: string | null
          home_name: string | null
          home_score: number | null
          home_score_90: number | null
          home_slug: string | null
          home_team: string | null
          kind: string | null
          match_date: string | null
          match_key: string | null
          matchday: number | null
          neutral: boolean | null
          shootout_winner: string | null
          stage_code: string | null
          stage_name: string | null
          stage_type: string | null
          went_extra_time: boolean | null
        }
        Relationships: []
      }
      job_health: {
        Row: {
          area: string | null
          expected_interval: string | null
          failures_7d: number | null
          health_status: string | null
          job_key: string | null
          last_attempt: string | null
          last_duration: string | null
          last_error: string | null
          last_rows_changed: number | null
          last_status: string | null
          last_success: string | null
          location: string | null
          max_duration: string | null
          notes: string | null
          output_check: string | null
          run_log: string | null
          runs_7d: number | null
          schedule: string | null
          stuck_runs: number | null
          upstream: string | null
        }
        Relationships: []
      }
      job_registry_gaps: {
        Row: {
          gap: string | null
          name: string | null
        }
        Relationships: []
      }
      job_runs_unified: {
        Row: {
          error: string | null
          finished_at: string | null
          rows_changed: number | null
          run_id: string | null
          run_key: string | null
          run_log: string | null
          started_at: string | null
          status: string | null
        }
        Relationships: []
      }
      lab_f1_dataset: {
        Row: {
          close_away: number | null
          close_draw: number | null
          close_home: number | null
          dc_as_of: string | null
          dc_away: number | null
          dc_draw: number | null
          dc_home: number | null
          league_id: number | null
          match_date: string | null
          match_id: number | null
          open_away: number | null
          open_draw: number | null
          open_home: number | null
          result: string | null
          start_year: number | null
        }
        Relationships: [
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "matches_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
        ]
      }
      lab_f4_lines: {
        Row: {
          ag: number | null
          away_team_id: number | null
          hg: number | null
          home_team_id: number | null
          league_id: number | null
          match_date: string | null
          match_id: number | null
          p_away: number | null
          p_draw: number | null
          p_home: number | null
          p_over: number | null
          start_year: number | null
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
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "matches_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
        ]
      }
      lab_market_probs: {
        Row: {
          basic_away: number | null
          basic_draw: number | null
          basic_home: number | null
          bookmaker: string | null
          is_closing: boolean | null
          match_id: number | null
          overround: number | null
          power_away: number | null
          power_draw: number | null
          power_home: number | null
          shin_away: number | null
          shin_draw: number | null
          shin_home: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "lab_f1_dataset"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "match_odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "lab_f4_lines"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "match_odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "market_closing_lines"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "match_odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["match_id"]
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
      league_pace_benchmarks: {
        Row: {
          comparable_group: string | null
          league_id: number | null
          matches_played: number | null
          max_points: number | null
          mean_points: number | null
          min_points: number | null
          outcome: string | null
          p10: number | null
          p25: number | null
          p50: number | null
          p75: number | null
          p90: number | null
          team_seasons: number | null
        }
        Relationships: []
      }
      league_season_display_names: {
        Row: {
          league_id: number | null
          name: string | null
          season_id: number | null
        }
        Relationships: []
      }
      league_season_summary: {
        Row: {
          avg_winning_margin: number | null
          away_goals_per_game: number | null
          away_win_share: number | null
          champion_points: number | null
          champion_ppg: number | null
          clean_sheet_share: number | null
          clubs: number | null
          comparable_group: string | null
          covid_affected: boolean | null
          curtailed: boolean | null
          draw_share: number | null
          games_in_season: number | null
          goalless_share: number | null
          goals_per_game: number | null
          half_time_coverage: number | null
          highest_relegated_points: number | null
          home_goals_per_game: number | null
          home_ppg_advantage: number | null
          home_win_share: number | null
          is_final: boolean | null
          league_code: string | null
          league_id: number | null
          lowest_safe_points: number | null
          matches: number | null
          noll_scully: number | null
          points_spread: number | null
          ppg_sd: number | null
          season_id: number | null
          season_label: string | null
          split_format: boolean | null
          start_year: number | null
          stats_coverage: number | null
        }
        Relationships: []
      }
      league_standings: {
        Row: {
          away_clean_sheets: number | null
          away_drawn: number | null
          away_goals_against: number | null
          away_goals_for: number | null
          away_lost: number | null
          away_played: number | null
          away_points: number | null
          away_won: number | null
          clean_sheets: number | null
          curtailed: boolean | null
          deduction: number | null
          drawn: number | null
          failed_to_score: number | null
          goals_against: number | null
          goals_for: number | null
          home_clean_sheets: number | null
          home_drawn: number | null
          home_goals_against: number | null
          home_goals_for: number | null
          home_lost: number | null
          home_played: number | null
          home_points: number | null
          home_won: number | null
          is_final: boolean | null
          league_code: string | null
          league_id: number | null
          league_name: string | null
          lost: number | null
          played: number | null
          points: number | null
          points_won: number | null
          position: number | null
          ppg: number | null
          pyramid_position: number | null
          ranked_on: string | null
          season_id: number | null
          season_label: string | null
          season_start_year: number | null
          split_adjustment: number | null
          split_group: number | null
          team_id: number | null
          teams: number | null
          tier: number | null
          won: number | null
        }
        Insert: {
          away_clean_sheets?: number | null
          away_drawn?: number | null
          away_goals_against?: number | null
          away_goals_for?: number | null
          away_lost?: number | null
          away_played?: number | null
          away_points?: number | null
          away_won?: number | null
          clean_sheets?: number | null
          curtailed?: boolean | null
          deduction?: number | null
          drawn?: number | null
          failed_to_score?: number | null
          goals_against?: number | null
          goals_for?: number | null
          home_clean_sheets?: number | null
          home_drawn?: number | null
          home_goals_against?: number | null
          home_goals_for?: number | null
          home_lost?: number | null
          home_played?: number | null
          home_points?: number | null
          home_won?: number | null
          is_final?: boolean | null
          league_code?: string | null
          league_id?: number | null
          league_name?: string | null
          lost?: number | null
          played?: number | null
          points?: number | null
          points_won?: number | null
          position?: number | null
          ppg?: number | null
          pyramid_position?: number | null
          ranked_on?: string | null
          season_id?: number | null
          season_label?: string | null
          season_start_year?: number | null
          split_adjustment?: number | null
          split_group?: number | null
          team_id?: number | null
          teams?: number | null
          tier?: number | null
          won?: number | null
        }
        Update: {
          away_clean_sheets?: number | null
          away_drawn?: number | null
          away_goals_against?: number | null
          away_goals_for?: number | null
          away_lost?: number | null
          away_played?: number | null
          away_points?: number | null
          away_won?: number | null
          clean_sheets?: number | null
          curtailed?: boolean | null
          deduction?: number | null
          drawn?: number | null
          failed_to_score?: number | null
          goals_against?: number | null
          goals_for?: number | null
          home_clean_sheets?: number | null
          home_drawn?: number | null
          home_goals_against?: number | null
          home_goals_for?: number | null
          home_lost?: number | null
          home_played?: number | null
          home_points?: number | null
          home_won?: number | null
          is_final?: boolean | null
          league_code?: string | null
          league_id?: number | null
          league_name?: string | null
          lost?: number | null
          played?: number | null
          points?: number | null
          points_won?: number | null
          position?: number | null
          ppg?: number | null
          pyramid_position?: number | null
          ranked_on?: string | null
          season_id?: number | null
          season_label?: string | null
          season_start_year?: number | null
          split_adjustment?: number | null
          split_group?: number | null
          team_id?: number | null
          teams?: number | null
          tier?: number | null
          won?: number | null
        }
        Relationships: []
      }
      league_standings_live: {
        Row: {
          away_clean_sheets: number | null
          away_drawn: number | null
          away_goals_against: number | null
          away_goals_for: number | null
          away_lost: number | null
          away_played: number | null
          away_points: number | null
          away_won: number | null
          clean_sheets: number | null
          curtailed: boolean | null
          deduction: number | null
          drawn: number | null
          failed_to_score: number | null
          goals_against: number | null
          goals_for: number | null
          home_clean_sheets: number | null
          home_drawn: number | null
          home_goals_against: number | null
          home_goals_for: number | null
          home_lost: number | null
          home_played: number | null
          home_points: number | null
          home_won: number | null
          is_final: boolean | null
          league_code: string | null
          league_id: number | null
          league_name: string | null
          lost: number | null
          played: number | null
          points: number | null
          points_won: number | null
          position: number | null
          ppg: number | null
          pyramid_position: number | null
          ranked_on: string | null
          season_id: number | null
          season_label: string | null
          season_start_year: number | null
          split_adjustment: number | null
          split_group: number | null
          team_id: number | null
          teams: number | null
          tier: number | null
          won: number | null
        }
        Relationships: []
      }
      league_table_reliability: {
        Row: {
          comparable_group: string | null
          league_id: number | null
          matches_played: number | null
          mean_abs_position_change: number | null
          rank_correlation: number | null
          same_position_share: number | null
          seasons: number | null
        }
        Relationships: []
      }
      market_closing_lines: {
        Row: {
          away_team_id: number | null
          home_team_id: number | null
          league_id: number | null
          match_date: string | null
          match_id: number | null
          p_away: number | null
          p_draw: number | null
          p_home: number | null
          p_over: number | null
          season_id: number | null
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
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
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
            referencedRelation: "league_season_display_names"
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "matches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["season_id"]
          },
        ]
      }
      meta_catalogue_gaps: {
        Row: {
          definition_changed_at: string | null
          gap: string | null
          kind: string | null
          layer: string | null
          node_key: string | null
          purpose_reviewed_at: string | null
          status: string | null
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
        Insert: {
          commentary?: string | null
          definition_changes?: never
          feeds_from?: never
          feeds_into?: never
          first_seen?: string | null
          is_present?: boolean | null
          kind?: string | null
          last_definition_change?: never
          last_seen?: string | null
          layer?: string | null
          node_key?: string | null
          obj_name?: string | null
          purpose?: string | null
          reads_from?: never
          refresh_note?: string | null
          row_estimate?: number | null
        }
        Update: {
          commentary?: string | null
          definition_changes?: never
          feeds_from?: never
          feeds_into?: never
          first_seen?: string | null
          is_present?: boolean | null
          kind?: string | null
          last_definition_change?: never
          last_seen?: string | null
          layer?: string | null
          node_key?: string | null
          obj_name?: string | null
          purpose?: string | null
          reads_from?: never
          refresh_note?: string | null
          row_estimate?: number | null
        }
        Relationships: []
      }
      model_scorecard_matches: {
        Row: {
          ag: number | null
          fit_run_id: number | null
          hg: number | null
          la: number | null
          league_id: number | null
          lh: number | null
          m_away: number | null
          m_draw: number | null
          m_home: number | null
          match_date: string | null
          match_id: number | null
          model_version: string | null
          p_away: number | null
          p_draw: number | null
          p_home: number | null
          phase: string | null
          result: string | null
          season_id: number | null
          team_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_fit_runs_model_version_fkey"
            columns: ["model_version"]
            isOneToOne: false
            referencedRelation: "model_versions"
            referencedColumns: ["version"]
          },
        ]
      }
      model_vs_market_by_league: {
        Row: {
          from_date: string | null
          league_id: number | null
          market_brier: number | null
          market_log_loss: number | null
          matches: number | null
          model_brier: number | null
          model_log_loss: number | null
          to_date: string | null
        }
        Relationships: []
      }
      nfl_depth_by_game: {
        Row: {
          as_of: string | null
          depth: number | null
          game_id: string | null
          gameday: string | null
          player_id: string | null
          player_name: string | null
          position: string | null
          season: number | null
          slot: string | null
          source: string | null
          team: string | null
          week: number | null
        }
        Relationships: []
      }
      nfl_depth_latest: {
        Row: {
          as_of: string | null
          depth: number | null
          player_id: string | null
          player_name: string | null
          player_slug: string | null
          position: string | null
          season: number | null
          slot: number | null
          snapshot_at: string | null
          team: string | null
        }
        Relationships: []
      }
      nfl_game_model: {
        Row: {
          game_id: string | null
          home_edge: number | null
          market_p_home: number | null
          model_version: string | null
          p_home: number | null
          predicted_at: string | null
          predicted_margin: number | null
          spread_line: number | null
          total_line: number | null
        }
        Relationships: []
      }
      nfl_games: {
        Row: {
          away_franchise: string | null
          away_name: string | null
          away_qb_name: string | null
          away_score: number | null
          away_short: string | null
          away_slug: string | null
          div_game: boolean | null
          game_id: string | null
          game_type: string | null
          gameday: string | null
          home_franchise: string | null
          home_name: string | null
          home_qb_name: string | null
          home_score: number | null
          home_short: string | null
          home_slug: string | null
          kickoff_at: string | null
          neutral_site: boolean | null
          overtime: boolean | null
          roof: string | null
          season: number | null
          spread_line: number | null
          stadium: string | null
          surface: string | null
          total_line: number | null
          week: number | null
        }
        Relationships: []
      }
      nfl_lab_games: {
        Row: {
          away_coach: string | null
          away_code: string | null
          away_franchise: string | null
          away_moneyline: number | null
          away_qb_id: string | null
          away_qb_name: string | null
          away_rest: number | null
          away_score: number | null
          away_spread_odds: number | null
          div_game: boolean | null
          game_id: string | null
          game_type: string | null
          gameday: string | null
          gametime: string | null
          home_coach: string | null
          home_code: string | null
          home_franchise: string | null
          home_moneyline: number | null
          home_qb_id: string | null
          home_qb_name: string | null
          home_rest: number | null
          home_score: number | null
          home_spread_odds: number | null
          imported_at: string | null
          kickoff_at: string | null
          neutral_site: boolean | null
          over_odds: number | null
          overtime: boolean | null
          roof: string | null
          season: number | null
          spread_line: number | null
          stadium: string | null
          surface: string | null
          temp: number | null
          total_line: number | null
          under_odds: number | null
          week: number | null
          wind: number | null
        }
        Relationships: []
      }
      nfl_player_seasons: {
        Row: {
          attempts: number | null
          best_ppr: number | null
          carries: number | null
          completions: number | null
          fg_att: number | null
          fg_made: number | null
          fumbles_lost: number | null
          games: number | null
          interceptions: number | null
          last_week: number | null
          last3_ppg_half: number | null
          last3_ppg_ppr: number | null
          last3_ppg_std: number | null
          passing_tds: number | null
          passing_yards: number | null
          pat_made: number | null
          player_id: string | null
          player_name: string | null
          player_slug: string | null
          position: string | null
          ppg_half: number | null
          ppg_ppr: number | null
          ppg_std: number | null
          pts_half: number | null
          pts_ppr: number | null
          pts_std: number | null
          receiving_tds: number | null
          receiving_yards: number | null
          receptions: number | null
          rushing_tds: number | null
          rushing_yards: number | null
          sd_ppr: number | null
          season: number | null
          target_share: number | null
          targets: number | null
          team: string | null
          team_short: string | null
          team_slug: string | null
        }
        Relationships: []
      }
      nfl_player_snaps: {
        Row: {
          defense_pct: number | null
          defense_snaps: number | null
          game_id: string | null
          game_type: string | null
          offense_pct: number | null
          offense_snaps: number | null
          opponent: string | null
          pfr_player_id: string | null
          player_id: string | null
          player_name: string | null
          player_slug: string | null
          position: string | null
          season: number | null
          st_pct: number | null
          st_snaps: number | null
          team: string | null
          team_offense_snaps: number | null
          team_slug: string | null
          week: number | null
        }
        Relationships: []
      }
      nfl_player_weeks: {
        Row: {
          air_yards_share: number | null
          at_home: boolean | null
          attempts: number | null
          carries: number | null
          completions: number | null
          fg_att: number | null
          fg_made: number | null
          fumbles_lost: number | null
          game_id: string | null
          gameday: string | null
          interceptions: number | null
          kickoff_at: string | null
          opponent: string | null
          opponent_score: number | null
          opponent_short: string | null
          opponent_slug: string | null
          passing_tds: number | null
          passing_yards: number | null
          pat_made: number | null
          pat_missed: number | null
          player_id: string | null
          player_name: string | null
          player_slug: string | null
          position: string | null
          pts_half: number | null
          pts_ppr: number | null
          pts_std: number | null
          receiving_tds: number | null
          receiving_yards: number | null
          receptions: number | null
          rushing_tds: number | null
          rushing_yards: number | null
          sacks: number | null
          season: number | null
          season_type: string | null
          special_teams_tds: number | null
          target_share: number | null
          targets: number | null
          team: string | null
          team_score: number | null
          two_pt: number | null
          week: number | null
          wopr: number | null
        }
        Relationships: []
      }
      nfl_players: {
        Row: {
          birth_date: string | null
          college: string | null
          draft_pick: number | null
          draft_round: number | null
          draft_year: number | null
          height_in: number | null
          jersey_number: number | null
          name: string | null
          player_id: string | null
          position: string | null
          position_group: string | null
          rookie_season: number | null
          slug: string | null
          status: string | null
          team: string | null
          team_name: string | null
          team_slug: string | null
          weight_lb: number | null
          years_exp: number | null
        }
        Relationships: []
      }
      nfl_points_allowed: {
        Row: {
          defence: string | null
          defence_name: string | null
          defence_short: string | null
          defence_slug: string | null
          games: number | null
          half_per_game: number | null
          position: string | null
          ppr_per_game: number | null
          ppr_rank: number | null
          season: number | null
          std_per_game: number | null
        }
        Relationships: []
      }
      nfl_projections: {
        Row: {
          at_home: boolean | null
          base_ppr: number | null
          computed_at: string | null
          game_id: string | null
          gameday: string | null
          games_used: number | null
          high_ppr: number | null
          injury: string | null
          injury_status: string | null
          kickoff_at: string | null
          low_ppr: number | null
          method: string | null
          opp_factor: number | null
          opponent: string | null
          opponent_short: string | null
          opponent_slug: string | null
          player_id: string | null
          player_name: string | null
          player_slug: string | null
          position: string | null
          practice_status: string | null
          proj_half: number | null
          proj_ppr: number | null
          proj_std: number | null
          season: number | null
          season_avg_ppr: number | null
          team: string | null
          team_implied: number | null
          team_name: string | null
          team_short: string | null
          team_slug: string | null
          team_usual: number | null
          week: number | null
        }
        Relationships: []
      }
      nfl_season_summary: {
        Row: {
          favourite_win_share: number | null
          home_win_share: number | null
          neutral_games: number | null
          one_score_share: number | null
          overtime_games: number | null
          points_per_game: number | null
          reg_games: number | null
          reg_played: number | null
          season: number | null
          ties: number | null
        }
        Relationships: []
      }
      nfl_standings: {
        Row: {
          away_lost: number | null
          away_won: number | null
          conf_lost: number | null
          conf_won: number | null
          conference: string | null
          div_lost: number | null
          div_tied: number | null
          div_won: number | null
          division: string | null
          division_rank: number | null
          franchise: string | null
          home_lost: number | null
          home_won: number | null
          lost: number | null
          played: number | null
          playoff_result: string | null
          playoff_round: number | null
          point_diff: number | null
          points_against: number | null
          points_for: number | null
          season: number | null
          season_complete: boolean | null
          short_name: string | null
          slug: string | null
          team_name: string | null
          tied: number | null
          win_pct: number | null
          won: number | null
          won_division: boolean | null
        }
        Relationships: []
      }
      nfl_team_games: {
        Row: {
          attempts: number | null
          carries: number | null
          completions: number | null
          def_sacks: number | null
          def_st_tds: number | null
          dst_points: number | null
          fg_att: number | null
          fg_made: number | null
          first_downs: number | null
          franchise: string | null
          game_id: string | null
          giveaways: number | null
          opp_attempts: number | null
          opp_carries: number | null
          opp_fg_made: number | null
          opp_pass_yards_net: number | null
          opp_passing_tds: number | null
          opp_plays: number | null
          opp_rushing_tds: number | null
          opp_rushing_yards: number | null
          opponent: string | null
          pass_yards_net: number | null
          passing_epa: number | null
          passing_tds: number | null
          pat_made: number | null
          penalties: number | null
          penalty_yards: number | null
          plays: number | null
          points_against: number | null
          points_for: number | null
          rushing_epa: number | null
          rushing_tds: number | null
          rushing_yards: number | null
          sacks_suffered: number | null
          season: number | null
          season_type: string | null
          takeaways: number | null
          week: number | null
        }
        Relationships: []
      }
      nfl_team_seasons: {
        Row: {
          attempts: number | null
          carries: number | null
          conference: string | null
          def_sacks: number | null
          def_st_tds: number | null
          division: string | null
          dst_points: number | null
          first_downs: number | null
          franchise: string | null
          games: number | null
          giveaways: number | null
          offence_epa: number | null
          opp_attempts: number | null
          opp_carries: number | null
          opp_pass_tds: number | null
          opp_pass_yards: number | null
          opp_plays: number | null
          opp_rush_tds: number | null
          opp_rush_yards: number | null
          pass_tds: number | null
          pass_yards: number | null
          penalties: number | null
          penalty_yards: number | null
          plays: number | null
          points_against: number | null
          points_for: number | null
          rush_tds: number | null
          rush_yards: number | null
          sacks_suffered: number | null
          season: number | null
          short_name: string | null
          slug: string | null
          takeaways: number | null
          team_name: string | null
        }
        Relationships: []
      }
      nfl_teams: {
        Row: {
          conference: string | null
          division: string | null
          franchise: string | null
          name: string | null
          short_name: string | null
          slug: string | null
        }
        Insert: {
          conference?: string | null
          division?: string | null
          franchise?: string | null
          name?: string | null
          short_name?: string | null
          slug?: string | null
        }
        Update: {
          conference?: string | null
          division?: string | null
          franchise?: string | null
          name?: string | null
          short_name?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      sf_clubs: {
        Row: {
          club_id: string | null
          identity_category: string | null
          manager: string | null
          name: string | null
          short: string | null
          universe_id: string | null
        }
        Relationships: []
      }
      sf_entry_rounds: {
        Row: {
          bank: number | null
          captain_used: string | null
          entry_id: number | null
          hits: number | null
          picks: Json | null
          points: number | null
          round: number | null
          subs: Json | null
          total: number | null
          transfers: number | null
          wildcard: boolean | null
        }
        Relationships: []
      }
      sf_fixtures: {
        Row: {
          away: string | null
          away_goals: number | null
          away_id: string | null
          fixture_id: number | null
          home: string | null
          home_goals: number | null
          home_id: string | null
          kickoff_at: string | null
          kind: string | null
          round: number | null
          season_id: number | null
          shootout: Json | null
          status: string | null
        }
        Relationships: []
      }
      sf_leaderboard: {
        Row: {
          bot_kind: string | null
          display_name: string | null
          entry_id: number | null
          hits: number | null
          is_bot: boolean | null
          joined_round: number | null
          last_round: number | null
          season_id: number | null
          team_name: string | null
          total: number | null
        }
        Relationships: []
      }
      sf_league_table: {
        Row: {
          club_id: string | null
          d: number | null
          ga: number | null
          gd: number | null
          gf: number | null
          l: number | null
          p: number | null
          pts: number | null
          season_id: number | null
          w: number | null
        }
        Relationships: []
      }
      sf_match_events: {
        Row: {
          detail: Json | null
          fixture_id: number | null
          minute: number | null
          player: string | null
          player_id: string | null
          seq: number | null
          side: string | null
          type: string | null
        }
        Relationships: []
      }
      sf_my_team: {
        Row: {
          bank: number | null
          entry_id: number | null
          free_transfers: number | null
          is_captain: boolean | null
          is_vice: boolean | null
          player_id: string | null
          price: number | null
          purchase_price: number | null
          season_id: number | null
          selling_price: number | null
          slot: number | null
          team_name: string | null
          transfers_this_round: number | null
          wildcard_this_round: boolean | null
          wildcards_left: number | null
        }
        Relationships: []
      }
      sf_player_rounds: {
        Row: {
          assists: number | null
          bonus: number | null
          clean_sheet: boolean | null
          goals: number | null
          minutes: number | null
          player_id: string | null
          points: number | null
          red: number | null
          round: number | null
          saves: number | null
          season_id: number | null
          started: boolean | null
          yellow: number | null
        }
        Relationships: []
      }
      sf_players: {
        Row: {
          age: number | null
          attack: number | null
          available_from: number | null
          club: string | null
          club_id: string | null
          creativity: number | null
          defence: number | null
          discipline: number | null
          keeping: number | null
          name: string | null
          nationality: string | null
          next_x_points: number | null
          player_id: string | null
          position: string | null
          price: number | null
          season_id: number | null
          start_price: number | null
          total_points: number | null
          universe_id: string | null
        }
        Relationships: []
      }
      sf_price_history: {
        Row: {
          created_at: string | null
          from_round: number | null
          player_id: string | null
          price: number | null
          reason: string | null
          season_id: number | null
        }
        Insert: {
          created_at?: string | null
          from_round?: number | null
          player_id?: string | null
          price?: number | null
          reason?: string | null
          season_id?: number | null
        }
        Update: {
          created_at?: string | null
          from_round?: number | null
          player_id?: string | null
          price?: number | null
          reason?: string | null
          season_id?: number | null
        }
        Relationships: []
      }
      sf_projections: {
        Row: {
          made_after_round: number | null
          p_clean_sheet: number | null
          p_start: number | null
          player_id: string | null
          round: number | null
          season_id: number | null
          x_assists: number | null
          x_goals: number | null
          x_minutes: number | null
          x_points: number | null
        }
        Insert: {
          made_after_round?: number | null
          p_clean_sheet?: number | null
          p_start?: number | null
          player_id?: string | null
          round?: number | null
          season_id?: number | null
          x_assists?: number | null
          x_goals?: number | null
          x_minutes?: number | null
          x_points?: number | null
        }
        Update: {
          made_after_round?: number | null
          p_clean_sheet?: number | null
          p_start?: number | null
          player_id?: string | null
          round?: number | null
          season_id?: number | null
          x_assists?: number | null
          x_goals?: number | null
          x_minutes?: number | null
          x_points?: number | null
        }
        Relationships: []
      }
      sf_rounds: {
        Row: {
          deadline_at: string | null
          kickoff_at: string | null
          kind: string | null
          number: number | null
          season_id: number | null
          state: string | null
        }
        Insert: {
          deadline_at?: string | null
          kickoff_at?: string | null
          kind?: string | null
          number?: number | null
          season_id?: number | null
          state?: string | null
        }
        Update: {
          deadline_at?: string | null
          kickoff_at?: string | null
          kind?: string | null
          number?: number | null
          season_id?: number | null
          state?: string | null
        }
        Relationships: []
      }
      sf_seasons: {
        Row: {
          current_round: number | null
          is_test: boolean | null
          number: number | null
          open_round: number | null
          rules_version: string | null
          scoring_version: string | null
          season_id: number | null
          shield_winner: string | null
          state: string | null
          universe: string | null
          universe_id: string | null
        }
        Relationships: []
      }
      smoke_latest: {
        Row: {
          api_kb: number | null
          base_url: string | null
          cls: number | null
          cls_sources: Json | null
          errors: Json | null
          fcp_ms: number | null
          js_kb: number | null
          kind: string | null
          largest_api: Json | null
          lcp_element: string | null
          lcp_ms: number | null
          ok: boolean | null
          page_type: string | null
          requests: number | null
          slowest_api_ms: number | null
          slowest_api_url: string | null
          smoke_run_id: number | null
          started_at: string | null
          tbt_ms: number | null
          ttfb_ms: number | null
          url: string | null
          warnings: Json | null
        }
        Relationships: []
      }
      social_weekly_report: {
        Row: {
          approved: number | null
          blocked: number | null
          dry_runs: number | null
          failed: number | null
          generated: number | null
          live_attempts: number | null
          passed_checks: number | null
          post_type: string | null
          published: number | null
          rejected: number | null
          spend_usd: number | null
          superseded: number | null
          week_start: string | null
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
      team_season_movement: {
        Row: {
          is_promoted: boolean | null
          league_id: number | null
          movement: string | null
          previous_league_id: number | null
          season_id: number | null
          team_id: number | null
        }
        Relationships: []
      }
      team_season_summary: {
        Row: {
          away_drawn: number | null
          away_goals_against: number | null
          away_goals_for: number | null
          away_lost: number | null
          away_played: number | null
          away_points: number | null
          away_won: number | null
          champion: boolean | null
          clean_sheets: number | null
          clubs: number | null
          comparable_group: string | null
          curtailed: boolean | null
          deduction: number | null
          drawn: number | null
          failed_to_score: number | null
          games_in_season: number | null
          goal_difference: number | null
          goals_against: number | null
          goals_for: number | null
          home_drawn: number | null
          home_goals_against: number | null
          home_goals_for: number | null
          home_lost: number | null
          home_played: number | null
          home_points: number | null
          home_won: number | null
          is_final: boolean | null
          league_code: string | null
          league_id: number | null
          league_name: string | null
          lost: number | null
          next_league_id: number | null
          played: number | null
          points: number | null
          points_won: number | null
          position: number | null
          ppg: number | null
          promoted: boolean | null
          ranked_on: string | null
          relegated: boolean | null
          season_id: number | null
          season_label: string | null
          split_format: boolean | null
          split_group: number | null
          start_year: number | null
          team_id: number | null
          teams: number | null
          top_four: boolean | null
          top_six: boolean | null
          won: number | null
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
            referencedRelation: "league_season_display_names"
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
          {
            foreignKeyName: "team_ratings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "team_ratings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_broadcast_fixtures"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "team_ratings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "team_ratings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "upcoming_watch_guide"
            referencedColumns: ["home_team_id"]
          },
        ]
      }
      tennis_calendar: {
        Row: {
          channel: string | null
          city: string | null
          country: string | null
          event_id: number | null
          free_to_air: string | null
          last_winner: string | null
          last_winner_slug: string | null
          last_year: number | null
          level: string | null
          level_rank: number | null
          name: string | null
          slug: string | null
          surface: string | null
          tour: string | null
          usual_end: string | null
          usual_start: string | null
        }
        Relationships: []
      }
      tennis_editions: {
        Row: {
          city: string | null
          country: string | null
          end_date: string | null
          event_id: number | null
          event_slug: string | null
          final_key: string | null
          level: string | null
          level_rank: number | null
          location: string | null
          matches: number | null
          name: string | null
          runner_up: string | null
          runner_up_slug: string | null
          start_date: string | null
          surface: string | null
          tour: string | null
          tournament_id: number | null
          winner: string | null
          winner_slug: string | null
          year: number | null
        }
        Relationships: []
      }
      tennis_events: {
        Row: {
          city: string | null
          country: string | null
          editions: number | null
          event_id: number | null
          first_year: number | null
          last_year: number | null
          level: string | null
          level_rank: number | null
          name: string | null
          slug: string | null
          surface: string | null
          tour: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          editions?: number | null
          event_id?: number | null
          first_year?: number | null
          last_year?: number | null
          level?: string | null
          level_rank?: number | null
          name?: string | null
          slug?: string | null
          surface?: string | null
          tour?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          editions?: number | null
          event_id?: number | null
          first_year?: number | null
          last_year?: number | null
          level?: string | null
          level_rank?: number | null
          name?: string | null
          slug?: string | null
          surface?: string | null
          tour?: string | null
        }
        Relationships: []
      }
      tennis_match_model: {
        Row: {
          p_winner: number | null
          source_key: string | null
        }
        Insert: {
          p_winner?: number | null
          source_key?: string | null
        }
        Update: {
          p_winner?: number | null
          source_key?: string | null
        }
        Relationships: []
      }
      tennis_matches: {
        Row: {
          avg_l: number | null
          avg_w: number | null
          b365_l: number | null
          b365_w: number | null
          best_of: number | null
          bfe_l: number | null
          bfe_w: number | null
          court: string | null
          l_games: number[] | null
          l_pts: number | null
          l_rank: number | null
          l_sets: number | null
          level: string | null
          level_rank: number | null
          location: string | null
          loser: string | null
          loser_id: number | null
          loser_slug: string | null
          match_date: string | null
          max_l: number | null
          max_w: number | null
          played: boolean | null
          ps_l: number | null
          ps_w: number | null
          result: string | null
          round: string | null
          round_order: number | null
          series: string | null
          source_key: string | null
          status: string | null
          surface: string | null
          surface_group: string | null
          tour: string | null
          tournament: string | null
          tournament_id: number | null
          tournament_slug: string | null
          w_games: number[] | null
          w_pts: number | null
          w_rank: number | null
          w_sets: number | null
          winner: string | null
          winner_id: number | null
          winner_slug: string | null
          year: number | null
        }
        Relationships: []
      }
      tennis_model_record: {
        Row: {
          market_matches: number | null
          market_right: number | null
          matches: number | null
          model_brier: number | null
          model_right: number | null
          tour: string | null
          year: number | null
        }
        Relationships: []
      }
      tennis_player_editions: {
        Row: {
          champion: boolean | null
          event_id: number | null
          event_slug: string | null
          last_round: string | null
          last_round_order: number | null
          level: string | null
          level_rank: number | null
          lost: number | null
          name: string | null
          player_id: number | null
          slug: string | null
          start_date: string | null
          surface: string | null
          tour: string | null
          tournament_id: number | null
          won: number | null
          year: number | null
        }
        Relationships: []
      }
      tennis_player_splits: {
        Row: {
          finals: number | null
          level: string | null
          lost: number | null
          player_id: number | null
          slug: string | null
          surface: string | null
          titles: number | null
          tour: string | null
          won: number | null
          year: number | null
        }
        Relationships: []
      }
      tennis_player_years: {
        Row: {
          best_rank: number | null
          end_points: number | null
          end_rank: number | null
          finals: number | null
          lost: number | null
          name: string | null
          player_id: number | null
          slug: string | null
          titles: number | null
          tour: string | null
          won: number | null
          year: number | null
        }
        Relationships: []
      }
      tennis_players: {
        Row: {
          best_rank: number | null
          best_rank_date: string | null
          birth_date: string | null
          country: string | null
          finals: number | null
          first_match: string | null
          first_year: number | null
          full_name: string | null
          hand: string | null
          last_match: string | null
          last_year: number | null
          latest_rank: number | null
          latest_rank_date: string | null
          lost: number | null
          matches: number | null
          name: string | null
          player_id: number | null
          recent_matches: number | null
          slug: string | null
          titles: number | null
          tour: string | null
          wikidata_qid: string | null
          wins: number | null
          won: number | null
        }
        Relationships: []
      }
      tennis_ratings: {
        Row: {
          last_match: string | null
          latest_rank: number | null
          matches: number | null
          name: string | null
          player_id: number | null
          rating: number | null
          slug: string | null
          surface: string | null
          tour: string | null
        }
        Relationships: []
      }
      tennis_tournaments: {
        Row: {
          first_year: number | null
          last_year: number | null
          matches: number | null
          name: string | null
          slug: string | null
          tour: string | null
          tournament_id: number | null
        }
        Relationships: []
      }
      upcoming_broadcast_fixtures: {
        Row: {
          away_team_id: number | null
          away_team_name: string | null
          broadcast_id: number | null
          broadcaster: string | null
          channel: string | null
          country_name: string | null
          fixture_id: number | null
          home_team_id: number | null
          home_team_name: string | null
          is_free_to_air: boolean | null
          is_ppv: boolean | null
          is_subscription: boolean | null
          kickoff_date: string | null
          kickoff_time: string | null
          league_code: string | null
          league_id: number | null
          league_name: string | null
          market: string | null
          predicted_away_goals: number | null
          predicted_home_goals: number | null
          slug: string | null
          streaming_service: string | null
          watch_url: string | null
        }
        Relationships: [
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "fixtures_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
        ]
      }
      upcoming_watch_guide: {
        Row: {
          access_type: string | null
          availability_notes: string | null
          away_team_country: string | null
          away_team_id: number | null
          away_team_name: string | null
          broadcast_id: number | null
          broadcaster: string | null
          channel: string | null
          competition_type: string | null
          confidence: string | null
          country_name: string | null
          delivery_methods: string[] | null
          fixture_id: number | null
          home_team_country: string | null
          home_team_id: number | null
          home_team_name: string | null
          is_fast: boolean | null
          is_free_to_air: boolean | null
          is_live: boolean | null
          is_ppv: boolean | null
          is_subscription: boolean | null
          kickoff_date: string | null
          kickoff_time: string | null
          league_code: string | null
          league_id: number | null
          league_name: string | null
          league_tier: number | null
          market: string | null
          platform_device: string | null
          predicted_away_goals: number | null
          predicted_home_goals: number | null
          service_product: string | null
          slug: string | null
          source: string | null
          source_url: string | null
          status: string | null
          streaming_service: string | null
          uk_available: boolean | null
          verified_at: string | null
          watch_url: string | null
        }
        Relationships: [
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
            referencedRelation: "league_season_display_names"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "fixtures_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["league_id"]
          },
        ]
      }
    }
    Functions: {
      _check_auth_user_token_nulls_impl: {
        Args: never
        Returns: {
          bad_rows: number
        }[]
      }
      _get_data_integrity_report_impl: {
        Args: never
        Returns: {
          check_name: string
          detail: string
          status: string
        }[]
      }
      _get_public_read_audit_impl: {
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
      _require_admin: { Args: never; Returns: undefined }
      ai_benchmark_truth: { Args: { p_question_id: string }; Returns: Json }
      ai_credit_summary: { Args: never; Returns: Json }
      ai_current_season: { Args: { p_league_id: number }; Returns: number }
      ai_fpl_position: { Args: { p: number }; Returns: string }
      ai_lab_enqueue_batch: {
        Args: {
          p_model: string
          p_name: string
          p_prompt_id: string
          p_question_ids: string[]
        }
        Returns: number
      }
      ai_lab_process_queue: { Args: never; Returns: number }
      ai_next_fpl_gameweek: { Args: { p_season: number }; Returns: number }
      ai_norm: { Args: { p: string }; Returns: string }
      ai_resolve_competition: { Args: { p_name: string }; Returns: Json }
      ai_resolve_fpl_player: {
        Args: { p_name: string; p_season_id: number }
        Returns: Json
      }
      ai_resolve_season: {
        Args: { p_league_id: number; p_season: string }
        Returns: number
      }
      ai_resolve_team: { Args: { p_name: string }; Returns: Json }
      ai_season_label: { Args: { p_season_id: number }; Returns: string }
      ai_tool_best_fpl_combination: { Args: { args: Json }; Returns: Json }
      ai_tool_compare_fixture_runs: { Args: { args: Json }; Returns: Json }
      ai_tool_compare_fpl_players: { Args: { args: Json }; Returns: Json }
      ai_tool_find_entity: { Args: { args: Json }; Returns: Json }
      ai_tool_get_club_accounts: { Args: { args: Json }; Returns: Json }
      ai_tool_get_competition_summary: { Args: { args: Json }; Returns: Json }
      ai_tool_get_data_status: { Args: { args: Json }; Returns: Json }
      ai_tool_get_fixtures: { Args: { args: Json }; Returns: Json }
      ai_tool_get_fpl_players: { Args: { args: Json }; Returns: Json }
      ai_tool_get_fpl_projections: { Args: { args: Json }; Returns: Json }
      ai_tool_get_league_table: { Args: { args: Json }; Returns: Json }
      ai_tool_get_results: { Args: { args: Json }; Returns: Json }
      ai_tool_get_tv_listings: { Args: { args: Json }; Returns: Json }
      apply_uk_3pm_blackout: { Args: never; Returns: Json }
      backfill_fixture_predictions: { Args: never; Returns: number }
      backfill_historic_fixture_predictions: {
        Args: { target_season_id: number }
        Returns: number
      }
      backfill_match_odds: { Args: never; Returns: number }
      backfill_match_odds_for: {
        Args: { p_competition_code: string; p_season_label: string }
        Returns: number
      }
      backfill_match_predictions: {
        Args: { p_league_id: number; p_season_id: number }
        Returns: number
      }
      broadcast_confidence_rank: { Args: { p: string }; Returns: number }
      capture_upcoming_odds: { Args: never; Returns: Json }
      check_auth_user_token_nulls: {
        Args: never
        Returns: {
          bad_rows: number
        }[]
      }
      check_broadcast_integrity: {
        Args: never
        Returns: {
          check_name: string
          detail: string
          found: number
          status: string
        }[]
      }
      check_club_grounds: {
        Args: never
        Returns: {
          check_name: string
          detail: string
          found: number
          status: string
        }[]
      }
      check_fixture_feed_names: {
        Args: never
        Returns: {
          check_name: string
          detail: string
          found: number
          status: string
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
      check_ga_integrity: {
        Args: never
        Returns: {
          check_name: string
          detail: string
          found: number
          status: string
        }[]
      }
      check_gsc_integrity: {
        Args: never
        Returns: {
          check_name: string
          detail: string
          found: number
          status: string
        }[]
      }
      check_intl_integrity: {
        Args: never
        Returns: {
          check_name: string
          detail: string
          found: number
          status: string
        }[]
      }
      check_job_health: {
        Args: never
        Returns: {
          check_name: string
          detail: string
          found: number
          status: string
        }[]
      }
      check_model_integrity: {
        Args: never
        Returns: {
          check_name: string
          detail: string
          found: number
          status: string
        }[]
      }
      check_nfl_integrity: {
        Args: never
        Returns: {
          check_name: string
          detail: string
          found: number
          status: string
        }[]
      }
      check_tennis_integrity: {
        Args: never
        Returns: {
          check_name: string
          detail: string
          found: number
          status: string
        }[]
      }
      current_season_id: { Args: never; Returns: number }
      earlier_season: { Args: { a: number; b: number }; Returns: number }
      export_schema_definitions: {
        Args: never
        Returns: {
          definition: string
          kind: string
          name: string
        }[]
      }
      fanteam_projection_inputs: {
        Args: { p_matchweek: number }
        Returns: {
          element_type: number
          expected_assists: number
          expected_goals: number
          expected_minutes: number
          expected_saves: number
          first_name: string
          fixture_id: number
          fpl_code: number
          fpl_player_id: number
          generated_at: string
          is_home: boolean
          kickoff_date: string
          kickoff_time: string
          matchweek: number
          now_cost: number
          opp_goals: number
          opponent_name: string
          p_full: number
          p_off_60_84: number
          p_off_before_60: number
          second_name: string
          start_probability: number
          status: string
          sub_appearance_probability: number
          team_goals: number
          team_id: number
          team_name: string
          web_name: string
          xpts_cards_own_goals: number
          xpts_clean_sheet: number
          xpts_goals_conceded: number
          xpts_penalties: number
        }[]
      }
      fanteam_save_paste: {
        Args: { p_paste: Json; p_rows: Json }
        Returns: number
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
      fixture_derived_markets_cached: {
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
      fpl_clear_external_lineup: {
        Args: { p_event: number; p_source: string; p_team_id: number }
        Returns: undefined
      }
      fpl_current_season_id: { Args: never; Returns: number }
      fpl_entry_fetch: { Args: { p_entry_id: number }; Returns: Json }
      fpl_gameweek_for_date: {
        Args: { p_date: string; p_season_id: number }
        Returns: number
      }
      fpl_live_entry: {
        Args: { p_entry_id: number; p_event_id?: number }
        Returns: Json
      }
      fpl_production_model_version: { Args: never; Returns: string }
      fpl_remove_first_choice: {
        Args: { p_first_choice_id: number }
        Returns: undefined
      }
      fpl_replace_depth_start: { Args: { p_rows: Json }; Returns: number }
      fpl_save_external_lineup: {
        Args: {
          p_event: number
          p_players: number[]
          p_source: string
          p_team_id: number
        }
        Returns: number
      }
      fpl_score: {
        Args: {
          p_assists: number
          p_bonus: number
          p_clean_sheets: number
          p_defensive_contribution?: number
          p_element_type: number
          p_goals: number
          p_goals_conceded: number
          p_minutes: number
          p_own_goals: number
          p_penalties_missed: number
          p_penalties_saved: number
          p_red_cards: number
          p_saves: number
          p_season_id: number
          p_yellow_cards: number
        }
        Returns: number
      }
      fpl_score_calc: {
        Args: {
          p_assists: number
          p_bonus: number
          p_clean_sheets: number
          p_defensive_contribution: number
          p_goals: number
          p_goals_conceded: number
          p_minutes: number
          p_own_goals: number
          p_penalties_missed: number
          p_penalties_saved: number
          p_red_cards: number
          p_saves: number
          p_yellow_cards: number
          rs: Database["public"]["Views"]["fpl_scoring_rule_sets"]["Row"]
        }
        Returns: number
      }
      fpl_set_first_choice: {
        Args: {
          p_fpl_player_id: number
          p_from?: string
          p_note?: string
          p_start_if_fit: number
          p_to?: string
        }
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
          seasons_covered: number
        }[]
      }
      get_best_defence_rating: {
        Args: { p_league_id: number }
        Returns: {
          canonical_name: string
          goals_against_per_game: number
        }[]
      }
      get_betting_bets: {
        Args: {
          p_best_price?: boolean
          p_closing?: boolean
          p_edge?: number
          p_league_id?: number
          p_market?: string
          p_promoted?: string
          p_season_id?: number
          p_stake?: number
        }
        Returns: {
          away_goals: number
          away_promoted: boolean
          away_team: string
          edge: number
          home_goals: number
          home_promoted: boolean
          home_team: string
          league_id: number
          league_name: string
          match_date: string
          match_id: number
          model_p: number
          predicted_from: string
          price: number
          prices: Json
          profit: number
          retrofit: boolean
          selection: string
          stake: number
          won: boolean
        }[]
      }
      get_betting_returns: {
        Args: {
          p_best_price?: boolean
          p_closing?: boolean
          p_edge?: number
          p_league_id?: number
          p_market?: string
          p_promoted?: string
          p_season_id?: number
          p_stake?: number
        }
        Returns: {
          avg_edge_pct: number
          avg_odds: number
          bets: number
          hit_rate_pct: number
          profit: number
          returned: number
          roi_pct: number
          selection: string
          staked: number
          wins: number
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
      get_countries_by_relevance: {
        Args: never
        Returns: {
          code: string
          country_id: number
          name: string
          teams_with_matches: number
        }[]
      }
      get_country_competitiveness: {
        Args: never
        Returns: {
          bottom_not_losing_pct: number
          clubs: number
          league_code: string
          points_spread: number
          season_label: string
        }[]
      }
      get_country_league_summary: {
        Args: never
        Returns: {
          away_goals_per_game: number
          away_win_pct: number
          both_scored_pct: number
          comeback_pct: number
          country_id: number
          country_name: string
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
      get_fpl_depth_inputs: {
        Args: never
        Returns: {
          availability: number
          available: number
          depth_rank: number
          element_type: number
          fixture_id: number
          formation: string
          fpl_player_id: number
          other_roles: Json
          rate: number
          start_if_fit: number
          starts: number
          tactical_role: string
          team_id: number
        }[]
      }
      get_fpl_external_lineup_runs: {
        Args: { p_event: number; p_source?: string }
        Returns: {
          fetched_at: string
          matched: number
          names_read: number
          saved: boolean
          source_updated: string
          team_id: number
          unmatched: string[]
        }[]
      }
      get_fpl_first_choices: {
        Args: { p_team_id: number }
        Returns: {
          effective_from: string
          effective_to: string
          first_choice_id: number
          fpl_player_id: number
          note: string
          set_at: string
          start_if_fit: number
          web_name: string
        }[]
      }
      get_fpl_fixture_bonus_v4: {
        Args: { p_fixture_id: number }
        Returns: {
          expected_bonus_points: number
          fpl_player_id: number
        }[]
      }
      get_fpl_lineup_comparison: {
        Args: { p_event: number; p_source?: string }
        Returns: {
          depth_rank: number
          element_type: number
          expected_minutes: number
          fpl_player_id: number
          news: string
          source_entered_at: string
          source_start: boolean
          start_probability: number
          status: string
          tactical_role: string
          team_id: number
          team_name: string
          web_name: string
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
      get_fpl_minutes_actuals: {
        Args: { p_team_id: number }
        Returns: {
          available: boolean
          fpl_event_id: number
          fpl_player_id: number
          minutes: number
          started: boolean
        }[]
      }
      get_fpl_minutes_outlook: {
        Args: { p_team_id: number }
        Returns: {
          availability: number
          availability_rule: string
          expected_minutes: number
          first_choice: boolean
          fixtures: number
          fpl_event_id: number
          fpl_player_id: number
          generated_at: string
          news: string
          opponents: string
          position_label: string
          slug: string
          start_probability: number
          status: string
          tactical_role: string
          web_name: string
        }[]
      }
      get_fpl_minutes_teams: {
        Args: never
        Returns: {
          slug: string
          team_id: number
          team_name: string
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
      get_league_ids_with_results: { Args: never; Returns: number[] }
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
      get_model_scorecard: {
        Args: never
        Returns: {
          brier_market: number
          brier_model: number
          draws: number
          goals: number
          league_id: number
          ll_market: number
          ll_model: number
          m_draw: number
          n: number
          p_draw: number
          phase: string
          pred_goals: number
          season_id: number
          team_type: string
        }[]
      }
      get_model_scorecard_calibration: {
        Args: never
        Returns: {
          bin: number
          happened: number
          league_id: number
          n: number
          outcome: string
          predicted: number
          season_id: number
        }[]
      }
      get_model_xi_history: {
        Args: { p_league_id?: number; p_season_id?: number }
        Returns: {
          actual_xi_points: number
          deadline_time: string
          fpl_event_id: number
          generated_before_deadline: boolean
          model_xi_actual_points: number
          model_xi_projected: number
          overlap_count: number
          players_projected: number
        }[]
      }
      get_model_xi_players: {
        Args: { p_event_id: number; p_season_id?: number }
        Returns: {
          actual_points: number
          element_type: number
          fpl_player_id: number
          in_perfect_xi: boolean
          minutes: number
          position_label: string
          projected_points: number
          team_name: string
          web_name: string
        }[]
      }
      get_most_common_scoreline: {
        Args: { p_league_id: number }
        Returns: {
          away_goals: number
          home_goals: number
          occurrences: number
          seasons_covered: number
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
      get_site_traffic: { Args: { p_days?: number }; Returns: Json }
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
      get_team_month_profile: {
        Args: { p_team_id: number }
        Returns: {
          goals_against: number
          goals_for: number
          month_label: string
          month_num: number
          played: number
          points: number
          ppg: number
          venue: string
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
      get_unmapped_alias_names: {
        Args: { p_raw_names: string[]; p_source: string }
        Returns: {
          raw_name: string
        }[]
      }
      get_xi_weekly_by_codes: {
        Args: { p_codes: number[]; p_season_id: number }
        Returns: {
          blanks: number
          gameweek: number
          players_returning: number
          total_points: number
        }[]
      }
      history_record_matches: {
        Args: { p_league_id: number; p_limit?: number }
        Returns: {
          away_goals: number
          away_team_id: number
          home_goals: number
          home_team_id: number
          match_date: string
          match_id: number
          rank: number
          record: string
          season_id: number
          start_year: number
        }[]
      }
      history_record_streaks: {
        Args: { p_league_id: number; p_limit?: number }
        Returns: {
          end_date: string
          end_season_id: number
          length: number
          ongoing: boolean
          rank: number
          start_date: string
          start_season_id: number
          streak_type: string
          team_id: number
          truncated_start: boolean
        }[]
      }
      history_scorelines: {
        Args: {
          p_from_year?: number
          p_league_id: number
          p_team_id?: number
          p_to_year?: number
          p_venue?: string
        }
        Returns: {
          goals_a: number
          goals_b: number
          matches: number
          outcome: string
        }[]
      }
      history_what_happened_next: {
        Args: {
          p_comparable_group?: string
          p_from_year?: number
          p_league_id: number
          p_matches_played: number
          p_points_max?: number
          p_points_min?: number
          p_position_max?: number
          p_position_min?: number
          p_to_year?: number
        }
        Returns: {
          champion: boolean
          clubs: number
          final_points: number
          final_position: number
          goal_difference: number
          points: number
          position_at_played: number
          promoted: boolean
          relegated: boolean
          season_id: number
          season_label: string
          start_year: number
          team_id: number
          team_name: string
          team_slug: string
          teams_at_played: number
          top_four: boolean
          top_six: boolean
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
      ingest_broadcasts: {
        Args: { p_label: string; p_rows: Json }
        Returns: Json
      }
      intl_delete_matches: { Args: { keys: Json }; Returns: number }
      intl_load_reference: { Args: { payload: Json }; Returns: undefined }
      intl_match_keys: { Args: { p_year: number }; Returns: string[] }
      intl_refresh: { Args: never; Returns: undefined }
      intl_refresh_visuals: { Args: never; Returns: undefined }
      intl_replace_club_elo: { Args: { payload: Json }; Returns: undefined }
      intl_replace_goals: { Args: { rows: Json }; Returns: undefined }
      intl_replace_projections: { Args: { payload: Json }; Returns: undefined }
      intl_replace_shootouts: { Args: { rows: Json }; Returns: undefined }
      intl_replace_squads: { Args: { payload: Json }; Returns: undefined }
      intl_snapshot_squads: { Args: { p_date?: string }; Returns: number }
      intl_upsert_fixtures: { Args: { rows: Json }; Returns: number }
      intl_upsert_matches: { Args: { rows: Json }; Returns: number }
      intl_year_totals: {
        Args: never
        Returns: {
          goals: number
          key_hash: string
          matches: number
          year: number
        }[]
      }
      intlw_delete_matches: { Args: { keys: Json }; Returns: number }
      intlw_load_reference: { Args: { payload: Json }; Returns: undefined }
      intlw_match_keys: { Args: { p_year: number }; Returns: string[] }
      intlw_refresh: { Args: never; Returns: undefined }
      intlw_refresh_visuals: { Args: never; Returns: undefined }
      intlw_replace_club_elo: { Args: { payload: Json }; Returns: undefined }
      intlw_replace_goals: { Args: { rows: Json }; Returns: undefined }
      intlw_replace_projections: { Args: { payload: Json }; Returns: undefined }
      intlw_replace_shootouts: { Args: { rows: Json }; Returns: undefined }
      intlw_replace_squads: { Args: { payload: Json }; Returns: undefined }
      intlw_snapshot_squads: { Args: { p_date?: string }; Returns: number }
      intlw_upsert_fixtures: { Args: { rows: Json }; Returns: number }
      intlw_upsert_matches: { Args: { rows: Json }; Returns: number }
      intlw_year_totals: {
        Args: never
        Returns: {
          goals: number
          key_hash: string
          matches: number
          year: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      lab_devig_power: {
        Args: { p_a: number; p_d: number; p_h: number }
        Returns: number[]
      }
      lab_devig_shin: {
        Args: { p_a: number; p_d: number; p_h: number }
        Returns: number[]
      }
      later_season: { Args: { a: number; b: number }; Returns: number }
      league_name_for_season: {
        Args: { p_league_id: number; p_season_id: number }
        Returns: string
      }
      league_standings_fingerprint: { Args: never; Returns: string }
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
      match_broadcast_fixture: {
        Args: {
          p_away: string
          p_competition: string
          p_date: string
          p_home: string
          p_time?: string
        }
        Returns: {
          fixture_id: number
          league_code: string
          reason: string
        }[]
      }
      meta_refresh_flow: {
        Args: never
        Returns: {
          changes: number
          edges: number
          nodes: number
        }[]
      }
      nfl_insert_predictions: { Args: { rows: Json }; Returns: number }
      nfl_replace_depth_daily: {
        Args: { p_days: string[]; p_first: boolean; rows: Json }
        Returns: number
      }
      nfl_replace_depth_weekly: {
        Args: { p_first: boolean; p_season: number; rows: Json }
        Returns: number
      }
      nfl_replace_projections: {
        Args: { p_game_ids: string[]; p_rows: Json }
        Returns: number
      }
      nfl_upsert_games: { Args: { rows: Json }; Returns: number }
      nfl_upsert_player_snaps: { Args: { rows: Json }; Returns: number }
      nfl_upsert_player_weeks: { Args: { rows: Json }; Returns: number }
      nfl_upsert_players: { Args: { rows: Json }; Returns: number }
      nfl_upsert_team_seasons: { Args: { rows: Json }; Returns: number }
      nfl_upsert_team_weeks: { Args: { rows: Json }; Returns: number }
      prediction_fit_eligible: {
        Args: { p_fitted_at: string; p_kickoff: string; p_status: string }
        Returns: boolean
      }
      previous_season_id: { Args: { p_season_id: number }; Returns: number }
      reconcile_unreported_played_fixtures: { Args: never; Returns: number }
      record_match_predictions: {
        Args: { p_season_id?: number }
        Returns: number
      }
      refresh_derived_markets_memo: { Args: never; Returns: number }
      refresh_feed_nearest_date: {
        Args: { p_code: string; p_url: string }
        Returns: number
      }
      refresh_fixture_feeds: { Args: never; Returns: undefined }
      refresh_fpl: { Args: never; Returns: Json }
      refresh_fpl_bonus_v3_for_fixture: {
        Args: { p_fixture_id: number }
        Returns: number
      }
      refresh_fpl_fixture_availability: { Args: never; Returns: number }
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
      refresh_fpl_start_record: { Args: never; Returns: number }
      refresh_history_derived: { Args: { p_force?: boolean }; Returns: Json }
      refresh_league_standings_cache: {
        Args: { p_force?: boolean }
        Returns: string
      }
      refresh_model_scorecard: { Args: never; Returns: number }
      refresh_national_league_fixtures: { Args: never; Returns: Json }
      refresh_scottish_premiership_fixtures: { Args: never; Returns: number }
      refresh_team_match_snapshot: {
        Args: { p_league_id: number; p_season_id: number }
        Returns: number
      }
      resolve_broadcast_team: { Args: { p_raw: string }; Returns: number }
      safe_numeric: { Args: { p_text: string }; Returns: number }
      score_model_experiment: {
        Args: { p_experiment: string }
        Returns: {
          draws: number
          goals: number
          league_id: number
          ll_market: number
          ll_model: number
          n: number
          p_draw: number
          pred_goals: number
          season_id: number
          variant: string
        }[]
      }
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
      season_id_for_date: { Args: { p_date: string }; Returns: number }
      season_start_year: { Args: { p_season_id: number }; Returns: number }
      set_fixture_market_goals: {
        Args: { p_league_id: number; p_rows: Json }
        Returns: number
      }
      sf_bot_save_team: { Args: { p: Json; p_entry: number }; Returns: Json }
      sf_commit_round: { Args: { p: Json }; Returns: string }
      sf_create_season: { Args: { p: Json }; Returns: number }
      sf_ensure_bot: {
        Args: {
          p_key: string
          p_kind: string
          p_name: string
          p_season: number
        }
        Returns: number
      }
      sf_join: {
        Args: { p_display_name?: string; p_season: number; p_team_name: string }
        Returns: number
      }
      sf_lock_round: {
        Args: { p_force?: boolean; p_round: number; p_season: number }
        Returns: string
      }
      sf_runner_state: { Args: { p_universe: string }; Returns: Json }
      sf_save_team: { Args: { p: Json; p_season: number }; Returns: Json }
      sf_test_rpc: { Args: { p_args: Json; p_fn: string }; Returns: Json }
      slugify: { Args: { input: string }; Returns: string }
      slugify_player_name: { Args: { p_name: string }; Returns: string }
      snapshot_due_fpl_projections: { Args: never; Returns: Json }
      snapshot_fpl_projections: {
        Args: { p_event: number; p_kind?: string; p_season_id: number }
        Returns: Json
      }
      social_auto_tick: { Args: never; Returns: Json }
      social_claim_for_publish: {
        Args: { p_actor: string; p_candidate_id: number; p_mode: string }
        Returns: Json
      }
      social_finish_publish:
        | {
            Args: {
              p_attempt_id: number
              p_error: string
              p_http_status: number
              p_outcome: string
              p_x_post_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_attempt_id: number
              p_error: string
              p_http_status: number
              p_outcome: string
              p_x_post_id: string
              p_x_post_ids: Json
            }
            Returns: undefined
          }
      social_has_url: { Args: { p_text: string }; Returns: boolean }
      social_hold: {
        Args: { p_candidate_id: number; p_hold: boolean }
        Returns: Json
      }
      social_numbers: { Args: { p_text: string }; Returns: string[] }
      social_oauth_begin: {
        Args: { p_actor: string; p_code_verifier: string; p_state_hash: string }
        Returns: undefined
      }
      social_oauth_consume: {
        Args: { p_state_hash: string }
        Returns: {
          code_verifier: string
          created_by: string
        }[]
      }
      social_resolve_needs_check: {
        Args: { p_candidate_id: number; p_x_post_id: string }
        Returns: Json
      }
      social_review: {
        Args: {
          p_action: string
          p_candidate_id: number
          p_reason?: string
          p_scheduled_for?: string
          p_text?: string
        }
        Returns: Json
      }
      social_run_detectors: { Args: { p_triggered_by?: string }; Returns: Json }
      social_update_settings: { Args: { p: Json }; Returns: Json }
      social_weighted_length: { Args: { p_text: string }; Returns: number }
      social_worker_ok: { Args: { p_token: string }; Returns: boolean }
      social_x_disconnect: { Args: never; Returns: Json }
      social_x_get_tokens: { Args: never; Returns: Json }
      social_x_mark_error: { Args: { p_error: string }; Returns: undefined }
      social_x_rotate_tokens: {
        Args: {
          p_access_token: string
          p_expected_version: number
          p_expires_in: number
          p_refresh_token: string
        }
        Returns: boolean
      }
      social_x_store_tokens: {
        Args: {
          p_access_token: string
          p_actor: string
          p_expires_in: number
          p_refresh_token: string
          p_scopes: string
          p_username: string
          p_x_user_id: string
        }
        Returns: Json
      }
      sync_fixture_status_from_results: { Args: never; Returns: number }
      sync_pl_kickoffs_from_fpl: {
        Args: { p_fixture_id?: number }
        Returns: number
      }
      tennis_refresh: { Args: never; Returns: string }
      tennis_refresh_if_stale: { Args: { p_force?: boolean }; Returns: string }
      tennis_set_people: { Args: { rows: Json }; Returns: number }
      tennis_upsert_matches: { Args: { rows: Json }; Returns: number }
      tennis_year_totals: {
        Args: { p_tour: string; p_year: number }
        Returns: {
          games: number
          key_hash: string
          matches: number
        }[]
      }
      unaccent: { Args: { "": string }; Returns: string }
      workflow_slot_covered: {
        Args: { p_cron: string; p_workflow: string }
        Returns: boolean
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
