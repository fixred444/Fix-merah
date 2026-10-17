import { db, getUser, json } from '@/lib/server';

async function admin(req) {
  const u = await getUser(req);
  if (!u) return [null, json({ error: 'Belum masuk' }, 401)];
  if (!u.isAdmin) return [null, json({ error: 'Khusus admin' }, 403)];
  return [u, null];
}
export async function GET(req) {
  const [, err] = await admin(req); if (err) return err;
  const { data } = await db().from('app_settings').select('value').eq('key', 'daily_user_limit').maybeSingle();
  return json({ dailyUserLimit: Math.max(1, Math.min(100, Number(data?.value || process.env.DAILY_LIMIT || 10))) });
}
export async function PUT(req) {
  const [, err] = await admin(req); if (err) return err;
  const body = await req.json(); const n = Number(body.dailyUserLimit);
  if (!Number.isInteger(n) || n < 1 || n > 100) return json({ error: 'Kuota harus angka bulat 1–100' }, 400);
  const { error } = await db().from('app_settings').upsert({ key: 'daily_user_limit', value: String(n), updated_at: new Date().toISOString() });
  if (error) return json({ error: 'Gagal menyimpan pengaturan kuota' }, 400);
  return json({ ok: true, dailyUserLimit: n });
}
