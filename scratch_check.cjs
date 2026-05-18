const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rmmakgwpmhhnzilauitk.supabase.co';
const supabaseAnonKey = 'sb_publishable_YxRo-jTKmA4N0vr82RcSEA_W5Z1lRrV';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log("=== TRYING TO INSERT BASIC ORDER ===");
  const { data, error } = await supabase.from('orders').insert([{
    user_email: 'talfarage@gmail.com',
    status: 'pending',
    delivery_method: 'none',
    payment_state: 'unpaid',
    amount_due: 0,
    total_price: 0
  }]).select();

  if (error) {
    console.error("Insert error:", error);
  } else {
    console.log("Insert success! Keys of inserted row:", Object.keys(data[0]));
    console.log("Inserted row content:", data[0]);
    
    // Clean up
    await supabase.from('orders').delete().eq('id', data[0].id);
  }
}

main();
