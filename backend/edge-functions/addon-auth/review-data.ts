// Edge Function: Handle review data tracking
// POST /addon-auth/users/card-review-data/
// POST /addon-auth/users/daily-card-review-summary/

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

    if (pathParts[pathParts.length - 1] === 'card-review-data') {
      return await handleCardReviewData(req, supabase, user.id)
    } else if (pathParts[pathParts.length - 1] === 'daily-card-review-summary') {
      return await handleDailyReviewSummary(req, supabase, user.id)
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

async function handleCardReviewData(req: Request, supabase: any, userId: string) {
  const reviews = await req.json()

  for (const review of reviews) {
    await supabase
      .from('card_review_data')
      .upsert({
        user_id: userId,
        product_id: review.deck_id,
        total_card_reviews_last_7_days: review.total_card_reviews_last_7_days,
        total_card_reviews_last_30_days: review.total_card_reviews_last_30_days,
        first_card_review_at: review.first_card_review_at,
        last_card_review_at: review.last_card_review_at,
      }, {
        onConflict: 'user_id,product_id',
      })
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleDailyReviewSummary(req: Request, supabase: any, userId: string) {
  const summaries = await req.json()

  for (const summary of summaries) {
    await supabase
      .from('daily_card_review_summaries')
      .upsert({
        user_id: userId,
        review_session_date: summary.review_session_date,
        total_cards_studied: summary.total_cards_studied,
        total_time_reviewing: summary.total_time_reviewing,
        total_cards_marked_as_again: summary.total_cards_marked_as_again,
        total_cards_marked_as_hard: summary.total_cards_marked_as_hard,
        total_cards_marked_as_good: summary.total_cards_marked_as_good,
        total_cards_marked_as_easy: summary.total_cards_marked_as_easy,
      }, {
        onConflict: 'user_id,review_session_date',
      })
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

