import { ensureProfile, getUser, isVerified, json } from '@/lib/server';
export async function GET(req) {
  const u = await getUser(req, true);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const p = await ensureProfile(u.id, u.email, u.isAdmin);
  return json({ id: u.id, email: u.email, isAdmin: u.isAdmin, status: u.status, note: u.note, name: p?.name || '', verified: isVerified(p) });
}
