// AI fallback for free-text the menu flow doesn't understand.
//
// The flow is deterministic; this only runs when a student types a genuine
// question instead of picking an option. It makes ONE direct, lightweight Groq
// call (plain text — NOT the old abroad-MBBS turn schema, which would reject
// most answers) grounded in SkyHigh's admission context + the student's current
// selections. Fully defensive: any failure returns null and the engine shows
// the scripted "please pick an option" line. Never throws into the flow.
import { config } from '../config.js';
import * as cat from './catalog.js';

const ENABLED = process.env.FLOW_AI_FALLBACK !== '0' && !!config.groqApiKey;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

// Worth answering with AI: anything that isn't empty / a stray single char.
export function looksLikeQuestion(text) {
  return (text || '').trim().length >= 2;
}

async function selectionContext(lead) {
  const parts = [];
  if (lead.selected_course_id) parts.push(`course: ${(await cat.getCourse(lead.selected_course_id))?.name}`);
  else if (lead.other_course) parts.push(`course: ${lead.other_course}`);
  if (lead.selected_state_id) parts.push(`state: ${(await cat.getState(lead.selected_state_id))?.name}`);
  else if (lead.other_state) parts.push(`state: ${lead.other_state}`);
  if (lead.selected_college_id) parts.push(`college: ${(await cat.getCollege(lead.selected_college_id))?.name}`);
  return parts.join(', ') || 'nothing selected yet';
}

export async function answerFreeText(lead, text) {
  if (!ENABLED || !looksLikeQuestion(text)) return null;
  try {
    const courses = (await cat.getActiveCourses()).slice(0, 14).map((c) => c.name).join(', ');
    const system =
      `You are a warm, helpful WhatsApp assistant for SkyHigh Educational Services Pvt. Ltd., an Indian ` +
      `college-admission consultancy. Students reach us to pick a course, state and college and to get ` +
      `admission guidance (eligibility, admission process, documents, scholarships, fees, placements, ` +
      `hostel, career options, and general questions about our services). Answer ANY question they ask ` +
      `— including general consultancy, greetings, "who are you", or off-topic-but-related queries — ` +
      `briefly (1-3 short sentences), warmly, and in the SAME language they use (English / Hindi / ` +
      `Hinglish). If they greet, greet back. Do NOT invent specific fees, cut-offs, rankings or seat ` +
      `numbers for a particular college — for exact figures say our Career Expert will share the latest ` +
      `verified details. Stay on the student's topic and continue the conversation naturally — do NOT ` +
      `list courses or colleges unless they ask for options. Only when it genuinely fits, you may offer ` +
      `to show course/college options or to connect them with a Career Expert (they can type ` +
      `"Counselor"). Never say you cannot help.\n` +
      `Course options we offer include: ${courses}.\n` +
      `Career Experts: Prakash Sir and Supriya Mam.\n` +
      `Student's current selection so far: ${await selectionContext(lead)}.`;

    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.groqApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.6,
        max_tokens: 220,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`[flow-ai] Groq HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();
    return reply || null;
  } catch (err) {
    console.warn(`[flow-ai] fallback unavailable: ${err.message}`);
    return null;
  }
}
