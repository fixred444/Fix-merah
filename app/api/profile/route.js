import { db, ensureProfile, getUser, isVerified, json, loadProfile, profileMap } from '@/lib/server';

export const runtime = 'nodejs';
const SQL_HINT = 'Pastikan SQL sosial (supabase/sosial.sql) sudah dijalankan di Supabase.';

const card = (p, following) => ({ id: p.user_id, name: p.name, bio: p.bio || '', verified: isVerified(p), isFollowing: following.has(p.user_id) });

async function followingSet(me, ids) {
  if (!ids.length) return new Set();
  const { data } = await db().from('follows').select('following_id').eq('follower_id', me).in('following_id', ids);
  return new Set((data || []).map((r) => r.following_id));
}

async function handleGET(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  await ensureProfile(u.id, u.email, u.isAdmin);
  const sp = new URL(req.url).searchParams;

  // Pencarian / daftar orang
  if (sp.has('q')) {
    const q = String(sp.get('q') || '').trim().slice(0, 30);
    let qy = db().from('profiles').select('*').neq('user_id', u.id).order('is_admin', { ascending: false }).order('created_at', { ascending: false }).limit(30);
    if (q) qy = qy.ilike('name', `%${q.replace(/[\\%_]/g, '\\$&')}%`);
    const { data, error } = await qy;
    if (error) return json({ error: `Gagal memuat. ${SQL_HINT}` }, 500);
    const fs = await followingSet(u.id, (data || []).map((p) => p.user_id));
    return json({ items: (data || []).map((p) => card(p, fs)) });
  }

  const id = sp.get('id') === 'me' || !sp.get('id') ? u.id : sp.get('id');
  const p = await loadProfile(id);
  if (!p) return json({ error: 'Profil tidak ditemukan' }, 404);

  // Daftar pengikut / yang diikuti
  const list = sp.get('list');
  if (list === 'followers' || list === 'following') {
    const col = list === 'followers' ? 'following_id' : 'follower_id';
    const other = list === 'followers' ? 'follower_id' : 'following_id';
    const { data } = await db().from('follows').select(other).eq(col, id).order('created_at', { ascending: false }).limit(100);
    const ids = (data || []).map((r) => r[other]);
    const pm = await profileMap(ids);
    const fs = await followingSet(u.id, ids);
    return json({ items: ids.filter((x) => pm.has(x)).map((x) => ({ ...card(pm.get(x), fs), bio: '', isMe: x === u.id })) });
  }

  const [{ count: followers }, { count: following }, fs] = await Promise.all([
    db().from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', id),
    db().from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', id),
    followingSet(u.id, [id]),
  ]);
  const mine = id === u.id;
  return json({
    profile: {
      ...card(p, fs), isMe: mine, followers: followers || 0, following: following || 0,
      ...((mine || u.isAdmin) ? { verifyStatus: p.verify_status, verifyNote: p.verify_note || '' } : {}),
      ...(mine ? { hideSeen: !!p.hide_seen } : {}),
    },
  });
}

async function handlePUT(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  let b; try { b = await req.json(); } catch { return json({ error: 'Permintaan tidak valid' }, 400); }
  const name = String(b.name || '').trim().replace(/\s+/g, ' ');
  const bio = String(b.bio || '').trim().slice(0, 160);
  if (name.length < 2 || name.length > 30) return json({ error: 'Nama 2 sampai 30 huruf.' }, 400);
  await ensureProfile(u.id, u.email, u.isAdmin);
  const upd = { name, bio };
  if (typeof b.hideSeen === 'boolean') upd.hide_seen = b.hideSeen;
  const { error } = await db().from('profiles').update(upd).eq('user_id', u.id);
  if (error) return json({ error: `Gagal menyimpan. ${SQL_HINT}` }, 500);
  return json({ ok: true });
}

async function safe(fn, req) {
  try { return await fn(req); } catch (e) { return json({ error: `Kesalahan server: ${String(e?.message || e).slice(0, 150)}` }, 500); }
}
export const GET = (req) => safe(handleGET, req);
export const PUT = (req) => safe(handlePUT, req);
