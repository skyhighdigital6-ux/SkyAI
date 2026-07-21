// PDF brochures from Supabase Storage (bucket: 'brochures'), sent when the
// lead's country interest is known. documents_shared on the lead prevents
// re-sending the same file.
import { supabase } from '../db/supabase.js';
import { updateLeadFields } from '../crm/leads.js';

// Sends the brochure for the lead's interested country if one exists and
// hasn't been sent yet. Returns the file name sent, or null.
export async function maybeSendBrochure(sock, jid, lead) {
  if (!lead.interested_country) return null;

  const { data: country, error } = await supabase
    .from('kb_countries')
    .select('display_name, brochure_path')
    .eq('country', lead.interested_country)
    .eq('is_active', true)
    .maybeSingle();
  if (error || !country?.brochure_path) return null;

  const alreadySent = (lead.documents_shared || []).some((d) => d.doc === country.brochure_path);
  if (alreadySent) return null;

  const { data: file, error: dlErr } = await supabase.storage
    .from('brochures')
    .download(country.brochure_path);
  if (dlErr) {
    console.error(`[media] brochure download failed (${country.brochure_path}): ${dlErr.message}`);
    return null;
  }

  const fileName = `${country.display_name.replace(/\s+/g, '-')}-Brochure.pdf`;
  await sock.sendMessage(jid, {
    document: Buffer.from(await file.arrayBuffer()),
    mimetype: 'application/pdf',
    fileName,
  });

  await updateLeadFields(lead.id, {
    documents_shared: [
      ...(lead.documents_shared || []),
      { doc: country.brochure_path, sent_at: new Date().toISOString() },
    ],
  });
  console.log(`[media] Sent ${fileName} to +${lead.whatsapp_number}`);
  return fileName;
}
