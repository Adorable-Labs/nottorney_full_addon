# Nottorney Backend Implementation Guide

Complete guide for implementing the Nottorney backend in Lovable with Supabase Edge Functions.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Database Setup](#database-setup)
3. [Storage Setup](#storage-setup)
4. [Edge Functions Setup](#edge-functions-setup)
5. [Testing](#testing)
6. [Deployment](#deployment)

---

## Prerequisites

### 1. Enable Lovable Cloud

1. Go to your Lovable project settings
2. Enable "Lovable Cloud" integration
3. Connect your Supabase project (or create a new one)
4. Note your Supabase URL and anon key

### 2. Required Environment Variables

Set these in Lovable Cloud or Supabase Dashboard:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key (for admin operations)
```

---

## Database Setup

### Step 1: Run Schema SQL

1. Open Supabase Dashboard → SQL Editor
2. Run `backend/database/schema.sql` to create all tables
3. Run `backend/database/rls_policies.sql` to set up security
4. Verify tables were created: `SELECT * FROM products LIMIT 1;`

### Step 2: Create Test Data

```sql
-- Insert a test product
INSERT INTO products (title, description, price, card_count, category, apkg_path)
VALUES (
  'Test Medical Deck',
  'A test deck for development',
  29.99,
  1000,
  'Medical',
  'decks/test-deck/test.apkg'
);

-- Create a test user (via Supabase Auth UI or API)
-- Then create a test purchase
INSERT INTO purchases (user_id, product_id, amount)
VALUES (
  'user-uuid-here',
  (SELECT id FROM products WHERE title = 'Test Medical Deck'),
  29.99
);
```

---

## Storage Setup

### Step 1: Create Storage Buckets

1. Open Supabase Dashboard → Storage
2. Run `backend/database/storage_buckets.sql` in SQL Editor
3. Verify buckets exist: Check Storage section in dashboard

### Step 2: Upload Test Deck File

1. Go to Storage → `decks` bucket
2. Create folder structure: `decks/test-deck/`
3. Upload a test `.apkg` file
4. Update product's `apkg_path` to match: `decks/test-deck/test.apkg`

---

## Edge Functions Setup

### Step 1: Deploy Core Functions

In Lovable, create these Edge Functions:

#### Function 1: `addon-auth/login`

**Path**: `backend/edge-functions/addon-auth/login.ts`

**Deploy Command** (if using Supabase CLI):
```bash
supabase functions deploy addon-auth/login
```

**Test**:
```bash
curl -X POST https://your-project.supabase.co/functions/v1/addon-auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

#### Function 2: `addon-auth/decks`

**Path**: `backend/edge-functions/addon-auth/decks.ts`

**Deploy Command**:
```bash
supabase functions deploy addon-auth/decks
```

**Test**:
```bash
curl -X GET https://your-project.supabase.co/functions/v1/addon-auth/decks \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### Function 3: `addon-auth/download`

**Path**: `backend/edge-functions/addon-auth/download.ts`

**Deploy Command**:
```bash
supabase functions deploy addon-auth/download
```

**Test**:
```bash
curl -X POST https://your-project.supabase.co/functions/v1/addon-auth/download \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"product_id":"deck-uuid-here"}'
```

### Step 2: Configure CORS

The Edge Functions include CORS headers. For production, update `corsHeaders` to restrict origins:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://yourdomain.com', // Specific domain
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

---

## Testing

### 1. Test Authentication Flow

```bash
# 1. Login
RESPONSE=$(curl -X POST https://your-project.supabase.co/functions/v1/addon-auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}')

TOKEN=$(echo $RESPONSE | jq -r '.access_token')

# 2. Get decks
curl -X GET https://your-project.supabase.co/functions/v1/addon-auth/decks \
  -H "Authorization: Bearer $TOKEN"

# 3. Get download URL
curl -X POST https://your-project.supabase.co/functions/v1/addon-auth/download \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"product_id":"your-deck-uuid"}'
```

### 2. Test with Addon

1. Update addon's API URL:
   ```bash
   export NOTTORNEY_API_URL="https://your-project.supabase.co/functions/v1/addon-auth"
   ```

2. Open Anki → Tools → Nottorney → Login
3. Enter test credentials
4. Verify purchased decks appear
5. Test deck download

---

## Deployment Checklist

### Pre-Deployment

- [ ] All database tables created
- [ ] RLS policies enabled and tested
- [ ] Storage buckets created with correct policies
- [ ] Edge Functions deployed
- [ ] Environment variables set
- [ ] CORS configured for production domain

### Post-Deployment

- [ ] Test login endpoint
- [ ] Test decks endpoint
- [ ] Test download endpoint
- [ ] Verify signed URLs expire correctly
- [ ] Test with actual addon
- [ ] Monitor error logs

---

## Next Steps (Phase 2: Full Sync)

Once the basic purchase/download system works, implement:

1. **Incremental Sync Endpoint**: `GET /decks/{id}/updates`
   - Paginated note updates
   - Base85 + gzip compression
   - Timestamp-based filtering

2. **Media Sync**: `GET /decks/{id}/media/list`
   - Paginated media file updates
   - Hash-based change detection

3. **Note Types**: `GET /decks/{id}/note-types`
   - Return note type definitions

4. **Protected Fields/Tags**: `GET /decks/{id}/protected-fields`
   - User customization protection

See `NOTTORNEY_VERIFICATION.md` for full endpoint specifications.

---

## Troubleshooting

### Issue: "Invalid credentials" on login

**Solution**: 
- Verify user exists in Supabase Auth
- Check password is correct
- Verify email is confirmed

### Issue: "Not purchased" error

**Solution**:
- Check `purchases` table has entry for user + product
- Verify RLS policies allow user to see their purchases

### Issue: Signed URL generation fails

**Solution**:
- Verify file exists in `decks` bucket
- Check `apkg_path` in products table matches storage path
- Verify storage policies allow signed URL generation

### Issue: CORS errors

**Solution**:
- Check CORS headers in Edge Functions
- Verify `Access-Control-Allow-Origin` includes your domain
- Test with browser DevTools Network tab

---

## Support

For issues or questions:
1. Check Supabase logs: Dashboard → Logs → Edge Functions
2. Check database logs: Dashboard → Logs → Postgres
3. Review addon logs: Anki → Tools → Nottorney → View Logs

---

## Security Notes

1. **Never expose service role key** in Edge Functions
2. **Always validate user authentication** before database queries
3. **Use RLS policies** as primary security layer
4. **Validate all inputs** (product_id format, etc.)
5. **Rate limit** API endpoints to prevent abuse
6. **Log security events** (failed logins, unauthorized access attempts)

