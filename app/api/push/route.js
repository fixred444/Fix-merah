import { db, getUser, json } from '@/lib/server';
import { pushReady } from '@/lib/push';

export const runtime = 'nodejs';

// GET: kunci publik VAPID (null bila server belum diatur).
export async function GET(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  return json({ publicKey: pushReady() ? process.env.VAPID_PUBLIC_KEY : null });
}

// POST: simpan langganan perangkat ini.
export async function POST(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  let b; try { b = await req.json(); } catch { return json({ error: 'Permintaan tidak valid' }, 400); }
  const s = b.subscription;
  if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth || !String(s.endpoint).startsWith('https://')) return json({ error: 'Langganan tidak valid' }, 400);
  const { error } = await db().from('push_subscriptions').upsert({
    user_id: u.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth,
    user_agent: String(req.headers.get('user-agent') || '').slice(0, 200),
  }, { onConflict: 'endpoint' });
  if (error) return json({ error: 'Gagal menyimpan. Pastikan SQL push (supabase/push.sql) sudah dijalankan.' }, 500);
  return json({ ok: true });
}

// DELETE: hapus langganan perangkat ini.
export async function DELETE(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  let b = {}; try { b = await req.json(); } catch {}
  if (b.endpoint) await db().from('push_subscriptions').delete().eq('endpoint', b.endpoint).eq('user_id', u.id);
  return json({ ok: true });
}
