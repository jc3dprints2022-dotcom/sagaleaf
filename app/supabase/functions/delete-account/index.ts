// Supabase Edge Function: deletes the signed-in user's account and their synced rows.
// Deploy (not done by the app; see docs/ANDROID.md and the PR description):
//   supabase functions deploy delete-account --project-ref <ref>
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided to functions automatically.
// The app calls it with the user's own session token (supabase.functions.invoke), so a caller can only delete themselves.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405)
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return reply({ error: 'Sign in first' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: { user }, error: who } = await asUser.auth.getUser(token)
  if (who || !user) return reply({ error: 'Invalid session' }, 401)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const rows = await admin.from('saga_sync').delete().eq('user_id', user.id)
  if (rows.error) return reply({ error: `Couldn't delete synced data: ${rows.error.message}` }, 500)
  const gone = await admin.auth.admin.deleteUser(user.id)
  if (gone.error) return reply({ error: `Couldn't delete the account: ${gone.error.message}` }, 500)
  return reply({ deleted: true })
})
