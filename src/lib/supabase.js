import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY

const isSecretKey = publishableKey?.startsWith('sb_secret_')

if(isSecretKey){
  console.error('Supabase secret keys cannot be used in browser apps. Use a publishable or anon public key instead.')
}

export const supabase = url && publishableKey && !isSecretKey ? createClient(url, publishableKey) : null
