// Groq (Llama) fallback with the SAME interface as gemini.js — used when
// Gemini's daily quota is exhausted or retries keep failing, so the bot
// never goes fully silent.
import Groq from 'groq-sdk';
import { config } from '../config.js';
import { buildSystemInstruction, JSON_CONTRACT } from './prompt.js';
import { validateTurnResponse } from './gemini.js';

let client = null;
function getClient() {
  if (!config.groqApiKey) throw new Error('GROQ_API_KEY not set in .env');
  client ??= new Groq({ apiKey: config.groqApiKey });
  return client;
}

export async function groqTurn({ lead, kbContext, kbCountryIds, history }) {
  const isFirstReply = !history.some((m) => m.sender !== 'student');
  const completion = await getClient().chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.8,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `${buildSystemInstruction({ kbContext, lead, kbCountryIds, isFirstReply })}\n\n${JSON_CONTRACT}` },
      ...history.map((m) => ({
        role: m.sender === 'student' ? 'user' : 'assistant',
        content: m.content,
      })),
    ],
  });
  return validateTurnResponse(JSON.parse(completion.choices[0].message.content));
}
