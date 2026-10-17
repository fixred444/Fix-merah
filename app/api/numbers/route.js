import { db, getUser, json } from '@/lib/server';

export async function GET(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const { data } = await db().from('numbers').select('id,phone').eq('user_id', u.id).order('created_at');
  return json({ items: data || [] });
}

export async function POST(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const { phone } = await req.json();
  const clean = (phone || '').replace(/[\s-]/g, '');
  if (!/^\+?\d{8,15}$/.test(clean)) return json({ error: 'Nomor tidak valid. Contoh: +628123456789' }, 400);
  const { error } = await db().from('numbers').insert({ user_id: u.id, phone: clean });
  if (error) return json({ error: error.code === '23505' ? 'Nomor ini sudah ditambahkan' : error.message }, 400);
  return json({ ok: true });
}

export async function DELETE(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const id = new URL(req.url).searchParams.get('id');
  await db().from('numbers').delete().eq('id', id).eq('user_id', u.id);
  return json({ ok: true });
}
