// Supabase client factory — build-safe stub.
//
// The project declares @supabase/supabase-js / @supabase/ssr in package.json as part
// of the required stack (Next.js + TypeScript + Tailwind + PostgreSQL + Prisma + Supabase Auth).
// Real auth wiring is enabled once the package is installed and env vars are set:
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
// Until then getSupabase() returns null and the app uses the local-first session in lib/auth.ts.
//
// To enable real Supabase auth, install deps, set the env vars, then replace the body below with:
//   const { createClient } = await import('@supabase/supabase-js');
//   return createClient(url, key);
export function getSupabase(): null {
  if (typeof window === 'undefined') return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  // Real client would be created here once the package is installed.
  return null;
}
