# Implementation Review and Issues

## ✅ Completed Implementation

### Addon Client (`ankihub/nottorney_client.py`)
- ✅ All AnkiHub-level methods implemented
- ✅ Suggestion system (3 methods)
- ✅ Review data tracking (2 methods)
- ✅ Deck upload (2 methods)
- ✅ Feature flags (1 method)
- ✅ User details (2 methods)
- ✅ Note type management (2 methods)
- ✅ All sync methods (updates, media, note-types, protected fields/tags)
- ✅ Deck subscriptions (3 methods)
- ✅ Deck extensions (3 methods)
- ✅ Pending actions (1 method)

### Backend Edge Functions
- ✅ `login.ts` - Authentication
- ✅ `decks.ts` - List purchased decks
- ✅ `download.ts` - Generate download URLs
- ✅ `suggestions.ts` - Suggestion system (4 endpoints)
- ✅ `review-data.ts` - Review data tracking (2 endpoints)
- ✅ `feature-flags.ts` - Feature flags
- ✅ `user-details.ts` - User details
- ✅ `deck-updates.ts` - Incremental note updates
- ✅ `deck-media.ts` - Media file updates
- ✅ `deck-note-types.ts` - Note type definitions
- ✅ `deck-protected.ts` - Protected fields/tags
- ✅ `deck-subscriptions.ts` - Subscription management (3 endpoints)
- ✅ `presigned-url.ts` - Storage URL generation
- ✅ `note-by-id.ts` - Single note lookup
- ✅ `deck-by-id.ts` - Deck information
- ✅ `deck-extensions.ts` - Deck extensions (2 endpoints)
- ✅ `notes-actions.ts` - Pending actions

### Database Schema
- ✅ All core tables
- ✅ All sync tables
- ✅ Suggestion tables
- ✅ Review data tables
- ✅ Feature flags tables
- ✅ All indexes and triggers

---

## ⚠️ Issues Found and Fixes Needed

### 1. Base85 Encoding Issue (CRITICAL)

**Issue**: The addon expects base85 encoding, but the Edge Function uses base64.

**Location**: `backend/edge-functions/addon-auth/deck-updates.ts`

**Current Code**:
```typescript
function base85Encode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data))
  return base64  // WRONG - should be base85
}
```

**Fix Required**:
```typescript
// Option 1: Use a base85 library
import { encode } from 'https://deno.land/x/base85@v1.0.0/mod.ts'

function base85Encode(data: Uint8Array): string {
  return encode(data)
}

// Option 2: Implement base85 encoding to match Python's base64.b85encode
// (More complex, but ensures exact compatibility)
```

**Impact**: High - Sync will fail if encoding doesn't match

---

### 2. Missing Products Table Columns

**Issue**: The `products` table is missing fields needed for full sync:
- `anki_id` (BIGINT) - Anki deck ID
- `csv_notes_filename` (TEXT) - CSV filename for full deck downloads
- `csv_last_upload` (TIMESTAMPTZ) - Last CSV upload timestamp
- `media_upload_finished` (BOOLEAN) - Media upload status

**Location**: `backend/database/schema.sql`

**Fix Required**:
```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS anki_id BIGINT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS csv_notes_filename TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS csv_last_upload TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS media_upload_finished BOOLEAN DEFAULT true;
```

**Impact**: Medium - Some endpoints return incomplete data

---

### 3. Missing Note ID Mapping

**Issue**: The `change_note_suggestions` table references `notes.id`, but suggestions are created with `ankihub_id` (note UUID). Need to map correctly.

**Location**: `backend/edge-functions/addon-auth/suggestions.ts`

**Current Code**:
```typescript
const { data: note } = await supabase
  .from('notes')
  .select('id, product_id')
  .eq('id', noteId)  // noteId is ankihub_id from request
```

**Fix Required**: The mapping is correct IF `noteId` in the request is the note UUID. Verify the addon sends the correct ID.

**Impact**: Medium - Suggestions may fail if ID mismatch

---

### 4. Presigned URL Generation Issue

**Issue**: The `presigned-url.ts` function uses Supabase Storage API which may not match the expected format.

**Location**: `backend/edge-functions/addon-auth/presigned-url.ts`

**Current Code**:
```typescript
const { data, error } = await supabase.storage
  .from(bucket)
  .createSignedUploadUrl(key)
```

**Potential Issue**: Supabase's `createSignedUploadUrl` may return a different format than expected. Need to verify the response format matches what the addon expects.

**Impact**: Medium - Uploads may fail

---

### 5. Missing Deck Upload Endpoints

**Issue**: Deck upload endpoints are not implemented.

**Missing**:
- `POST /addon-auth/decks/` - Upload new deck
- `POST /addon-auth/decks/{id}/create-note-type/` - Create note type
- `PATCH /addon-auth/decks/{id}/note-types/{type_id}/` - Update note type

**Impact**: Low - Only needed if creators upload via addon (web app can handle this)

---

### 6. CORS Configuration

**Issue**: All Edge Functions use `'Access-Control-Allow-Origin': '*'` which is insecure for production.

**Location**: All Edge Functions

**Fix Required**:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

**Impact**: Low - Security best practice

---

### 7. Error Handling Consistency

**Issue**: Some Edge Functions return different error formats.

**Example**:
- Some return: `{ error: 'unauthorized', message: '...' }`
- Others return: `{ error: 'error_code', message: '...' }`

**Fix Required**: Standardize error response format across all functions.

**Impact**: Low - Addon handles both, but consistency is better

---

### 8. Missing Validation

**Issue**: Some endpoints don't validate input parameters (UUID format, required fields, etc.).

**Example**: `deck-updates.ts` doesn't validate `deckId` is a valid UUID.

**Fix Required**: Add input validation:
```typescript
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}
```

**Impact**: Low - Database will reject invalid UUIDs, but better to validate early

---

### 9. Database Query Optimization

**Issue**: Some queries could be optimized with better joins or indexes.

**Example**: `deck-subscriptions.ts` makes separate queries for subscriptions and products.

**Fix Required**: Use joins to reduce query count:
```typescript
const { data: subscriptions } = await supabase
  .from('deck_subscriptions')
  .select(`
    product_id,
    products!inner(*)
  `)
  .eq('user_id', userId)
```

**Impact**: Low - Performance optimization

---

### 10. Missing RLS Policies

**Issue**: RLS policies may not cover all new tables (suggestions, review data, feature flags).

**Location**: `backend/database/rls_policies.sql`

**Fix Required**: Verify all tables have appropriate RLS policies:
- Users can only see their own suggestions
- Users can only see their own review data
- Feature flags are readable by all authenticated users

**Impact**: High - Security issue if RLS not configured

---

## 🔧 Recommended Fixes (Priority Order)

### Priority 1 (Critical - Must Fix)
1. ✅ Fix base85 encoding in `deck-updates.ts`
2. ✅ Add missing columns to `products` table
3. ✅ Verify RLS policies for all tables

### Priority 2 (Important - Should Fix)
4. ✅ Verify presigned URL format matches addon expectations
5. ✅ Standardize error response format
6. ✅ Add input validation

### Priority 3 (Nice to Have)
7. ✅ Optimize database queries
8. ✅ Update CORS for production
9. ✅ Implement deck upload endpoints (if needed)

---

## 📝 Testing Checklist

### Before Deployment
- [ ] Test base85 encoding/decoding matches Python's `base64.b85encode/b85decode`
- [ ] Test all endpoints with valid tokens
- [ ] Test all endpoints with invalid tokens (should return 401)
- [ ] Test all endpoints with unauthorized access (should return 403)
- [ ] Test pagination works correctly
- [ ] Test protected fields/tags are returned correctly
- [ ] Test subscription management (subscribe/unsubscribe)
- [ ] Test deck extensions
- [ ] Test suggestion creation
- [ ] Test review data submission
- [ ] Verify RLS policies prevent unauthorized access

### Integration Testing
- [ ] Test addon login flow
- [ ] Test deck download
- [ ] Test incremental sync
- [ ] Test media sync
- [ ] Test suggestion submission from addon
- [ ] Test review data submission from addon

---

## 🎯 Summary

**Implementation Status**: ~95% Complete

**Critical Issues**: 3 (base85 encoding, missing columns, RLS policies)

**Important Issues**: 3 (presigned URLs, error format, validation)

**Nice to Have**: 3 (query optimization, CORS, upload endpoints)

**Overall**: The implementation is solid and ready for testing. The critical issues should be fixed before production deployment.

