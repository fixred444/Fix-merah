import { db, getUser, json, startOfTodayWIB } from '@/lib/server';

const STATUSES = ['aktif', 'beku', 'nonaktif'];
const adminEmails = () => (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);

async function guard(req) {
  const u = await getUser(req);
  if (!u) return [null, json({ error: 'Belum masuk' }, 401)];
  if (!u.isAdmin) return [null, json({ error: 'Khusus admin' }, 403)];
  return [u, null];
}

export async function GET(req) {
  const [, err] = await guard(req); if (err) return err;
  const { data: list, error } = await db().auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) return json({ error: 'Gagal memuat daftar pengguna' }, 500);
  const [st, acc, logs] = await Promise.all([
    db().from('user_status').select('user_id,status,note'),
    db().from('accounts').select('user_id,shared_enabled'),
    db().from('send_log').select('user_id,status,target_email,created_at').order('created_at', { ascending: false }).limit(5000),
  ]);
  const since = startOfTodayWIB();
  const stMap = new Map((st.data || []).map((r) => [r.user_id, r]));
  const agg = new Map();
  for (const l of logs.data || []) {
    if (l.status !== 'terkirim') continue;
    const a = agg.get(l.user_id) || { sent: 0, today: 0, lastSent: l.created_at, lastTarget: l.target_email };
    a.sent += 1;
    if (l.created_at >= since) a.today += 1;
    agg.set(l.user_id, a);
  }
  const accAgg = new Map();
  for (const a of acc.data || []) {
    const x = accAgg.get(a.user_id) || { accounts: 0, shared: 0 };
    x.accounts += 1; if (a.shared_enabled) x.shared += 1;
    accAgg.set(a.user_id, x);
  }
  const admins = adminEmails();
  const items = (list?.users || []).map((u) => {
    const email = (u.email || '').toLowerCase();
    const s = stMap.get(u.id);
    return {
      id: u.id, email, createdAt: u.created_at, lastSignIn: u.last_sign_in_at || null,
      isAdmin: admins.includes(email), status: s?.status || 'aktif', note: s?.note || '',
      accounts: accAgg.get(u.id)?.accounts || 0, shared: accAgg.get(u.id)?.shared || 0,
      sent: agg.get(u.id)?.sent || 0, today: agg.get(u.id)?.today || 0,
      lastSent: agg.get(u.id)?.lastSent || null, lastTarget: agg.get(u.id)?.lastTarget || null,
    };
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return json({ items, statusReady: !st.error });
}

export async function PATCH(req) {
  const [me, err] = await guard(req); if (err) return err;
  let body; try { body = await req.json(); } catch { return json({ error: 'Permintaan tidak valid' }, 400); }
  const { id, status, note } = body;
  if (!id || !STATUSES.includes(status)) return json({ error: 'Data tidak valid' }, 400);
  if (id === me.id) return json({ error: 'Tidak bisa mengubah status akunmu sendiri' }, 400);
  const { data: target } = await db().auth.admin.getUserById(id);
  if (!target?.user) return json({ error: 'Pengguna tidak ditemukan' }, 404);
  if (adminEmails().includes((target.user.email || '').toLowerCase())) return json({ error: 'Akun admin tidak bisa dibekukan atau dinonaktifkan' }, 400);
  const { error } = await db().from('user_status').upsert({
    user_id: id, status, note: String(note || '').slice(0, 200) || null, updated_at: new Date().toISOString(),
  });
  if (error) return json({ error: 'Gagal menyimpan. Pastikan SQL tabel user_status sudah dijalankan di Supabase.' }, 400);
  return json({ ok: true });
}
