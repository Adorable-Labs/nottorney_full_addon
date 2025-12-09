// Edge Function: Get media file updates
// GET /addon-auth/decks/{deck_id}/media/list/

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
    const deckId = pathParts[pathParts.length - 3] // /decks/{id}/media/list/

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

    // Get query parameters
    const since = url.searchParams.get('since')
    const size = parseInt(url.searchParams.get('size') || String(PAGE_SIZE))

    // Build query
    let query = supabase
      .from('deck_media')
      .select('*')
      .eq('product_id', deckId)
      .order('modified', { ascending: true })
      .limit(size)

    if (since) {
      query = query.gt('modified', since)
    }

    const { data: media, error: mediaError } = await query

    if (mediaError) {
      return new Response(
        JSON.stringify({ error: 'database_error', message: mediaError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Transform to API format
    const mediaData = (media || []).map((m: any) => ({
      name: m.name,
      file_content_hash: m.file_content_hash,
      modified: m.modified,
      referenced_on_accepted_note: m.referenced_on_accepted_note ?? true,
      exists_on_s3: m.exists_on_s3 ?? true,
      download_enabled: m.download_enabled ?? true,
    }))

    // Get latest update
    const latestUpdate = media.length > 0 
      ? media[media.length - 1].modified 
      : null

    // Check if there are more (pagination)
    const hasMore = media.length === size
    const next = hasMore && latestUpdate
      ? `/decks/${deckId}/media/list/?since=${encodeURIComponent(latestUpdate)}&size=${size}`
      : null

    return new Response(
      JSON.stringify({
        media: mediaData,
        latest_update: latestUpdate,
        next,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'internal_error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

