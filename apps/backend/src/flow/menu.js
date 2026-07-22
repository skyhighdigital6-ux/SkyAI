// Menu rendering + reply parsing.
//
// WhatsApp interactive buttons/lists render unreliably on non-Business-API
// (Baileys) clients, so every menu is sent as a numbered text list — the
// format the spec mandates as the fallback — and the parser accepts BOTH the
// number and the option text. Each option carries a stable `token` the engine
// switches on.
import { logMessage } from '../crm/messages.js';
import { updateLeadFields } from '../crm/leads.js';

// Build option lists. Entity tokens: c<id> course, s<id> state, g<id> college,
// co<id> counsellor. Control tokens are fixed strings.
export const opt = (token, label) => ({ token, label });

export function courseMenu(courses) {
  return [
    ...courses.map((c) => opt(`c${c.id}`, c.name)),
    opt('other', 'Other Course'),
    opt('counsellor', 'Talk to a Career Counselor'),
    opt('not_interested', 'Not Interested'),
  ];
}

export function stateMenu(states) {
  return [
    ...states.map((s) => opt(`s${s.id}`, s.name)),
    opt('any_state', 'Any State'),
    opt('other', 'Other State'),
    opt('back', 'Go Back'),
    opt('counsellor', 'Talk to a Career Counselor'),
    opt('not_interested', 'Not Interested'),
  ];
}

export function collegeMenu(colleges, { hasMore }) {
  return [
    ...colleges.map((g) => opt(`g${g.id}`, g.name)),
    opt('other', 'Other College'),
    ...(hasMore ? [opt('show_more', 'Show More Colleges')] : []),
    opt('back', 'Go Back'),
    opt('counsellor', 'Talk to a Career Counselor'),
    opt('not_interested', 'Not Interested'),
  ];
}

export function actionMenu(counsellors) {
  return [
    ...counsellors.map((c) => opt(`co${c.id}`, `Contact ${c.name}`)),
    opt('callback', 'Request a Callback'),
    opt('explore', 'Explore Another College'),
    opt('change_course', 'Change Course'),
    opt('no_thanks', 'No, Thank You'),
  ];
}

const numbered = (options) => options.map((o, i) => `${i + 1}. ${o.label}`).join('\n');

// Strip emoji/punctuation for lenient text matching.
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Match a student's reply against the current menu.
 * Accepts: the 1-based number, an exact/normalized label, or a clear prefix.
 * Returns the matched option, or null.
 */
export function matchReply(text, options) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;

  // Pure number → index into the menu.
  const asNum = raw.replace(/[.)]/g, '').trim();
  if (/^\d+$/.test(asNum)) {
    const idx = Number(asNum) - 1;
    return options[idx] ?? null;
  }

  const t = norm(raw);
  if (!t) return null;
  // Exact normalized label.
  let hit = options.find((o) => norm(o.label) === t);
  if (hit) return hit;
  // Student typed a distinctive prefix of an option (min 3 chars, unambiguous).
  if (t.length >= 3) {
    const starts = options.filter((o) => norm(o.label).startsWith(t) || norm(o.label).includes(t));
    if (starts.length === 1) return starts[0];
  }

  // Fuzzy: tolerate spelling mistakes / typos ("karnatka" → "Karnataka",
  // "mbss" → "MBBS", "enginering" → "Engineering"). Compare against the whole
  // label and each of its words; accept only a clear, unambiguous winner.
  const scored = options.map((o) => {
    const label = norm(o.label);
    const words = label.split(' ');
    const d = Math.min(lev(t, label), ...words.map((w) => lev(t, w)));
    return { o, d };
  }).sort((a, b) => a.d - b.d);
  if (scored.length) {
    const best = scored[0];
    const tol = t.length <= 4 ? 1 : t.length <= 7 ? 2 : 3;
    const unambiguous = scored.length < 2 || scored[1].d > best.d;
    if (best.d <= tol && unambiguous) return best.o;
  }
  return null;
}

// Levenshtein edit distance (small strings only).
function lev(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Send a prompt + numbered menu, log it, and (since it expects a reply) arm the
 * no-reply reminder timer by stamping last_bot_message_at and clearing the
 * reminder flags for this fresh question.
 */
export async function sendMenu(sock, jid, lead, promptText, options, { arm = true } = {}) {
  const body = `${promptText}\n\n${numbered(options)}`;
  await sock.sendMessage(jid, { text: body });
  await logMessage({ leadId: lead.id, direction: 'outbound', sender: 'bot', content: body, messageType: 'buttons' });
  // arm → this is a fresh question: (re)start the no-reply clock and clear
  // any reminder flags. The reminder sweep passes arm:false so re-showing the
  // menu doesn't reset the original-message clock the 24h timer runs off.
  if (!arm) return lead;
  return updateLeadFields(lead.id, {
    last_bot_message_at: new Date().toISOString(),
    reminder_8h_sent: false,
    reminder_24h_sent: false,
  });
}

// Plain bot message (no menu). `expectsReply`/`arm` arms the reminder timer.
export async function say(sock, jid, lead, text, { expectsReply = false, arm = true, messageType = 'text' } = {}) {
  await sock.sendMessage(jid, { text });
  await logMessage({ leadId: lead.id, direction: 'outbound', sender: 'bot', content: text, messageType });
  if (expectsReply && arm) {
    return updateLeadFields(lead.id, {
      last_bot_message_at: new Date().toISOString(),
      reminder_8h_sent: false,
      reminder_24h_sent: false,
    });
  }
  return lead;
}
