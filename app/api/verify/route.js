import { db, ensureProfile, getUser, json, loadProfile } from '@/lib/server';
import { pushToAll } from '@/lib/push';

export const runtime = 'nodejs';
const SQL_HINT = 'Pastikan SQL sosial (supabase/sosial.sql) sudah dijalankan di Supabase.';

// Admin: daftar permintaan (menunggu) dan akun yang sudah bercentang.
async function handleGET(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  if (!u.isAdmin) return json({ error: 'Khusus admin' }, 403);
  const { data, error } = await db().from('profiles').select('user_id,name,bio,verify_status,verify_note,verify_requested_at').in('verify_status', ['pending', 'approved']).eq('is_admin', false).order('verify_requested_at', { ascending: false, nullsFirst: false }).limit(100);
  if (error) return json({ error: `Gagal memuat. ${SQL_HINT}` }, 500);
  const map = (p) => ({ id: p.user_id, name: p.name, bio: p.bio || '', note: p.verify_note || '', requestedAt: p.verify_requested_at });
  return json({ pending: (data || []).filter((p) => p.verify_status === 'pending').map(map), approved: (data || []).filter((p) => p.verify_status === 'approved').map(map) });
}

// Pengguna: ajukan centang biru.
async function handlePOST(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  if (u.isAdmin) return json({ error: 'Akun admin sudah otomatis bercentang biru.' }, 400);
  if (u.status !== 'aktif') return json({ error: 'Akunmu sedang dibatasi admin.' }, 403);
  let b = {}; try { b = await req.json(); } catch {}
  const note = String(b.note || '').trim().slice(0, 200);
  const p = await ensureProfile(u.id, u.email, false);
  if (!p) return json({ error: `Gagal memuat profil. ${SQL_HINT}` }, 500);
  if (p.verify_status === 'approved') return json({ error: 'Akunmu sudah bercentang biru.' }, 400);
  if (p.verify_status === 'pending') return json({ error: 'Permintaanmu sedang menunggu persetujuan admin.' }, 400);
  const { error } = await db().from('profiles').update({ verify_status: 'pending', verify_note: note || null, verify_requested_at: new Date().toISOString() }).eq('user_id', u.id);
  if (error) return json({ error: 'Gagal mengajukan.' }, 500);
  try {
    const { data: admins } = await db().from('profiles').select('user_id').eq('is_admin', true);
    if (admins?.length) await pushToAll({ title: 'Permintaan centang biru', body: `${p.name} meminta centang biru`, tag: 'verify-req', url: '/admin', ts: Date.now() }, admins.map((a) => a.user_id));
  } catch { /* opsional */ }
  return json({ ok: true });
}

// Admin: setujui / tolak / cabut.
async function handlePUT(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  if (!u.isAdmin) return json({ error: 'Khusus admin' }, 403);
  let b; try { b = await req.json(); } catch { return json({ error: 'Permintaan tidak valid' }, 400); }
  const p = await loadProfile(b.userId);
  if (!p) return json({ error: 'Pengguna tidak ditemukan' }, 404);
  const upd = { approve: { verify_status: 'approved', verify_note: null }, reject: { verify_status: 'rejected', verify_note: String(b.note || '').trim().slice(0, 200) || null }, revoke: { verify_status: 'none', verify_note: null } }[b.action];
  if (!upd) return json({ error: 'Aksi tidak valid' }, 400);
  const { error } = await db().from('profiles').update(upd).eq('user_id', p.user_id);
  if (error) return json({ error: 'Gagal menyimpan.' }, 500);
  const text = { approve: 'Selamat, akunmu kini bercentang biru.', reject: `Permintaan centang biru belum disetujui${upd.verify_note ? `: ${upd.verify_note}` : '.'}`, revoke: null }[b.action];
  if (text) { try { await pushToAll({ title: 'Centang biru', body: text, tag: `verify-${p.user_id}`, url: '/menu', ts: Date.now() }, [p.user_id]); } catch {} }
  return json({ ok: true });
}

async function safe(fn, req) {
  try { return await fn(req); } catch (e) { return json({ error: `Kesalahan server: ${String(e?.message || e).slice(0, 150)}` }, 500); }
}
export const GET = (req) => safe(handleGET, req);
export const POST = (req) => safe(handlePOST, req);
export const PUT = (req) => safe(handlePUT, req);
