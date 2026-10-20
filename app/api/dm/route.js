import { db, getUser, isVerified, json, loadProfile, profileMap } from '@/lib/server';
import { pushToAll } from '@/lib/push';

export const runtime = 'nodejs';
const SQL_HINT = 'Pastikan SQL sosial (supabase/sosial.sql) sudah dijalankan di Supabase.';
const UUID = /^[0-9a-f-]{36}$/i;

const msg = (m, me) => ({ id: m.id, body: m.body, createdAt: m.created_at, mine: m.sender_id === me });

async function handleGET(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const sp = new URL(req.url).searchParams;

  if (sp.get('unread')) {
    const { count } = await db().from('dm_messages').select('id', { count: 'exact', head: true }).eq('recipient_id', u.id).is('read_at', null);
    return json({ unread: count || 0 });
  }

  const peerId = sp.get('with');
  if (peerId) {
    if (!UUID.test(peerId)) return json({ error: 'ID tidak valid' }, 400);
    const peer = await loadProfile(peerId);
    if (!peer) return json({ error: 'Pengguna tidak ditemukan' }, 404);
    const pair = `and(sender_id.eq.${u.id},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${u.id})`;
    const after = sp.get('after');
    let rows;
    if (after && !Number.isNaN(new Date(after).getTime())) {
      const { data, error } = await db().from('dm_messages').select('*').or(pair).gt('created_at', after).order('created_at', { ascending: true }).limit(100);
      if (error) return json({ error: `Gagal memuat pesan. ${SQL_HINT}` }, 500);
      rows = data || [];
    } else {
      const { data, error } = await db().from('dm_messages').select('*').or(pair).order('created_at', { ascending: false }).limit(60);
      if (error) return json({ error: `Gagal memuat pesan. ${SQL_HINT}` }, 500);
      rows = (data || []).reverse();
    }
    if (rows.some((m) => m.recipient_id === u.id && !m.read_at)) {
      await db().from('dm_messages').update({ read_at: new Date().toISOString() }).eq('recipient_id', u.id).eq('sender_id', peerId).is('read_at', null);
    }
    return json({ peer: { id: peerId, name: peer.name, verified: isVerified(peer) }, items: rows.map((m) => msg(m, u.id)) });
  }

  // Kotak masuk: percakapan terbaru per orang
  const { data, error } = await db().from('dm_messages').select('id,sender_id,recipient_id,body,created_at,read_at')
    .or(`sender_id.eq.${u.id},recipient_id.eq.${u.id}`).order('created_at', { ascending: false }).limit(300);
  if (error) return json({ error: `Gagal memuat pesan. ${SQL_HINT}` }, 500);
  const convo = new Map();
  for (const m of data || []) {
    const other = m.sender_id === u.id ? m.recipient_id : m.sender_id;
    if (!convo.has(other)) convo.set(other, { userId: other, last: m.body, lastAt: m.created_at, mine: m.sender_id === u.id, unread: 0 });
    if (m.recipient_id === u.id && !m.read_at) convo.get(other).unread += 1;
  }
  const pm = await profileMap([...convo.keys()]);
  const items = [...convo.values()].map((c) => ({ ...c, name: pm.get(c.userId)?.name || 'Pengguna', verified: isVerified(pm.get(c.userId)) }));
  return json({ items });
}

async function handlePOST(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  if (u.status === 'beku') return json({ error: 'Akunmu sedang dibekukan admin, belum bisa mengirim pesan.' }, 403);
  let b; try { b = await req.json(); } catch { return json({ error: 'Permintaan tidak valid' }, 400); }
  const body = String(b.body || '').trim().slice(0, 500);
  if (!body) return json({ error: 'Pesan kosong.' }, 400);
  if (!b.to || b.to === u.id) return json({ error: 'Penerima tidak valid.' }, 400);
  const peer = await loadProfile(b.to);
  if (!peer) return json({ error: 'Pengguna tidak ditemukan' }, 404);
  if (!u.isAdmin) {
    const { count } = await db().from('dm_messages').select('id', { count: 'exact', head: true }).eq('sender_id', u.id).gte('created_at', new Date(Date.now() - 10e3).toISOString());
    if ((count || 0) >= 8) return json({ error: 'Terlalu cepat, tunggu beberapa detik.' }, 429);
  }
  const { data, error } = await db().from('dm_messages').insert({ sender_id: u.id, recipient_id: b.to, body }).select('*').single();
  if (error) return json({ error: `Gagal mengirim. ${SQL_HINT}` }, 500);
  try {
    const me = (await profileMap([u.id])).get(u.id);
    await pushToAll({ title: me?.name || 'Pesan baru', body: body.slice(0, 120), tag: `dm-${u.id}`, url: `/menu?dm=${u.id}`, ts: Date.now() }, [b.to]);
  } catch { /* push opsional */ }
  return json({ ok: true, item: msg(data, u.id) });
}

async function handleDELETE(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'ID tidak valid' }, 400);
  await db().from('dm_messages').delete().eq('id', id).eq('sender_id', u.id);
  return json({ ok: true });
}

async function safe(fn, req) {
  try { return await fn(req); } catch (e) { return json({ error: `Kesalahan server: ${String(e?.message || e).slice(0, 150)}` }, 500); }
}
export const GET = (req) => safe(handleGET, req);
export const POST = (req) => safe(handlePOST, req);
export const DELETE = (req) => safe(handleDELETE, req);
