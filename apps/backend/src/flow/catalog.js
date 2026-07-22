// Read-only access to the admin-managed catalog the WhatsApp menu flow shows.
// Everything here is driven by the `courses`, `states`, `colleges`,
// `college_documents` and `counsellors` tables — add/edit rows in the admin
// panel and they appear in the flow with no code change. Inactive rows are
// always filtered out.
import { supabase } from '../db/supabase.js';

const order = (q) => q.order('display_order', { ascending: true }).order('id', { ascending: true });

export async function getActiveCourses() {
  const { data } = await order(supabase.from('courses').select('*').eq('is_active', true));
  return data ?? [];
}

export async function getCourse(id) {
  if (!id) return null;
  const { data } = await supabase.from('courses').select('*').eq('id', id).maybeSingle();
  return data ?? null;
}

// Active states that actually have at least one active college for this course.
// courseId null (student typed an "Other" course) → show every active state.
export async function getStatesForCourse(courseId) {
  const { data: states } = await order(supabase.from('states').select('*').eq('is_active', true));
  if (!states?.length) return [];
  if (!courseId) return states;

  let cq = supabase.from('colleges').select('state_id').eq('is_active', true).contains('course_ids', [courseId]);
  const { data: colleges } = await cq;
  const stateIds = new Set((colleges ?? []).map((c) => c.state_id).filter(Boolean));
  return states.filter((s) => stateIds.has(s.id));
}

export async function getState(id) {
  if (!id) return null;
  const { data } = await supabase.from('states').select('*').eq('id', id).maybeSingle();
  return data ?? null;
}

// Colleges for the selected course + state. stateId null = "Any State".
// courseId null ("Other" course) = don't filter by course.
export async function getCollegesFor(courseId, stateId) {
  let q = supabase.from('colleges').select('*').eq('is_active', true);
  if (courseId) q = q.contains('course_ids', [courseId]);
  if (stateId) q = q.eq('state_id', stateId);
  const { data } = await order(q);
  return data ?? [];
}

export async function getCollege(id) {
  if (!id) return null;
  const { data } = await supabase.from('colleges').select('*').eq('id', id).maybeSingle();
  return data ?? null;
}

// Latest ACTIVE document per type for a college (newest academic year / upload).
// Returns e.g. { brochure: {...}, fee_structure: {...}, other: {...} }.
export async function getLatestDocs(collegeId) {
  const { data } = await supabase
    .from('college_documents')
    .select('*')
    .eq('college_id', collegeId)
    .eq('is_active', true)
    .order('academic_year', { ascending: false })
    .order('uploaded_at', { ascending: false });
  const latest = {};
  for (const doc of data ?? []) {
    if (!latest[doc.doc_type]) latest[doc.doc_type] = doc; // first = newest
  }
  return latest;
}

export async function getActiveCounsellors() {
  const { data } = await order(supabase.from('counsellors').select('*').eq('is_active', true));
  return data ?? [];
}

export async function getDefaultCounsellor() {
  const list = await getActiveCounsellors();
  return list.find((c) => c.is_default_callback) ?? list[0] ?? null;
}

export async function getSetting(key, fallback = null) {
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  return data?.value ?? fallback;
}
