// Supabase Edge Function: POST /addon-auth/download
// Generates signed download URL for a purchased deck

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DownloadRequest {
  product_id: string
}

interface DownloadResponse {
  success: boolean
  download_url: string
  deck_title: string
  expires_in: number
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
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { product_id }: DownloadRequest = await req.json()

    if (!product_id) {
      return new Response(
        JSON.stringify({ error: 'missing_product_id', message: 'product_id is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

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
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check if user has purchased this deck (payment must be completed)
    // Payment confirmation happens on web app, not in addon
    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .select('product_id')
      .eq('user_id', user.id)
      .eq('product_id', product_id)
      .eq('payment_status', 'completed') // Only allow download if payment completed
      .single()

    if (purchaseError || !purchase) {
      return new Response(
        JSON.stringify({ 
          error: 'not_purchased', 
          message: 'You have not purchased this deck' 
        }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get product info
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('title, apkg_path')
      .eq('id', product_id)
      .single()

    if (productError || !product) {
      return new Response(
        JSON.stringify({ error: 'not_found', message: 'Deck not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!product.apkg_path) {
      return new Response(
        JSON.stringify({ error: 'no_file', message: 'Deck file not available' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Generate signed URL (valid for 1 hour)
    const expiresIn = 3600 // 1 hour in seconds
    const { data: signedUrlData, error: signedUrlError } = await supabase
      .storage
      .from('decks')
      .createSignedUrl(product.apkg_path, expiresIn)

    if (signedUrlError || !signedUrlData) {
      console.error('Error generating signed URL:', signedUrlError)
      return new Response(
        JSON.stringify({ error: 'server_error', message: 'Failed to generate download URL' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const response: DownloadResponse = {
      success: true,
      download_url: signedUrlData.signedUrl,
      deck_title: product.title,
      expires_in: expiresIn,
    }

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Download error:', error)
    return new Response(
      JSON.stringify({ error: 'server_error', message: 'An unexpected error occurred' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

