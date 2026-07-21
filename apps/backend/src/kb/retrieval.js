// Builds the grounded KB context string passed to the AI each turn.
// The model is instructed to state facts ONLY from this context.
//
// The KB is large (25+ destinations, 400+ universities), so the context is
// filtered per lead: every destination appears as a one-line summary, but the
// full university/fee detail is included ONLY for the lead's interested
// country. Until the student picks one, the AI works from summaries and is
// nudged to ask for the country preference.
import { supabase } from '../db/supabase.js';

function summarizeCountry(c) {
  return `- ${c.display_name} (id: ${c.country})${c.total_fee_range ? ` — ${c.total_fee_range}` : ''}`;
}

function formatCountry(c) {
  const unis = (c.universities || [])
    .map((u) => `  - ${u.name}${u.city ? ` (${u.city})` : ''}${u.annual_fee_inr ? ` — ${u.annual_fee_inr}` : ''}${u.notes ? ` — ${u.notes}` : ''}`)
    .join('\n');
  return [
    `DESTINATION DETAIL: ${c.display_name}`,
    c.total_fee_range && `Total fees: ${c.total_fee_range}`,
    c.duration && `Duration: ${c.duration}`,
    c.eligibility && `Eligibility: ${c.eligibility}`,
    c.recognition && `Recognition: ${c.recognition}`,
    c.language && `Language: ${c.language}`,
    c.living_costs && `Living costs: ${c.living_costs}`,
    c.pros && `Pros: ${c.pros}`,
    c.cons && `Cons: ${c.cons}`,
    c.counselling_notes && `Counselling note: ${c.counselling_notes}`,
    unis && `Universities:\n${unis}`,
  ].filter(Boolean).join('\n');
}

/**
 * @param {{ interested_country?: string } | null} lead — full detail is
 *   included only for this country; everything else is summarized.
 * @returns {Promise<{ context: string, countryIds: string[] }>}
 */
export async function buildKbContext(lead = null) {
  const [countries, courses, faqs, steps] = await Promise.all([
    supabase.from('kb_countries').select('*').eq('is_active', true),
    supabase.from('kb_courses').select('*').eq('is_active', true),
    supabase.from('kb_faqs').select('question, answer').eq('is_active', true),
    supabase.from('kb_process_steps').select('step_number, title, description').order('step_number'),
  ]);
  for (const r of [countries, courses, faqs, steps]) {
    if (r.error) throw new Error(`KB fetch failed: ${r.error.message}`);
  }

  const countryIds = countries.data.map((c) => c.country);
  const interest = lead?.interested_country
    ? countries.data.find((c) => c.country === lead.interested_country)
    : null;

  const sections = [];
  if (countries.data.length) {
    sections.push(
      'DESTINATIONS WE OFFER (summaries — do not suggest anything outside this list):\n' +
      countries.data.map(summarizeCountry).join('\n')
    );
    if (interest) {
      sections.push(formatCountry(interest));
    } else {
      sections.push(
        'The student has not confirmed a destination yet. University-level detail is only ' +
        'loaded once they pick one — ask for their preferred destination (and budget) first, ' +
        'and answer using the summaries above until then.'
      );
    }
  }
  if (courses.data.length) {
    sections.push('COURSES:\n' + courses.data.map((c) => `- ${c.display_name}: ${c.eligibility}${c.notes ? ` (${c.notes})` : ''}`).join('\n'));
  }
  if (steps.data.length) {
    sections.push('ADMISSION PROCESS:\n' + steps.data.map((s) => `${s.step_number}. ${s.title} — ${s.description}`).join('\n'));
  }
  if (faqs.data.length) {
    sections.push('FAQs:\n' + faqs.data.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n'));
  }
  return { context: sections.join('\n\n═══\n\n'), countryIds };
}
