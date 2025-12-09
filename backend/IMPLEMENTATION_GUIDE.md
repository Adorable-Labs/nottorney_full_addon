# Nottorney Backend Implementation Guide

Complete guide for implementing the Nottorney backend in Lovable with Supabase Edge Functions.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [Database Setup](#database-setup)
4. [Storage Setup](#storage-setup)
5. [Edge Functions Setup](#edge-functions-setup)
6. [Payment Integration](#payment-integration)
7. [Testing](#testing)
8. [Deployment](#deployment)

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

## Architecture Overview

### Payment Flow

**IMPORTANT**: Payment processing happens entirely on the **Nottorney web app**, NOT in the Anki addon.

- **Web App**: Handles PayPal, GCash, HitPay payments
- **Addon**: Only authenticates and checks purchase status

See `PAYMENT_FLOW.md` for detailed architecture.

### Addon Endpoints (Simple)

The addon only needs 3 endpoints:
1. `POST /addon-auth/login` - Authenticate user
2. `GET /addon-auth/decks` - List purchased decks (only completed purchases)
3. `POST /addon-auth/download` - Get download URL for purchased deck

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
-- Then create a test purchase (simulating web app payment completion)
INSERT INTO purchases (user_id, product_id, amount, payment_status, payment_method)
VALUES (
  'user-uuid-here',
  (SELECT id FROM products WHERE title = 'Test Medical Deck'),
  29.99,
  'completed', -- Payment already completed on web app
  'paypal'
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

**Purpose**: Authenticate user and return access token with purchased decks

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

**Purpose**: List user's purchased decks (only completed purchases)

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

**Purpose**: Generate signed download URL for purchased deck

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

## Payment Integration

### Web App Payment Endpoints (Not in Addon)

The web app needs these endpoints (separate from addon-auth):

1. **Create Payment Intent**
   - `POST /api/payments/create` - Initialize PayPal/HitPay checkout
   - `POST /api/payments/gcash/initiate` - Start GCash manual payment

2. **Payment Webhooks**
   - `POST /api/webhooks/paypal` - Handle PayPal payment completion
   - `POST /api/webhooks/hitpay` - Handle HitPay payment completion

3. **GCash Manual Confirmation**
   - `POST /api/payments/gcash/submit` - User submits payment proof
   - `GET /api/admin/payments/pending` - Admin views pending GCash payments
   - `POST /api/admin/payments/approve` - Admin approves GCash payment

### Payment Flow Example (GCash)

```typescript
// 1. User initiates payment on web app
POST /api/payments/gcash/initiate
{
  "product_id": "deck-uuid",
  "amount": 29.99
}
// Returns: { purchase_id, reference_number, gcash_account_details }

// 2. User sends payment and submits proof
POST /api/payments/gcash/submit
{
  "purchase_id": "purchase-uuid",
  "reference_number": "GC123456",
  "screenshot_url": "https://..."
}
// Creates payment_confirmations record with status='pending'

// 3. Admin approves payment (web app dashboard)
POST /api/admin/payments/approve
{
  "confirmation_id": "confirmation-uuid"
}
// Updates purchases.payment_status = 'completed'

// 4. Addon can now see the purchase
GET /addon-auth/decks
// Returns the newly purchased deck
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

# 2. Get decks (only shows completed purchases)
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
4. Verify purchased decks appear (only completed purchases)
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
- [ ] Web app payment endpoints implemented (separate from addon)

### Post-Deployment

- [ ] Test login endpoint
- [ ] Test decks endpoint (only shows completed purchases)
- [ ] Test download endpoint
- [ ] Verify signed URLs expire correctly
- [ ] Test with actual addon
- [ ] Monitor error logs
- [ ] Test payment flow on web app
- [ ] Verify purchases appear in addon after payment completion

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

## ✅ Implemented Features

### Core Features (Phase 1)
- ✅ Authentication (login, decks, download)
- ✅ Suggestion system (all endpoints)
- ✅ Review data tracking (all endpoints)
- ✅ Feature flags
- ✅ User details

### Edge Functions Created
- ✅ `backend/edge-functions/addon-auth/login.ts`
- ✅ `backend/edge-functions/addon-auth/decks.ts`
- ✅ `backend/edge-functions/addon-auth/download.ts`
- ✅ `backend/edge-functions/addon-auth/suggestions.ts`
- ✅ `backend/edge-functions/addon-auth/review-data.ts`
- ✅ `backend/edge-functions/addon-auth/feature-flags.ts`
- ✅ `backend/edge-functions/addon-auth/user-details.ts`

### Database Tables Created
- ✅ All core tables (products, purchases, profiles)
- ✅ All sync tables (notes, note_types, deck_media, etc.)
- ✅ Suggestion tables (change_note_suggestions, new_note_suggestions)
- ✅ Review data tables (card_review_data, daily_card_review_summaries)
- ✅ Feature flags tables (feature_flags, user_feature_flags)

### Addon Client Methods
- ✅ All Phase 1 sync methods
- ✅ All suggestion methods
- ✅ All review data methods
- ✅ Deck upload methods
- ✅ Feature flags method
- ✅ User details method

### Still Needs Implementation
- ⚠️ Sync endpoints (updates, media, note-types, protected fields/tags)
- ⚠️ Deck upload endpoints
- ⚠️ Deck subscription management
- ⚠️ Deck extensions

See `COMPLETE_API_REFERENCE.md` for full API documentation.

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
- Verify `payment_status = 'completed'` (not 'pending')
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

### Issue: Purchased deck not showing in addon

**Solution**:
- Verify `payment_status = 'completed'` in purchases table
- Check RLS policies allow user to see their purchases
- Verify user_id matches the logged-in user

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
7. **Payment processing is separate** - addon never handles payments
