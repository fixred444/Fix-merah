import { db, getUser, isVerified, json, loadProfile, profileMap } from '@/lib/server';
import { pushToAll } from '@/lib/push';

export const runtime = 'nodejs';
const SQL_HINT = 'Pastikan SQL panggilan (supabase/panggilan.sql) sudah dijalankan di Supabase.';
const UUID = /^[0-9a-f-]{36}$/i;
const RING_MS = 45000;      // lama berdering
const STALE_MS = 2 * 3600e3; // panggilan aktif yang nyangkut dianggap sudah selesai

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const iceServers = () => {
  const list = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.TURN_URL) list.push({ urls: process.env.TURN_URL.split(',').map((s) => s.trim()).filter(Boolean), username: process.env.TURN_USERNAME || '', credential: process.env.TURN_CREDENTIAL || '' });
  return list;
};
const okSdp = (d, type) => d && d.type === type && typeof d.sdp === 'string' && d.sdp.length > 20 && d.sdp.length < 30000;

// Catat hasil panggilan sebagai pesan di chat pribadi.
async function logCall(c, text) {
  try { await db().from('dm_messages').insert({ sender_id: c.caller_id, recipient_id: c.callee_id, body: text }); } catch { /* opsional */ }
}

// Akhiri panggilan sekali saja (aman dipanggil berulang).
async function finish(c, status) {
  const { data } = await db().from('calls').update({ status, ended_at: new Date().toISOString(), end_reason: status }).eq('id', c.id).in('status', ['ringing', 'active']).select('id');
  if (!data?.length) return false;
  if (c.status === 'active') {
    const secs = Math.max(0, Math.round((Date.now() - new Date(c.answered_at || c.created_at).getTime()) / 1000));
    await logCall(c, `\u{1F4DE} Panggilan suara \u00B7 ${fmt(secs)}`);
  } else if (status === 'declined') await logCall(c, '\u{1F4DE} Panggilan ditolak');
  else await logCall(c, '\u{1F4DE} Panggilan tidak terjawab');
  return true;
}

const isStale = (c) => c.status === 'ringing' && Date.now() - new Date(c.created_at).getTime() > RING_MS + 3000;

async function handleGET(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const sp = new URL(req.url).searchParams;
  if (sp.get('ice')) return json({ iceServers: iceServers() });

  const id = sp.get('id');
  if (id) {
    if (!UUID.test(id)) return json({ error: 'ID tidak valid' }, 400);
    let { data: c, error } = await db().from('calls').select('*').eq('id', id).maybeSingle();
    if (error) return json({ error: `Gagal memuat panggilan. ${SQL_HINT}` }, 500);
    if (!c || (c.caller_id !== u.id && c.callee_id !== u.id)) return json({ error: 'Panggilan tidak ditemukan' }, 404);
    if (isStale(c)) { await finish(c, 'missed'); c = { ...c, status: 'missed' }; }
    const after = Math.max(0, parseInt(sp.get('after') || '0', 10) || 0);
    const { data: ice } = await db().from('call_ice').select('id,candidate').eq('call_id', id).neq('sender_id', u.id).gt('id', after).order('id', { ascending: true }).limit(200);
    return json({ status: c.status, answer: c.caller_id === u.id ? c.answer || null : null, ice: ice || [] });
  }

  // Panggilan masuk untukku
  const { data: ring, error } = await db().from('calls').select('*').eq('callee_id', u.id).eq('status', 'ringing').order('created_at', { ascending: false }).limit(5);
  if (error) return json({ error: `Gagal memuat panggilan. ${SQL_HINT}` }, 500);
  let fresh = null;
  for (const c of ring || []) { if (isStale(c)) await finish(c, 'missed'); else if (!fresh) fresh = c; }
  if (!fresh) return json({ incoming: null });
  const p = (await profileMap([fresh.caller_id])).get(fresh.caller_id);
  return json({ incoming: { id: fresh.id, from: { id: fresh.caller_id, name: p?.name || 'Pengguna', verified: isVerified(p) }, offer: fresh.offer } });
}

async function handlePOST(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  let b; try { b = await req.json(); } catch { return json({ error: 'Permintaan tidak valid' }, 400); }

  if (b.action === 'start') {
    if (u.status === 'beku') return json({ error: 'Akunmu sedang dibekukan admin, belum bisa menelepon.' }, 403);
    if (!b.to || b.to === u.id || !UUID.test(b.to)) return json({ error: 'Penerima tidak valid.' }, 400);
    if (!okSdp(b.offer, 'offer')) return json({ error: 'Data panggilan tidak valid.' }, 400);
    const peer = await loadProfile(b.to);
    if (!peer) return json({ error: 'Pengguna tidak ditemukan' }, 404);
    const { count } = await db().from('calls').select('id', { count: 'exact', head: true }).eq('caller_id', u.id).gte('created_at', new Date(Date.now() - 60e3).toISOString());
    if ((count || 0) >= 5) return json({ error: 'Terlalu sering menelepon, tunggu sebentar.' }, 429);

    // Bersihkan panggilanku yang nyangkut, lalu cek apakah lawan sedang sibuk.
    const { data: mine, error: e0 } = await db().from('calls').select('*').in('status', ['ringing', 'active']).or(`caller_id.eq.${u.id},callee_id.eq.${u.id}`);
    if (e0) return json({ error: `Gagal memulai panggilan. ${SQL_HINT}` }, 500);
    for (const c of mine || []) await finish(c, c.status === 'ringing' ? (c.caller_id === u.id ? 'canceled' : 'declined') : 'ended');
    const { data: busy } = await db().from('calls').select('status,created_at').in('status', ['ringing', 'active']).or(`caller_id.eq.${b.to},callee_id.eq.${b.to}`);
    const live = (busy || []).filter((c) => Date.now() - new Date(c.created_at).getTime() < (c.status === 'ringing' ? RING_MS : STALE_MS));
    if (live.length) return json({ error: `${peer.name} sedang dalam panggilan lain. Coba lagi nanti.` }, 409);

    const { data, error } = await db().from('calls').insert({ caller_id: u.id, callee_id: b.to, offer: { type: 'offer', sdp: b.offer.sdp } }).select('id').single();
    if (error) return json({ error: `Gagal memulai panggilan. ${SQL_HINT}` }, 500);
    try {
      const me = (await profileMap([u.id])).get(u.id);
      await pushToAll({ title: 'Panggilan masuk', body: `${me?.name || 'Seseorang'} memanggilmu`, tag: `call-${data.id}`, url: `/menu?dm=${u.id}`, ts: Date.now(), ring: true }, [b.to]);
    } catch { /* push opsional */ }
    return json({ ok: true, id: data.id });
  }

  if (!b.id || !UUID.test(b.id)) return json({ error: 'ID tidak valid' }, 400);
  const { data: c } = await db().from('calls').select('*').eq('id', b.id).maybeSingle();
  if (!c || (c.caller_id !== u.id && c.callee_id !== u.id)) return json({ error: 'Panggilan tidak ditemukan' }, 404);

  if (b.action === 'answer') {
    if (c.callee_id !== u.id) return json({ error: 'Bukan panggilan untukmu' }, 403);
    if (c.status !== 'ringing' || isStale(c)) return json({ error: 'Panggilan sudah berakhir.' }, 409);
    if (!okSdp(b.answer, 'answer')) return json({ error: 'Data jawaban tidak valid.' }, 400);
    const { data } = await db().from('calls').update({ status: 'active', answered_at: new Date().toISOString(), answer: { type: 'answer', sdp: b.answer.sdp } }).eq('id', c.id).eq('status', 'ringing').select('id');
    if (!data?.length) return json({ error: 'Panggilan sudah berakhir.' }, 409);
    return json({ ok: true });
  }

  if (b.action === 'decline') {
    if (c.callee_id !== u.id) return json({ error: 'Bukan panggilan untukmu' }, 403);
    await finish(c, 'declined');
    return json({ ok: true });
  }

  if (b.action === 'end') {
    if (c.status === 'ringing') await finish(c, c.caller_id === u.id ? 'canceled' : 'declined');
    else if (c.status === 'active') await finish(c, 'ended');
    return json({ ok: true });
  }

  if (b.action === 'ice') {
    if (!['ringing', 'active'].includes(c.status)) return json({ ok: true });
    const cand = b.candidate;
    if (!cand || typeof cand !== 'object' || typeof cand.candidate !== 'string' || JSON.stringify(cand).length > 2000) return json({ error: 'Kandidat tidak valid' }, 400);
    await db().from('call_ice').insert({ call_id: c.id, sender_id: u.id, candidate: cand });
    return json({ ok: true });
  }

  return json({ error: 'Aksi tidak valid' }, 400);
}

async function safe(fn, req) {
  try { return await fn(req); } catch (e) { return json({ error: `Kesalahan server: ${String(e?.message || e).slice(0, 150)}` }, 500); }
}
export const GET = (req) => safe(handleGET, req);
export const POST = (req) => safe(handlePOST, req);
