// Edge Function: Get deck extensions
// GET /addon-auth/users/deck_extensions
// GET /addon-auth/deck_extensions/{id}/note_customizations/

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PAGE_SIZE = 2000

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

    // Route based on path
    if (pathParts[pathParts.length - 1] === 'deck_extensions') {
      return await handleGetExtensions(supabase, user.id, url)
    } else if (pathParts[pathParts.length - 1] === 'note_customizations') {
      const extensionId = parseInt(pathParts[pathParts.length - 2])
      return await handleGetExtensionUpdates(supabase, user.id, extensionId, url)
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

async function handleGetExtensions(supabase: any, userId: string, url: URL) {
  const deckId = url.searchParams.get('deck_id')

  let query = supabase
    .from('deck_extensions')
    .select(`
      id,
      product_id,
      owner_id,
      name,
      tag_group_name,
      description,
      products!inner(id)
    `)

  if (deckId) {
    query = query.eq('product_id', deckId)
  }

  // Only show extensions for decks user has purchased
  const { data: purchases } = await supabase
    .from('purchases')
    .select('product_id')
    .eq('user_id', userId)
    .eq('payment_status', 'completed')

  const purchasedDeckIds = (purchases || []).map((p: any) => p.product_id)

  if (purchasedDeckIds.length === 0) {
    return new Response(
      JSON.stringify({ deck_extensions: [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  query = query.in('product_id', purchasedDeckIds)

  const { data: extensions, error } = await query

  if (error) {
    return new Response(
      JSON.stringify({ error: 'database_error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Check subscriptions
  const { data: subscriptions } = await supabase
    .from('deck_subscriptions')
    .select('product_id')
    .eq('user_id', userId)

  const subscribedDeckIds = new Set((subscriptions || []).map((s: any) => s.product_id))

  const result = (extensions || []).map((ext: any) => ({
    id: ext.id,
    deck: ext.product_id,
    owner: ext.owner_id,
    name: ext.name,
    tag_group_name: ext.tag_group_name,
    description: ext.description,
    user_relation: subscribedDeckIds.has(ext.product_id) ? 'subscriber' : 'none',
  }))

  return new Response(
    JSON.stringify({ deck_extensions: result }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleGetExtensionUpdates(supabase: any, userId: string, extensionId: number, url: URL) {
  // Check if user has access to this extension's deck
  const { data: extension, error: extError } = await supabase
    .from('deck_extensions')
    .select('product_id')
    .eq('id', extensionId)
    .single()

  if (extError || !extension) {
    return new Response(
      JSON.stringify({ error: 'not_found', message: 'Extension not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Check access
  const { data: purchase } = await supabase
    .from('purchases')
    .select('id')
    .eq('user_id', userId)
    .eq('product_id', extension.product_id)
    .eq('payment_status', 'completed')
    .single()

  if (!purchase) {
    return new Response(
      JSON.stringify({ error: 'forbidden', message: 'You do not have access to this extension' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get query parameters
  const since = url.searchParams.get('since')
  const size = parseInt(url.searchParams.get('size') || String(PAGE_SIZE))

  // Get note customizations
  let query = supabase
    .from('note_customizations')
    .select(`
      note_id,
      tags,
      updated_at,
      notes!inner(id)
    `)
    .eq('deck_extension_id', extensionId)
    .order('updated_at', { ascending: true })
    .limit(size)

  if (since) {
    query = query.gt('updated_at', since)
  }

  const { data: customizations, error } = await query

  if (error) {
    return new Response(
      JSON.stringify({ error: 'database_error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Transform to API format
  const noteCustomizations = (customizations || []).map((c: any) => ({
    note: c.note_id,
    tags: c.tags || [],
  }))

  // Get latest update
  const latestUpdate = customizations.length > 0
    ? customizations[customizations.length - 1].updated_at
    : null

  // Check if there are more
  const hasMore = customizations.length === size
  const next = hasMore && latestUpdate
    ? `/deck_extensions/${extensionId}/note_customizations/?since=${encodeURIComponent(latestUpdate)}&size=${size}`
    : null

  return new Response(
    JSON.stringify({
      note_customizations: noteCustomizations,
      latest_update: latestUpdate,
      next,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

