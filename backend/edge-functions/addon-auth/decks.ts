// Supabase Edge Function: GET /addon-auth/decks
// Returns user's purchased decks (requires Bearer token)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Deck {
  id: string
  title: string
  description: string | null
  category: string | null
  card_count: number
  apkg_path: string | null
  updated_at: string
}

interface DecksResponse {
  purchased_decks: Deck[]
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

    // Initialize Supabase client with user's token
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

    // Get purchased decks (only completed purchases)
    // Payment processing happens on web app, addon only checks purchase status
    const { data: purchases, error: purchasesError } = await supabase
      .from('purchases')
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
      .eq('user_id', user.id)
      .eq('payment_status', 'completed') // Only show completed purchases
      .order('purchased_at', { ascending: false })

    if (purchasesError) {
      console.error('Error fetching purchases:', purchasesError)
      return new Response(
        JSON.stringify({ error: 'server_error', message: 'Failed to fetch decks' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const purchased_decks: Deck[] = (purchases || [])
      .filter((p: any) => p.products) // Filter out any null products
      .map((p: any) => ({
        id: p.products.id,
        title: p.products.title,
        description: p.products.description,
        category: p.products.category,
        card_count: p.products.card_count || 0,
        apkg_path: p.products.apkg_path,
        updated_at: p.products.updated_at,
      }))

    const response: DecksResponse = {
      purchased_decks,
    }

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Decks error:', error)
    return new Response(
      JSON.stringify({ error: 'server_error', message: 'An unexpected error occurred' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

