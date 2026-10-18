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

export async function getUser(req, includeBlocked = false) {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const { data, error } = await db().auth.getUser(token);
  if (error || !data?.user) return null;
  const email = (data.user.email || '').toLowerCase();
  const admins = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  const isAdmin = admins.includes(email);
  let status = 'aktif'; let note = '';
  if (!isAdmin) {
    const { data: st } = await db().from('user_status').select('status,note').eq('user_id', data.user.id).maybeSingle();
    if (st?.status) { status = st.status; note = st.note || ''; }
  }
  if (status === 'nonaktif' && !includeBlocked) return null;
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
