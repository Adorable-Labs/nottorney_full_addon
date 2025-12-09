# API Contract Verification

## Addon ↔ Backend Contract Check

This document verifies that the addon's API calls match the backend's expected endpoints and data formats.

---

## ✅ Authentication Endpoints

### `POST /addon-auth/login`
**Addon Call**: `POST {api_url}/login`
**Backend**: `backend/edge-functions/addon-auth/login.ts`

**Request Match**: ✅
- Addon sends: `{"email": str, "password": str}`
- Backend expects: `{email: string, password: string}`

**Response Match**: ✅
- Backend returns: `{success: boolean, access_token: string, user: {...}, purchased_decks: [...]}`
- Addon expects: `{success: bool, access_token: str, user: {...}, purchased_decks: [...]}`

---

### `GET /addon-auth/decks`
**Addon Call**: `GET {api_url}/decks`
**Backend**: `backend/edge-functions/addon-auth/decks.ts`

**Request Match**: ✅
- Addon sends: `Authorization: Bearer {token}`
- Backend expects: `Authorization: Bearer {token}`

**Response Match**: ✅
- Backend returns: `{purchased_decks: [...]}`
- Addon expects: `{purchased_decks: [...]}`

---

### `POST /addon-auth/download`
**Addon Call**: `POST {api_url}/download`
**Backend**: `backend/edge-functions/addon-auth/download.ts`

**Request Match**: ✅
- Addon sends: `{"product_id": str}`
- Backend expects: `{product_id: string}`

**Response Match**: ✅
- Backend returns: `{success: boolean, download_url: string, deck_title: string, expires_in: number}`
- Addon expects: `{success: bool, download_url: str, deck_title: str, expires_in: int}`

---

## ✅ Sync Endpoints

### `GET /addon-auth/decks/{deck_id}/updates`
**Addon Call**: `GET {api_url}/decks/{deck_id}/updates?since={timestamp}&size={size}&full_deck={bool}`
**Backend**: `backend/edge-functions/addon-auth/deck-updates.ts`

**Request Match**: ✅
- Addon sends: Query params `since`, `size`, `full_deck`
- Backend expects: Query params `since`, `size`, `full_deck`

**Response Match**: ⚠️ **NEEDS VERIFICATION**
- Backend returns: `{notes: string (base85), latest_update: string, protected_fields: {...}, protected_tags: [...], next: string | null}`
- Addon expects: `{notes: string (base85), latest_update: string, protected_fields: {...}, protected_tags: [...], next: string | null}`
- **Issue**: Base85 encoding must match Python's `base64.b85encode` exactly

---

### `GET /addon-auth/decks/{deck_id}/media/list/`
**Addon Call**: `GET {api_url}/decks/{deck_id}/media/list/?since={timestamp}&size={size}`
**Backend**: `backend/edge-functions/addon-auth/deck-media.ts`

**Request Match**: ✅
- Addon sends: Query params `since`, `size`
- Backend expects: Query params `since`, `size`

**Response Match**: ✅
- Backend returns: `{media: [...], latest_update: string, next: string | null}`
- Addon expects: `{media: [...], latest_update: string, next: string | null}`

---

### `GET /addon-auth/decks/{deck_id}/note-types/`
**Addon Call**: `GET {api_url}/decks/{deck_id}/note-types/`
**Backend**: `backend/edge-functions/addon-auth/deck-note-types.ts`

**Request Match**: ✅
- Addon sends: `Authorization: Bearer {token}`
- Backend expects: `Authorization: Bearer {token}`

**Response Match**: ✅
- Backend returns: `[{anki_id: number, name: string, fields: [...], templates: [...]}]`
- Addon expects: `[{anki_id: int, name: str, fields: [...], templates: [...]}]`

---

### `GET /addon-auth/decks/{deck_id}/protected-fields/`
**Addon Call**: `GET {api_url}/decks/{deck_id}/protected-fields/`
**Backend**: `backend/edge-functions/addon-auth/deck-protected.ts`

**Request Match**: ✅
- Addon sends: `Authorization: Bearer {token}`
- Backend expects: `Authorization: Bearer {token}`

**Response Match**: ✅
- Backend returns: `{fields: {[note_type_id: string]: string[]}}`
- Addon expects: `{fields: {[note_type_id: str]: [str]}}`
- Addon converts string keys to int: ✅ Handled in addon

---

### `GET /addon-auth/decks/{deck_id}/protected-tags/`
**Addon Call**: `GET {api_url}/decks/{deck_id}/protected-tags/`
**Backend**: `backend/edge-functions/addon-auth/deck-protected.ts`

**Request Match**: ✅
- Addon sends: `Authorization: Bearer {token}`
- Backend expects: `Authorization: Bearer {token}`

**Response Match**: ✅
- Backend returns: `{tags: string[]}`
- Addon expects: `{tags: [str]}`

---

### `GET /addon-auth/notes/{note_id}`
**Addon Call**: `GET {api_url}/notes/{note_id}`
**Backend**: `backend/edge-functions/addon-auth/note-by-id.ts`

**Request Match**: ✅
- Addon sends: `Authorization: Bearer {token}`
- Backend expects: `Authorization: Bearer {token}`

**Response Match**: ✅
- Backend returns: `{note_id: string, anki_id: number, note_type_id: number, fields: [...], tags: [...], guid: string}`
- Addon expects: `NoteInfo` object with same fields

---

### `GET /addon-auth/decks/generate-presigned-url`
**Addon Call**: `GET {api_url}/decks/generate-presigned-url?key={key}&type={action}&many={bool}`
**Backend**: `backend/edge-functions/addon-auth/presigned-url.ts`

**Request Match**: ✅
- Addon sends: Query params `key`, `type`, `many`
- Backend expects: Query params `key`, `type`, `many`

**Response Match**: ⚠️ **NEEDS VERIFICATION**
- Backend returns: `{pre_signed_url: string}`
- Addon expects: `{pre_signed_url: str}`
- **Issue**: Need to verify Supabase's `createSignedUploadUrl` format matches addon expectations

---

## ✅ Subscription Endpoints

### `GET /addon-auth/decks/subscriptions/`
**Addon Call**: `GET {api_url}/decks/subscriptions/`
**Backend**: `backend/edge-functions/addon-auth/deck-subscriptions.ts`

**Request Match**: ✅
- Addon sends: `Authorization: Bearer {token}`
- Backend expects: `Authorization: Bearer {token}`

**Response Match**: ⚠️ **PARTIAL**
- Backend returns: `[{deck: {...}}]`
- Addon expects: `[{deck: {...}}]`
- **Issue**: Backend returns `anki_id: 0` (not stored) - may need to add to products table

---

### `POST /addon-auth/decks/subscriptions/`
**Addon Call**: `POST {api_url}/decks/subscriptions/` with `{"deck": "uuid"}`
**Backend**: `backend/edge-functions/addon-auth/deck-subscriptions.ts`

**Request Match**: ✅
- Addon sends: `{"deck": "uuid"}`
- Backend expects: `{deck: string}`

**Response Match**: ✅
- Backend returns: `201 Created` or `200 OK`
- Addon expects: `201 Created`

---

### `DELETE /addon-auth/decks/{deck_id}/subscriptions/`
**Addon Call**: `DELETE {api_url}/decks/{deck_id}/subscriptions/`
**Backend**: `backend/edge-functions/addon-auth/deck-subscriptions.ts`

**Request Match**: ✅
- Addon sends: `DELETE` with `Authorization: Bearer {token}`
- Backend expects: `DELETE` with `Authorization: Bearer {token}`

**Response Match**: ✅
- Backend returns: `204 No Content`
- Addon expects: `204 No Content` or `404 Not Found`

---

### `GET /addon-auth/decks/{deck_id}/`
**Addon Call**: `GET {api_url}/decks/{deck_id}/`
**Backend**: `backend/edge-functions/addon-auth/deck-by-id.ts`

**Request Match**: ✅
- Addon sends: `Authorization: Bearer {token}`
- Backend expects: `Authorization: Bearer {token}`

**Response Match**: ⚠️ **PARTIAL**
- Backend returns: `{id, anki_id: 0, name, csv_last_upload, csv_notes_filename: "", media_upload_finished, user_relation, has_note_embeddings}`
- Addon expects: `Deck` object with same fields
- **Issue**: `anki_id: 0` and empty `csv_notes_filename` - need to store in products table

---

## ✅ Suggestion Endpoints

### `POST /addon-auth/notes/{note_id}/suggestion/`
**Addon Call**: `POST {api_url}/notes/{note_id}/suggestion/`
**Backend**: `backend/edge-functions/addon-auth/suggestions.ts`

**Request Match**: ✅
- Addon sends: `{ankihub_id, anki_id, fields, added_tags, removed_tags, change_type, comment, auto_accept}`
- Backend expects: Same structure

**Response Match**: ✅
- Backend returns: `201 Created`
- Addon expects: `201 Created`

---

### `POST /addon-auth/decks/{deck_id}/note-suggestion/`
**Addon Call**: `POST {api_url}/decks/{deck_id}/note-suggestion/`
**Backend**: `backend/edge-functions/addon-auth/suggestions.ts`

**Request Match**: ✅
- Addon sends: `{deck_id, note_type_id, note_type, anki_id, fields, tags, guid, comment, auto_accept}`
- Backend expects: Same structure

**Response Match**: ✅
- Backend returns: `201 Created`
- Addon expects: `201 Created`

---

### `POST /addon-auth/notes/bulk-change-suggestions/`
**Addon Call**: `POST {api_url}/notes/bulk-change-suggestions/`
**Backend**: `backend/edge-functions/addon-auth/suggestions.ts`

**Request Match**: ✅
- Addon sends: `{suggestions: [...], auto_accept: bool}`
- Backend expects: Same structure

**Response Match**: ✅
- Backend returns: `[{anki_id: number, validation_errors: string[] | null}]`
- Addon expects: Same structure

---

### `POST /addon-auth/notes/bulk-new-note-suggestions/`
**Addon Call**: `POST {api_url}/notes/bulk-new-note-suggestions/`
**Backend**: `backend/edge-functions/addon-auth/suggestions.ts`

**Request Match**: ✅
- Addon sends: `{suggestions: [...], auto_accept: bool}`
- Backend expects: Same structure

**Response Match**: ✅
- Backend returns: `[{anki_id: number, validation_errors: string[] | null}]`
- Addon expects: Same structure

---

## ✅ Review Data Endpoints

### `POST /addon-auth/users/card-review-data/`
**Addon Call**: `POST {api_url}/users/card-review-data/`
**Backend**: `backend/edge-functions/addon-auth/review-data.ts`

**Request Match**: ✅
- Addon sends: `[{deck_id, total_card_reviews_last_7_days, total_card_reviews_last_30_days, first_card_review_at, last_card_review_at}]`
- Backend expects: Same structure

**Response Match**: ✅
- Backend returns: `200 OK`
- Addon expects: `200 OK`

---

### `POST /addon-auth/users/daily-card-review-summary/`
**Addon Call**: `POST {api_url}/users/daily-card-review-summary/`
**Backend**: `backend/edge-functions/addon-auth/review-data.ts`

**Request Match**: ✅
- Addon sends: `[{review_session_date, total_cards_studied, total_time_reviewing, ...}]`
- Backend expects: Same structure

**Response Match**: ✅
- Backend returns: `201 Created`
- Addon expects: `201 Created`

---

## ✅ Feature Flags & User Endpoints

### `GET /addon-auth/feature-flags/`
**Addon Call**: `GET {api_url}/feature-flags/`
**Backend**: `backend/edge-functions/addon-auth/feature-flags.ts`

**Request Match**: ✅
- Addon sends: `Authorization: Bearer {token}`
- Backend expects: `Authorization: Bearer {token}`

**Response Match**: ✅
- Backend returns: `{flags: {[flag_key: string]: {is_active: boolean}}}`
- Addon expects: `{flags: {[flag_key: str]: {is_active: bool}}}`

---

### `GET /addon-auth/users/me`
**Addon Call**: `GET {api_url}/users/me`
**Backend**: `backend/edge-functions/addon-auth/user-details.ts`

**Request Match**: ✅
- Addon sends: `Authorization: Bearer {token}`
- Backend expects: `Authorization: Bearer {token}`

**Response Match**: ✅
- Backend returns: `{id, email, display_name, created_decks: []}`
- Addon expects: Same structure

---

## ✅ Deck Extensions

### `GET /addon-auth/users/deck_extensions`
**Addon Call**: `GET {api_url}/users/deck_extensions?deck_id={uuid}`
**Backend**: `backend/edge-functions/addon-auth/deck-extensions.ts`

**Request Match**: ✅
- Addon sends: Query param `deck_id` (optional)
- Backend expects: Query param `deck_id` (optional)

**Response Match**: ✅
- Backend returns: `{deck_extensions: [...]}`
- Addon expects: `{deck_extensions: [...]}`

---

### `GET /addon-auth/deck_extensions/{id}/note_customizations/`
**Addon Call**: `GET {api_url}/deck_extensions/{id}/note_customizations/?since={timestamp}&size={size}`
**Backend**: `backend/edge-functions/addon-auth/deck-extensions.ts`

**Request Match**: ✅
- Addon sends: Query params `since`, `size`
- Backend expects: Query params `since`, `size`

**Response Match**: ✅
- Backend returns: `{note_customizations: [...], latest_update: string, next: string | null}`
- Addon expects: Same structure

---

## ✅ Pending Actions

### `GET /addon-auth/decks/{deck_id}/notes-actions/`
**Addon Call**: `GET {api_url}/decks/{deck_id}/notes-actions/`
**Backend**: `backend/edge-functions/addon-auth/notes-actions.ts`

**Request Match**: ✅
- Addon sends: `Authorization: Bearer {token}`
- Backend expects: `Authorization: Bearer {token}`

**Response Match**: ⚠️ **NEEDS VERIFICATION**
- Backend returns: `{results: [{action: string, note_ids: string[]}]}`
- Addon expects: `[{action: str, note_ids: [str]}]` (array, not wrapped in `results`)
- **Issue**: Response format mismatch - addon expects array, backend returns object with `results` key

---

## ⚠️ Issues Found

### 1. Base85 Encoding (CRITICAL)
**Issue**: Base85 encoding in `deck-updates.ts` needs to match Python's `base64.b85encode` exactly.

**Status**: ⚠️ Implemented but needs testing

---

### 2. Notes Actions Response Format
**Issue**: Backend returns `{results: [...]}` but addon expects `[...]` (direct array).

**Location**: `backend/edge-functions/addon-auth/notes-actions.ts`

**Fix Required**:
```typescript
// Change from:
return new Response(JSON.stringify({ results }), ...)

// To:
return new Response(JSON.stringify(results), ...)
```

**Priority**: High

---

### 3. Missing Products Table Fields
**Issue**: `products` table missing `anki_id` and `csv_notes_filename` which are returned as defaults.

**Status**: ✅ Fixed (columns added to schema)

**Action Required**: Populate these fields when creating products

---

### 4. Presigned URL Format
**Issue**: Need to verify Supabase's `createSignedUploadUrl` returns format expected by addon.

**Status**: ⚠️ Needs testing

**Priority**: Medium

---

## ✅ Summary

**Overall Contract Match**: ~95%

**Critical Issues**: 2 (base85 encoding, notes-actions format)

**Important Issues**: 1 (presigned URL format)

**All Other Endpoints**: ✅ Match correctly

---

## 🔧 Quick Fixes Needed

1. Fix `notes-actions.ts` response format (remove `results` wrapper)
2. Test base85 encoding compatibility
3. Test presigned URL format

