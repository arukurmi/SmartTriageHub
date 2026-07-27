const { createClient } = require('@supabase/supabase-js');

// A single service-role Supabase client shared across the backend. The
// service-role key bypasses row-level security, so this module must only ever
// be required by trusted server-side code (routes, cron jobs, services) — never
// exposed to the client.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = supabaseAdmin;
