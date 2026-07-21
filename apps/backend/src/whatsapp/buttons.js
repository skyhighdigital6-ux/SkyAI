// Interactive structured choices (country / course / budget).
//
// Reality check on Baileys buttons: WhatsApp has been progressively breaking
// button/list rendering for unofficial (non-Business-API) clients — they can
// silently not render on modern apps. So: ≤3 options → quick-reply buttons,
// >3 → list message, and if sending throws we fall back to a plain numbered
// text message (the AI parses the student's typed answer via crm_updates).
import { CHOICE_OPTIONS } from 'shared/constants';

const TITLES = {
  country: { text: 'Which destination are you interested in? 👇', buttonText: 'Choose destination' },
  course: { text: 'Which course are you looking for? 👇', buttonText: 'Choose course' },
  budget: { text: 'What is your approximate budget range? 👇', buttonText: 'Choose budget' },
};

// Replies arrive as "choice:<kind>:<id>" via selectedButtonId / selectedRowId.
export const choiceId = (kind, id) => `choice:${kind}:${id}`;

export function parseChoiceReply(text) {
  const match = /^choice:(country|course|budget):(.+)$/.exec(text || '');
  return match ? { kind: match[1], id: match[2] } : null;
}

export async function sendChoiceButtons(sock, jid, kind) {
  const options = CHOICE_OPTIONS[kind];
  const { text, buttonText } = TITLES[kind];
  if (!options) throw new Error(`unknown choice kind: ${kind}`);

  try {
    if (options.length <= 3) {
      await sock.sendMessage(jid, {
        text,
        buttons: options.map((o) => ({
          buttonId: choiceId(kind, o.id),
          buttonText: { displayText: o.label },
          type: 1,
        })),
      });
    } else {
      await sock.sendMessage(jid, {
        text,
        buttonText,
        sections: [{
          title: buttonText,
          rows: options.map((o) => ({ rowId: choiceId(kind, o.id), title: o.label })),
        }],
      });
    }
    return { kind, fallback: false };
  } catch (err) {
    console.warn(`[buttons] interactive send failed (${err.message}) — using numbered text fallback`);
    const numbered = options.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
    await sock.sendMessage(jid, { text: `${text}\n\n${numbered}` });
    return { kind, fallback: true };
  }
}
