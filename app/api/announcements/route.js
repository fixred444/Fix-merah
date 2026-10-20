import crypto from 'crypto';
import { db, getUser, json } from '@/lib/server';

export const runtime = 'nodejs';

const BUCKET = 'stories'; // memakai tempat penyimpanan yang sama dengan story (folder notif/)
const AUD = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'webm' };
const MB = 1048576;
const SQL_HINT = 'Pastikan SQL notifikasi sudah dijalankan di Supabase.';
const baseType = (t) => String(t || '').split(';')[0].trim().toLowerCase();

async function fileExists(path) {
  const [dir, name] = String(path).split('/');
  if (!dir || !name) return false;
  const { data } = await db().storage.from(BUCKET).list(dir, { search: name, limit: 5 });
  return (data || []).some((f) => f.name === name);
}

// Pengguna: pengumuman 24 jam terakhir. Admin (?all=1): 30 terbaru untuk dikelola.
async function handleGET(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const all = new URL(req.url).searchParams.get('all') === '1';
  if (all && !u.isAdmin) return json({ error: 'Khusus admin' }, 403);
  let q = db().from('announcements').select('*').order('created_at', { ascending: false }).limit(all ? 30 : 5);
  if (!all) q = q.gt('created_at', new Date(Date.now() - 24 * 3600e3).toISOString());
  const { data, error } = await q;
  if (error) return json({ error: `Gagal memuat notifikasi. ${SQL_HINT}` }, 500);
  const items = (data || []).map((a) => ({ id: a.id, kind: a.kind, text: a.body || '', audioUrl: a.audio_url || '', createdAt: a.created_at }));
  return json({ items });
}

async function handlePOST(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  if (!u.isAdmin) return json({ error: 'Khusus admin' }, 403);
  let body; try { body = await req.json(); } catch { return json({ error: 'Permintaan tidak valid' }, 400); }

  if (body.step === 'sign') {
    const type = baseType(body.audio?.type);
    const ext = AUD[type];
    if (!ext) return json({ error: 'Format audio tidak didukung (pakai MP3, M4A, AAC, OGG, WAV, WebM).' }, 400);
    if (!(body.audio.size > 0) || body.audio.size > 5 * MB) return json({ error: 'VN maksimal 5 MB.' }, 400);
    const path = `notif/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return json({ error: 'Gagal menyiapkan unggahan VN. Pastikan SQL story (tempat penyimpanan) sudah dijalankan.' }, 500);
    return json({ path, token: data.token });
  }

  if (body.step === 'create') {
    const text = String(body.text || '').trim().slice(0, 200);
    const audioPath = body.audioPath || null;
    if (!text && !audioPath) return json({ error: 'Isi teks atau lampirkan VN.' }, 400);
    if (audioPath) {
      if (typeof audioPath !== 'string' || !audioPath.startsWith('notif/') || audioPath.includes('..') || audioPath.split('/').length !== 2) return json({ error: 'Berkas VN tidak valid' }, 400);
      if (!(await fileExists(audioPath))) return json({ error: 'VN belum terunggah. Coba lagi.' }, 400);
    }
    const audioUrl = audioPath ? db().storage.from(BUCKET).getPublicUrl(audioPath).data.publicUrl : null;
    const { data, error } = await db().from('announcements').insert({ kind: audioPath ? 'voice' : 'text', body: text || null, audio_path: audioPath, audio_url: audioUrl, created_by: u.id }).select('id').single();
    if (error) return json({ error: `Gagal menyimpan notifikasi. ${SQL_HINT}` }, 500);
    return json({ ok: true, id: data.id });
  }

  return json({ error: 'Permintaan tidak valid' }, 400);
}

async function handleDELETE(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  if (!u.isAdmin) return json({ error: 'Khusus admin' }, 403);
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'ID tidak valid' }, 400);
  const { data: a } = await db().from('announcements').select('*').eq('id', id).maybeSingle();
  if (!a) return json({ error: 'Notifikasi tidak ditemukan' }, 404);
  if (a.audio_path) await db().storage.from(BUCKET).remove([a.audio_path]);
  await db().from('announcements').delete().eq('id', id);
  return json({ ok: true });
}

async function safe(fn, req) {
  try {
    return await fn(req);
  } catch (e) {
    return json({ error: `Kesalahan server: ${String(e?.message || e).slice(0, 150)}` }, 500);
  }
}
export const GET = (req) => safe(handleGET, req);
export const POST = (req) => safe(handlePOST, req);
export const DELETE = (req) => safe(handleDELETE, req);
