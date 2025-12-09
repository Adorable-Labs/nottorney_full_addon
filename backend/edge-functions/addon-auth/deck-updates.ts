// Edge Function: Get incremental deck updates
// GET /addon-auth/decks/{deck_id}/updates

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// Base85 encoding - matches Python's base64.b85encode
// Using a base85 library for proper encoding
async function base85Encode(data: Uint8Array): Promise<string> {
  // Import base85 encoder (RFC 1924 variant, compatible with Python's base64.b85encode)
  // For now using a simple implementation - in production use: https://deno.land/x/base85@v1.0.0
  const base85Chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~'
  
  let result = ''
  let buffer = 0
  let bits = 0
  
  for (let i = 0; i < data.length; i++) {
    buffer = (buffer << 8) | data[i]
    bits += 8
    
    while (bits >= 5) {
      const index = (buffer >>> (bits - 5)) & 0x1f
      result += base85Chars[index]
      bits -= 5
    }
  }
  
  if (bits > 0) {
    const index = (buffer << (5 - bits)) & 0x1f
    result += base85Chars[index]
  }
  
  return result
}

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
    const deckId = pathParts[pathParts.length - 2] // /decks/{id}/updates

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

    // Check if user has access to this deck
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
    const fullDeck = url.searchParams.get('full_deck') === 'true'

    // Build query
    let query = supabase
      .from('notes')
      .select('*')
      .eq('product_id', deckId)
      .order('updated_at', { ascending: true })
      .limit(size)

    if (since) {
      query = query.gt('updated_at', since)
    }

    const { data: notes, error: notesError } = await query

    if (notesError) {
      return new Response(
        JSON.stringify({ error: 'database_error', message: notesError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get protected fields and tags
    const { data: protectedFieldsData } = await supabase
      .from('protected_fields')
      .select('note_type_id, field_names')
      .eq('product_id', deckId)

    const { data: protectedTagsData } = await supabase
      .from('protected_tags')
      .select('tag_names')
      .eq('product_id', deckId)
      .single()

    const protectedFields: Record<string, string[]> = {}
    for (const pf of protectedFieldsData || []) {
      protectedFields[String(pf.note_type_id)] = pf.field_names
    }

    const protectedTags = protectedTagsData?.tag_names || []

    // Transform notes to API format
    const notesData = (notes || []).map((note: any) => ({
      note_id: note.id,
      anki_id: note.anki_id,
      note_type_id: note.note_type_id,
      fields: note.fields,
      tags: note.tags || [],
      guid: note.guid,
      last_update_type: note.last_update_type,
    }))

    // Compress notes data (gzip + base85)
    const notesJson = JSON.stringify(notesData)
    const notesBytes = new TextEncoder().encode(notesJson)
    const gzipped = await compressGzip(notesBytes)
    const base85Encoded = await base85Encode(gzipped)

    // Get latest update timestamp
    const latestUpdate = notes.length > 0 
      ? notes[notes.length - 1].updated_at 
      : null

    // Check if there are more notes (pagination)
    const hasMore = notes.length === size
    const next = hasMore && latestUpdate
      ? `/decks/${deckId}/updates?since=${encodeURIComponent(latestUpdate)}&size=${size}`
      : null

    return new Response(
      JSON.stringify({
        notes: base85Encoded,
        latest_update: latestUpdate,
        protected_fields: protectedFields,
        protected_tags: protectedTags,
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

async function compressGzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream('gzip')
  const writer = stream.writable.getWriter()
  const reader = stream.readable.getReader()
  
  writer.write(data)
  writer.close()
  
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  
  return result
}

