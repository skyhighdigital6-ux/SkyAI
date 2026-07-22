// Loads id -> name lookup maps for the catalog tables, so lead rows (which
// store course/state/college/counsellor IDs) can be shown as readable names.
import { supabase } from './supabase';

export async function fetchCatalogMaps() {
  const [c, s, g, co] = await Promise.all([
    supabase.from('courses').select('id,name'),
    supabase.from('states').select('id,name'),
    supabase.from('colleges').select('id,name'),
    supabase.from('counsellors').select('id,name'),
  ]);
  const map = (r) => Object.fromEntries((r.data ?? []).map((x) => [x.id, x.name]));
  return { courses: map(c), states: map(s), colleges: map(g), counsellors: map(co) };
}

// Human-readable value for a lead's course / state / college / counsellor,
// falling back to the manually-typed "Other" value then an em dash.
export const leadCourse = (l, m) =>
  m.courses[l.selected_course_id] ?? l.other_course ?? '—';
export const leadState = (l, m) =>
  m.states[l.selected_state_id] ?? l.other_state ?? '—';
export const leadCollege = (l, m) =>
  m.colleges[l.selected_college_id] ?? l.other_college ?? '—';
export const leadCounsellor = (l, m) =>
  m.counsellors[l.assigned_counsellor_id] ?? '—';

// The deterministic flow doesn't run AI lead-scoring, so derive an engagement
// score + temperature from how far the student progressed through the flow.
const STAGE_SCORE = {
  'New Lead': 20, 'Course Selected': 40, 'State Selected': 55, 'College Selected': 70,
  'Documents Shared': 82, 'Callback Requested': 90, 'Guidance Completed': 92,
  'Counselor Assigned': 85, 'Human Assistance Required': 75, 'Not Interested': 8,
};
export const leadScore = (l) => STAGE_SCORE[l?.flow_status] ?? l?.lead_score ?? 20;
export const leadTemp = (l) => { const s = leadScore(l); return s >= 70 ? 'Hot' : s >= 40 ? 'Warm' : 'Cold'; };
export const TEMP_CLS = { Hot: 'hot', Warm: 'warm', Cold: 'cold' };
