import { db, getUser, json, encrypt } from '@/lib/server';

export async function GET(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const { data } = await db().from('accounts').select('id,email,shared_enabled,created_at').eq('user_id', u.id).order('created_at');
  const [{ data: shared }, { data: blocked }] = await Promise.all([
    db().from('accounts').select('user_id').eq('shared_enabled', true),
    db().from('user_status').select('user_id').in('status', ['beku', 'nonaktif']),
  ]);
  const blockedIds = new Set((blocked || []).map((b) => b.user_id));
  const globalTotal = (shared || []).filter((a) => !blockedIds.has(a.user_id)).length;
  return json({ items: data || [], globalTotal });
}

export async function POST(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const { email, appPassword, sharedEnabled } = await req.json();
  const pass = (appPassword || '').replace(/\s+/g, '');
  if (!/^[^@\s]+@gmail\.com$/i.test(email || '')) return json({ error: 'Gunakan alamat Gmail yang valid' }, 400);
  if (pass.length !== 16) return json({ error: 'App password Gmail terdiri dari 16 karakter' }, 400);
  const { error } = await db().from('accounts').insert({
    user_id: u.id, email: email.toLowerCase(), app_password_enc: encrypt(pass), shared_enabled: sharedEnabled === true,
  });
  if (error) return json({ error: error.code === '23505' ? 'Email ini sudah ditambahkan' : error.message }, 400);
  return json({ ok: true });
}

export async function DELETE(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const id = new URL(req.url).searchParams.get('id');
  await db().from('accounts').delete().eq('id', id).eq('user_id', u.id);
  return json({ ok: true });
}


export async function PATCH(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const { id, sharedEnabled } = await req.json();
  if (!id || typeof sharedEnabled !== 'boolean') return json({ error: 'Data tidak valid' }, 400);
  const { error } = await db().from('accounts').update({ shared_enabled: sharedEnabled }).eq('id', id).eq('user_id', u.id);
  if (error) return json({ error: 'Gagal memperbarui pengaturan akun' }, 400);
  return json({ ok: true });
}
