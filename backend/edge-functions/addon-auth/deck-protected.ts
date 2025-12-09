// Edge Function: Get protected fields and tags
// GET /addon-auth/decks/{deck_id}/protected-fields/
// GET /addon-auth/decks/{deck_id}/protected-tags/

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
    const deckId = pathParts[pathParts.length - 2]
    const endpoint = pathParts[pathParts.length - 1] // 'protected-fields' or 'protected-tags'

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

    if (endpoint === 'protected-fields') {
      // Get protected fields
      const { data: protectedFields, error: pfError } = await supabase
        .from('protected_fields')
        .select('note_type_id, field_names')
        .eq('product_id', deckId)

      if (pfError) {
        return new Response(
          JSON.stringify({ error: 'database_error', message: pfError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const fields: Record<string, string[]> = {}
      for (const pf of protectedFields || []) {
        fields[String(pf.note_type_id)] = pf.field_names
      }

      return new Response(
        JSON.stringify({ fields }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else if (endpoint === 'protected-tags') {
      // Get protected tags
      const { data: protectedTags, error: ptError } = await supabase
        .from('protected_tags')
        .select('tag_names')
        .eq('product_id', deckId)
        .single()

      if (ptError && ptError.code !== 'PGRST116') { // PGRST116 = no rows returned
        return new Response(
          JSON.stringify({ error: 'database_error', message: ptError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ tags: protectedTags?.tag_names || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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

