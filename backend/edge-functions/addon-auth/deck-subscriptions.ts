// Edge Function: Manage deck subscriptions
// GET /addon-auth/decks/subscriptions/
// POST /addon-auth/decks/subscriptions/
// DELETE /addon-auth/decks/{deck_id}/subscriptions/

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

    // Route based on method and path
    if (req.method === 'GET' && pathParts[pathParts.length - 1] === 'subscriptions') {
      return await handleGetSubscriptions(supabase, user.id)
    } else if (req.method === 'POST' && pathParts[pathParts.length - 1] === 'subscriptions') {
      return await handleSubscribe(req, supabase, user.id)
    } else if (req.method === 'DELETE' && pathParts[pathParts.length - 1] === 'subscriptions') {
      const deckId = pathParts[pathParts.length - 2]
      return await handleUnsubscribe(supabase, user.id, deckId)
    }

    return new Response(
      JSON.stringify({ error: 'not_found', message: 'Endpoint not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'internal_error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function handleGetSubscriptions(supabase: any, userId: string) {
  const { data: subscriptions, error } = await supabase
    .from('deck_subscriptions')
    .select(`
      product_id,
      products (
        id,
        title,
        description,
        category,
        card_count,
        apkg_path,
        updated_at
      )
    `)
    .eq('user_id', userId)

  if (error) {
    return new Response(
      JSON.stringify({ error: 'database_error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Transform to API format
  const result = (subscriptions || []).map((sub: any) => ({
    deck: {
      id: sub.products.id,
      anki_id: 0, // Not stored in products table, would need to add
      name: sub.products.title,
      csv_last_upload: sub.products.updated_at,
      csv_notes_filename: '', // Would need to store this
      media_upload_finished: true,
      user_relation: 'subscriber',
      has_note_embeddings: false,
    },
  }))

  return new Response(
    JSON.stringify(result),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleSubscribe(req: Request, supabase: any, userId: string) {
  const body = await req.json()
  const deckId = body.deck

  if (!deckId) {
    return new Response(
      JSON.stringify({ error: 'bad_request', message: 'deck is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Check if user has purchased the deck
  const { data: purchase } = await supabase
    .from('purchases')
    .select('id')
    .eq('user_id', userId)
    .eq('product_id', deckId)
    .eq('payment_status', 'completed')
    .single()

  if (!purchase) {
    return new Response(
      JSON.stringify({ error: 'forbidden', message: 'You must purchase the deck before subscribing' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Create subscription
  const { error } = await supabase
    .from('deck_subscriptions')
    .insert({
      user_id: userId,
      product_id: deckId,
    })

  if (error) {
    // If already subscribed, that's okay
    if (error.code === '23505') { // Unique violation
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    return new Response(
      JSON.stringify({ error: 'database_error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleUnsubscribe(supabase: any, userId: string, deckId: string) {
  const { error } = await supabase
    .from('deck_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('product_id', deckId)

  if (error) {
    return new Response(
      JSON.stringify({ error: 'database_error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    null,
    { status: 204, headers: corsHeaders }
  )
}

