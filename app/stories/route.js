import crypto from 'crypto';
import { db, getUser, json } from '@/lib/server';

export const runtime = 'nodejs';

const BUCKET = 'stories';
const IMG = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const VID = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
const AUD = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'webm' };
const MB = 1048576;
const MAX_ACTIVE = 10;
const SQL_HINT = 'Pastikan SQL story sudah dijalankan di Supabase.';

async function cleanupExpired() {
  try {
    const { data } = await db().from('stories').select('id,media_path,music_path').lte('expires_at', new Date().toISOString()).limit(50);
    if (!data?.length) return;
    const paths = data.flatMap((s) => [s.media_path, s.music_path].filter(Boolean));
    if (paths.length) await db().storage.from(BUCKET).remove(paths);
    await db().from('stories').delete().in('id', data.map((s) => s.id));
  } catch { /* pembersihan bersifat opsional */ }
}

async function fileExists(path) {
  const [dir, name] = String(path).split('/');
  if (!dir || !name) return false;
  const { data } = await db().storage.from(BUCKET).list(dir, { search: name, limit: 5 });
  return (data || []).some((f) => f.name === name);
}

const okPath = (p, uid) => typeof p === 'string' && p.startsWith(`${uid}/`) && !p.includes('..') && p.split('/').length === 2;

export async function GET(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const { data, error } = await db().from('stories').select('*').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: true });
  if (error) return json({ error: `Gagal memuat story. ${SQL_HINT}` }, 500);
  const items = (data || []).map((s) => ({
    id: s.id, userId: s.user_id, author: s.author, mediaUrl: s.media_url, mediaType: s.media_type,
    musicUrl: s.music_url || '', musicTitle: s.music_title || '', caption: s.caption || '', createdAt: s.created_at,
    mine: s.user_id === u.id, canDelete: s.user_id === u.id || u.isAdmin,
  }));
  return json({ items });
}

export async function POST(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  if (u.status === 'beku') return json({ error: 'Akunmu sedang dibekukan admin, belum bisa memposting story.' }, 403);
  let body; try { body = await req.json(); } catch { return json({ error: 'Permintaan tidak valid' }, 400); }

  if (body.step === 'sign') {
    const m = body.media || {};
    const isImg = !!IMG[m.type];
    const mExt = IMG[m.type] || VID[m.type];
    if (!mExt) return json({ error: 'Format foto/video tidak didukung (pakai JPG, PNG, WebP, GIF, MP4, WebM).' }, 400);
    if (!(m.size > 0) || m.size > (isImg ? 6 : 25) * MB) return json({ error: isImg ? 'Foto maksimal 6 MB.' : 'Video maksimal 25 MB.' }, 400);
    let aExt = null;
    if (body.music) {
      aExt = AUD[body.music.type];
      if (!aExt) return json({ error: 'Format musik tidak didukung (pakai MP3, M4A, AAC, OGG, WAV).' }, 400);
      if (!(body.music.size > 0) || body.music.size > 10 * MB) return json({ error: 'Musik maksimal 10 MB.' }, 400);
    }
    await cleanupExpired();
    const { count } = await db().from('stories').select('id', { count: 'exact', head: true }).eq('user_id', u.id).gt('expires_at', new Date().toISOString());
    if ((count || 0) >= MAX_ACTIVE) return json({ error: `Maksimal ${MAX_ACTIVE} story aktif. Hapus yang lama atau tunggu 24 jam.` }, 429);

    const base = `${u.id}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const mediaPath = `${base}.${mExt}`;
    const { data: ms, error: e1 } = await db().storage.from(BUCKET).createSignedUploadUrl(mediaPath);
    if (e1 || !ms) return json({ error: `Gagal menyiapkan unggahan. ${SQL_HINT}` }, 500);
    const out = { media: { path: mediaPath, token: ms.token }, music: null };
    if (aExt) {
      const musicPath = `${base}-m.${aExt}`;
      const { data: as, error: e2 } = await db().storage.from(BUCKET).createSignedUploadUrl(musicPath);
      if (e2 || !as) return json({ error: 'Gagal menyiapkan unggahan musik.' }, 500);
      out.music = { path: musicPath, token: as.token };
    }
    return json(out);
  }

  if (body.step === 'create') {
    if (!okPath(body.mediaPath, u.id)) return json({ error: 'Berkas media tidak valid' }, 400);
    if (!['image', 'video'].includes(body.mediaType)) return json({ error: 'Jenis media tidak valid' }, 400);
    if (body.musicPath && !okPath(body.musicPath, u.id)) return json({ error: 'Berkas musik tidak valid' }, 400);
    if (!(await fileExists(body.mediaPath))) return json({ error: 'Media belum terunggah. Coba lagi.' }, 400);
    if (body.musicPath && !(await fileExists(body.musicPath))) return json({ error: 'Musik belum terunggah. Coba lagi.' }, 400);
    const pub = (p) => db().storage.from(BUCKET).getPublicUrl(p).data.publicUrl;
    const row = {
      user_id: u.id, author: (u.email.split('@')[0] || 'pengguna').slice(0, 30),
      media_path: body.mediaPath, media_url: pub(body.mediaPath), media_type: body.mediaType,
      music_path: body.musicPath || null, music_url: body.musicPath ? pub(body.musicPath) : null,
      music_title: body.musicPath ? String(body.musicTitle || '').trim().slice(0, 60) : null,
      caption: String(body.caption || '').trim().slice(0, 200) || null,
    };
    const { data, error } = await db().from('stories').insert(row).select('id').single();
    if (error) return json({ error: `Gagal menyimpan story. ${SQL_HINT}` }, 500);
    return json({ ok: true, id: data.id });
  }

  return json({ error: 'Permintaan tidak valid' }, 400);
}

export async function DELETE(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'ID tidak valid' }, 400);
  const { data: s } = await db().from('stories').select('*').eq('id', id).maybeSingle();
  if (!s) return json({ error: 'Story tidak ditemukan' }, 404);
  if (s.user_id !== u.id && !u.isAdmin) return json({ error: 'Bukan story milikmu' }, 403);
  const paths = [s.media_path, s.music_path].filter(Boolean);
  if (paths.length) await db().storage.from(BUCKET).remove(paths);
  await db().from('stories').delete().eq('id', id);
  return json({ ok: true });
    }
