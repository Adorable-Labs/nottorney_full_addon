// Edge Function: Generate presigned URLs for storage
// GET /addon-auth/decks/generate-presigned-url

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
    const key = url.searchParams.get('key')
    const type = url.searchParams.get('type') // 'upload' or 'download'
    const many = url.searchParams.get('many') === 'true'

    if (!key || !type) {
      return new Response(
        JSON.stringify({ error: 'bad_request', message: 'key and type are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    // Generate presigned URL
    const bucket = key.startsWith('deck_assets/') ? 'deck-media' : 'decks'
    const expiresIn = 3600 // 1 hour

    let signedUrl: string

    if (type === 'download') {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(key, expiresIn)

      if (error) {
        return new Response(
          JSON.stringify({ error: 'storage_error', message: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      signedUrl = data.signedUrl
    } else if (type === 'upload') {
      if (many) {
        // For multiple uploads, return upload options
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUploadUrl(key)

        if (error) {
          return new Response(
            JSON.stringify({ error: 'storage_error', message: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        signedUrl = JSON.stringify(data)
      } else {
        // Single file upload
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUploadUrl(key)

        if (error) {
          return new Response(
            JSON.stringify({ error: 'storage_error', message: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        signedUrl = data.path
      }
    } else {
      return new Response(
        JSON.stringify({ error: 'bad_request', message: 'type must be upload or download' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ pre_signed_url: signedUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'internal_error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

