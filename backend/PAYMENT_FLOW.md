# Payment Flow Architecture

## Overview

**Payment processing happens entirely on the Nottorney web app, NOT in the Anki addon.**

The addon only:
1. Authenticates users (login)
2. Checks purchase status (list purchased decks)
3. Downloads purchased content

## Payment Flow

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │
       │ 1. Browse & Select Deck
       ▼
┌─────────────────────┐
│  Nottorney Web App  │
│  (Lovable Frontend) │
└──────┬──────────────┘
       │
       │ 2. Choose Payment Method
       │    - GCash (manual confirmation)
       │    - PayPal
       │    - HitPay (future)
       ▼
┌─────────────────────┐
│  Payment Processing  │
│  (Web App Backend)   │
└──────┬──────────────┘
       │
       │ 3. Process Payment
       │    - PayPal: Redirect to PayPal → Webhook
       │    - GCash: User submits proof → Admin confirms
       │    - HitPay: Redirect to HitPay → Webhook
       ▼
┌─────────────────────┐
│   Supabase Database │
│   purchases table   │
│   status: completed │
└──────┬──────────────┘
       │
       │ 4. Purchase Record Created
       ▼
┌─────────────────────┐
│   Anki Addon        │
│   (User logs in)    │
└──────┬──────────────┘
       │
       │ 5. GET /decks
       │    Returns purchased decks
       ▼
┌─────────────────────┐
│   User Downloads    │
│   Deck via Addon    │
└─────────────────────┘
```

## Web App Responsibilities

### 1. Payment Processing
- Handle PayPal checkout flow
- Handle HitPay checkout flow
- Accept GCash payment confirmations (screenshots/reference numbers)
- Admin dashboard to approve/reject GCash payments

### 2. Purchase Management
- Create purchase records in database
- Update purchase status (pending → completed)
- Send confirmation emails
- Handle refunds/cancellations

### 3. User Account Management
- User registration
- Password reset
- Profile management
- Purchase history

## Addon Responsibilities

### 1. Authentication Only
```typescript
POST /addon-auth/login
// Returns: access_token, user, purchased_decks
```

### 2. Check Purchases
```typescript
GET /addon-auth/decks
// Returns: List of decks where payment_status = 'completed'
```

### 3. Download Content
```typescript
POST /addon-auth/download
// Returns: Signed URL for purchased deck
```

## Database Schema

The `purchases` table stores payment information, but the addon **only reads** from it:

```sql
CREATE TABLE purchases (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  product_id UUID REFERENCES products(id),
  amount DECIMAL(10,2),
  payment_method TEXT, -- 'gcash', 'paypal', 'hitpay'
  payment_status TEXT, -- 'pending', 'completed', 'failed'
  payment_id TEXT, -- Transaction ID from payment provider
  payment_provider TEXT,
  payment_data JSONB, -- Provider-specific data
  purchased_at TIMESTAMPTZ
);
```

**Important**: The addon's `/decks` endpoint only returns purchases where `payment_status = 'completed'`.

## Payment Methods

### GCash (Manual Confirmation)
1. User selects GCash on web app
2. Web app shows GCash account details
3. User sends payment and uploads screenshot/reference number
4. Admin reviews and approves in web app dashboard
5. Web app updates `purchases.payment_status = 'completed'`
6. Addon can now see the purchase

### PayPal
1. User selects PayPal on web app
2. Web app redirects to PayPal checkout
3. User completes payment on PayPal
4. PayPal webhook notifies web app
5. Web app creates purchase record with `payment_status = 'completed'`
6. Addon can now see the purchase

### HitPay (Future)
1. User selects HitPay on web app
2. Web app redirects to HitPay checkout
3. User completes payment on HitPay
4. HitPay webhook notifies web app
5. Web app creates purchase record with `payment_status = 'completed'`
6. Addon can now see the purchase

## Security Considerations

1. **Addon Never Handles Payments**: The addon has no payment processing code
2. **RLS Policies**: Users can only see their own completed purchases
3. **Signed URLs**: Download URLs are time-limited and user-specific
4. **Token Validation**: All addon endpoints verify JWT tokens

## Implementation Notes

- The web app needs separate endpoints for payment processing (not in addon-auth)
- Admin dashboard needs endpoints to approve GCash payments
- Webhooks need to be set up for PayPal and HitPay
- The addon endpoints remain simple: login, list decks, download

