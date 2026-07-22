// Dynamic PDF generation (Critical Feature 4.1).
//
// Builds branded PDFs on demand from the structured KB tables — never from
// the model's own knowledge — using pdfkit (pure JS; no headless browser, so
// it runs fine on Railway). Generated files are cached in Supabase Storage
// under brochures/generated/ keyed by content type + topic; a repeat request
// within CACHE_DAYS resends the stored file instead of regenerating.
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { supabase } from '../db/supabase.js';

const LOGO_PATH = join(dirname(fileURLToPath(import.meta.url)), 'assets', 'skyai-logo.png');

// ── Branding (single place to edit before launch) ────────────────────
const BRAND = {
  name: 'SkyHigh Educational Services Private Limited',
  tagline: 'Your Trusted Partner for Abroad Medical Studies',
  address: '2nd Floor, Nirmaan Complex, Baghat, Srinagar, Jammu and Kashmir 190005',
  phone: '091231 37500',
  footerLine: 'For personalized guidance, WhatsApp us anytime.',
  // Colour scheme (proposed): deep green + white, matching the dashboard.
  primary: '#123524',   // deep green — headers, table headers
  accent: '#2e7d32',    // mid green — section titles, rules
  lightBg: '#eef5ef',   // pale green — alternating table rows
  text: '#1f2937',      // near-black body text
  muted: '#6b7280',     // grey — footer, notes
};

const CACHE_DAYS = 7;
const PAGE = { margin: 54, footerH: 46 };

const slugify = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// Helvetica (WinAnsi) has no ₹/≈ glyphs — swap them for safe equivalents.
const san = (s) => String(s ?? '')
  .replace(/₹/g, 'Rs ')
  .replace(/≈/g, '~')
  .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
  .trim();

// ── Topic resolution: id, display name, or a university name ─────────
async function resolveTopic(topic) {
  const { data: countries, error } = await supabase.from('kb_countries').select('*').eq('is_active', true);
  if (error) throw new Error(`KB fetch failed: ${error.message}`);
  const t = String(topic ?? '').trim().toLowerCase();
  if (!t) return { country: null, university: null };

  let country = countries.find((c) => c.country === slugify(t))
    || countries.find((c) => c.display_name.toLowerCase() === t)
    || countries.find((c) => c.display_name.toLowerCase().includes(t) || t.includes(c.display_name.toLowerCase()));
  let university = null;

  if (!country) {
    for (const c of countries) {
      const hit = (c.universities || []).find((u) => {
        const n = (u.name || '').toLowerCase();
        return n === t || n.includes(t) || t.includes(n);
      });
      if (hit) { country = c; university = hit; break; }
    }
  } else {
    university = (country.universities || []).find((u) => {
      const n = (u.name || '').toLowerCase();
      return n && t !== country.display_name.toLowerCase() && (n.includes(t) || t.includes(n));
    }) ?? null;
  }
  return { country: country ?? null, university };
}

// ── Layout helpers ───────────────────────────────────────────────────
function newDoc() {
  return new PDFDocument({
    size: 'A4',
    margins: { top: PAGE.margin, left: PAGE.margin, right: PAGE.margin, bottom: PAGE.margin + PAGE.footerH },
    bufferPages: true,
    info: { Author: BRAND.name },
  });
}

// Logo aspect ratio (cropped asset is 684x262) — used to size the white plate.
const LOGO_ASPECT = 684 / 262;

function cover(doc, title, subtitle) {
  doc.rect(0, 0, doc.page.width, 130).fill(BRAND.primary);
  // The logo's wordmark is dark navy — illegible directly on the dark green
  // bar, so it sits on a white plate instead (matches how it reads everywhere
  // else: dashboard, login page).
  const logoH = 44;
  const logoW = logoH * LOGO_ASPECT;
  const padX = 10, padY = 7;
  doc.roundedRect(PAGE.margin - padX, 24 - padY, logoW + padX * 2, logoH + padY * 2, 6).fill('#ffffff');
  doc.image(LOGO_PATH, PAGE.margin, 24, { height: logoH });
  doc.fill('#ffffff').font('Helvetica-Oblique').fontSize(11).text(BRAND.tagline, PAGE.margin, 24 + logoH + padY + 8);
  doc.moveDown(2);
  doc.fill(BRAND.primary).font('Helvetica-Bold').fontSize(19).text(san(title), PAGE.margin, 156);
  if (subtitle) doc.fill(BRAND.muted).font('Helvetica').fontSize(11).text(san(subtitle));
  doc.moveTo(PAGE.margin, doc.y + 8).lineTo(doc.page.width - PAGE.margin, doc.y + 8)
    .lineWidth(2).stroke(BRAND.accent);
  doc.y += 20;
}

function section(doc, title) {
  ensureRoom(doc, 60);
  doc.moveDown(0.8);
  doc.fill(BRAND.accent).font('Helvetica-Bold').fontSize(13).text(title);
  doc.moveDown(0.3);
  doc.fill(BRAND.text).font('Helvetica').fontSize(10.5);
}

function para(doc, label, value) {
  if (!value) return;
  ensureRoom(doc, 40);
  doc.fill(BRAND.text).font('Helvetica-Bold').fontSize(10.5).text(`${label}: `, { continued: true });
  doc.font('Helvetica').text(san(value));
  doc.moveDown(0.25);
}

function bullets(doc, items) {
  for (const item of items.filter(Boolean)) {
    ensureRoom(doc, 30);
    doc.fill(BRAND.text).font('Helvetica').fontSize(10.5)
      .text(`•  ${san(item)}`, { indent: 6, lineGap: 1.5 });
    doc.moveDown(0.15);
  }
}

function ensureRoom(doc, needed) {
  if (doc.y + needed > doc.page.height - PAGE.margin - PAGE.footerH) doc.addPage();
}

// Simple 3-column table: name | city | fee, with wrapped rows.
function universityTable(doc, unis) {
  const x = PAGE.margin;
  const w = doc.page.width - PAGE.margin * 2;
  const cols = [Math.round(w * 0.44), Math.round(w * 0.2), Math.round(w * 0.36)];

  const header = () => {
    ensureRoom(doc, 40);
    const y = doc.y;
    doc.rect(x, y, w, 20).fill(BRAND.primary);
    doc.fill('#ffffff').font('Helvetica-Bold').fontSize(9.5);
    doc.text('Institution', x + 6, y + 6, { width: cols[0] - 10 });
    doc.text('City/State', x + cols[0] + 4, y + 6, { width: cols[1] - 8 });
    doc.text('Fee (indicative)', x + cols[0] + cols[1] + 4, y + 6, { width: cols[2] - 10 });
    doc.y = y + 24;
  };
  header();

  unis.forEach((u, i) => {
    const name = san(u.name) || '—';
    const city = san(u.city) || '—';
    const fee = san(u.annual_fee_inr) || 'On request';
    doc.font('Helvetica').fontSize(9.5);
    const h = Math.max(
      doc.heightOfString(name, { width: cols[0] - 10 }),
      doc.heightOfString(fee, { width: cols[2] - 10 }),
    ) + 8;
    if (doc.y + h > doc.page.height - PAGE.margin - PAGE.footerH) { doc.addPage(); header(); }
    const y = doc.y;
    if (i % 2 === 0) doc.rect(x, y - 2, w, h).fill(BRAND.lightBg);
    doc.fill(BRAND.text);
    doc.text(name, x + 6, y + 2, { width: cols[0] - 10 });
    doc.text(city, x + cols[0] + 4, y + 2, { width: cols[1] - 8 });
    doc.text(fee, x + cols[0] + cols[1] + 4, y + 2, { width: cols[2] - 10 });
    doc.y = y + h;
    doc.x = x;
  });
}

function disclaimerAndFooters(doc) {
  ensureRoom(doc, 70);
  doc.moveDown(1);
  doc.fill(BRAND.muted).font('Helvetica-Oblique').fontSize(9).text(
    'All fees and details are indicative, compiled from recent official sources. The current official ' +
    'offer letter, fee invoice and counselling notification of the university/authority are final. ' +
    'No guarantee of admission, recognition, visa or licensing eligibility is expressed or implied.'
  );
  // Footer on every page (buffered pages). Writing below the bottom margin
  // makes pdfkit auto-add pages, so zero the margin while stamping footers.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - PAGE.footerH - 16;
    doc.moveTo(PAGE.margin, y).lineTo(doc.page.width - PAGE.margin, y).lineWidth(0.7).stroke(BRAND.accent);
    doc.fill(BRAND.muted).font('Helvetica').fontSize(8);
    doc.text(`${BRAND.name} · ${BRAND.address} · ${BRAND.phone}`, PAGE.margin, y + 6,
      { width: doc.page.width - PAGE.margin * 2, align: 'center', lineBreak: false });
    doc.text(`${BRAND.footerLine}  ·  Page ${i - range.start + 1} of ${range.count}`, PAGE.margin, y + 18,
      { width: doc.page.width - PAGE.margin * 2, align: 'center', lineBreak: false });
    doc.page.margins.bottom = savedBottom;
  }
}

// ── Content builders ─────────────────────────────────────────────────
function addCountryFacts(doc, c) {
  para(doc, 'Fee range', c.total_fee_range);
  para(doc, 'Duration', c.duration);
  para(doc, 'Eligibility', c.eligibility);
  para(doc, 'Recognition', c.recognition);
  para(doc, 'Language', c.language);
  para(doc, 'Living costs', c.living_costs);
}

async function buildBody(doc, contentType, country, university) {
  if (contentType === 'process_steps') {
    const [{ data: steps }, { data: faqs }] = await Promise.all([
      supabase.from('kb_process_steps').select('*').order('step_number'),
      supabase.from('kb_faqs').select('question, answer').eq('is_active', true).limit(6),
    ]);
    cover(doc, 'Admission Process — Step by Step', 'How we take you from first enquiry to arrival');
    section(doc, 'Our Process');
    for (const s of steps ?? []) {
      ensureRoom(doc, 44);
      doc.fill(BRAND.primary).font('Helvetica-Bold').fontSize(11).text(`Step ${s.step_number}: ${s.title}`);
      doc.fill(BRAND.text).font('Helvetica').fontSize(10.5).text(s.description, { lineGap: 1.5 });
      doc.moveDown(0.4);
    }
    if (faqs?.length) {
      section(doc, 'Frequently Asked Questions');
      for (const f of faqs) {
        ensureRoom(doc, 40);
        doc.fill(BRAND.text).font('Helvetica-Bold').fontSize(10.5).text(`Q: ${f.question}`);
        doc.font('Helvetica').text(`A: ${f.answer}`, { lineGap: 1.5 });
        doc.moveDown(0.3);
      }
    }
    return 'Admission-Process';
  }

  if (!country) throw new Error('topic not found in knowledge base');

  if (contentType === 'college_details' && university) {
    cover(doc, university.name, `${university.city ? `${university.city} · ` : ''}${country.display_name}`);
    section(doc, 'Institution Details');
    para(doc, 'Institution', university.name);
    para(doc, 'Location', university.city);
    para(doc, 'Fee (indicative)', university.annual_fee_inr || 'On request');
    if (university.notes) { section(doc, 'Additional Information'); bullets(doc, university.notes.split(' | ')); }
    section(doc, `About ${country.display_name}`);
    addCountryFacts(doc, c(country));
    return `${slugify(university.name)}`;
  }

  if (contentType === 'fee_structure') {
    cover(doc, `Fee Structure — ${country.display_name}`, 'Indicative tuition by institution');
    para(doc, 'Overall range', country.total_fee_range);
    para(doc, 'Living costs', country.living_costs);
    doc.moveDown(0.5);
    if (country.universities?.length) universityTable(doc, country.universities);
    return `Fees-${slugify(country.display_name)}`;
  }

  // country_overview (default)
  cover(doc, country.display_name, 'Destination overview');
  section(doc, 'Key Facts');
  addCountryFacts(doc, c(country));
  if (country.pros) { section(doc, 'Advantages'); bullets(doc, country.pros.split(/;\s*|\|/)); }
  if (country.cons) { section(doc, 'Points to Consider'); bullets(doc, country.cons.split(/;\s*|\|/)); }
  if (country.counselling_notes) { section(doc, 'Counselling Note'); doc.text(country.counselling_notes); }
  if (country.universities?.length) { section(doc, 'Institutions'); universityTable(doc, country.universities); }
  return `Overview-${slugify(country.display_name)}`;
}
const c = (x) => x; // readability shim

// ── Public API ───────────────────────────────────────────────────────
export async function generatePdf({ contentType, topic }) {
  const { country, university } = await resolveTopic(topic);
  const doc = newDoc();
  const chunks = [];
  doc.on('data', (d) => chunks.push(d));
  const done = new Promise((resolve) => doc.on('end', resolve));

  const baseName = await buildBody(doc, contentType, country, university);
  disclaimerAndFooters(doc);
  doc.end();
  await done;

  return {
    buffer: Buffer.concat(chunks),
    fileName: `SkyHigh-${baseName}.pdf`,
    storagePath: `generated/${contentType}-${slugify(topic) || 'general'}.pdf`,
  };
}

// Cache-aware: reuse the stored PDF when fresh, else generate + upload.
export async function getOrCreatePdf({ contentType, topic }) {
  const storagePath = `generated/${contentType}-${slugify(topic) || 'general'}.pdf`;

  const dir = storagePath.split('/')[0];
  const file = storagePath.split('/')[1];
  const { data: listing } = await supabase.storage.from('brochures').list(dir, { search: file });
  const existing = listing?.find((f) => f.name === file);
  const fresh = existing &&
    (Date.now() - new Date(existing.updated_at ?? existing.created_at).getTime()) < CACHE_DAYS * 86400000;

  if (fresh) {
    const { data: blob, error } = await supabase.storage.from('brochures').download(storagePath);
    if (!error && blob) {
      return {
        buffer: Buffer.from(await blob.arrayBuffer()),
        fileName: `SkyHigh-${slugify(topic) || contentType}.pdf`,
        storagePath,
        cached: true,
      };
    }
  }

  const pdf = await generatePdf({ contentType, topic });
  await supabase.storage.from('brochures')
    .upload(pdf.storagePath, pdf.buffer, { contentType: 'application/pdf', upsert: true });
  return { ...pdf, cached: false };
}
