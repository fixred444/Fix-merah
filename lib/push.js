import webpush from 'web-push';
import { db } from '@/lib/server';

let ready = null;
export function pushReady() {
  if (ready !== null) return ready;
  const pub = process.env.VAPID_PUBLIC_KEY; const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) { ready = false; return ready; }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', pub, priv);
  ready = true;
  return ready;
}

// Kirim ke semua perangkat yang berlangganan. Langganan mati (404/410) dibersihkan otomatis.
export async function pushToAll(payload, userIds = null) {
  if (!pushReady()) return { sent: 0, failed: 0, skipped: true };
  let q = db().from('push_subscriptions').select('id,endpoint,p256dh,auth');
  if (userIds) q = q.in('user_id', userIds);
  const { data, error } = await q;
  if (error || !data?.length) return { sent: 0, failed: 0 };
  const body = JSON.stringify(payload);
  const dead = []; let sent = 0; let failed = 0;
  for (let i = 0; i < data.length; i += 25) {
    await Promise.all(data.slice(i, i + 25).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 24 * 3600, urgency: 'high' });
        sent++;
      } catch (e) {
        failed++;
        if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.id);
      }
    }));
  }
  if (dead.length) await db().from('push_subscriptions').delete().in('id', dead);
  return { sent, failed };
}
