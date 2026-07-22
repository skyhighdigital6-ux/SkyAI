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
