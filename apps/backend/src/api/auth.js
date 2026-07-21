// Verifies the Supabase Auth JWT the dashboard sends (Authorization: Bearer)
// and confirms the user is registered in staff_users.
import { supabase } from '../db/supabase.js';

export async function requireStaff(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Missing Authorization bearer token' });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });

    const { data: staff } = await supabase
      .from('staff_users').select('*').eq('id', user.id).maybeSingle();
    if (!staff) return res.status(403).json({ error: 'Not a registered staff member' });

    req.staff = staff;
    next();
  } catch (err) {
    console.error('[auth] verification failed:', err.message);
    res.status(500).json({ error: 'Auth check failed' });
  }
}
