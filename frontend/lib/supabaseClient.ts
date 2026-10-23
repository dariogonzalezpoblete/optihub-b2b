import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { installRecoveryProof } from './auth/recoveryProof';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const rawAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

const isConfigured = Boolean(rawUrl && rawAnonKey);

// Fallback safely to a harmless dummy placeholder during build/SSR or when env vars are missing,
// ensuring execution NEVER defaults or falls back to the production Supabase project (yrdjnkbrvynmnzyrxlfx).
const supabaseUrl = isConfigured ? (rawUrl as string) : 'https://placeholder-unconfigured.supabase.co';
const supabaseAnonKey = isConfigured ? (rawAnonKey as string) : 'placeholder-anon-key-unconfigured';

export const isSupabaseConfigured = isConfigured;

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

if (typeof window !== 'undefined') {
  installRecoveryProof(supabase);
}
