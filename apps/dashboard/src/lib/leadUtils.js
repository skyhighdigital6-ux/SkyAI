// Shared helpers for manual / bulk lead import. Pure functions — safe to use
// in both the browser (preview) and serverless routes (authoritative).

// Normalize a phone number to WhatsApp's digits-only form with country code,
// e.g. "+91 99067 12345" / "9906712345" → "919906712345". Defaults bare
// 10-digit numbers to India (91); pass full country code for others.
export function normalizeNumber(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);       // 00 international prefix
  if (d.length === 10) d = '91' + d;            // bare Indian mobile
  else if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  return d;
}

export const validNumber = (d) => /^\d{11,15}$/.test(d);

// Parse pasted/uploaded CSV into [{ name, whatsapp_number, course, state }].
// Accepts a header row (name / whatsapp_number|number|phone|mobile / course /
// state, any order) or, if none is detected, positional columns
// name, whatsapp_number, course, state.
export function parseCsv(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const split = (l) => l.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const first = split(lines[0]).map((h) => h.toLowerCase());
  const known = ['name', 'student', 'student_name', 'whatsapp_number', 'number', 'phone', 'mobile', 'whatsapp', 'course', 'state'];
  const hasHeader = first.some((h) => known.includes(h));

  const header = hasHeader ? first : ['name', 'whatsapp_number', 'course', 'state'];
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const col = (names) => header.findIndex((h) => names.includes(h));
  const iName = col(['name', 'student', 'student_name']);
  const iNum = col(['whatsapp_number', 'number', 'phone', 'mobile', 'whatsapp']);
  const iCourse = col(['course']);
  const iState = col(['state']);

  return dataLines.map((l) => {
    const c = split(l);
    return {
      name: iName >= 0 ? (c[iName] || '') : '',
      whatsapp_number: iNum >= 0 ? (c[iNum] || '') : (c[1] || c[0] || ''),
      course: iCourse >= 0 ? (c[iCourse] || '') : '',
      state: iState >= 0 ? (c[iState] || '') : '',
    };
  }).filter((r) => r.whatsapp_number);
}
