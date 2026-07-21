// Gemini (gemini-2.5-flash) turn call with enforced structured JSON output.
// Returns a validated AiTurnResponse (see shared/types.js). Throws
// RateLimitError on 429 so the router (Milestone 10) can queue/fallback.
import { GoogleGenAI, Type } from '@google/genai';
import { STAGES } from 'shared/constants';
import { config } from '../config.js';
import { buildSystemInstruction, buildContents } from './prompt.js';

export class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Gemini's structured-output schema — guarantees parseable JSON with every field.
const TURN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply_text: { type: Type.STRING },
    detected_stage: { type: Type.STRING, enum: STAGES },
    tone_profile_update: {
      type: Type.OBJECT,
      properties: {
        language_mix: { type: Type.STRING },
        script: { type: Type.STRING },
        formality: { type: Type.STRING },
        message_length: { type: Type.STRING },
        uses_emoji: { type: Type.BOOLEAN },
        notes: { type: Type.STRING },
      },
      required: ['language_mix', 'script', 'formality', 'message_length', 'uses_emoji'],
    },
    score_delta: {
      type: Type.OBJECT,
      properties: {
        delta: { type: Type.NUMBER },
        reasoning: { type: Type.STRING },
      },
      required: ['delta', 'reasoning'],
    },
    escalate: { type: Type.BOOLEAN },
    // CRM fields the student revealed in free text this turn (null when not mentioned).
    crm_updates: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        name: { type: Type.STRING, nullable: true },
        interested_country: { type: Type.STRING, nullable: true },
        interested_course: { type: Type.STRING, nullable: true },
        neet_status: { type: Type.STRING, nullable: true },
        academic_details: { type: Type.STRING, nullable: true },
        budget_range: { type: Type.STRING, nullable: true },
      },
    },
    // Set to offer a structured choice via WhatsApp buttons after the reply.
    send_buttons: { type: Type.STRING, nullable: true, enum: ['country', 'course', 'budget'] },
    // Student asked to be contacted later ("4 din baad", "next week", "abhi busy").
    follow_up_requested: { type: Type.BOOLEAN },
    follow_up_days: { type: Type.NUMBER, nullable: true },
    // Student asked for a PDF / written details → backend generates one from the KB.
    pdf_requested: { type: Type.BOOLEAN },
    pdf_content_type: {
      type: Type.STRING, nullable: true,
      enum: ['college_details', 'fee_structure', 'country_overview', 'process_steps'],
    },
    pdf_topic: { type: Type.STRING, nullable: true },
  },
  required: ['reply_text', 'detected_stage', 'tone_profile_update', 'score_delta', 'escalate', 'follow_up_requested'],
};

let client = null;
function getClient() {
  if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY not set in .env');
  client ??= new GoogleGenAI({ apiKey: config.geminiApiKey });
  return client;
}

export function validateTurnResponse(parsed) {
  const problems = [];
  if (typeof parsed.reply_text !== 'string' || !parsed.reply_text.trim())
    problems.push('reply_text missing/empty');
  if (!STAGES.includes(parsed.detected_stage)) problems.push(`bad detected_stage: ${parsed.detected_stage}`);
  if (typeof parsed.score_delta?.delta !== 'number') problems.push('score_delta.delta not a number');
  if (typeof parsed.escalate !== 'boolean') problems.push('escalate not boolean');
  if (!parsed.tone_profile_update || typeof parsed.tone_profile_update !== 'object')
    problems.push('tone_profile_update missing');
  if (problems.length) throw new Error(`Invalid AI turn response: ${problems.join('; ')}`);
  return parsed;
}

/**
 * @param {{ lead: object, kbContext: string, history: Array<{sender: string, content: string}> }} turn
 * @returns {Promise<import('shared/types').AiTurnResponse>}
 */
export async function geminiTurn({ lead, kbContext, kbCountryIds, history }) {
  // No counselor message yet → this reply is the fixed English greeting.
  const isFirstReply = !history.some((m) => m.sender !== 'student');
  let response;
  try {
    response = await getClient().models.generateContent({
      model: config.geminiModel,
      contents: buildContents(history),
      config: {
        systemInstruction: buildSystemInstruction({ kbContext, lead, kbCountryIds, isFirstReply }),
        responseMimeType: 'application/json',
        responseSchema: TURN_SCHEMA,
        temperature: 0.8, // natural human-sounding variation
      },
    });
  } catch (err) {
    const status = err?.status ?? err?.code;
    if (status === 429 || /429|RESOURCE_EXHAUSTED/i.test(String(err?.message))) {
      throw new RateLimitError(err.message);
    }
    throw err;
  }

  return validateTurnResponse(JSON.parse(response.text));
}
