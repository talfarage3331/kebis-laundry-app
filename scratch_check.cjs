const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rmmakgwpmhhnzilauitk.supabase.co';
const supabaseAnonKey = 'sb_publishable_YxRo-jTKmA4N0vr82RcSEA_W5Z1lRrV';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log("=== INSPECTING RLS POLICIES ===");
  // Query Supabase RPC or system views if possible
  const { data, error } = await supabase.from('pg_policies').select('*');
  if (error) {
    console.log("pg_policies query error:", error.message);
    
    // Let's try custom postgres query if RPC exists, otherwise print error
    const { data: d2, error: e2 } = await supabase.rpc('inspect_policies');
    if (e2) {
      console.log("inspect_policies RPC error:", e2.message);
    } else {
      console.log("Policies:", d2);
    }
  } else {
    console.log("Policies:", data);
  }
}

main();
