import { db, getUser, json, loadProfile } from '@/lib/server';

export const runtime = 'nodejs';

async function handlePOST(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  if (u.status === 'beku') return json({ error: 'Akunmu sedang dibekukan admin.' }, 403);
  let b; try { b = await req.json(); } catch { return json({ error: 'Permintaan tidak valid' }, 400); }
  if (!b.id || b.id === u.id) return json({ error: 'Tidak bisa mengikuti diri sendiri.' }, 400);
  if (!(await loadProfile(b.id))) return json({ error: 'Pengguna tidak ditemukan' }, 404);
  const { error } = await db().from('follows').upsert({ follower_id: u.id, following_id: b.id }, { onConflict: 'follower_id,following_id', ignoreDuplicates: true });
  if (error) return json({ error: 'Gagal mengikuti. Pastikan SQL sosial (supabase/sosial.sql) sudah dijalankan.' }, 500);
  return json({ ok: true });
}

async function handleDELETE(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'ID tidak valid' }, 400);
  await db().from('follows').delete().eq('follower_id', u.id).eq('following_id', id);
  return json({ ok: true });
}

async function safe(fn, req) {
  try { return await fn(req); } catch (e) { return json({ error: `Kesalahan server: ${String(e?.message || e).slice(0, 150)}` }, 500); }
}
export const POST = (req) => safe(handlePOST, req);
export const DELETE = (req) => safe(handleDELETE, req);
