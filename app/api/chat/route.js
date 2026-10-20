import { db, getUser, isVerified, json, profileMap } from '@/lib/server';

export const runtime = 'nodejs';
const SQL_HINT = 'Pastikan SQL ulasan & chat (supabase/ulasan-chat.sql) sudah dijalankan di Supabase.';
const KEEP_DAYS = 7;

const shape = (m, u, pm) => ({ id: m.id, userId: m.user_id, author: pm?.get(m.user_id)?.name || m.author, verified: isVerified(pm?.get(m.user_id)) || !!m.is_admin, isAdmin: !!m.is_admin, body: m.body, createdAt: m.created_at, mine: m.user_id === u.id, canDelete: m.user_id === u.id || u.isAdmin });

// ?after=<waktu>: hanya pesan yang lebih baru. Tanpa after: 60 pesan terakhir.
async function handleGET(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const after = new URL(req.url).searchParams.get('after');
  let rows;
  if (after && !Number.isNaN(new Date(after).getTime())) {
    const { data, error } = await db().from('chat_messages').select('*').gt('created_at', after).order('created_at', { ascending: true }).limit(100);
    if (error) return json({ error: `Gagal memuat chat. ${SQL_HINT}` }, 500);
    rows = data || [];
  } else {
    const { data, error } = await db().from('chat_messages').select('*').order('created_at', { ascending: false }).limit(60);
    if (error) return json({ error: `Gagal memuat chat. ${SQL_HINT}` }, 500);
    rows = (data || []).reverse();
  }
  const pm = await profileMap(rows.map((m) => m.user_id));
  return json({ items: rows.map((m) => shape(m, u, pm)) });
}

async function handlePOST(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  if (u.status === 'beku') return json({ error: 'Akunmu sedang dibekukan admin, belum bisa mengirim chat.' }, 403);
  let b; try { b = await req.json(); } catch { return json({ error: 'Permintaan tidak valid' }, 400); }
  const body = String(b.body || '').trim().slice(0, 300);
  if (!body) return json({ error: 'Pesan kosong.' }, 400);
  if (!u.isAdmin) {
    const { count } = await db().from('chat_messages').select('id', { count: 'exact', head: true }).eq('user_id', u.id).gte('created_at', new Date(Date.now() - 10e3).toISOString());
    if ((count || 0) >= 5) return json({ error: 'Terlalu cepat, tunggu beberapa detik.' }, 429);
  }
  const { data, error } = await db().from('chat_messages').insert({ user_id: u.id, author: (u.email.split('@')[0] || 'pengguna').slice(0, 30), is_admin: u.isAdmin, body }).select('*').single();
  if (error) return json({ error: `Gagal mengirim. ${SQL_HINT}` }, 500);
  // bersihkan pesan lama sesekali
  if (Math.random() < 0.05) { try { await db().from('chat_messages').delete().lt('created_at', new Date(Date.now() - KEEP_DAYS * 86400e3).toISOString()); } catch {} }
  return json({ ok: true, item: shape(data, u, await profileMap([u.id])) });
}

async function handleDELETE(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'ID tidak valid' }, 400);
  const { data: m } = await db().from('chat_messages').select('user_id').eq('id', id).maybeSingle();
  if (!m) return json({ ok: true });
  if (m.user_id !== u.id && !u.isAdmin) return json({ error: 'Tidak diizinkan' }, 403);
  await db().from('chat_messages').delete().eq('id', id);
  return json({ ok: true });
}

async function safe(fn, req) {
  try { return await fn(req); } catch (e) { return json({ error: `Kesalahan server: ${String(e?.message || e).slice(0, 150)}` }, 500); }
}
export const GET = (req) => safe(handleGET, req);
export const POST = (req) => safe(handlePOST, req);
export const DELETE = (req) => safe(handleDELETE, req);
