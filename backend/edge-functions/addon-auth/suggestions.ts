// Edge Function: Handle note suggestions
// POST /addon-auth/notes/{note_id}/suggestion/
// POST /addon-auth/decks/{deck_id}/note-suggestion/
// POST /addon-auth/notes/bulk-change-suggestions/
// POST /addon-auth/notes/bulk-new-note-suggestions/

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ChangeNoteSuggestionRequest {
  ankihub_id: string
  anki_id: number
  fields: Array<{ name: string; value: string }>
  added_tags: string[]
  removed_tags: string[]
  change_type: string
  comment: string
  auto_accept: boolean
}

interface NewNoteSuggestionRequest {
  deck_id: string
  note_type_id: number
  note_type: string
  anki_id: number
  fields: Array<{ name: string; value: string }>
  tags: string[] | null
  guid: string
  comment: string
  auto_accept: boolean
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get authorization header
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

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    })

    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'unauthorized', message: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Route to appropriate handler
    if (pathParts[pathParts.length - 1] === 'suggestion' && pathParts[pathParts.length - 2] === 'note') {
      // POST /addon-auth/notes/{note_id}/suggestion/
      return await handleChangeNoteSuggestion(req, supabase, user.id)
    } else if (pathParts[pathParts.length - 1] === 'note-suggestion') {
      // POST /addon-auth/decks/{deck_id}/note-suggestion/
      return await handleNewNoteSuggestion(req, supabase, user.id)
    } else if (pathParts[pathParts.length - 1] === 'bulk-change-suggestions') {
      // POST /addon-auth/notes/bulk-change-suggestions/
      return await handleBulkChangeSuggestions(req, supabase, user.id)
    } else if (pathParts[pathParts.length - 1] === 'bulk-new-note-suggestions') {
      // POST /addon-auth/notes/bulk-new-note-suggestions/
      return await handleBulkNewNoteSuggestions(req, supabase, user.id)
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

async function handleChangeNoteSuggestion(req: Request, supabase: any, userId: string) {
  const body: ChangeNoteSuggestionRequest = await req.json()
  const url = new URL(req.url)
  const noteId = url.pathname.split('/').filter(Boolean)[2] // Extract note_id from path

  // Find the note
  const { data: note, error: noteError } = await supabase
    .from('notes')
    .select('id, product_id')
    .eq('id', noteId)
    .single()

  if (noteError || !note) {
    return new Response(
      JSON.stringify({ error: 'not_found', message: 'Note not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Check if user has access to the deck
  const { data: purchase } = await supabase
    .from('purchases')
    .select('id')
    .eq('user_id', userId)
    .eq('product_id', note.product_id)
    .eq('payment_status', 'completed')
    .single()

  if (!purchase) {
    return new Response(
      JSON.stringify({ error: 'forbidden', message: 'You do not have access to this deck' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Create suggestion
  const { data: suggestion, error: suggestionError } = await supabase
    .from('change_note_suggestions')
    .insert({
      note_id: note.id,
      user_id: userId,
      change_type: body.change_type,
      fields: body.fields,
      added_tags: body.added_tags || [],
      removed_tags: body.removed_tags || [],
      comment: body.comment,
      auto_accept: body.auto_accept || false,
      status: body.auto_accept ? 'accepted' : 'pending',
    })
    .select()
    .single()

  if (suggestionError) {
    return new Response(
      JSON.stringify({ error: 'database_error', message: suggestionError.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ success: true, suggestion_id: suggestion.id }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleNewNoteSuggestion(req: Request, supabase: any, userId: string) {
  const body: NewNoteSuggestionRequest = await req.json()
  const url = new URL(req.url)
  const deckId = url.pathname.split('/').filter(Boolean)[2] // Extract deck_id from path

  // Check if user has access to the deck
  const { data: purchase } = await supabase
    .from('purchases')
    .select('id')
    .eq('user_id', userId)
    .eq('product_id', deckId)
    .eq('payment_status', 'completed')
    .single()

  if (!purchase) {
    return new Response(
      JSON.stringify({ error: 'forbidden', message: 'You do not have access to this deck' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Create suggestion
  const { data: suggestion, error: suggestionError } = await supabase
    .from('new_note_suggestions')
    .insert({
      product_id: deckId,
      user_id: userId,
      note_type_id: body.note_type_id,
      note_type_name: body.note_type,
      fields: body.fields,
      tags: body.tags || [],
      guid: body.guid,
      comment: body.comment,
      auto_accept: body.auto_accept || false,
      status: body.auto_accept ? 'accepted' : 'pending',
    })
    .select()
    .single()

  if (suggestionError) {
    return new Response(
      JSON.stringify({ error: 'database_error', message: suggestionError.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ success: true, suggestion_id: suggestion.id }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleBulkChangeSuggestions(req: Request, supabase: any, userId: string) {
  const body = await req.json()
  const suggestions: ChangeNoteSuggestionRequest[] = body.suggestions || []
  const autoAccept = body.auto_accept || false

  const results = []

  for (const suggestion of suggestions) {
    try {
      // Find the note
      const { data: note } = await supabase
        .from('notes')
        .select('id, product_id')
        .eq('id', suggestion.ankihub_id)
        .single()

      if (!note) {
        results.push({
          anki_id: suggestion.anki_id,
          validation_errors: ['Note not found'],
        })
        continue
      }

      // Check access
      const { data: purchase } = await supabase
        .from('purchases')
        .select('id')
        .eq('user_id', userId)
        .eq('product_id', note.product_id)
        .eq('payment_status', 'completed')
        .single()

      if (!purchase) {
        results.push({
          anki_id: suggestion.anki_id,
          validation_errors: ['You do not have access to this deck'],
        })
        continue
      }

      // Create suggestion
      const { error } = await supabase
        .from('change_note_suggestions')
        .insert({
          note_id: note.id,
          user_id: userId,
          change_type: suggestion.change_type,
          fields: suggestion.fields,
          added_tags: suggestion.added_tags || [],
          removed_tags: suggestion.removed_tags || [],
          comment: suggestion.comment,
          auto_accept: autoAccept,
          status: autoAccept ? 'accepted' : 'pending',
        })

      if (error) {
        results.push({
          anki_id: suggestion.anki_id,
          validation_errors: [error.message],
        })
      } else {
        results.push({
          anki_id: suggestion.anki_id,
          validation_errors: null,
        })
      }
    } catch (error) {
      results.push({
        anki_id: suggestion.anki_id,
        validation_errors: [error.message],
      })
    }
  }

  return new Response(
    JSON.stringify(results),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleBulkNewNoteSuggestions(req: Request, supabase: any, userId: string) {
  const body = await req.json()
  const suggestions: NewNoteSuggestionRequest[] = body.suggestions || []
  const autoAccept = body.auto_accept || false

  const results = []

  for (const suggestion of suggestions) {
    try {
      // Check access
      const { data: purchase } = await supabase
        .from('purchases')
        .select('id')
        .eq('user_id', userId)
        .eq('product_id', suggestion.deck_id)
        .eq('payment_status', 'completed')
        .single()

      if (!purchase) {
        results.push({
          anki_id: suggestion.anki_id,
          validation_errors: ['You do not have access to this deck'],
        })
        continue
      }

      // Create suggestion
      const { error } = await supabase
        .from('new_note_suggestions')
        .insert({
          product_id: suggestion.deck_id,
          user_id: userId,
          note_type_id: suggestion.note_type_id,
          note_type_name: suggestion.note_type,
          fields: suggestion.fields,
          tags: suggestion.tags || [],
          guid: suggestion.guid,
          comment: suggestion.comment,
          auto_accept: autoAccept,
          status: autoAccept ? 'accepted' : 'pending',
        })

      if (error) {
        results.push({
          anki_id: suggestion.anki_id,
          validation_errors: [error.message],
        })
      } else {
        results.push({
          anki_id: suggestion.anki_id,
          validation_errors: null,
        })
      }
    } catch (error) {
      results.push({
        anki_id: suggestion.anki_id,
        validation_errors: [error.message],
      })
    }
  }

  return new Response(
    JSON.stringify(results),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

