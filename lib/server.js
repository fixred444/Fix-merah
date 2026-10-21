import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

let _db;
export function db() {
  if (!_db) {
    _db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return _db;
}

export function json(data, status = 200) {
  return Response.json(data, { status });
}

export function isAdminEmail(email) {
  const admins = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  return admins.includes(String(email || '').toLowerCase());
}

const defaultName = (email) => (String(email || '').split('@')[0] || 'pengguna').slice(0, 30);

// Pastikan profil ada & status admin sinkron dengan ADMIN_EMAILS. Tidak pernah melempar error.
export async function ensureProfile(id, email, isAdmin) {
  try {
    const { data: p } = await db().from('profiles').select('*').eq('user_id', id).maybeSingle();
    if (p) {
      if (p.is_admin !== !!isAdmin) { await db().from('profiles').update({ is_admin: !!isAdmin }).eq('user_id', id); p.is_admin = !!isAdmin; }
      return p;
    }
    const row = { user_id: id, name: defaultName(email), is_admin: !!isAdmin };
    const { data } = await db().from('profiles').upsert(row, { onConflict: 'user_id', ignoreDuplicates: true }).select('*').maybeSingle();
    return data || { ...row, bio: '', verify_status: 'none' };
  } catch { return null; }
}

// Ambil profil siapa pun; dibuat otomatis kalau pengguna itu belum pernah membuka aplikasi sejak fitur profil ada.
export async function loadProfile(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return null;
  const { data: p } = await db().from('profiles').select('*').eq('user_id', id).maybeSingle();
  if (p) return p;
  const { data } = await db().auth.admin.getUserById(id);
  if (!data?.user) return null;
  return ensureProfile(id, data.user.email, isAdminEmail(data.user.email));
}

export const isVerified = (p) => !!p && (!!p.is_admin || p.verify_status === 'approved');

// Map id -> profil untuk banyak pengguna sekaligus (nama + centang).
export async function profileMap(ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) return new Map();
  try {
    const { data } = await db().from('profiles').select('user_id,name,is_admin,verify_status').in('user_id', list);
    return new Map((data || []).map((p) => [p.user_id, p]));
  } catch { return new Map(); }
}

// Catat "terakhir dilihat" (dibatasi sekali per 45 detik per instance supaya hemat).
const seenAt = new Map();
async function touchSeen(id) {
  const now = Date.now();
  if (now - (seenAt.get(id) || 0) < 45e3) return;
  seenAt.set(id, now);
  if (seenAt.size > 5000) seenAt.clear();
  try { await db().from('profiles').update({ last_seen_at: new Date(now).toISOString() }).eq('user_id', id); } catch { /* opsional */ }
}

export async function getUser(req, includeBlocked = false) {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const { data, error } = await db().auth.getUser(token);
  if (error || !data?.user) return null;
  const email = (data.user.email || '').toLowerCase();
  const isAdmin = isAdminEmail(email);
  let status = 'aktif'; let note = '';
  if (!isAdmin) {
    const { data: st } = await db().from('user_status').select('status,note').eq('user_id', data.user.id).maybeSingle();
    if (st?.status) { status = st.status; note = st.note || ''; }
  }
  if (status === 'nonaktif' && !includeBlocked) return null;
  await touchSeen(data.user.id);
  return { id: data.user.id, email, isAdmin, status, note };
}

// AES-256-GCM untuk app password
function key() {
  const k = process.env.ENCRYPT_KEY || '';
  if (k.length !== 64) throw new Error('ENCRYPT_KEY harus 64 karakter hex');
  return Buffer.from(k, 'hex');
}
export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
export function decrypt(payload) {
  const [iv, tag, enc] = payload.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

export function startOfTodayWIB() {
  const wib = new Date(Date.now() + 7 * 3600e3);
  wib.setUTCHours(0, 0, 0, 0);
  return new Date(wib.getTime() - 7 * 3600e3).toISOString();
}

// CRUD generik untuk halaman admin
export function adminCrud(table, fields) {
  const pick = (b) => Object.fromEntries(fields.map((f) => [f, b[f]]).filter(([, v]) => v !== undefined));
  const guard = async (req) => {
    const u = await getUser(req);
    if (!u) return [null, json({ error: 'Belum masuk' }, 401)];
    if (!u.isAdmin) return [null, json({ error: 'Khusus admin' }, 403)];
    return [u, null];
  };
  return {
    GET: async (req) => {
      const [, err] = await guard(req); if (err) return err;
      const { data } = await db().from(table).select('*').order('created_at', { ascending: false });
      return json({ items: data || [] });
    },
    POST: async (req) => {
      const [, err] = await guard(req); if (err) return err;
      const { error } = await db().from(table).insert(pick(await req.json()));
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    },
    PUT: async (req) => {
      const [, err] = await guard(req); if (err) return err;
      const b = await req.json();
      const { error } = await db().from(table).update(pick(b)).eq('id', b.id);
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    },
    DELETE: async (req) => {
      const [, err] = await guard(req); if (err) return err;
      const id = new URL(req.url).searchParams.get('id');
      const { error } = await db().from(table).delete().eq('id', id);
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    },
  };
}
