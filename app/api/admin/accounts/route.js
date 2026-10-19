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

  let candidates;
  if (senderMode === 'personal') {
    const { data } = await db().from('accounts').select('*').eq('id', accountId).eq('user_id', u.id).maybeSingle();
    if (!data) return json({ error: 'Pilih akun Gmail pribadi yang valid' }, 400);
    candidates = [data];
  } else {
    // Hanya akun yang pemiliknya secara eksplisit mengaktifkan berbagi.
    const { data: pool } = await db().from('accounts').select('*').eq('shared_enabled', true).order('created_at', { ascending: true });
    const { data: blocked } = await db().from('user_status').select('user_id').in('status', ['beku', 'nonaktif']);
    const blockedIds = new Set((blocked || []).map((b) => b.user_id));
    // Akun yang App Password-nya sudah terbukti salah dilewati supaya tidak bermasalah terus.
    const usable = (pool || []).filter((a) => !blockedIds.has(a.user_id) && !a.login_failed_at);
    if (!usable.length) return json({ error: 'Belum ada akun yang secara sukarela bergabung ke Sender Global.' }, 400);
    // Batas harian per pengirim menjaga batas penyedia email; rotasi bukan untuk melewati batas layanan.
    const eligible = [];
    for (const a of usable) {
      const { count } = await db().from('send_log').select('id', { count: 'exact', head: true }).eq('account_email', a.email).eq('status', 'terkirim').gte('created_at', since);
      if ((count || 0) < Math.max(1, Math.min(20, Number(process.env.PER_SENDER_DAILY_LIMIT || 10)))) eligible.push(a);
    }
    if (!eligible.length) return json({ error: 'Semua pengirim global telah mencapai batas harian. Coba lagi besok.' }, 429);
    const { count: globalSent } = await db().from('send_log').select('id', { count: 'exact', head: true }).eq('status', 'terkirim').gte('created_at', since);
    const start = (globalSent || 0) % eligible.length;
    candidates = eligible.slice(start).concat(eligible.slice(0, start)).slice(0, 5);
  }

  const fill = (s) => String(s || '').replaceAll('{nomor}', num.phone);
  const log = (email, status, error, messageId) => db().from('send_log').insert({ message_id: messageId || null, user_id: u.id, account_email: email, phone: num.phone, target_email: tgt.email, template_title: tpl.title, status, error: error || null }).select('id').single();
  const isAuthErr = (e) => /Invalid login|Username and Password|EAUTH|AUTH|\b53[45]\b/i.test(`${e?.code || ''} ${e?.responseCode || ''} ${e?.message || ''}`);

  let lastErr = null; let lastAuth = false; let lastEmail = '';
  for (const a of candidates) {
    try {
      const transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000, auth: { user: a.email, pass: decrypt(a.app_password_enc) } });
      const info = await transporter.sendMail({ from: a.email, to: tgt.email, subject: fill(tpl.subject), text: fill(tpl.body) });
      const { data: logRow } = await log(a.email, 'terkirim', null, info.messageId);
      if (a.login_failed_at) await db().from('accounts').update({ login_failed_at: null, login_error: null }).eq('id', a.id);
      return json({ ok: true, senderEmail: a.email, senderMode, logId: logRow?.id || null });
    } catch (e) {
      lastErr = e; lastEmail = a.email; lastAuth = isAuthErr(e);
      if (lastAuth) {
        await db().from('accounts').update({ login_failed_at: new Date().toISOString(), login_error: String(e.message || 'login ditolak').slice(0, 200) }).eq('id', a.id);
      }
      await log(a.email, 'gagal', String(e.message || 'error').slice(0, 200));
    }
  }
  let msg = 'Gagal mengirim email. Coba lagi nanti.';
  if (lastAuth) {
    msg = senderMode === 'personal'
      ? `Login Gmail ditolak untuk ${lastEmail}. App Password salah atau sudah dicabut. Hapus akun ini di menu Akun Gmail, lalu tambahkan lagi dengan App Password baru.`
      : 'Semua sender global yang dicoba gagal login (App Password salah). Akun bermasalah sudah ditandai untuk admin. Coba kirim lagi.';
  }
  return json({ error: msg }, 502);
}
