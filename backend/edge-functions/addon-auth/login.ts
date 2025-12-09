// Supabase Edge Function: POST /addon-auth/login
// Authenticates user and returns access token with purchased decks

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface LoginRequest {
  email: string
  password: string
}

interface LoginResponse {
  success: boolean
  access_token: string
  user: {
    id: string
    email: string
    display_name: string | null
  }
  purchased_decks: Array<{
    id: string
    title: string
    description: string | null
    category: string | null
    card_count: number
    apkg_path: string | null
  }>
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, password }: LoginRequest = await req.json()

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'missing_credentials', message: 'Email and password are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Authenticate user
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError || !authData.user || !authData.session) {
      return new Response(
        JSON.stringify({ 
          error: 'invalid_credentials', 
          message: 'Invalid email or password' 
        }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', authData.user.id)
      .single()

    // Get purchased decks
    const { data: purchases } = await supabase
      .from('purchases')
      .select(`
        product_id,
        products (
          id,
          title,
          description,
          category,
          card_count,
          apkg_path
        )
      `)
      .eq('user_id', authData.user.id)

    const purchased_decks = (purchases || []).map((p: any) => ({
      id: p.products.id,
      title: p.products.title,
      description: p.products.description,
      category: p.products.category,
      card_count: p.products.card_count || 0,
      apkg_path: p.products.apkg_path,
    }))

    const response: LoginResponse = {
      success: true,
      access_token: authData.session.access_token,
      user: {
        id: authData.user.id,
        email: authData.user.email!,
        display_name: profile?.display_name || null,
      },
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
    console.error('Login error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'server_error', 
        message: 'An unexpected error occurred' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

