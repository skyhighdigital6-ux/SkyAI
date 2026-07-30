// Official WhatsApp Business Cloud API transport.
//
// Used for BUSINESS-INITIATED sends — the welcome (first) message and bulk
// campaigns — because unofficial clients get banned for exactly that traffic.
// Ongoing conversation automation stays on Baileys (see connection.js).
//
// Two message classes matter:
//   • template  — the only thing allowed when no 24h window is open (welcome/bulk)
//   • text/media — free-form, allowed for 24h after the student's last message
//
// Config (Railway env vars, never committed):
//   WA_CLOUD_TOKEN        permanent System-User token
//   WA_PHONE_NUMBER_ID    e.g. 1289919044194696
//   WA_API_VERSION        default v25.0
//   WA_WELCOME_TEMPLATE   approved template name, default 'welcome'
//   WA_TEMPLATE_LANG      default 'en'
const API = () => `https://graph.facebook.com/${process.env.WA_API_VERSION || 'v25.0'}`;
const PHONE_ID = () => process.env.WA_PHONE_NUMBER_ID;
const TOKEN = () => process.env.WA_CLOUD_TOKEN;

export const cloudEnabled = () => Boolean(TOKEN() && PHONE_ID());
export const WELCOME_TEMPLATE = () => process.env.WA_WELCOME_TEMPLATE || 'welcome';
export const TEMPLATE_LANG = () => process.env.WA_TEMPLATE_LANG || 'en';

// Cloud API wants bare digits with country code — no '+', no jid suffix.
export const toPhone = (v) => String(v || '').replace(/@.*$/, '').replace(/\D/g, '');

async function post(path, body) {
  const res = await fetch(`${API()}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json?.error || {};
    // Surface Meta's own reason (expired token, template not approved, …)
    throw new Error(`[cloud ${res.status}] ${e.message || 'send failed'}${e.code ? ` (code ${e.code})` : ''}`);
  }
  return json;
}

/** Business-initiated template send. `params` fill {{1}}, {{2}}… in the body. */
export async function sendTemplate(to, { name = WELCOME_TEMPLATE(), lang = TEMPLATE_LANG(), params = [] } = {}) {
  const components = params.length
    ? [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t) })) }]
    : [];
  const json = await post(`${PHONE_ID()}/messages`, {
    messaging_product: 'whatsapp',
    to: toPhone(to),
    type: 'template',
    template: { name, language: { code: lang }, ...(components.length ? { components } : {}) },
  });
  return json?.messages?.[0]?.id ?? null;   // wamid, for delivery-status matching
}

/** Free-form text — only valid inside the 24h customer-service window. */
export async function sendText(to, text) {
  const json = await post(`${PHONE_ID()}/messages`, {
    messaging_product: 'whatsapp',
    to: toPhone(to),
    type: 'text',
    text: { body: String(text), preview_url: true },
  });
  return json?.messages?.[0]?.id ?? null;
}

/** Upload bytes and return a media id usable in image/document sends. */
export async function uploadMedia(buffer, mimetype, fileName = 'file') {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimetype);
  form.append('file', new Blob([buffer], { type: mimetype }), fileName);
  const res = await fetch(`${API()}/${PHONE_ID()}/media`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN()}` }, body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`[cloud media ${res.status}] ${json?.error?.message || 'upload failed'}`);
  return json.id;
}

/** Send an already-uploaded (or link-hosted) image/document. */
export async function sendMedia(to, { kind, mediaId, link, caption, fileName }) {
  const payload = mediaId ? { id: mediaId } : { link };
  if (caption && kind !== 'document') payload.caption = caption;
  if (kind === 'document') { payload.filename = fileName || 'document.pdf'; if (caption) payload.caption = caption; }
  const json = await post(`${PHONE_ID()}/messages`, {
    messaging_product: 'whatsapp', to: toPhone(to), type: kind, [kind]: payload,
  });
  return json?.messages?.[0]?.id ?? null;
}

/**
 * A Baileys-shaped socket backed by the Cloud API, so the existing flow code
 * (say / sendMenu / sendCollegeDocuments, which all call
 * `sock.sendMessage(jid, content)`) works unchanged over the official transport.
 */
export function cloudSock() {
  return {
    isCloud: true,
    async sendMessage(jid, content) {
      const to = toPhone(jid);
      if (content?.text) return { key: { id: await sendText(to, content.text) } };
      if (content?.image) {
        const id = Buffer.isBuffer(content.image)
          ? await uploadMedia(content.image, content.mimetype || 'image/jpeg', 'image.jpg')
          : null;
        return { key: { id: await sendMedia(to, { kind: 'image', mediaId: id, link: content.image?.url, caption: content.caption }) } };
      }
      if (content?.document) {
        const id = Buffer.isBuffer(content.document)
          ? await uploadMedia(content.document, content.mimetype || 'application/pdf', content.fileName || 'document.pdf')
          : null;
        return { key: { id: await sendMedia(to, { kind: 'document', mediaId: id, link: content.document?.url, caption: content.caption, fileName: content.fileName }) } };
      }
      throw new Error('cloudSock: unsupported message content');
    },
  };
}
