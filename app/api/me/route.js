import { getUser, json } from '@/lib/server';
export async function GET(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  return json({ email: u.email, isAdmin: u.isAdmin });
}
