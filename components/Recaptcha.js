'use client';
import { useEffect, useRef } from 'react';

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || '';
export const captchaOn = !!SITE_KEY;
export const captchaV3 = process.env.NEXT_PUBLIC_RECAPTCHA_VERSION === 'v3';

let loading = null;
function loadScript() {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = captchaV3 ? `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}` : 'https://www.google.com/recaptcha/api.js?render=explicit';
    s.async = true; s.defer = true;
    s.onload = () => window.grecaptcha.ready(resolve);
    s.onerror = () => { loading = null; reject(new Error('Captcha gagal dimuat')); };
    document.head.appendChild(s);
  });
  return loading;
}

// v3: ambil token tanpa tampilan (dipanggil saat submit).
export async function tokenV3(action) {
  await loadScript();
  return window.grecaptcha.execute(SITE_KEY, { action });
}

// v2: kotak "Saya bukan robot". resetKey diubah untuk mengulang kotaknya.
export default function Recaptcha({ onToken, resetKey }) {
  const box = useRef(null);
  const id = useRef(null);

  useEffect(() => {
    if (!captchaOn || captchaV3) return undefined;
    let dead = false;
    loadScript().then(() => {
      if (dead || !box.current || id.current !== null) return;
      id.current = window.grecaptcha.render(box.current, {
        sitekey: SITE_KEY,
        theme: document.documentElement.dataset.theme === 'comic' ? 'light' : 'dark',
        callback: (t) => onToken(t),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
    }).catch(() => {});
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (id.current !== null && window.grecaptcha) { try { window.grecaptcha.reset(id.current); } catch {} onToken(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  if (!captchaOn || captchaV3) return null;
  return <div ref={box} style={{ minHeight: 78, overflow: 'hidden' }} />;
}
