-- Storage Buckets Setup for Nottorney Backend
-- Run this in Supabase SQL Editor

-- ============================================================================
-- CREATE STORAGE BUCKETS
-- ============================================================================

-- Bucket for .apkg deck files (private, requires authentication)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'decks',
  'decks',
  false, -- Private bucket
  1073741824, -- 1GB max file size
  ARRAY['application/zip', 'application/x-zip-compressed', 'application/vnd.anki']
)
ON CONFLICT (id) DO NOTHING;

-- Bucket for deck media files (images, audio) - public read, private write
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'deck-media',
  'deck-media',
  true, -- Public read access
  52428800, -- 50MB max file size
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STORAGE POLICIES FOR 'decks' BUCKET (Private)
-- ============================================================================

-- Allow authenticated users to download decks they've purchased
CREATE POLICY "Users can download purchased decks"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'decks' AND
  auth.uid() IN (
    SELECT user_id FROM purchases
    WHERE product_id::text = (storage.foldername(name))[1]
  )
);

-- Allow admins to upload deck files
CREATE POLICY "Admins can upload deck files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'decks' AND
  auth.uid() IN (
    SELECT id FROM auth.users 
    WHERE raw_user_meta_data->>'role' = 'admin'
  )
);

-- Allow admins to update deck files
CREATE POLICY "Admins can update deck files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'decks' AND
  auth.uid() IN (
    SELECT id FROM auth.users 
    WHERE raw_user_meta_data->>'role' = 'admin'
  )
);

-- Allow admins to delete deck files
CREATE POLICY "Admins can delete deck files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'decks' AND
  auth.uid() IN (
    SELECT id FROM auth.users 
    WHERE raw_user_meta_data->>'role' = 'admin'
  )
);

-- ============================================================================
-- STORAGE POLICIES FOR 'deck-media' BUCKET (Public Read)
-- ============================================================================

-- Anyone can read media files (public bucket)
CREATE POLICY "Anyone can read media files"
ON storage.objects FOR SELECT
USING (bucket_id = 'deck-media');

-- Only admins can upload media files
CREATE POLICY "Admins can upload media files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'deck-media' AND
  auth.uid() IN (
    SELECT id FROM auth.users 
    WHERE raw_user_meta_data->>'role' = 'admin'
  )
);

-- Only admins can update media files
CREATE POLICY "Admins can update media files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'deck-media' AND
  auth.uid() IN (
    SELECT id FROM auth.users 
    WHERE raw_user_meta_data->>'role' = 'admin'
  )
);

-- Only admins can delete media files
CREATE POLICY "Admins can delete media files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'deck-media' AND
  auth.uid() IN (
    SELECT id FROM auth.users 
    WHERE raw_user_meta_data->>'role' = 'admin'
  )
);

