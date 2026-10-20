import { db, getUser, isVerified, json, profileMap, startOfTodayWIB } from '@/lib/server';
import { pushToAll } from '@/lib/push';

export const runtime = 'nodejs';
const SQL_HINT = 'Pastikan SQL ulasan & chat (supabase/ulasan-chat.sql) sudah dijalankan di Supabase.';
const MAX_PER_DAY = 3;

async function handleGET(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const { data, error } = await db().from('reviews').select('*').order('created_at', { ascending: false }).limit(60);
  if (error) return json({ error: `Gagal memuat ulasan. ${SQL_HINT}` }, 500);
  const { data: rs } = await db().from('reviews').select('rating').limit(5000);
  const count = rs?.length || 0;
  const avg = count ? rs.reduce((a, r) => a + r.rating, 0) / count : 0;
  const pm = await profileMap((data || []).map((r) => r.user_id));
  const items = (data || []).map((r) => ({
    id: r.id, userId: r.user_id, verified: isVerified(pm.get(r.user_id)), author: pm.get(r.user_id)?.name || r.author, rating: r.rating, body: r.body, reply: r.admin_reply || '', repliedAt: r.replied_at, createdAt: r.created_at,
    mine: r.user_id === u.id, canDelete: r.user_id === u.id || u.isAdmin,
  }));
  return json({ items, avg: Math.round(avg * 10) / 10, count, isAdmin: u.isAdmin });
}

async function handlePOST(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  if (u.status === 'beku') return json({ error: 'Akunmu sedang dibekukan admin, belum bisa menulis ulasan.' }, 403);
  let b; try { b = await req.json(); } catch { return json({ error: 'Permintaan tidak valid' }, 400); }
  const rating = Number(b.rating); const body = String(b.body || '').trim().slice(0, 500);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: 'Pilih bintang 1 sampai 5.' }, 400);
  if (body.length < 3) return json({ error: 'Tulis ulasan minimal 3 huruf.' }, 400);
  const { count } = await db().from('reviews').select('id', { count: 'exact', head: true }).eq('user_id', u.id).gte('created_at', startOfTodayWIB());
  if ((count || 0) >= MAX_PER_DAY) return json({ error: `Maksimal ${MAX_PER_DAY} ulasan per hari.` }, 429);
  const { error } = await db().from('reviews').insert({ user_id: u.id, author: (u.email.split('@')[0] || 'pengguna').slice(0, 30), rating, body });
  if (error) return json({ error: `Gagal menyimpan ulasan. ${SQL_HINT}` }, 500);
  return json({ ok: true });
}

// Admin membalas (atau mengosongkan balasan) sebuah ulasan.
async function handlePUT(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  if (!u.isAdmin) return json({ error: 'Khusus admin' }, 403);
  let b; try { b = await req.json(); } catch { return json({ error: 'Permintaan tidak valid' }, 400); }
  const reply = String(b.reply || '').trim().slice(0, 500);
  const { data: r } = await db().from('reviews').select('id,user_id').eq('id', b.id).maybeSingle();
  if (!r) return json({ error: 'Ulasan tidak ditemukan' }, 404);
  const { error } = await db().from('reviews').update({ admin_reply: reply || null, replied_at: reply ? new Date().toISOString() : null }).eq('id', r.id);
  if (error) return json({ error: 'Gagal menyimpan balasan.' }, 500);
  if (reply && r.user_id !== u.id) {
    try { await pushToAll({ title: 'Admin membalas ulasanmu', body: reply, tag: `rev-${r.id}`, url: '/menu', ts: Date.now() }, [r.user_id]); } catch { /* opsional */ }
  }
  return json({ ok: true });
}

async function handleDELETE(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'ID tidak valid' }, 400);
  const { data: r } = await db().from('reviews').select('user_id').eq('id', id).maybeSingle();
  if (!r) return json({ error: 'Ulasan tidak ditemukan' }, 404);
  if (r.user_id !== u.id && !u.isAdmin) return json({ error: 'Tidak diizinkan' }, 403);
  await db().from('reviews').delete().eq('id', id);
  return json({ ok: true });
}

async function safe(fn, req) {
  try { return await fn(req); } catch (e) { return json({ error: `Kesalahan server: ${String(e?.message || e).slice(0, 150)}` }, 500); }
}
export const GET = (req) => safe(handleGET, req);
export const POST = (req) => safe(handlePOST, req);
export const PUT = (req) => safe(handlePUT, req);
export const DELETE = (req) => safe(handleDELETE, req);
