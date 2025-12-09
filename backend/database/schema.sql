-- Nottorney Backend Database Schema
-- For Supabase PostgreSQL

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable RLS
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Products table (decks for sale)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  card_count INTEGER DEFAULT 0,
  category TEXT,
  apkg_path TEXT, -- Storage path to .apkg file
  featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Purchases table
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  stripe_payment_id TEXT,
  purchased_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- INCREMENTAL SYNC TABLES (Phase 2)
-- ============================================================================

-- Deck subscriptions (for sync-enabled decks)
CREATE TABLE IF NOT EXISTS deck_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- Notes table (for incremental sync)
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  anki_id BIGINT NOT NULL,
  note_type_id BIGINT NOT NULL,
  fields JSONB NOT NULL,
  tags TEXT[],
  guid TEXT NOT NULL,
  last_update_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, anki_id)
);

-- Note types table
CREATE TABLE IF NOT EXISTS note_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  anki_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  fields JSONB,
  templates JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, anki_id)
);

-- Deck media table
CREATE TABLE IF NOT EXISTS deck_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  file_content_hash TEXT,
  modified TIMESTAMPTZ DEFAULT now(),
  referenced_on_accepted_note BOOLEAN DEFAULT true,
  exists_on_s3 BOOLEAN DEFAULT true,
  download_enabled BOOLEAN DEFAULT true,
  UNIQUE(product_id, name)
);

-- Protected fields (fields users shouldn't sync)
CREATE TABLE IF NOT EXISTS protected_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  note_type_id BIGINT NOT NULL,
  field_names TEXT[] NOT NULL,
  UNIQUE(product_id, note_type_id)
);

-- Protected tags
CREATE TABLE IF NOT EXISTS protected_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  tag_names TEXT[] NOT NULL,
  UNIQUE(product_id)
);

-- Deck extensions (optional tag groups)
CREATE TABLE IF NOT EXISTS deck_extensions (
  id SERIAL PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  tag_group_name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Note customizations (tags for deck extensions)
CREATE TABLE IF NOT EXISTS note_customizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_extension_id INTEGER REFERENCES deck_extensions(id) ON DELETE CASCADE NOT NULL,
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE NOT NULL,
  tags TEXT[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(deck_extension_id, note_id)
);

-- Notes actions (e.g., unsuspend cards)
CREATE TABLE IF NOT EXISTS notes_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL, -- 'unsuspend', etc.
  note_ids UUID[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Products
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured) WHERE featured = true;

-- Purchases
CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_product_id ON purchases(product_id);

-- Notes (for incremental sync)
CREATE INDEX IF NOT EXISTS idx_notes_product_id ON notes(product_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
CREATE INDEX IF NOT EXISTS idx_notes_anki_id ON notes(anki_id);

-- Note types
CREATE INDEX IF NOT EXISTS idx_note_types_product_id ON note_types(product_id);

-- Deck media
CREATE INDEX IF NOT EXISTS idx_deck_media_product_id ON deck_media(product_id);
CREATE INDEX IF NOT EXISTS idx_deck_media_modified ON deck_media(modified);

-- Subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON deck_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_product_id ON deck_subscriptions(product_id);

-- Note customizations
CREATE INDEX IF NOT EXISTS idx_note_customizations_extension_id ON note_customizations(deck_extension_id);
CREATE INDEX IF NOT EXISTS idx_note_customizations_updated_at ON note_customizations(updated_at);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_note_types_updated_at BEFORE UPDATE ON note_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

