// Edge Function: Get feature flags
// GET /addon-auth/feature-flags/

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

    // Get all feature flags
    const { data: flags, error: flagsError } = await supabase
      .from('feature_flags')
      .select('*')

    if (flagsError) {
      return new Response(
        JSON.stringify({ error: 'database_error', message: flagsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user-specific overrides
    const { data: userFlags } = await supabase
      .from('user_feature_flags')
      .select('flag_key, is_enabled')
      .eq('user_id', user.id)

    // Build response
    const flagsMap: Record<string, { is_active: boolean }> = {}

    for (const flag of flags || []) {
      // Check for user override first
      const userOverride = userFlags?.find(uf => uf.flag_key === flag.flag_key)
      
      if (userOverride) {
        flagsMap[flag.flag_key] = { is_active: userOverride.is_enabled }
      } else if (flag.is_active && flag.rollout_percentage > 0) {
        // Simple rollout logic: use user ID hash to determine if user gets feature
        const userHash = parseInt(user.id.replace(/-/g, '').substring(0, 8), 16)
        const shouldEnable = (userHash % 100) < flag.rollout_percentage
        flagsMap[flag.flag_key] = { is_active: shouldEnable }
      } else {
        flagsMap[flag.flag_key] = { is_active: flag.is_active }
      }
    }

    return new Response(
      JSON.stringify({ flags: flagsMap }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'internal_error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

