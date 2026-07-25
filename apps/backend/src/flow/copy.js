// All student-facing message copy for the admission-counselling flow, kept in
// one place so wording can be tuned without touching the state machine.
// Brand wording follows the client's script verbatim.
import { getActiveCounsellors, getSetting } from './catalog.js';

export const BRAND = 'Sky High Educational Services Pvt. Ltd.';

// Title-case the name for display, so "arun kumar" → "Arun Kumar" in messages
// (the stored value is left untouched).
const titleCase = (s) => String(s).replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
export const nameOf = (lead) => {
  const n = lead?.name && lead.name !== 'unknown' ? lead.name.trim() : '';
  return n ? titleCase(n) : 'Student';
};

export const welcome = (lead) =>
  `Hi ${nameOf(lead)}\n` +
  `Welcome to ${BRAND}\n` +
  `We're here to help you choose the right course and college based on your interests, ` +
  `career goals, academic profile and placement opportunities.\n` +
  `Let's begin by selecting your preferred course.`;

export const coursePrompt =
  'Please select your preferred course from the options below so we can recommend the ' +
  'most suitable colleges and career opportunities for you.';

export const askOtherCourse = 'Please type the name of the course you are interested in.';

export const statePrompt =
  'Great choice!\nNow, please select your preferred state so we can show you the most ' +
  'suitable colleges and available admission opportunities.';

export const askOtherState = 'Please type the name of your preferred state.';

export const collegePrompt =
  'Perfect!\nNow, please select your preferred college. Once selected, our career expert ' +
  'will review your preferences and guide you with the best available admission opportunities.';

export const askOtherCollege = 'Please type the name of the college you are interested in.';

export const selectionSummary = (lead, { course, state, college }) =>
  `Thank you, ${nameOf(lead)}.\n` +
  `You have selected:\n` +
  `Course: ${course}\n` +
  `State: ${state}\n` +
  `College: ${college}\n` +
  `Please find the latest available college brochure and fee structure below.`;

export const docsUpdating = (collegeName) =>
  `The latest brochure and fee structure for ${collegeName} are currently being updated. ` +
  `Our Career Expert will share the verified information with you shortly.`;

export const completion =
  'Your preferences have been successfully submitted.\n' +
  'Our Career Expert will review your selected course, state and college and contact you ' +
  'shortly to guide you regarding eligibility, admission process, scholarships, documentation ' +
  'and available seats.\n' +
  'Would you like to speak with a Career Expert now?';

export const callbackConfirmed =
  'Your callback request has been submitted successfully. One of our Career Experts will contact you shortly.';

export const handover = (lead) =>
  `Thank you, ${nameOf(lead)}.\n` +
  `A Career Expert will assist you shortly. Please share your question here, and our team ` +
  `will respond as soon as possible.`;

export const invalidReply =
  "Sorry, I couldn't understand that response.\n" +
  'Please select one of the available options below, or type "Counselor" to speak with our Career Expert.';

export const reminder8h = (lead) =>
  `Hi ${nameOf(lead)}\n` +
  `Just a friendly reminder. We noticed that your admission guidance process is still ` +
  `incomplete. Whenever you're ready, please continue by selecting the next option from the ` +
  `menu. If you need any help, simply reply to this message or connect with one of our ` +
  `Career Experts—we'll be happy to assist you.`;

// Renders the "Prakash Sir – Career Expert / 6200513372" expert lines + the
// Instagram handle, both pulled live from the DB so they stay admin-editable.
export async function expertsBlock() {
  const list = await getActiveCounsellors();
  return list
    .map((c) => `${c.name}${c.title ? ` – ${c.title}` : ''}${c.phone ? ` / ${c.phone}` : ''}`)
    .join('\n');
}

export async function instagramLine() {
  const handle = await getSetting('instagram_handle', 'skyhigheducationalservices');
  return `@${handle}`;
}

export async function reminder24h(lead) {
  const experts = await expertsBlock();
  const insta = await instagramLine();
  return (
    `Hi ${nameOf(lead)}\n` +
    `This is our final reminder regarding your career guidance request.\n` +
    `If you're still looking for the right course or college, simply continue by selecting the ` +
    `next option from the menu below. Our team will be happy to guide you through every step of ` +
    `the admission process.\n` +
    `You can also connect with our experts directly:\n${experts}\n` +
    `Follow us on Instagram for admission updates, scholarships, career guidance and college information:\n${insta}\n` +
    `If you've already completed your admission or no longer require assistance, you may ignore this message.\n` +
    `Thank you, and we wish you all the best for your future!`
  );
}

// 8h reminder — course chosen, state or college still pending (spec msg #3).
export async function reminderPending(lead, pending, courseName) {
  const experts = await expertsBlock();
  const insta = await instagramLine();
  const chooseLine = pending === 'state'
    ? `Please choose your preferred state from the menu below. Based on your selection, we'll show you the available colleges offering ${courseName}. 😊👇`
    : `Please choose your preferred college from the menu below so we can guide you with the best admission opportunities for ${courseName}. 😊👇`;
  return `Hi ${nameOf(lead)} 👋\n` +
    `It looks like you selected ${courseName}, but you haven't selected your preferred ${pending} yet.\n` +
    `${chooseLine}\n` +
    `If you're not interested in continuing, simply reply with "No," and we'll close your request. We're always here if you need guidance in the future.\n` +
    `You can also connect directly with our experts:\n${experts}\n` +
    `📲 Follow us on Instagram for the latest admission updates, scholarships, career guidance and college information:\n${insta}\n` +
    `If you've already completed your admission or no longer require assistance, you may ignore this message. Thank you, and we wish you all the best for your future! 🌟`;
}

// 8h reminder — college chosen, application not completed (spec msg #4).
export function reminderAppPending(lead, collegeName) {
  return `Hi ${nameOf(lead)} 👋\n` +
    `Our records show that you selected ${collegeName}, but your application form hasn't been completed yet.\n` +
    `Please reply with 1, 2, 3, or 4:\n` +
    `1️⃣ I want to complete my application for ${collegeName}.\n` +
    `2️⃣ I want to explore a different state or college.\n` +
    `3️⃣ I want information about another college. Please type the college name, and our team will assist you with the admission details.\n` +
    `4️⃣ I don't want to continue the admission process.\n` +
    `If you choose option 4, we'll stop sending you admission-related messages.\n` +
    `You can always contact us again whenever you need career guidance or admission assistance. 😊`;
}

// 8h reminder — no course selected yet.
export const reminderCoursePending = (lead) =>
  `Hi ${nameOf(lead)} 👋\nJust a friendly reminder — you haven't selected a course yet. Whenever you're ready, ` +
  `please pick a course from the menu below and we'll guide you further. If you're not interested, reply "No" and we'll close your request.`;

export async function notInterestedMessage(lead) {
  const experts = await expertsBlock();
  const insta = await instagramLine();
  return (
    `No worries, ${nameOf(lead)}!\n` +
    `Thank you for your time. If you need career guidance, college admission support, scholarship ` +
    `information or have any questions in the future, we're always here to help.\n` +
    `You can connect with our experts anytime:\n${experts}\n` +
    `Follow us on Instagram for admission updates, career tips, scholarships and college information:\n${insta}`
  );
}
