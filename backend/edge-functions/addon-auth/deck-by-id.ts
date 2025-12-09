// Edge Function: Get deck by ID
// GET /addon-auth/decks/{deck_id}/

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'unauthorized', message: 'Missing or invalid authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const deckId = pathParts[pathParts.length - 2] // /decks/{id}/

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'unauthorized', message: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check access
    const { data: purchase } = await supabase
      .from('purchases')
      .select('id')
      .eq('user_id', user.id)
      .eq('product_id', deckId)
      .eq('payment_status', 'completed')
      .single()

    if (!purchase) {
      return new Response(
        JSON.stringify({ error: 'forbidden', message: 'You do not have access to this deck' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get product/deck info
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', deckId)
      .single()

    if (productError || !product) {
      return new Response(
        JSON.stringify({ error: 'not_found', message: 'Deck not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if subscribed
    const { data: subscription } = await supabase
      .from('deck_subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .eq('product_id', deckId)
      .single()

    // Transform to API format
    const result = {
      id: product.id,
      anki_id: 0, // Would need to store this in products table
      name: product.title,
      csv_last_upload: product.updated_at,
      csv_notes_filename: '', // Would need to store this
      media_upload_finished: true,
      user_relation: subscription ? 'subscriber' : 'none',
      has_note_embeddings: false,
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'internal_error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

