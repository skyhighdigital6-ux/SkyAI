// DEMO MODE — active automatically while Supabase env vars are missing.
// Lets you preview the whole dashboard with dummy data, no login needed.
// Connect Supabase in .env and this switches itself off.
export const DEMO = !process.env.NEXT_PUBLIC_SUPABASE_URL;

const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();

// Country/destination id → display label (matches kb_countries.country ids).
export const COUNTRY_LABELS = {
  russia: 'Russia', georgia: 'Georgia', kyrgyzstan: 'Kyrgyzstan',
  kazakhstan: 'Kazakhstan', china: 'China', iran: 'Iran', italy: 'Italy',
  malaysia: 'Malaysia', germany: 'Germany',
  'united-kingdom': 'UK', 'united-states': 'USA',
  philippines: 'Philippines',
  'india-deemed-universities': 'India (Deemed)',
  'india-bihar-private': 'India (Bihar)', 'india-chhattisgarh-private': 'India (Chhattisgarh)',
  'india-delhi-ncr-private': 'India (Delhi NCR)', 'india-haryana-private': 'India (Haryana)',
  'india-karnataka-private': 'India (Karnataka)', 'india-jammu-kashmir-private': 'India (J&K)',
  'india-kerala-private': 'India (Kerala)', 'india-maharashtra-private': 'India (Maharashtra)',
  'india-punjab-private': 'India (Punjab)', 'india-rajasthan-private': 'India (Rajasthan)',
  'india-tamil-nadu-private': 'India (Tamil Nadu)', 'india-telangana-private': 'India (Telangana)',
  'india-uttar-pradesh-private': 'India (UP)', 'india-west-bengal-private': 'India (West Bengal)',
};

// Display labels + badge colors for stages (DB keeps the internal ids).
export const STAGE_META = {
  new: { label: 'New Inquiry', cls: 'st-blue' },
  discovery: { label: 'Discovery', cls: 'st-blue' },
  eligibility: { label: 'Eligibility Check', cls: 'st-orange' },
  brochure_sent: { label: 'Brochure Sent', cls: 'st-teal' },
  faq: { label: 'FAQ', cls: 'st-blue' },
  documents: { label: 'Documents Pending', cls: 'st-amber' },
  admission: { label: 'Follow-up', cls: 'st-purple' },
  escalated: { label: 'Escalated', cls: 'st-red' },
  closed_won: { label: 'Converted', cls: 'st-green' },
  closed_lost: { label: 'Closed Lost', cls: 'st-gray' },
};

export const demoLeads = [
  {
    id: 'demo-1', whatsapp_number: '917006499112', name: 'Muzamil Lone',
    current_stage: 'closed_won', interested_country: 'russia', interested_course: 'mbbs',
    neet_status: 'Qualified 2026 — 388 marks', academic_details: '12th — 76% (PCB)',
    budget_range: '25L_40L', lead_score: 81, lead_temperature: 'Hot', needs_human: false,
    tone_profile: { language_mix: 'hinglish', script: 'latin', formality: 'aap', message_length: 'short', uses_emoji: true },
    documents_shared: [{ doc: 'Russia MBBS Brochure.pdf', sent_at: ago(2100) }],
    disclosure_sent: true, last_active_at: ago(1440), created_at: ago(9000),
  },
  {
    id: 'demo-2', whatsapp_number: '917006345678', name: 'Ayaan Rashid',
    current_stage: 'eligibility', interested_country: 'russia', interested_course: 'mbbs',
    neet_status: 'NEET 2026 — 412 marks', academic_details: '12th — 72% (PCB)',
    budget_range: '15L_25L', lead_score: 78, lead_temperature: 'Hot', needs_human: false,
    tone_profile: { language_mix: 'hinglish', script: 'latin', formality: 'aap', message_length: 'short', uses_emoji: true },
    documents_shared: [
      { doc: 'Russia MBBS Brochure.pdf', sent_at: ago(120), size: '1.8 MB' },
      { doc: 'Fee Sheet.pdf', sent_at: ago(119), size: '520 KB' },
    ],
    disclosure_sent: true, last_active_at: ago(5), created_at: ago(3000),
  },
  {
    id: 'demo-3', whatsapp_number: '917889911223', name: 'Sania Rather',
    current_stage: 'brochure_sent', interested_country: 'georgia', interested_course: 'mbbs',
    neet_status: 'Qualified 2026 — 356 marks', academic_details: '12th — 79% (PCB)',
    budget_range: '25L_40L', lead_score: 74, lead_temperature: 'Hot', needs_human: false,
    tone_profile: { language_mix: 'english', script: 'latin', formality: 'formal', message_length: 'medium', uses_emoji: false },
    documents_shared: [{ doc: 'Georgia MBBS Brochure.pdf', sent_at: ago(15) }],
    disclosure_sent: true, last_active_at: ago(13), created_at: ago(2000),
  },
  {
    id: 'demo-4', whatsapp_number: '916005488990', name: 'Adil Dar',
    current_stage: 'new', interested_country: 'kyrgyzstan', interested_course: 'mbbs',
    neet_status: null, academic_details: null, budget_range: 'under_15L',
    lead_score: 65, lead_temperature: 'Warm', needs_human: true,
    tone_profile: { language_mix: 'hinglish', script: 'latin', formality: 'tum', message_length: 'short', uses_emoji: false },
    documents_shared: [], disclosure_sent: true, last_active_at: ago(18), created_at: ago(60),
  },
  {
    id: 'demo-5', whatsapp_number: '919596533221', name: 'Uzma Nazir',
    current_stage: 'documents', interested_country: 'philippines', interested_course: 'mbbs',
    neet_status: 'Qualified 2026 — 301 marks', academic_details: '12th — 68% (PCB)',
    budget_range: '15L_25L', lead_score: 62, lead_temperature: 'Warm', needs_human: true,
    tone_profile: { language_mix: 'urdu-english', script: 'latin', formality: 'aap', message_length: 'medium', uses_emoji: true },
    documents_shared: [{ doc: 'Philippines MBBS Brochure.pdf', sent_at: ago(500) }],
    disclosure_sent: true, last_active_at: ago(38), created_at: ago(4000),
  },
  {
    id: 'demo-6', whatsapp_number: '919149666778', name: 'Rayees Ahmed',
    current_stage: 'admission', interested_country: 'russia', interested_course: 'mbbs',
    neet_status: 'Qualified 2025 — 274 marks', academic_details: null,
    budget_range: null, lead_score: 42, lead_temperature: 'Warm', needs_human: false,
    tone_profile: { language_mix: 'hinglish', script: 'latin', formality: 'tum', message_length: 'short', uses_emoji: false },
    documents_shared: [], disclosure_sent: true, last_active_at: ago(60), created_at: ago(6000),
  },
  {
    id: 'demo-7', whatsapp_number: '919622144556', name: 'Insha Malik',
    current_stage: 'new', interested_country: 'georgia', interested_course: 'mbbs',
    neet_status: null, academic_details: null, budget_range: null,
    lead_score: 38, lead_temperature: 'Cold', needs_human: false,
    tone_profile: null, documents_shared: [], disclosure_sent: false,
    last_active_at: ago(120), created_at: ago(125),
  },
];

const msg = (id, mins, direction, sender, content, type = 'text') => ({
  id, created_at: ago(mins), direction, sender, content, message_type: type,
});

export const demoMessages = {
  'demo-1': [
    msg(1, 9000, 'inbound', 'student', 'salam sir, russia mbbs ke bare me info chahiye thi'),
    msg(2, 8999, 'outbound', 'bot', 'Walaikum salam! Bilkul. Russia me total package 25-35 lakh ka hota hai, 6 saal ka. NEET diya hai aapne?'),
    msg(3, 8990, 'inbound', 'student', 'haan 388 marks 2026 me'),
    msg(4, 8989, 'outbound', 'bot', 'MashaAllah, solid score 👍 12th PCB percentage?'),
    msg(5, 8980, 'inbound', 'student', '76%'),
    msg(6, 8979, 'outbound', 'bot', 'Perfect, aap easily eligible ho. Brochure bhej raha hoon.'),
    msg(7, 8978, 'outbound', 'bot', '[sent PDF: Russia MBBS Brochure.pdf]', 'pdf'),
    msg(8, 1445, 'inbound', 'student', 'sir humne decide kar liya, admission process start karte hain 🎉'),
    msg(9, 1440, 'outbound', 'bot', 'Bahut badhiya! 🎉 Documents list bhejta hoon — 10th 12th marksheet, NEET scorecard, passport aur photos.'),
  ],
  'demo-2': [
    msg(1, 130, 'inbound', 'student', 'aoa sir, mbbs russia ke liye kya requirement hai?'),
    msg(2, 129, 'outbound', 'bot', 'Walaikum assalam! NEET qualified + 12th me 50% PCB chahiye. Aapka NEET score kitna hai?'),
    msg(3, 125, 'inbound', 'student', '412 marks 2026, 12th me 72% PCB'),
    msg(4, 123, 'outbound', 'bot', 'Great! Aapka profile Russia ke liye suitable hai. 👍\nMain aapko brochure aur fee details bhej raha hoon.'),
    msg(5, 122, 'outbound', 'bot', '[sent PDF: Russia MBBS Brochure.pdf]', 'pdf'),
    msg(6, 8, 'inbound', 'student', 'Thanks! Hostel aur total kharcha?'),
    msg(7, 5, 'outbound', 'bot', 'Hostel included hota hai approx 2-2.5L/year. Total 6 years ka around 22-24L aata hai.'),
  ],
  'demo-3': [
    msg(1, 2000, 'inbound', 'student', 'Hello, I wanted details about MBBS in Georgia.'),
    msg(2, 1999, 'outbound', 'bot', 'Hi! Georgia is an excellent option — English medium, NMC recognized. May I know your NEET score and 12th PCB percentage?'),
    msg(3, 1990, 'inbound', 'student', 'NEET 356 this year, PCB 79%.'),
    msg(4, 1989, 'outbound', 'bot', 'You are comfortably eligible! Sharing the Georgia brochure with the complete fee structure.'),
    msg(5, 15, 'outbound', 'bot', '[sent PDF: Georgia MBBS Brochure.pdf]', 'pdf'),
  ],
  'demo-4': [
    msg(1, 60, 'inbound', 'student', 'bhai kyrgyzstan ka package batao'),
    msg(2, 59, 'outbound', 'bot', 'Kyrgyzstan sabse budget-friendly hai 👍 15 lakh se kam me ho jata hai total. NEET diya hai?'),
    msg(3, 20, 'inbound', 'student', 'mujhe kisi senior se baat karni hai directly'),
    msg(4, 18, 'outbound', 'bot', 'Bilkul! Hamare senior counselor aapko thodi der me yahi reply karenge 🙏'),
  ],
  'demo-5': [
    msg(1, 4000, 'inbound', 'student', 'Assalamualaikum, Philippines me MBBS kaisa rehta hai?'),
    msg(2, 3999, 'outbound', 'bot', 'Walaikum assalam! Philippines bahut acha option hai — English medium, US-pattern education. Aapka NEET status kya hai?'),
    msg(3, 45, 'inbound', 'student', 'fees ki installment me payment ho sakti hai? refund policy kya hai?'),
    msg(4, 38, 'outbound', 'bot', 'Payment aur refund ke bare me hamare senior counselor aapko personally guide karenge — thodi der me reply aayega 🙏'),
  ],
};

export const demoKb = {
  kb_countries: [{
    id: 1, country: 'russia', display_name: 'Russia',
    universities: [{ name: 'Sample State Medical University', city: 'Sample City', annual_fee_inr: '₹4.5 lakh/year', notes: 'PLACEHOLDER' }],
    total_fee_range: '₹25–35 lakh', duration: '6 years', eligibility: '50% PCB + NEET',
    recognition: 'NMC, WHO', pros: 'PLACEHOLDER: low fees, English medium', cons: 'PLACEHOLDER: cold climate',
    brochure_path: null, is_active: true,
  }],
  kb_courses: [{ id: 1, course: 'mbbs', display_name: 'MBBS', eligibility: 'PLACEHOLDER: NEET qualified, 12th PCB 50%, age 17+', notes: null, is_active: true }],
  kb_faqs: [
    { id: 1, question: 'Is NEET required for MBBS abroad?', answer: 'PLACEHOLDER: Yes, mandatory for Indian students.', category: 'eligibility', is_active: true },
    { id: 2, question: 'Kya wahan khana Indian milta hai?', answer: 'PLACEHOLDER: Haan, zyada universities me Indian mess available hai.', category: 'food', is_active: true },
  ],
  kb_process_steps: [
    { id: 1, step_number: 1, title: 'Free counseling & eligibility check', description: 'PLACEHOLDER: Share NEET score, 12th marks and budget.' },
    { id: 2, step_number: 2, title: 'Document collection', description: 'PLACEHOLDER: Marksheets, NEET scorecard, passport, photos.' },
    { id: 3, step_number: 3, title: 'University application & admission letter', description: 'PLACEHOLDER: Admission letter in 7–14 days.' },
    { id: 4, step_number: 4, title: 'Visa processing', description: 'PLACEHOLDER: Invitation letter and visa filing handled by us.' },
    { id: 5, step_number: 5, title: 'Travel & arrival support', description: 'PLACEHOLDER: Tickets, airport pickup, hostel allotment.' },
  ],
};

export const demoQuota = { day: new Date().toISOString().slice(0, 10), gemini_requests: 205, groq_requests: 4, gemini_daily_limit: 250, gemini_pct: 82 };
