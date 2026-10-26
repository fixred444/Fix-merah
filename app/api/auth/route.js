import { createClient } from '@supabase/supabase-js';
import { db, json } from '@/lib/server';

export const runtime = 'nodejs';

// Verifikasi token reCAPTCHA (v2 checkbox atau v3). Bila RECAPTCHA_SECRET_KEY belum diisi, pemeriksaan dilewati.
async function captchaOk(token, ip, action) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return true;
  if (!token || typeof token !== 'string') return false;
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set('remoteip', ip);
  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'POST', body: form });
  const d = await res.json().catch(() => ({}));
  if (!d.success) return false;
  if (typeof d.score === 'number') return d.score >= 0.5 && (!d.action || d.action === action);
  return true;
}

// Masuk / daftar lewat server supaya captcha benar-benar diperiksa.
export async function POST(req) {
  try {
    let b; try { b = await req.json(); } catch { return json({ error: 'Permintaan tidak valid' }, 400); }
    const mode = b.mode === 'daftar' ? 'daftar' : 'masuk';
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Email tidak valid.' }, 400);
    if (password.length < 8) return json({ error: 'Kata sandi minimal 8 karakter.' }, 400);
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    if (!(await captchaOk(b.token, ip, mode))) return json({ error: 'Verifikasi captcha gagal. Coba lagi.' }, 400);

    if (mode === 'daftar') {
      const { error } = await db().auth.admin.createUser({ email, password, email_confirm: true });
      if (error) {
        const m = String(error.message || '');
        return json({ error: /already|registered|exists/i.test(m) ? 'Email ini sudah terdaftar. Silakan masuk.' : `Gagal mendaftar: ${m.slice(0, 120)}` }, 400);
      }
    }

    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data?.session) return json({ error: /invalid login/i.test(error?.message || '') ? 'Email atau kata sandi salah.' : (error?.message || 'Gagal masuk.') }, 400);
    return json({ ok: true, access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch (e) {
    return json({ error: `Kesalahan server: ${String(e?.message || e).slice(0, 120)}` }, 500);
  }
}
