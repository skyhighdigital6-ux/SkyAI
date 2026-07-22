// Deterministic admission-counselling state machine.
//
//   welcome → course → state → college → send documents → expert handover
//
// One function, handleFlowMessage(), is the entry point the pipeline calls for
// every inbound student message. It rebuilds the menu for the student's saved
// step, interprets their reply (number or text), advances the FSM, and never
// restarts on an invalid answer. All catalog data is admin-managed (see
// catalog.js); all copy lives in copy.js.
import { supabase } from '../db/supabase.js';
import { updateLeadFields } from '../crm/leads.js';
import * as C from './copy.js';
import * as cat from './catalog.js';
import { sendCollegeDocuments } from './documents.js';
import {
  courseMenu, stateMenu, collegeMenu, actionMenu, matchReply, sendMenu, say,
} from './menu.js';
import { answerFreeText } from './aiFallback.js';

const PAGE_SIZE = 8;

// ── intent detection ─────────────────────────────────────────────────
const NOT_INTERESTED = [
  /\bnot\s*interest/i, /\bno\s*interest/i, /\bnot\s*required\b/i, /\bnot\s*need/i,
  /\bstop\b/i, /\bunsubscribe\b/i, /\bdon'?t\s*(message|msg|contact|call)/i,
  /\bremove\s*my\s*(number|no|name)/i, /\balready\s*(taken|got|done)\s*admission/i,
  /\badmission\s*(completed|done|taken)/i, /\bleave me\b/i,
];
const HUMAN = [
  /\bcounsel?or\b/i, /\bcounsell?or\b/i, /\bhuman\b/i, /\bagent\b/i,
  /\btalk\s*to\s*(a\s*)?(person|expert|someone)\b/i, /\bcall\s*me\b/i,
];
const ADMISSION_INTENT = /admission|course|college|mbbs|neet|counsel|guidance|interested|\bhelp\b/i;

const isNotInterested = (t) => NOT_INTERESTED.some((re) => re.test(t));
const wantsHuman = (t) => HUMAN.some((re) => re.test(t));
const isHardOptOut = (t) => /\bstop\b/i.test(t) || /\bunsubscribe\b/i.test(t) || /\bremove\s*my\s*(number|no|name)/i.test(t);

// ── labels for the confirmation summary ──────────────────────────────
async function selectionLabels(lead) {
  const course = lead.selected_course_id ? (await cat.getCourse(lead.selected_course_id))?.name : lead.other_course;
  const state = lead.selected_state_id ? (await cat.getState(lead.selected_state_id))?.name : (lead.other_state || 'Any State');
  const college = lead.selected_college_id ? (await cat.getCollege(lead.selected_college_id))?.name : lead.other_college;
  return { course: course || '—', state: state || '—', college: college || '—' };
}

// ── step menu reconstruction (also used by the reminder sweep) ───────
// Returns { text, options }.  options === null → a free-text prompt.
export async function buildStepMenu(lead) {
  switch (lead.flow_step) {
    case 'awaiting_course':
      return { text: C.coursePrompt, options: courseMenu(await cat.getActiveCourses()) };
    case 'awaiting_other_course':
      return { text: C.askOtherCourse, options: null };
    case 'awaiting_state':
      return { text: C.statePrompt, options: stateMenu(await cat.getStatesForCourse(lead.selected_course_id)) };
    case 'awaiting_other_state':
      return { text: C.askOtherState, options: null };
    case 'awaiting_college': {
      const all = await cat.getCollegesFor(lead.selected_course_id, lead.selected_state_id);
      const page = Math.max(0, lead.college_page || 0);
      const slice = all.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
      const hasMore = all.length > (page + 1) * PAGE_SIZE;
      const prefix = all.length === 0 ? 'No colleges are listed yet for this selection. You can type another college or go back.\n\n' : '';
      return { text: prefix + C.collegePrompt, options: collegeMenu(slice, { hasMore }) };
    }
    case 'awaiting_other_college':
      return { text: C.askOtherCollege, options: null };
    case 'awaiting_action':
      return { text: 'Would you like to speak with a Career Expert now?', options: actionMenu(await cat.getActiveCounsellors()) };
    default:
      return { text: C.coursePrompt, options: courseMenu(await cat.getActiveCourses()) };
  }
}

// Send whatever the current step is. `arm` stamps the reminder timer; the
// reminder sweep passes arm:false so the 24h clock keeps running off the
// original unanswered message.
export async function resendStep(sock, jid, lead, { arm = true } = {}) {
  const { text, options } = await buildStepMenu(lead);
  if (options) return sendMenu(sock, jid, lead, text, options, { arm });
  return say(sock, jid, lead, text, { expectsReply: arm, arm });
}

// ── terminal / branch actions ────────────────────────────────────────
async function goNotInterested(sock, jid, lead, reason) {
  await say(sock, jid, lead, await C.notInterestedMessage(lead));
  return updateLeadFields(lead.id, {
    flow_step: 'not_interested',
    flow_status: 'Not Interested',
    not_interested_reason: reason || null,
    opted_out: isHardOptOut(reason || ''),
    reminder_8h_sent: true,
    reminder_24h_sent: true,
  });
}

async function goHandover(sock, jid, lead, status = 'Human Assistance Required') {
  await say(sock, jid, lead, C.handover(lead));
  console.log(`[flow] 🙋 +${lead.whatsapp_number} → human handover (${status})`);
  // Pause the bot via needs_human (the pipeline gates on it). We deliberately
  // keep flow_step where the student was, so if an admin resumes automation the
  // conversation continues from the same point.
  return updateLeadFields(lead.id, {
    flow_status: status,
    needs_human: true,
    unrecognized_count: 0,
  });
}

async function sendCounsellorProfile(sock, jid, lead, counsellor) {
  const details =
    `${counsellor.name}${counsellor.title ? `\n${counsellor.title}` : ''}` +
    `${counsellor.phone ? `\nCall/WhatsApp: ${counsellor.phone}` : ''}`;
  let photoSent = false;
  if (counsellor.photo_path) {
    try {
      const { data, error } = await supabase.storage.from('counsellor-photos').download(counsellor.photo_path);
      if (!error && data) {
        await sock.sendMessage(jid, { image: Buffer.from(await data.arrayBuffer()), caption: details });
        photoSent = true;
      }
    } catch (err) {
      console.error(`[flow] counsellor photo failed (${counsellor.photo_path}): ${err.message}`);
    }
  }
  if (!photoSent) await sock.sendMessage(jid, { text: details });
}

// Save college, send the summary + documents, then the completion/expert menu.
async function selectCollege(sock, jid, lead, { college, otherName }) {
  const updates = college
    ? { selected_college_id: college.id, other_college: null }
    : { selected_college_id: null, other_college: otherName };
  lead = await updateLeadFields(lead.id, { ...updates, flow_status: 'College Selected' });

  const labels = await selectionLabels(lead);
  await say(sock, jid, lead, C.selectionSummary(lead, labels));

  let delivered = 0;
  if (college) delivered = await sendCollegeDocuments(sock, jid, lead, college);
  if (!delivered) await say(sock, jid, lead, C.docsUpdating(labels.college));

  lead = await updateLeadFields(lead.id, { flow_status: 'Documents Shared' });
  await say(sock, jid, lead, C.completion);
  await sendMenu(sock, jid, lead, 'Please choose an option:', actionMenu(await cat.getActiveCounsellors()));
  return updateLeadFields(lead.id, { flow_step: 'awaiting_action' });
}

// Advance into the state step (from course selection or "change course").
async function goToStateStep(sock, jid, lead) {
  const states = await cat.getStatesForCourse(lead.selected_course_id);
  await sendMenu(sock, jid, lead, C.statePrompt, stateMenu(states));
  return updateLeadFields(lead.id, { flow_step: 'awaiting_state' });
}

async function goToCollegeStep(sock, jid, lead, { resetPage = true } = {}) {
  if (resetPage) lead = await updateLeadFields(lead.id, { college_page: 0 });
  const { text, options } = await buildStepMenu({ ...lead, flow_step: 'awaiting_college' });
  await sendMenu(sock, jid, lead, text, options);
  return updateLeadFields(lead.id, { flow_step: 'awaiting_college' });
}

async function invalid(sock, jid, lead, text) {
  // Always try to answer the free-text with AI first, then re-show the current
  // step — so general/off-flow questions get a real answer and typos never hit
  // a dead-end. The bot never goes silent while AI is available.
  const aiAnswer = await answerFreeText(lead, text);
  if (aiAnswer) {
    lead = await updateLeadFields(lead.id, { unrecognized_count: 0 });
    await say(sock, jid, lead, aiAnswer);
    await resendStep(sock, jid, lead);
    return lead;
  }
  // AI unavailable → scripted line; only offer a human after several misses in a
  // row (never on a single typo).
  const count = (lead.unrecognized_count || 0) + 1;
  if (count >= 3) return goHandover(sock, jid, lead);
  lead = await updateLeadFields(lead.id, { unrecognized_count: count });
  await say(sock, jid, lead, C.invalidReply);
  await resendStep(sock, jid, lead);
  return lead;
}

// ── follow-up scheduling ("contact me after 4 days", "call me later") ──
const DAY = 86400000, HOUR = 3600000;
function parseDelayMs(s) {
  s = s.toLowerCase();
  if (/\b(day after tomorrow|parso)\b/.test(s)) return 2 * DAY;
  if (/\b(tomorrow|kal)\b/.test(s)) return DAY;
  let m;
  if ((m = s.match(/\b(\d+)\s*(hour|hours|hr|hrs|ghante|ghanta)\b/))) return +m[1] * HOUR;
  if ((m = s.match(/\b(\d+)\s*(day|days|din)\b/))) return +m[1] * DAY;
  if ((m = s.match(/\b(\d+)\s*(week|weeks|hafte|hafta)\b/))) return +m[1] * 7 * DAY;
  if ((m = s.match(/\b(\d+)\s*(month|months|mahine|mahina)\b/))) return +m[1] * 30 * DAY;
  if (/\bnext week\b|\bagle hafte\b/.test(s)) return 7 * DAY;
  if (/\bnext month\b|\bagle mah/.test(s)) return 30 * DAY;
  return null;
}
const CONTACT_LATER = /\b(contact|call|reach|connect|ping|remind|message|msg|text|talk|callback|call ?back|get ?back|follow ?up|baat|sampark)\b/i;
const LATER_CUE = /\b(later|after|back|baad|tomorrow|kal|parso|next week|next month|agle|free|busy|abhi nahi|abhi nhi|not now|some other time|few days|kuch din)\b/i;
function detectFollowUp(t) {
  const ms = parseDelayMs(t);
  const wantsLater = (CONTACT_LATER.test(t) && (LATER_CUE.test(t) || ms != null))
    || /\b(i am busy|i'?m busy|abhi busy|thodi der baad|baad me (baat|call|contact)|contact me later|call me later|message me later|talk later)\b/i.test(t);
  if (!wantsLater) return null;
  return { ms: ms ?? 3 * DAY };
}
function fmtDelay(ms) {
  if (ms >= 30 * DAY) return `in about ${Math.round(ms / (30 * DAY))} month(s)`;
  if (ms >= 7 * DAY) return `in about ${Math.round(ms / (7 * DAY))} week(s)`;
  if (ms >= DAY) return `in ${Math.round(ms / DAY)} day(s)`;
  return `in about ${Math.max(1, Math.round(ms / HOUR))} hour(s)`;
}
async function scheduleFollowUp(sock, jid, lead, ms) {
  const when = new Date(Date.now() + ms);
  await say(sock, jid, lead,
    `No problem, ${C.nameOf(lead)}! 😊 We'll follow up with you ${fmtDelay(ms)}. ` +
    `If you'd like to continue sooner, just message us anytime.`);
  console.log(`[flow] ⏰ +${lead.whatsapp_number} follow-up scheduled ${fmtDelay(ms)}`);
  return updateLeadFields(lead.id, { follow_up_date: when.toISOString(), follow_up_sent: false });
}

// Send the welcome + course menu and arm the flow. Used both on a student's
// first inbound message and when an admin adds a lead and opts to start the
// conversation proactively.
export async function startFlow(sock, jid, lead) {
  await say(sock, jid, lead, C.welcome(lead));
  await sendMenu(sock, jid, lead, C.coursePrompt, courseMenu(await cat.getActiveCourses()));
  return updateLeadFields(lead.id, { flow_step: 'awaiting_course', flow_status: 'New Lead', unrecognized_count: 0 });
}

// ── main entry point ─────────────────────────────────────────────────
export async function handleFlowMessage(ctx, lead) {
  const { sock, jid, number, text } = ctx;
  const t = (text || '').trim();

  // Opted-out students stay silent unless they clearly ask for guidance again.
  if (lead.opted_out) {
    if (ADMISSION_INTENT.test(t) && !isNotInterested(t)) {
      lead = await updateLeadFields(lead.id, { opted_out: false, flow_step: null });
    } else {
      console.log(`[flow] +${number} opted out — staying silent`);
      return;
    }
  }

  // Admin paused automation for this contact → bot silent.
  if (lead.automation_paused) {
    console.log(`[flow] +${number} automation paused by admin — silent`);
    return;
  }

  // Global: explicit opt-out / not-interested at any point.
  if (isNotInterested(t)) return goNotInterested(sock, jid, lead, t);

  // A reply means they're engaging → cancel any pending scheduled follow-up.
  if (lead.follow_up_date && !lead.follow_up_sent) {
    lead = await updateLeadFields(lead.id, { follow_up_date: null });
  }

  // "Contact me after 4 days" / "call me later" → schedule an auto follow-up.
  const fu = detectFollowUp(t);
  if (fu) return scheduleFollowUp(sock, jid, lead, fu.ms);

  // First contact (or a fresh restart) → welcome + course menu, then wait.
  if (!lead.flow_step || lead.flow_step === 'not_interested') {
    await startFlow(sock, jid, lead);
    return;
  }

  // Completed conversation → treat as the expert menu so further questions are
  // still answered (via the menu match / AI fallback below) instead of ignored.
  if (lead.flow_step === 'completed') {
    lead = await updateLeadFields(lead.id, { flow_step: 'awaiting_action' });
  }

  // ── free-text steps (Other course/state/college) ──
  if (lead.flow_step === 'awaiting_other_course') {
    if (!t) return invalid(sock, jid, lead, t);
    lead = await updateLeadFields(lead.id, { other_course: t, selected_course_id: null, flow_status: 'Course Selected', unrecognized_count: 0 });
    return goToStateStep(sock, jid, lead);
  }
  if (lead.flow_step === 'awaiting_other_state') {
    if (!t) return invalid(sock, jid, lead, t);
    lead = await updateLeadFields(lead.id, { other_state: t, selected_state_id: null, flow_status: 'State Selected', unrecognized_count: 0 });
    return goToCollegeStep(sock, jid, lead);
  }
  if (lead.flow_step === 'awaiting_other_college') {
    if (!t) return invalid(sock, jid, lead, t);
    lead = await updateLeadFields(lead.id, { unrecognized_count: 0 });
    return selectCollege(sock, jid, lead, { college: null, otherName: t });
  }

  // ── menu steps ──
  const { options } = await buildStepMenu(lead);
  const choice = matchReply(t, options || []);

  if (!choice) {
    if (wantsHuman(t)) return goHandover(sock, jid, lead); // typed "counselor"/"human"
    return invalid(sock, jid, lead, t);
  }
  lead = await updateLeadFields(lead.id, { unrecognized_count: 0 }); // valid reply → reset

  // Shared controls.
  if (choice.token === 'not_interested') return goNotInterested(sock, jid, lead, t);
  if (choice.token === 'counsellor') return goHandover(sock, jid, lead);

  switch (lead.flow_step) {
    case 'awaiting_course': {
      if (choice.token === 'other') {
        await say(sock, jid, lead, C.askOtherCourse, { expectsReply: true });
        return updateLeadFields(lead.id, { flow_step: 'awaiting_other_course' });
      }
      const id = Number(choice.token.slice(1));
      lead = await updateLeadFields(lead.id, { selected_course_id: id, other_course: null, flow_status: 'Course Selected' });
      return goToStateStep(sock, jid, lead);
    }

    case 'awaiting_state': {
      if (choice.token === 'back') {
        await sendMenu(sock, jid, lead, C.coursePrompt, courseMenu(await cat.getActiveCourses()));
        return updateLeadFields(lead.id, { flow_step: 'awaiting_course' });
      }
      if (choice.token === 'other') {
        await say(sock, jid, lead, C.askOtherState, { expectsReply: true });
        return updateLeadFields(lead.id, { flow_step: 'awaiting_other_state' });
      }
      if (choice.token === 'any_state') {
        lead = await updateLeadFields(lead.id, { selected_state_id: null, other_state: 'Any State', flow_status: 'State Selected' });
        return goToCollegeStep(sock, jid, lead);
      }
      const id = Number(choice.token.slice(1));
      lead = await updateLeadFields(lead.id, { selected_state_id: id, other_state: null, flow_status: 'State Selected' });
      return goToCollegeStep(sock, jid, lead);
    }

    case 'awaiting_college': {
      if (choice.token === 'back') return goToStateStep(sock, jid, lead);
      if (choice.token === 'other') {
        await say(sock, jid, lead, C.askOtherCollege, { expectsReply: true });
        return updateLeadFields(lead.id, { flow_step: 'awaiting_other_college' });
      }
      if (choice.token === 'show_more') {
        lead = await updateLeadFields(lead.id, { college_page: (lead.college_page || 0) + 1 });
        return goToCollegeStep(sock, jid, lead, { resetPage: false });
      }
      const id = Number(choice.token.slice(1));
      const college = await cat.getCollege(id);
      if (!college) return invalid(sock, jid, lead, t);
      return selectCollege(sock, jid, lead, { college });
    }

    case 'awaiting_action': {
      if (choice.token.startsWith('co')) {
        const counsellors = await cat.getActiveCounsellors();
        const c = counsellors.find((x) => `co${x.id}` === choice.token);
        if (c) await sendCounsellorProfile(sock, jid, lead, c);
        await sendMenu(sock, jid, lead, 'Anything else?', actionMenu(counsellors));
        return lead;
      }
      if (choice.token === 'callback') {
        const c = await cat.getDefaultCounsellor();
        await say(sock, jid, lead, C.callbackConfirmed);
        console.log(`[flow] 📞 +${number} callback requested → ${c?.name ?? 'unassigned'}`);
        return updateLeadFields(lead.id, {
          flow_step: 'completed', flow_status: 'Callback Requested',
          assigned_counsellor_id: c?.id ?? null,
          reminder_8h_sent: true, reminder_24h_sent: true,
        });
      }
      if (choice.token === 'explore') {
        // Keep course + state; browse colleges again from the top.
        return goToCollegeStep(sock, jid, lead);
      }
      if (choice.token === 'change_course') {
        lead = await updateLeadFields(lead.id, {
          selected_state_id: null, selected_college_id: null,
          other_state: null, other_college: null, college_page: 0,
        });
        await sendMenu(sock, jid, lead, C.coursePrompt, courseMenu(await cat.getActiveCourses()));
        return updateLeadFields(lead.id, { flow_step: 'awaiting_course' });
      }
      if (choice.token === 'no_thanks') {
        await say(sock, jid, lead, 'Thank you! Our Career Expert will be in touch. We wish you all the best. 🎓');
        return updateLeadFields(lead.id, {
          flow_step: 'completed', flow_status: 'Guidance Completed',
          reminder_8h_sent: true, reminder_24h_sent: true,
        });
      }
      return invalid(sock, jid, lead, t);
    }

    case 'completed': {
      // They came back after finishing → reopen the expert menu.
      await sendMenu(sock, jid, lead, 'Welcome back! Would you like to continue?', actionMenu(await cat.getActiveCounsellors()));
      return updateLeadFields(lead.id, { flow_step: 'awaiting_action' });
    }

    default:
      return invalid(sock, jid, lead, t);
  }
}
