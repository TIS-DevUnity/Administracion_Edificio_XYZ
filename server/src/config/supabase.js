const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET;

module.exports = { supabase, STORAGE_BUCKET };
