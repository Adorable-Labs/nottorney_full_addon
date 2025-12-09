# Complete Nottorney API Reference

## All Implemented Endpoints

This document lists all API endpoints that have been implemented for the Nottorney addon.

---

## 🔐 Authentication Endpoints

### `POST /addon-auth/login`
**Purpose:** Authenticate user and get access token

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "display_name": "John Doe"
  },
  "purchased_decks": [...]
}
```

**File:** `backend/edge-functions/addon-auth/login.ts`

---

### `GET /addon-auth/decks`
**Purpose:** Get user's purchased decks

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "purchased_decks": [
    {
      "id": "uuid",
      "title": "Deck Title",
      "description": "...",
      "category": "Medical",
      "card_count": 5000,
      "apkg_path": "decks/uuid/deck.apkg",
      "updated_at": "2024-12-01T00:00:00.000000+00:00"
    }
  ]
}
```

**File:** `backend/edge-functions/addon-auth/decks.ts`

---

### `POST /addon-auth/download`
**Purpose:** Get signed download URL for purchased deck

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "product_id": "deck-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "download_url": "https://...supabase.co/storage/v1/object/sign/decks/...",
  "deck_title": "Deck Title",
  "expires_in": 3600
}
```

**File:** `backend/edge-functions/addon-auth/download.ts`

---

## 🔄 Sync Endpoints (Phase 1)

### `GET /addon-auth/decks/subscriptions/`
**Purpose:** Get user's deck subscriptions

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
[
  {
    "deck": {
      "id": "uuid",
      "anki_id": 1234567890,
      "name": "Deck Name",
      "csv_last_upload": "2024-12-01T00:00:00.000000+00:00",
      "csv_notes_filename": "deck_notes.csv.gz",
      "media_upload_finished": true,
      "user_relation": "subscriber"
    }
  }
]
```

**Status:** ✅ Needs implementation

---

### `POST /addon-auth/decks/subscriptions/`
**Purpose:** Subscribe to a deck

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "deck": "deck-uuid"
}
```

**Response:** `201 Created`

**Status:** ✅ Needs implementation

---

### `DELETE /addon-auth/decks/{deck_id}/subscriptions/`
**Purpose:** Unsubscribe from a deck

**Headers:** `Authorization: Bearer <token>`

**Response:** `204 No Content`

**Status:** ✅ Needs implementation

---

### `GET /addon-auth/decks/{deck_id}/`
**Purpose:** Get deck information by ID

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "id": "uuid",
  "anki_id": 1234567890,
  "name": "Deck Name",
  "csv_last_upload": "2024-12-01T00:00:00.000000+00:00",
  "csv_notes_filename": "deck_notes.csv.gz",
  "media_upload_finished": true,
  "user_relation": "subscriber"
}
```

**Status:** ✅ Needs implementation

---

### `GET /addon-auth/decks/{deck_id}/updates`
**Purpose:** Get incremental note updates

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `since` - ISO datetime (optional)
- `size` - Page size (default: 2000)
- `full_deck` - Boolean (optional)

**Response:**
```json
{
  "notes": "<base85-encoded-gzipped-json>",
  "latest_update": "2024-12-15T10:00:00.000000+00:00",
  "protected_fields": {
    "1234567890": ["Extra", "Personal Notes"]
  },
  "protected_tags": ["#myedits"],
  "next": "/decks/{id}/updates?cursor=abc123"
}
```

**Status:** ✅ Needs implementation

---

### `GET /addon-auth/decks/{deck_id}/media/list/`
**Purpose:** Get media file updates

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `since` - ISO datetime (optional)
- `size` - Page size (default: 2000)

**Response:**
```json
{
  "media": [
    {
      "name": "image123.png",
      "file_content_hash": "abc123...",
      "modified": "2024-12-15T10:00:00.000000+00:00",
      "referenced_on_accepted_note": true,
      "exists_on_s3": true,
      "download_enabled": true
    }
  ],
  "latest_update": "2024-12-15T10:00:00.000000+00:00",
  "next": null
}
```

**Status:** ✅ Needs implementation

---

### `GET /addon-auth/decks/{deck_id}/note-types/`
**Purpose:** Get note types for a deck

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
[
  {
    "anki_id": 1234567890,
    "name": "Cloze",
    "fields": [...],
    "templates": [...]
  }
]
```

**Status:** ✅ Needs implementation

---

### `GET /addon-auth/decks/{deck_id}/protected-fields/`
**Purpose:** Get protected fields

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "fields": {
    "1234567890": ["Extra", "Personal Notes"]
  }
}
```

**Status:** ✅ Needs implementation

---

### `GET /addon-auth/decks/{deck_id}/protected-tags/`
**Purpose:** Get protected tags

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "tags": ["#myedits", "#personal"]
}
```

**Status:** ✅ Needs implementation

---

### `GET /addon-auth/notes/{note_id}`
**Purpose:** Get a single note by ID

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "note_id": "uuid",
  "anki_id": 1234567890,
  "note_type_id": 9876543210,
  "fields": [...],
  "tags": [...],
  "guid": "abc123"
}
```

**Status:** ✅ Needs implementation

---

### `GET /addon-auth/decks/generate-presigned-url`
**Purpose:** Generate presigned URL for storage operations

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `key` - Storage path
- `type` - "upload" or "download"
- `many` - Boolean

**Response:**
```json
{
  "pre_signed_url": "https://...supabase.co/storage/v1/object/sign/..."
}
```

**Status:** ✅ Needs implementation

---

### `GET /addon-auth/users/deck_extensions`
**Purpose:** Get deck extensions (optional tag groups)

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `deck_id` - Optional filter

**Response:**
```json
{
  "deck_extensions": [
    {
      "id": 123,
      "deck": "uuid",
      "owner": 456,
      "name": "Extension Name",
      "tag_group_name": "#Extension",
      "description": "...",
      "user_relation": "subscriber"
    }
  ]
}
```

**Status:** ✅ Needs implementation

---

### `GET /addon-auth/deck_extensions/{id}/note_customizations/`
**Purpose:** Get tag customizations for deck extension

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `since` - ISO datetime (optional)
- `size` - Page size (default: 2000)

**Response:**
```json
{
  "note_customizations": [
    {
      "note": "uuid",
      "tags": ["#Extension::Tag"]
    }
  ],
  "latest_update": "2024-12-15T10:00:00.000000+00:00",
  "next": null
}
```

**Status:** ✅ Needs implementation

---

### `GET /addon-auth/decks/{deck_id}/notes-actions/`
**Purpose:** Get pending note actions

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "results": [
    {
      "action": "unsuspend",
      "note_ids": ["uuid1", "uuid2"]
    }
  ]
}
```

**Status:** ✅ Needs implementation

---

## 💡 Suggestion System Endpoints

### `POST /addon-auth/notes/{note_id}/suggestion/`
**Purpose:** Create a change note suggestion

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "ankihub_id": "uuid",
  "anki_id": 1234567890,
  "fields": [...],
  "added_tags": ["tag1"],
  "removed_tags": ["tag2"],
  "change_type": "updated_content",
  "comment": "Fixed typo",
  "auto_accept": false
}
```

**Response:** `201 Created`

**File:** `backend/edge-functions/addon-auth/suggestions.ts`

---

### `POST /addon-auth/decks/{deck_id}/note-suggestion/`
**Purpose:** Create a new note suggestion

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "deck_id": "uuid",
  "note_type_id": 9876543210,
  "note_type": "Cloze",
  "anki_id": 1234567890,
  "fields": [...],
  "tags": ["tag1"],
  "guid": "abc123",
  "comment": "New note suggestion",
  "auto_accept": false
}
```

**Response:** `201 Created`

**File:** `backend/edge-functions/addon-auth/suggestions.ts`

---

### `POST /addon-auth/notes/bulk-change-suggestions/`
**Purpose:** Create multiple change note suggestions

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "suggestions": [...],
  "auto_accept": false
}
```

**Response:**
```json
[
  {
    "anki_id": 1234567890,
    "validation_errors": null
  }
]
```

**File:** `backend/edge-functions/addon-auth/suggestions.ts`

---

### `POST /addon-auth/notes/bulk-new-note-suggestions/`
**Purpose:** Create multiple new note suggestions

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "suggestions": [...],
  "auto_accept": false
}
```

**Response:**
```json
[
  {
    "anki_id": 1234567890,
    "validation_errors": null
  }
]
```

**File:** `backend/edge-functions/addon-auth/suggestions.ts`

---

## 📊 Review Data Endpoints

### `POST /addon-auth/users/card-review-data/`
**Purpose:** Send card review statistics

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
[
  {
    "deck_id": "uuid",
    "total_card_reviews_last_7_days": 100,
    "total_card_reviews_last_30_days": 500,
    "first_card_review_at": "2024-12-01T00:00:00.000000+00:00",
    "last_card_review_at": "2024-12-15T10:00:00.000000+00:00"
  }
]
```

**Response:** `200 OK`

**File:** `backend/edge-functions/addon-auth/review-data.ts`

---

### `POST /addon-auth/users/daily-card-review-summary/`
**Purpose:** Send daily review summaries

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
[
  {
    "review_session_date": "2024-12-15",
    "total_cards_studied": 50,
    "total_time_reviewing": 1800,
    "total_cards_marked_as_again": 5,
    "total_cards_marked_as_hard": 10,
    "total_cards_marked_as_good": 30,
    "total_cards_marked_as_easy": 5
  }
]
```

**Response:** `201 Created`

**File:** `backend/edge-functions/addon-auth/review-data.ts`

---

## 🚀 Deck Upload Endpoints

### `POST /addon-auth/decks/`
**Purpose:** Upload a new deck

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "key": "deck-name-uuid.json.gz",
  "name": "Deck Name",
  "anki_id": 1234567890,
  "is_private": false
}
```

**Response:**
```json
{
  "deck_id": "uuid"
}
```

**Status:** ✅ Needs implementation

---

### `POST /addon-auth/decks/{deck_id}/create-note-type/`
**Purpose:** Create a note type for a deck

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "anki_id": 9876543210,
  "name": "Cloze",
  "fields": [...],
  "templates": [...]
}
```

**Response:**
```json
{
  "anki_id": 9876543210,
  "name": "Cloze",
  "fields": [...],
  "templates": [...]
}
```

**Status:** ✅ Needs implementation

---

### `PATCH /addon-auth/decks/{deck_id}/note-types/{note_type_id}/`
**Purpose:** Update a note type

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "name": "Updated Cloze",
  "fields": [...],
  "templates": [...]
}
```

**Response:**
```json
{
  "anki_id": 9876543210,
  "name": "Updated Cloze",
  "fields": [...],
  "templates": [...]
}
```

**Status:** ✅ Needs implementation

---

## 🎛️ Feature Flags & User Endpoints

### `GET /addon-auth/feature-flags/`
**Purpose:** Get feature flags

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "flags": {
    "new_feature": {
      "is_active": true
    }
  }
}
```

**File:** `backend/edge-functions/addon-auth/feature-flags.ts`

---

### `GET /addon-auth/users/me`
**Purpose:** Get current user details

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "display_name": "John Doe",
  "created_decks": []
}
```

**File:** `backend/edge-functions/addon-auth/user-details.ts`

---

## 📝 Implementation Status

### ✅ Fully Implemented
- Authentication (login, decks, download)
- Suggestion system (all endpoints)
- Review data tracking (all endpoints)
- Feature flags
- User details

### ⚠️ Needs Implementation
- All sync endpoints (updates, media, note-types, etc.)
- Deck upload endpoints
- Deck subscription management
- Deck extensions

---

## 🔧 Next Steps

1. Implement sync endpoints (`/decks/{id}/updates`, `/decks/{id}/media/list`, etc.)
2. Implement deck upload endpoints
3. Add RLS policies for all new tables
4. Test all endpoints with the addon
5. Deploy to production

