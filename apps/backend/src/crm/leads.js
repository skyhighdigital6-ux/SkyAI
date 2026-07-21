// Leads table access — one row per student, the whole CRM profile.
import { supabase } from '../db/supabase.js';
import { applyScoreDelta } from './scoring.js';

export async function findOrCreateLead(whatsappNumber, pushName) {
  const { data: existing, error: findErr } = await supabase
    .from('leads')
    .select('*')
    .eq('whatsapp_number', whatsappNumber)
    .maybeSingle();
  if (findErr) throw new Error(`lead lookup failed: ${findErr.message}`);
  if (existing) return existing;

  const { data: created, error: insertErr } = await supabase
    .from('leads')
    .insert({ whatsapp_number: whatsappNumber, name: pushName || null })
    .select()
    .single();
  if (insertErr) {
    // Unique-violation race (two messages arriving together) → re-read.
    const { data: raced } = await supabase
      .from('leads').select('*').eq('whatsapp_number', whatsappNumber).single();
    if (raced) return raced;
    throw new Error(`lead create failed: ${insertErr.message}`);
  }
  console.log(`[crm] New lead created: +${whatsappNumber} (${pushName || 'no name'})`);
  return created;
}

// CRM fields the AI may fill from free text (crm_updates in the turn JSON).
const AI_UPDATABLE = ['name', 'interested_country', 'interested_course', 'neet_status', 'academic_details', 'budget_range'];

// Apply one AI turn's structured output to the lead row. Returns the updated row.
export async function applyTurn(lead, turn) {
  const updates = {
    current_stage: turn.detected_stage,
    tone_profile: turn.tone_profile_update,
    ...applyScoreDelta(lead.lead_score, turn.score_delta?.delta),
    last_active_at: new Date().toISOString(),
  };
  if (turn.escalate) {
    updates.needs_human = true;
    updates.current_stage = 'escalated';
  }
  // Student asked to talk later → schedule an automatic re-engagement.
  if (turn.follow_up_requested) {
    // 180-day ceiling: generous enough for real admission-cycle deferrals
    // (a student saying "follow up in October") while still guarding against
    // a runaway/garbage value from the model.
    const days = Number.isFinite(turn.follow_up_days) && turn.follow_up_days > 0
      ? Math.min(turn.follow_up_days, 180)
      : 3;
    updates.follow_up_date = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    updates.follow_up_sent = false;
    console.log(`[crm] +${lead.whatsapp_number} follow-up scheduled in ${days} day(s)`);
  }
  for (const field of AI_UPDATABLE) {
    const value = turn.crm_updates?.[field];
    if (typeof value === 'string' && value.trim()) updates[field] = value.trim();
  }

  const { data, error } = await supabase
    .from('leads').update(updates).eq('id', lead.id).select().single();
  if (error) throw new Error(`lead update failed: ${error.message}`);

  if (turn.score_delta?.delta) {
    console.log(`[crm] +${lead.whatsapp_number} score ${lead.lead_score}→${data.lead_score} (${turn.score_delta.reasoning})`);
  }
  return data;
}

export async function updateLeadFields(leadId, fields) {
  const { data, error } = await supabase
    .from('leads')
    .update({ ...fields, last_active_at: new Date().toISOString() })
    .eq('id', leadId).select().single();
  if (error) throw new Error(`lead field update failed: ${error.message}`);
  return data;
}

// Privacy purge — deletes the lead row; messages cascade with it.
export async function purgeLead(leadId) {
  const { error } = await supabase.from('leads').delete().eq('id', leadId);
  if (error) throw new Error(`lead purge failed: ${error.message}`);
}
