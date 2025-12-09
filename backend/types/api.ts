// TypeScript types matching the Nottorney addon's expected API contract

// ============================================================================
// AUTHENTICATION
// ============================================================================

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  success: boolean
  access_token: string
  user: {
    id: string
    email: string
    display_name: string | null
  }
  purchased_decks: Deck[]
}

// ============================================================================
// DECK TYPES
// ============================================================================

export interface Deck {
  id: string
  title: string
  description: string | null
  category: string | null
  card_count: number
  apkg_path: string | null
  updated_at?: string
}

export interface DecksResponse {
  purchased_decks: Deck[]
}

// ============================================================================
// DOWNLOAD
// ============================================================================

export interface DownloadRequest {
  product_id: string
}

export interface DownloadResponse {
  success: boolean
  download_url: string
  deck_title: string
  expires_in: number
}

// ============================================================================
// INCREMENTAL SYNC (Phase 2)
// ============================================================================

export interface Field {
  name: string
  value: string
}

export interface NoteInfo {
  note_id: string
  anki_id: number
  note_type_id: number
  fields: Field[]
  tags: string[] | null
  guid: string
  last_update_type?: string | null
}

export interface DeckUpdatesResponse {
  notes: string // Base85-encoded, gzipped JSON string
  latest_update: string | null // ISO datetime
  protected_fields: Record<string, string[]>
  protected_tags: string[]
  next: string | null // Pagination cursor
  external_notes_url?: string | null // For full deck downloads
}

export interface DeckMedia {
  name: string
  file_content_hash: string
  modified: string // ISO datetime
  referenced_on_accepted_note: boolean
  exists_on_s3: boolean
  download_enabled: boolean
}

export interface DeckMediaUpdatesResponse {
  media: DeckMedia[]
  latest_update: string | null
  next: string | null
}

export interface NoteType {
  anki_id: number
  name: string
  fields: Array<{
    name: string
    ord: number
  }>
  templates: Array<{
    name: string
    qfmt: string
    afmt: string
  }>
}

export interface ProtectedFieldsResponse {
  fields: Record<string, string[]> // note_type_id -> field_names[]
}

export interface ProtectedTagsResponse {
  tags: string[]
}

export interface DeckExtension {
  id: number
  deck: string // UUID
  owner: number
  name: string
  tag_group_name: string
  description: string
  user_relation: 'subscriber' | 'owner' | 'maintainer'
}

export interface NoteCustomization {
  note: string // UUID
  tags: string[]
}

export interface DeckExtensionUpdatesResponse {
  note_customizations: NoteCustomization[]
  latest_update: string | null
  next: string | null
}

export interface NotesAction {
  action: 'unsuspend'
  note_ids: string[] // UUIDs
}

// ============================================================================
// ERROR RESPONSES
// ============================================================================

export interface ErrorResponse {
  error: string
  message: string
  code?: number
}

// ============================================================================
// DATETIME FORMAT
// ============================================================================

// The addon expects this exact format:
// "%Y-%m-%dT%H:%M:%S.%f%z"
// Example: "2024-12-01T14:30:00.000000+00:00"
export const ANKIHUB_DATETIME_FORMAT = "yyyy-MM-dd'T'HH:mm:ss.SSSSSSxxx"

