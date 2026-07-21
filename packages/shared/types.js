// JSDoc typedefs for the shapes shared between backend and dashboard.
// These are documentation, not runtime code — import them in editors for IntelliSense.

/**
 * The structured JSON Gemini (or Groq fallback) must return every turn.
 * Backend parses this, updates the lead row, and sends `reply_text` via Baileys.
 *
 * @typedef {Object} AiTurnResponse
 * @property {string}  reply_text          Reply to send (backend splits into 2–3 WhatsApp messages)
 * @property {string}  detected_stage      One of STAGES from constants.js
 * @property {ToneProfile} tone_profile_update  Updated running tone profile for this student
 * @property {{ delta: number, reasoning: string }} score_delta  +/- points with why
 * @property {boolean} escalate            True → set needs_human, send holding message, pause bot
 * @property {Object|null} crm_updates     CRM fields revealed in free text this turn
 * @property {('country'|'course'|'budget')|null} send_buttons  Offer a structured choice after the reply
 */

/**
 * Running tone profile stored per student in leads.tone_profile (JSON column).
 * Re-evaluated on every incoming message.
 *
 * @typedef {Object} ToneProfile
 * @property {string} language_mix   e.g. "hinglish", "urdu-english", "english"
 * @property {string} script         e.g. "latin", "devanagari", "mixed"
 * @property {string} formality      e.g. "aap", "tum", "neutral"
 * @property {string} message_length "short" | "medium" | "long"
 * @property {boolean} uses_emoji
 * @property {string} notes          Free-form style notes ("broken phrases", "voice-note style")
 */

/**
 * One row in the `leads` table — the complete CRM profile for a student.
 *
 * @typedef {Object} Lead
 * @property {string} id
 * @property {string} whatsapp_number
 * @property {string|null} name
 * @property {string} current_stage
 * @property {string|null} interested_country
 * @property {string|null} interested_course
 * @property {string|null} neet_status
 * @property {string|null} academic_details
 * @property {string|null} budget_range
 * @property {ToneProfile|null} tone_profile
 * @property {number} lead_score          0–100
 * @property {'Hot'|'Warm'|'Cold'} lead_temperature
 * @property {boolean} needs_human
 * @property {Array<{doc: string, sent_at: string}>} documents_shared
 * @property {string} last_active_at
 * @property {string} created_at
 */

export {};
