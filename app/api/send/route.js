import nodemailer from 'nodemailer';
import { db, getUser, json, decrypt, startOfTodayWIB } from '@/lib/server';

export const runtime = 'nodejs';

export async function POST(req) {
  const u = await getUser(req);
  if (!u) return json({ error: 'Belum masuk' }, 401);
  if (u.status === 'beku') return json({ error: 'Akunmu sedang dibekukan admin, belum bisa mengirim.' }, 403);
  let body; try { body = await req.json(); } catch { return json({ error: 'Permintaan tidak valid' }, 400); }
  const { accountId, numberId, templateId, targetId, senderMode = 'personal' } = body;
  if (!['personal', 'global'].includes(senderMode)) return json({ error: 'Mode pengirim tidak valid' }, 400);

  const since = startOfTodayWIB();
  const perNumber = Math.max(1, Math.min(10, Number(process.env.PER_NUMBER_LIMIT || 3)));
  const [{ data: setting }, { data: num }, { data: tpl }, { data: tgt }, { data: sentToday }] = await Promise.all([
    db().from('app_settings').select('value').eq('key', 'daily_user_limit').maybeSingle(),
    db().from('numbers').select('*').eq('id', numberId).eq('user_id', u.id).maybeSingle(),
    db().from('templates').select('*').eq('id', templateId).maybeSingle(),
    db().from('targets').select('*').eq('id', targetId).eq('active', true).maybeSingle(),
    db().from('send_log').select('phone').eq('user_id', u.id).eq('status', 'terkirim').gte('created_at', since),
  ]);
  if (!num || !tpl || !tgt) return json({ error: 'Pilihan tidak lengkap atau tidak ditemukan' }, 400);
  const dailyLimit = Math.max(1, Math.min(100, Number(setting?.value || process.env.DAILY_LIMIT || 10)));
  const rows = sentToday || [];
  if (rows.length >= dailyLimit) return json({ error: `Kuota harian akunmu (${dailyLimit}) sudah tercapai.` }, 429);
  if (rows.filter((r) => r.phone === num.phone).length >= perNumber) return json({ error: `Nomor ini sudah dikirim ${perNumber}x hari ini.` }, 429);

  let sender;
  if (senderMode === 'personal') {
    const { data } = await db().from('accounts').select('*').eq('id', accountId).eq('user_id', u.id).maybeSingle();
    if (!data) return json({ error: 'Pilih akun Gmail pribadi yang valid' }, 400);
    sender = data;
  } else {
    // Hanya akun yang pemiliknya secara eksplisit mengaktifkan berbagi.
    const { data: pool } = await db().from('accounts').select('*').eq('shared_enabled', true).order('created_at', { ascending: true });
    const { data: blocked } = await db().from('user_status').select('user_id').in('status', ['beku', 'nonaktif']);
    const blockedIds = new Set((blocked || []).map((b) => b.user_id));
    const usable = (pool || []).filter((a) => !blockedIds.has(a.user_id));
    if (!usable.length) return json({ error: 'Belum ada akun yang secara sukarela bergabung ke Sender Global.' }, 400);
    // Batas harian per pengirim menjaga batas penyedia email; rotasi bukan untuk melewati batas layanan.
    const eligible = [];
    for (const a of usable) {
      const { count } = await db().from('send_log').select('id', { count: 'exact', head: true }).eq('account_email', a.email).eq('status', 'terkirim').gte('created_at', since);
      if ((count || 0) < Math.max(1, Math.min(20, Number(process.env.PER_SENDER_DAILY_LIMIT || 10)))) eligible.push(a);
    }
    if (!eligible.length) return json({ error: 'Semua pengirim global telah mencapai batas harian. Coba lagi besok.' }, 429);
    const { count: globalSent } = await db().from('send_log').select('id', { count: 'exact', head: true }).eq('status', 'terkirim').gte('created_at', since);
    sender = eligible[(globalSent || 0) % eligible.length];
  }

  const fill = (s) => String(s || '').replaceAll('{nomor}', num.phone);
  const log = (status, error) => db().from('send_log').insert({ user_id: u.id, account_email: sender.email, phone: num.phone, target_email: tgt.email, template_title: tpl.title, status, error: error || null }).select('id').single();
  try {
    const transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: sender.email, pass: decrypt(sender.app_password_enc) } });
    await transporter.sendMail({ from: sender.email, to: tgt.email, subject: fill(tpl.subject), text: fill(tpl.body) });
    const { data: logRow } = await log('terkirim');
    return json({ ok: true, senderEmail: sender.email, senderMode, logId: logRow?.id || null });
  } catch (e) {
    const msg = /Invalid login|Username and Password/i.test(e.message) ? 'Login Gmail ditolak. Pemilik akun perlu memeriksa App Password.' : 'Gagal mengirim email. Coba lagi nanti.';
    await log('gagal', String(e.message || 'error').slice(0, 200));
    return json({ error: msg }, 502);
  }
}
