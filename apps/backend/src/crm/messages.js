// Transcript persistence — every inbound/outbound message lands here so the
// dashboard can show full chat history and the AI gets real context.
import { supabase } from '../db/supabase.js';

export async function logMessage({ leadId, direction, sender, content, messageType = 'text', waMessageId = null }) {
  const { error } = await supabase.from('messages').insert({
    lead_id: leadId,
    direction,
    sender,
    content,
    message_type: messageType,
    wa_message_id: waMessageId,
  });
  if (error) console.error('[messages] log failed:', error.message);
}

// Last N messages in chronological order, shaped for the AI prompt.
export async function getHistory(leadId, limit = 20) {
  const { data, error } = await supabase
    .from('messages')
    .select('sender, content, created_at')
    .eq('lead_id', leadId)
    .in('message_type', ['text', 'button_reply'])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getHistory failed: ${error.message}`);
  return data.reverse().filter((m) => m.content);
}
