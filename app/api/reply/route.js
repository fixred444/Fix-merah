import { ImapFlow } from 'imapflow';
import { db, getUser, json, decrypt } from '@/lib/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const DAY = 24 * 3600e3;

// Cek apakah ada email balasan dari WhatsApp di Gmail pengirim setelah email permohonan dikirim.
// Pencocokan dilakukan di sisi Gmail (pencarian); isi email tidak diunduh maupun dikirim ke browser.
export async function GET(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'ID tidak valid' }, 400);

  const { data: row } = await db().from('send_log').select('*').eq('id', id).eq('user_id', u.id).maybeSingle();
  if (!row) return json({ error: 'Data pengiriman tidak ditemukan' }, 404);
  if (row.replied_at) return json({ replied: true, repliedAt: row.replied_at, phone: row.phone });
  if (row.status !== 'terkirim') return json({ replied: false });
  const sentAt = new Date(row.created_at);
  if (Date.now() - sentAt.getTime() > DAY) return json({ replied: false, expired: true });

  const { data: accs } = await db().from('accounts').select('email,app_password_enc').eq('email', row.account_email).limit(1);
  const acc = accs?.[0];
  if (!acc) return json({ replied: false, error: 'Akun pengirim sudah tidak ada' });

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: acc.email, pass: decrypt(acc.app_password_enc) },
    logger: false,
  });
  client.on('error', () => {});

  let found = null;
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      // Hanya email dari WhatsApp yang terkait nomor ini: memuat nomornya, atau membalas email yang kita kirim.
      const base = { since: new Date(sentAt.getTime() - 3600e3), from: 'whatsapp' };
      const set = new Set();
      const add = async (q) => { try { (await client.search(q, { uid: true }) || []).forEach((x) => set.add(x)); } catch {} };
      const digits = String(row.phone || '').replace(/\D/g, '');
      if (digits.length >= 8) await add({ ...base, text: digits });
      if (row.message_id) {
        await add({ ...base, header: { 'in-reply-to': row.message_id } });
        await add({ ...base, header: { references: row.message_id } });
      }
      const uids = [...set];
      if (uids.length) {
        for await (const m of client.fetch(uids.slice(-20), { internalDate: true }, { uid: true })) {
          const d = new Date(m.internalDate);
          if (d > sentAt && (!found || d < found)) found = d;
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    try { client.close(); } catch {}
    const denied = /Invalid credentials|AUTHENTICATIONFAILED|Username and Password/i.test(String(e?.message || e));
    return json({ replied: false, error: denied ? 'Login Gmail ditolak saat cek balasan.' : 'Gagal cek Gmail, akan dicoba lagi.' });
  }

  if (!found) return json({ replied: false });
  await db().from('send_log').update({ replied_at: found.toISOString() }).eq('id', row.id);
  return json({ replied: true, repliedAt: found.toISOString(), phone: row.phone });
        }
