// Calls the Railway backend's action endpoints with the staff JWT.
import { supabase } from './supabase';

const BASE = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:3001';

export async function backendApi(path, { method = 'GET', body } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Backend error ${res.status}`);
  return json;
}
