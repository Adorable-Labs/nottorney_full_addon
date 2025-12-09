-- Row Level Security (RLS) Policies for Nottorney Backend
-- Ensures users can only access their own data

-- ============================================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE deck_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE deck_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE protected_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE protected_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE deck_extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_customizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_note_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE new_note_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_review_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_card_review_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feature_flags ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTION: Get current user ID
-- ============================================================================

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- ============================================================================
-- PRODUCTS POLICIES
-- ============================================================================

-- Anyone can view products (for marketplace browsing)
CREATE POLICY "Products are viewable by everyone"
  ON products FOR SELECT
  USING (true);

-- Only authenticated admins can insert/update products
CREATE POLICY "Only admins can create products"
  ON products FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM auth.users 
      WHERE raw_user_meta_data->>'role' = 'admin'
    )
  );

CREATE POLICY "Only admins can update products"
  ON products FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users 
      WHERE raw_user_meta_data->>'role' = 'admin'
    )
  );

-- ============================================================================
-- PURCHASES POLICIES
-- ============================================================================

-- Users can only see their own purchases
CREATE POLICY "Users can view their own purchases"
  ON purchases FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create purchases (via Stripe webhook)
CREATE POLICY "Users can create purchases"
  ON purchases FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- PROFILES POLICIES
-- ============================================================================

-- Users can view all profiles (for display names)
CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

-- Users can only update their own profile
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================================================
-- DECK SUBSCRIPTIONS POLICIES
-- ============================================================================

-- Users can view their own subscriptions
CREATE POLICY "Users can view their own subscriptions"
  ON deck_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own subscriptions
CREATE POLICY "Users can create their own subscriptions"
  ON deck_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own subscriptions
CREATE POLICY "Users can delete their own subscriptions"
  ON deck_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- NOTES POLICIES (for incremental sync)
-- ============================================================================

-- Users can only view notes for decks they've purchased or subscribed to
CREATE POLICY "Users can view notes for purchased/subscribed decks"
  ON notes FOR SELECT
  USING (
    product_id IN (
      SELECT product_id FROM purchases WHERE user_id = auth.uid()
      UNION
      SELECT product_id FROM deck_subscriptions WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- NOTE TYPES POLICIES
-- ============================================================================

-- Same as notes - only for purchased decks
CREATE POLICY "Users can view note types for purchased decks"
  ON note_types FOR SELECT
  USING (
    product_id IN (
      SELECT product_id FROM purchases 
      WHERE user_id = auth.uid() 
      AND payment_status = 'completed'
    )
  );

-- ============================================================================
-- DECK MEDIA POLICIES
-- ============================================================================

-- Users can view media for purchased decks
CREATE POLICY "Users can view media for purchased decks"
  ON deck_media FOR SELECT
  USING (
    product_id IN (
      SELECT product_id FROM purchases 
      WHERE user_id = auth.uid() 
      AND payment_status = 'completed'
    )
  );

-- ============================================================================
-- PROTECTED FIELDS/TAGS POLICIES
-- ============================================================================

-- Users can view protected fields/tags for purchased decks
CREATE POLICY "Users can view protected fields for purchased decks"
  ON protected_fields FOR SELECT
  USING (
    product_id IN (
      SELECT product_id FROM purchases 
      WHERE user_id = auth.uid() 
      AND payment_status = 'completed'
    )
  );

CREATE POLICY "Users can view protected tags for purchased decks"
  ON protected_tags FOR SELECT
  USING (
    product_id IN (
      SELECT product_id FROM purchases 
      WHERE user_id = auth.uid() 
      AND payment_status = 'completed'
    )
  );

-- ============================================================================
-- DECK EXTENSIONS POLICIES
-- ============================================================================

-- Users can view extensions for decks they have purchased
CREATE POLICY "Users can view extensions for purchased decks"
  ON deck_extensions FOR SELECT
  USING (
    product_id IN (
      SELECT product_id FROM purchases 
      WHERE user_id = auth.uid() 
      AND payment_status = 'completed'
    )
  );

-- Users can create extensions for decks they own
CREATE POLICY "Users can create extensions for owned decks"
  ON deck_extensions FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id AND
    product_id IN (
      SELECT product_id FROM purchases WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- NOTE CUSTOMIZATIONS POLICIES
-- ============================================================================

-- Users can view customizations for extensions they have access to
CREATE POLICY "Users can view customizations for accessible extensions"
  ON note_customizations FOR SELECT
  USING (
    deck_extension_id IN (
      SELECT id FROM deck_extensions
      WHERE product_id IN (
        SELECT product_id FROM purchases 
        WHERE user_id = auth.uid() 
        AND payment_status = 'completed'
      )
    )
  );

-- ============================================================================
-- NOTES ACTIONS POLICIES
-- ============================================================================

-- Users can view actions for purchased decks
CREATE POLICY "Users can view actions for purchased decks"
  ON notes_actions FOR SELECT
  USING (
    product_id IN (
      SELECT product_id FROM purchases 
      WHERE user_id = auth.uid() 
      AND payment_status = 'completed'
    )
  );

-- ============================================================================
-- SUGGESTIONS POLICIES
-- ============================================================================

-- Users can view their own suggestions
CREATE POLICY "Users can view their own suggestions"
  ON change_note_suggestions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create suggestions for decks they have purchased
CREATE POLICY "Users can create change note suggestions"
  ON change_note_suggestions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    note_id IN (
      SELECT id FROM notes
      WHERE product_id IN (
        SELECT product_id FROM purchases 
        WHERE user_id = auth.uid() 
        AND payment_status = 'completed'
      )
    )
  );

-- Users can view their own new note suggestions
CREATE POLICY "Users can view their own new note suggestions"
  ON new_note_suggestions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create new note suggestions for decks they have purchased
CREATE POLICY "Users can create new note suggestions"
  ON new_note_suggestions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    product_id IN (
      SELECT product_id FROM purchases 
      WHERE user_id = auth.uid() 
      AND payment_status = 'completed'
    )
  );

-- ============================================================================
-- REVIEW DATA POLICIES
-- ============================================================================

-- Users can only view their own review data
CREATE POLICY "Users can view their own review data"
  ON card_review_data FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert/update their own review data
CREATE POLICY "Users can manage their own review data"
  ON card_review_data FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can only view their own daily summaries
CREATE POLICY "Users can view their own daily summaries"
  ON daily_card_review_summaries FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert/update their own daily summaries
CREATE POLICY "Users can manage their own daily summaries"
  ON daily_card_review_summaries FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- FEATURE FLAGS POLICIES
-- ============================================================================

-- All authenticated users can view feature flags
CREATE POLICY "Authenticated users can view feature flags"
  ON feature_flags FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can view their own feature flag overrides
CREATE POLICY "Users can view their own feature flag overrides"
  ON user_feature_flags FOR SELECT
  USING (auth.uid() = user_id);

-- Users can manage their own feature flag overrides
CREATE POLICY "Users can manage their own feature flag overrides"
  ON user_feature_flags FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

