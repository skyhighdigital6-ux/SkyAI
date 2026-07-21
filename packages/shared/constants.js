// Conversation stages a lead moves through. Gemini returns one of these
// as `detected_stage` each turn; dashboard filters/groups by them.
export const STAGES = [
  'new',              // first contact, greeting exchanged
  'discovery',        // exploring country/course interest
  'eligibility',      // NEET / academics / budget check in progress
  'brochure_sent',    // relevant PDF(s) shared
  'faq',              // answering detailed questions
  'documents',        // collecting documents for admission
  'admission',        // actively in admission process
  'escalated',        // handed to a human counselor
  'closed_won',       // enrolled
  'closed_lost',      // dropped off / not eligible / went elsewhere
];

// Lead temperature derived from lead_score (0–100).
export const TEMPERATURE = {
  HOT: { min: 70, max: 100, emoji: '🔴', label: 'Hot' },
  WARM: { min: 40, max: 69, emoji: '🟡', label: 'Warm' },
  COLD: { min: 0, max: 39, emoji: '⚪', label: 'Cold' },
};

export function temperatureForScore(score) {
  if (score >= TEMPERATURE.HOT.min) return 'Hot';
  if (score >= TEMPERATURE.WARM.min) return 'Warm';
  return 'Cold';
}

// Interactive-choice flows (Milestone 9). `id` is the stable value stored in
// the DB; `label` is what the student sees on the button/list row.
export const CHOICE_OPTIONS = {
  country: [
    { id: 'russia', label: 'Russia 🇷🇺' },
    { id: 'georgia', label: 'Georgia 🇬🇪' },
    { id: 'kyrgyzstan', label: 'Kyrgyzstan 🇰🇬' },
    { id: 'kazakhstan', label: 'Kazakhstan 🇰🇿' },
    { id: 'china', label: 'China 🇨🇳' },
    { id: 'iran', label: 'Iran 🇮🇷' },
    { id: 'italy', label: 'Italy 🇮🇹' },
    { id: 'malaysia', label: 'Malaysia 🇲🇾' },
    { id: 'germany', label: 'Germany 🇩🇪' },
    { id: 'united-kingdom', label: 'UK 🇬🇧' },
    { id: 'united-states', label: 'USA 🇺🇸' },
    { id: 'india-deemed-universities', label: 'India (Private/Deemed) 🇮🇳' },
  ],
  course: [
    { id: 'mbbs', label: 'MBBS' },
    { id: 'bds', label: 'BDS (Dental)' },
    { id: 'nursing', label: 'Nursing' },
  ],
  budget: [
    { id: 'under_15L', label: 'Under ₹15 lakh' },
    { id: '15L_25L', label: '₹15–25 lakh' },
    { id: '25L_40L', label: '₹25–40 lakh' },
    { id: 'above_40L', label: 'Above ₹40 lakh' },
  ],
};

// Which lead column each choice kind fills.
export const CHOICE_FIELD = {
  country: 'interested_country',
  course: 'interested_course',
  budget: 'budget_range',
};

export const COUNTRIES = CHOICE_OPTIONS.country.map((o) => o.id);
export const COURSES = CHOICE_OPTIONS.course.map((o) => o.id);
export const BUDGET_RANGES = CHOICE_OPTIONS.budget.map((o) => o.id);
