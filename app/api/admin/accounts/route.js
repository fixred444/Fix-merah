import nodemailer from 'nodemailer';
import { db, getUser, json, decrypt } from '@/lib/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

async function guard(req) {
  const u = await getUser(req);
  if (!u) return [null, json({ error: 'Belum masuk' }, 401)];
  if (!u.isAdmin) return [null, json({ error: 'Khusus admin' }, 403)];
  return [u, null];
}

// Daftar semua akun Gmail pengguna (tanpa App Password), akun bermasalah di urutan teratas.
export async function GET(req) {
  const [, err] = await guard(req); if (err) return err;
  const { data: accs, error } = await db().from('accounts').select('*').order('created_at', { ascending: false });
  if (error) return json({ error: 'Gagal memuat akun Gmail' }, 500);
  const { data: list } = await db().auth.admin.listUsers({ page: 1, perPage: 200 });
  const owners = new Map((list?.users || []).map((x) => [x.id, x.email || '']));
  const items = (accs || []).map((a) => ({
    id: a.id, email: a.email, owner: owners.get(a.user_id) || '(pengguna tidak ditemukan)',
    shared: !!a.shared_enabled, createdAt: a.created_at,
    failedAt: a.login_failed_at || null, error: a.login_error || '',
  })).sort((a, b) => (b.failedAt ? 1 : 0) - (a.failedAt ? 1 : 0) || String(b.createdAt).localeCompare(String(a.createdAt)));
  const columnReady = !accs?.length || Object.prototype.hasOwnProperty.call(accs[0], 'login_failed_at');
  return json({ items, columnReady });
}

// Tes login satu akun (SMTP Gmail) dan tandai hasilnya.
export async function POST(req) {
  const [, err] = await guard(req); if (err) return err;
  let body; try { body = await req.json(); } catch { return json({ error: 'Permintaan tidak valid' }, 400); }
  const { data: a } = await db().from('accounts').select('*').eq('id', body.id).maybeSingle();
  if (!a) return json({ error: 'Akun tidak ditemukan' }, 404);
  try {
    const t = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, auth: { user: a.email, pass: decrypt(a.app_password_enc) } });
    await t.verify();
    await db().from('accounts').update({ login_failed_at: null, login_error: null }).eq('id', a.id);
    return json({ ok: true, valid: true });
  } catch (e) {
    const bad = /Invalid login|Username and Password|EAUTH|AUTH|\b53[45]\b/i.test(`${e?.code || ''} ${e?.responseCode || ''} ${e?.message || ''}`);
    if (!bad) return json({ ok: true, valid: null, note: 'Tidak bisa terhubung ke Gmail, coba lagi nanti.' });
    await db().from('accounts').update({ login_failed_at: new Date().toISOString(), login_error: String(e.message || 'login ditolak').slice(0, 200) }).eq('id', a.id);
    return json({ ok: true, valid: false });
  }
}

export async function DELETE(req) {
  const [, err] = await guard(req); if (err) return err;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'ID tidak valid' }, 400);
  const { error } = await db().from('accounts').delete().eq('id', id);
  if (error) return json({ error: 'Gagal menghapus akun' }, 400);
  return json({ ok: true });
}
