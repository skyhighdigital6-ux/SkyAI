// Milestone 3 verification — run with:  npm run check:db
// Confirms the schema was applied: every table exists, placeholder KB rows
// are readable, storage buckets exist, and a test lead can be written+deleted.
import 'dotenv/config';
import { supabase } from '../src/db/supabase.js';

const TABLES = [
  'leads', 'messages', 'kb_countries', 'kb_courses',
  'kb_faqs', 'kb_process_steps', 'staff_users', 'ai_usage',
];

let failed = false;
const ok = (label) => console.log(`  ✅ ${label}`);
const bad = (label, err) => { failed = true; console.error(`  ❌ ${label}: ${err}`); };

console.log('Checking tables…');
for (const table of TABLES) {
  const { error, count } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) bad(table, error.message);
  else ok(`${table} (${count} rows)`);
}

console.log('Checking storage buckets…');
const { data: buckets, error: bucketErr } = await supabase.storage.listBuckets();
if (bucketErr) bad('listBuckets', bucketErr.message);
else {
  for (const name of ['brochures', 'wa-sessions']) {
    if (buckets.some((b) => b.name === name)) ok(`bucket: ${name}`);
    else bad(`bucket: ${name}`, 'missing');
  }
}

console.log('Checking write access (insert + delete a test lead)…');
const { data: lead, error: insertErr } = await supabase
  .from('leads')
  .insert({ whatsapp_number: '000000000000', name: '__check_db_test__' })
  .select()
  .single();
if (insertErr) bad('insert test lead', insertErr.message);
else {
  ok(`insert test lead (score=${lead.lead_score}, temp=${lead.lead_temperature}, stage=${lead.current_stage})`);
  const { error: delErr } = await supabase.from('leads').delete().eq('id', lead.id);
  if (delErr) bad('delete test lead', delErr.message);
  else ok('delete test lead');
}

console.log(failed ? '\nSchema check FAILED — see ❌ above.' : '\nSchema check passed 🎉');
process.exit(failed ? 1 : 0);
