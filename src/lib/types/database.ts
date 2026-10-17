/**
 * Supabase database types for supabase/schema.sql.
 *
 * Hand-maintained in the format produced by `supabase gen types typescript`.
 * Regenerate with:
 *   npx supabase gen types typescript --project-id "$SUPABASE_PROJECT_REF" --schema public > src/lib/types/database.ts
 * and keep the hand-written JSON result types in src/lib/types/session-view.ts.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
	__InternalSupabase: {
		PostgrestVersion: '12';
	};
	public: {
		Tables: {
			hosts: {
				Row: {
					id: string;
					created_at: string;
				};
				Insert: {
					id: string;
					created_at?: string;
				};
				Update: {
					id?: string;
					created_at?: string;
				};
				Relationships: [];
			};
			game_sessions: {
				Row: {
					id: string;
					host_id: string;
					name: string;
					join_code: string;
					scheduled_at: string | null;
					variant: Database['public']['Enums']['game_variant'];
					pair_count: number;
					status: Database['public']['Enums']['session_status'];
					revision: number;
					created_at: string;
					started_at: string | null;
					ended_at: string | null;
				};
				Insert: {
					id?: string;
					host_id: string;
					name: string;
					join_code: string;
					scheduled_at?: string | null;
					variant: Database['public']['Enums']['game_variant'];
					pair_count: number;
					status?: Database['public']['Enums']['session_status'];
					revision?: number;
					created_at?: string;
					started_at?: string | null;
					ended_at?: string | null;
				};
				Update: {
					id?: string;
					host_id?: string;
					name?: string;
					join_code?: string;
					scheduled_at?: string | null;
					variant?: Database['public']['Enums']['game_variant'];
					pair_count?: number;
					status?: Database['public']['Enums']['session_status'];
					revision?: number;
					created_at?: string;
					started_at?: string | null;
					ended_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'game_sessions_host_id_fkey';
						columns: ['host_id'];
						isOneToOne: false;
						referencedRelation: 'hosts';
						referencedColumns: ['id'];
					}
				];
			};
			players: {
				Row: {
					id: string;
					session_id: string;
					user_id: string;
					nickname: string;
					avatar: string;
					level: Database['public']['Enums']['proficiency_level'];
					status: Database['public']['Enums']['player_status'];
					score: number;
					joined_at: string;
					removed_at: string | null;
				};
				Insert: {
					id?: string;
					session_id: string;
					user_id: string;
					nickname: string;
					avatar: string;
					level: Database['public']['Enums']['proficiency_level'];
					status?: Database['public']['Enums']['player_status'];
					score?: number;
					joined_at?: string;
					removed_at?: string | null;
				};
				Update: {
					id?: string;
					session_id?: string;
					user_id?: string;
					nickname?: string;
					avatar?: string;
					level?: Database['public']['Enums']['proficiency_level'];
					status?: Database['public']['Enums']['player_status'];
					score?: number;
					joined_at?: string;
					removed_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'players_session_id_fkey';
						columns: ['session_id'];
						isOneToOne: false;
						referencedRelation: 'game_sessions';
						referencedColumns: ['id'];
					}
				];
			};
			vocabulary_items: {
				Row: {
					id: string;
					slug: string;
					word: string;
					article: string | null;
					emoji: string | null;
					image_path: string | null;
					theme: Database['public']['Enums']['vocabulary_theme'] | null;
					level: Database['public']['Enums']['proficiency_level'] | null;
					active: boolean;
					created_at: string;
				};
				Insert: {
					id?: string;
					slug: string;
					word: string;
					article?: string | null;
					emoji?: string | null;
					image_path?: string | null;
					theme?: Database['public']['Enums']['vocabulary_theme'] | null;
					level?: Database['public']['Enums']['proficiency_level'] | null;
					active?: boolean;
					created_at?: string;
				};
				Update: {
					id?: string;
					slug?: string;
					word?: string;
					article?: string | null;
					emoji?: string | null;
					image_path?: string | null;
					theme?: Database['public']['Enums']['vocabulary_theme'] | null;
					level?: Database['public']['Enums']['proficiency_level'] | null;
					active?: boolean;
					created_at?: string;
				};
				Relationships: [];
			};
			vocabulary_pairs: {
				Row: {
					id: string;
					variant: Database['public']['Enums']['game_variant'];
					item_a: string;
					face_a: Database['public']['Enums']['card_face_kind'];
					item_b: string;
					face_b: Database['public']['Enums']['card_face_kind'];
					active: boolean;
					created_at: string;
				};
				Insert: {
					id?: string;
					variant: Database['public']['Enums']['game_variant'];
					item_a: string;
					face_a: Database['public']['Enums']['card_face_kind'];
					item_b: string;
					face_b: Database['public']['Enums']['card_face_kind'];
					active?: boolean;
					created_at?: string;
				};
				Update: {
					id?: string;
					variant?: Database['public']['Enums']['game_variant'];
					item_a?: string;
					face_a?: Database['public']['Enums']['card_face_kind'];
					item_b?: string;
					face_b?: Database['public']['Enums']['card_face_kind'];
					active?: boolean;
					created_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'vocabulary_pairs_item_a_fkey';
						columns: ['item_a'];
						isOneToOne: false;
						referencedRelation: 'vocabulary_items';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'vocabulary_pairs_item_b_fkey';
						columns: ['item_b'];
						isOneToOne: false;
						referencedRelation: 'vocabulary_items';
						referencedColumns: ['id'];
					}
				];
			};
			games: {
				Row: {
					id: string;
					session_id: string;
					status: Database['public']['Enums']['game_status'];
					turn_order: string[];
					active_player_id: string | null;
					first_flip: number | null;
					mismatch_positions: number[] | null;
					reveal_until: string | null;
					turn_until: string | null;
					end_reason: Database['public']['Enums']['game_end_reason'] | null;
					winner_ids: string[];
					started_at: string;
					ended_at: string | null;
				};
				Insert: {
					id?: string;
					session_id: string;
					status?: Database['public']['Enums']['game_status'];
					turn_order: string[];
					active_player_id?: string | null;
					first_flip?: number | null;
					mismatch_positions?: number[] | null;
					reveal_until?: string | null;
					turn_until?: string | null;
					end_reason?: Database['public']['Enums']['game_end_reason'] | null;
					winner_ids?: string[];
					started_at?: string;
					ended_at?: string | null;
				};
				Update: {
					id?: string;
					session_id?: string;
					status?: Database['public']['Enums']['game_status'];
					turn_order?: string[];
					active_player_id?: string | null;
					first_flip?: number | null;
					mismatch_positions?: number[] | null;
					reveal_until?: string | null;
					turn_until?: string | null;
					end_reason?: Database['public']['Enums']['game_end_reason'] | null;
					winner_ids?: string[];
					started_at?: string;
					ended_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'games_session_id_fkey';
						columns: ['session_id'];
						isOneToOne: true;
						referencedRelation: 'game_sessions';
						referencedColumns: ['id'];
					}
				];
			};
			game_layout: {
				Row: {
					game_id: string;
					position: number;
					pair_id: string;
					side: number;
				};
				Insert: {
					game_id: string;
					position: number;
					pair_id: string;
					side: number;
				};
				Update: {
					game_id?: string;
					position?: number;
					pair_id?: string;
					side?: number;
				};
				Relationships: [
					{
						foreignKeyName: 'game_layout_game_id_fkey';
						columns: ['game_id'];
						isOneToOne: false;
						referencedRelation: 'games';
						referencedColumns: ['id'];
					}
				];
			};
			board_cells: {
				Row: {
					game_id: string;
					player_id: string;
					position: number;
					matched_at: string | null;
				};
				Insert: {
					game_id: string;
					player_id: string;
					position: number;
					matched_at?: string | null;
				};
				Update: {
					game_id?: string;
					player_id?: string;
					position?: number;
					matched_at?: string | null;
				};
				Relationships: [];
			};
			game_attempts: {
				Row: {
					id: number;
					game_id: string;
					player_id: string;
					first_position: number | null;
					second_position: number | null;
					outcome: Database['public']['Enums']['attempt_outcome'];
					created_at: string;
				};
				Insert: {
					game_id: string;
					player_id: string;
					first_position?: number | null;
					second_position?: number | null;
					outcome: Database['public']['Enums']['attempt_outcome'];
					created_at?: string;
				};
				Update: {
					game_id?: string;
					player_id?: string;
					first_position?: number | null;
					second_position?: number | null;
					outcome?: Database['public']['Enums']['attempt_outcome'];
					created_at?: string;
				};
				Relationships: [];
			};
			processed_actions: {
				Row: {
					action_id: string;
					game_id: string;
					player_id: string;
					created_at: string;
				};
				Insert: {
					action_id: string;
					game_id: string;
					player_id: string;
					created_at?: string;
				};
				Update: {
					action_id?: string;
					game_id?: string;
					player_id?: string;
					created_at?: string;
				};
				Relationships: [];
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			create_session: {
				Args: {
					p_name: string;
					p_variant: string;
					p_pair_count: number;
					p_scheduled_at?: string | null;
				};
				Returns: Json;
			};
			lookup_session: {
				Args: { p_join_code: string };
				Returns: Json;
			};
			join_session: {
				Args: {
					p_join_code: string;
					p_nickname: string;
					p_avatar: string;
					p_level: string;
				};
				Returns: Json;
			};
			get_session_view: {
				Args: { p_session_id: string };
				Returns: Json;
			};
			start_game: {
				Args: { p_session_id: string };
				Returns: Json;
			};
			flip_card: {
				Args: {
					p_session_id: string;
					p_board_player_id: string;
					p_position: number;
					p_action_id: string;
					p_revision: number;
				};
				Returns: Json;
			};
			end_game: {
				Args: { p_session_id: string };
				Returns: Json;
			};
			remove_player: {
				Args: { p_session_id: string; p_player_id: string };
				Returns: Json;
			};
		};
		Enums: {
			session_status: 'lobby' | 'in_progress' | 'completed';
			game_variant: 'image_pairs' | 'word_image' | 'de_het' | 'opposites';
			proficiency_level: 'beginner' | 'elementary' | 'intermediate' | 'advanced';
			player_status: 'active' | 'removed';
			card_face_kind: 'image' | 'word' | 'article_word';
			vocabulary_theme:
				| 'transport'
				| 'eten_en_drinken'
				| 'huis'
				| 'lichaam_en_dokter'
				| 'werk'
				| 'boodschappen'
				| 'weer'
				| 'familie';
			game_status: 'active' | 'completed';
			game_end_reason: 'board_cleared' | 'ended_by_host' | 'not_enough_players';
			attempt_outcome: 'match' | 'mismatch' | 'timeout' | 'cancelled';
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];
