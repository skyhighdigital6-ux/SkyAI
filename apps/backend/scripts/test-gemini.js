// Milestone 4 verification — run with:  npm run test:gemini
// Feeds fake conversation histories + fake KB context to Gemini and prints
// the parsed structured JSON. No WhatsApp, no Supabase — pure AI test.
// Needs only GEMINI_API_KEY in .env.
import 'dotenv/config';
import { geminiTurn } from '../src/ai/gemini.js';

// Fake KB context — mimics what kb/retrieval.js will build from Supabase.
const FAKE_KB = `
COUNTRY: Russia
- Universities: Sample State Medical University (Sample City) — ₹4.5 lakh/year
- Total package: ₹25–35 lakh for full 6 years (fees + hostel)
- Duration: 6 years including internship
- Eligibility: NEET qualified + 50% PCB in 12th (40% reserved categories)
- Recognition: NMC & WHO recognized
- Pros: low fees, no donation, English medium
- Cons: cold climate, basic Russian needed for patient interaction

COURSE: MBBS — NEET qualified, 12th with PCB 50%, age 17+

PROCESS: 1) Free eligibility check 2) Documents (10th/12th marksheets, NEET
scorecard, passport) 3) University application → admission letter in 7–14 days
4) Visa processing 5) Travel & arrival support

FAQ: Indian food available in most university messes.
`.trim();

const SCENARIOS = [
  {
    name: 'Hinglish casual student, short messages — expect mirrored Hinglish + score increase',
    lead: { current_stage: 'new', tone_profile: null },
    history: [
      { sender: 'student', content: 'sir russia mbbs ka total kharcha kitna hai' },
      { sender: 'bot', content: 'Total package 25-35 lakh ka hai, 6 saal ka pura — fees hostel sab milake. NEET diya hai aapne?' },
      { sender: 'student', content: 'haan 320 marks hain iss saal ke 😅 chalega kya' },
    ],
  },
  {
    name: 'Formal English student — expect formal English mirror + eligibility stage',
    lead: { current_stage: 'discovery', tone_profile: { language_mix: 'english', script: 'latin', formality: 'formal', message_length: 'long', uses_emoji: false } },
    history: [
      { sender: 'student', content: 'Good evening. I would like to know the complete admission requirements and fee structure for MBBS in Russia. My daughter has qualified NEET this year with 410 marks and scored 78% in PCB.' },
    ],
  },
  {
    name: 'Frustrated student asking for human — expect escalate=true',
    lead: { current_stage: 'faq', tone_profile: { language_mix: 'hinglish', script: 'latin', formality: 'tum', message_length: 'short', uses_emoji: false } },
    history: [
      { sender: 'student', content: 'yaar ye sab chhodo mujhe kisi insaan se baat karni hai, call karao kisi se' },
    ],
  },
];

for (const scenario of SCENARIOS) {
  console.log('\n════════════════════════════════════════════════════');
  console.log(`SCENARIO: ${scenario.name}`);
  console.log(`Student's last message: "${scenario.history.at(-1).content}"`);
  console.log('────────────────────────────────────────────────────');
  try {
    const start = Date.now();
    const turn = await geminiTurn({ lead: scenario.lead, kbContext: FAKE_KB, history: scenario.history });
    console.log(`(${Date.now() - start}ms)`);
    console.log(JSON.stringify(turn, null, 2));
  } catch (err) {
    console.error(`❌ ${err.name}: ${err.message}`);
    process.exitCode = 1;
  }
}
