// College document sharing — sends the latest ACTIVE brochure + fee structure
// (+ any other active admission doc) for the selected college, each with a
// clear caption. Never throws into the conversation: a missing/broken file is
// skipped, and if nothing sends the caller shows the "being updated" message.
import { supabase } from '../db/supabase.js';
import { logMessage } from '../crm/messages.js';
import { updateLeadFields } from '../crm/leads.js';
import { getLatestDocs } from './catalog.js';

const TYPE_LABEL = { brochure: 'Brochure', fee_structure: 'Fee Structure', other: 'Admission Document' };
const ORDER = ['brochure', 'fee_structure', 'other'];

const caption = (collegeName, doc) => {
  const type = TYPE_LABEL[doc.doc_type] ?? 'Document';
  const session = doc.academic_year ? ` – Academic Session ${doc.academic_year}` : '';
  return `${collegeName}\n${type}${session}`;
};

/**
 * Send every available latest-active document for a college.
 * Returns the number of files actually delivered (0 → caller sends "updating").
 * Skips any document already recorded in lead.flow_documents_sent (no dupes).
 */
export async function sendCollegeDocuments(sock, jid, lead, college) {
  const latest = await getLatestDocs(college.id);
  const already = new Set((lead.flow_documents_sent || []).map((d) => d.path));
  const sent = [...(lead.flow_documents_sent || [])];
  let delivered = 0;

  for (const type of ORDER) {
    const doc = latest[type];
    if (!doc || !doc.storage_path || already.has(doc.storage_path)) continue;

    try {
      const { data: file, error } = await supabase.storage.from('brochures').download(doc.storage_path);
      if (error || !file) {
        console.error(`[flow-docs] download failed (${doc.storage_path}): ${error?.message}`);
        continue;
      }
      const fileName = doc.file_name || `${college.name.replace(/\s+/g, '-')}-${type}.pdf`;
      await sock.sendMessage(jid, {
        document: Buffer.from(await file.arrayBuffer()),
        mimetype: 'application/pdf',
        fileName,
        caption: caption(college.name, doc),
      });
      await logMessage({
        leadId: lead.id, direction: 'outbound', sender: 'bot',
        content: `[sent ${type}: ${fileName}]`, messageType: 'pdf',
      });
      sent.push({ path: doc.storage_path, type, college_id: college.id, sent_at: new Date().toISOString() });
      delivered += 1;
    } catch (err) {
      console.error(`[flow-docs] send failed (${doc.storage_path}): ${err.message}`);
    }
  }

  if (delivered) await updateLeadFields(lead.id, { flow_documents_sent: sent });
  return delivered;
}
