import { db, getUser, json, encrypt } from '@/lib/server';

export async function GET(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const { data } = await db().from('accounts').select('id,email,shared_enabled,created_at').eq('user_id', u.id).order('created_at');
  return json({ items: data || [] });
}

export async function POST(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const { email, appPassword } = await req.json();
  const pass = (appPassword || '').replace(/\s+/g, '');
  if (!/^[^@\s]+@gmail\.com$/i.test(email || '')) return json({ error: 'Gunakan alamat Gmail yang valid' }, 400);
  if (pass.length !== 16) return json({ error: 'App password Gmail terdiri dari 16 karakter' }, 400);
  const { error } = await db().from('accounts').insert({
    user_id: u.id, email: email.toLowerCase(), app_password_enc: encrypt(pass),
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
