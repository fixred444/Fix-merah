'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';

function b64ToU8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Mendaftarkan service worker, lalu menawarkan tombol "Aktifkan notifikasi HP".
export default function PushPrompt() {
  const [state, setState] = useState('hidden'); // hidden | ask | busy | on | denied | ios
  const [err, setErr] = useState('');

  const sync = useCallback(async (reg) => {
    const sub = await reg.pushManager.getSubscription();
    if (sub) { try { await api('/api/push', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) }); } catch {} return 'on'; }
    return Notification.permission === 'denied' ? 'denied' : 'ask';
  }, []);

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator)) return;
      const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      if (!('PushManager' in window) || !('Notification' in window)) { if (isIOS && !standalone) setState('ios'); return; }
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        const { publicKey } = await api('/api/push');
        if (!publicKey) return; // server belum diatur VAPID
        setState(await sync(reg));
      } catch { /* abaikan */ }
    })();
  }, [sync]);

  const enable = async () => {
    setErr(''); setState('busy');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'ask'); return; }
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await api('/api/push');
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) });
      await api('/api/push', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) });
      setState('on');
    } catch (e) { setErr(e.message || 'Gagal mengaktifkan'); setState('ask'); }
  };

  const disable = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await api('/api/push', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
      setState('ask');
    } catch {}
  };

  if (state === 'hidden') return null;
  if (state === 'on') return <p className="muted" style={{ fontSize: '.8rem', textAlign: 'right' }}>Notifikasi HP aktif · <button type="button" className="link" onClick={disable}>matikan</button></p>;
  return (
    <div className="note ok" role="region" aria-label="Notifikasi HP" style={{ display: 'grid', gap: 8 }}>
      {state === 'ios' && <span>Untuk notifikasi di iPhone: buka menu Bagikan di Safari, pilih <b>Tambah ke Layar Utama</b>, lalu buka Fix Merah dari ikon itu dan aktifkan notifikasi.</span>}
      {state === 'denied' && <span>Notifikasi diblokir untuk situs ini. Aktifkan lewat ikon gembok di address bar &rarr; Izin &rarr; Notifikasi, lalu muat ulang.</span>}
      {(state === 'ask' || state === 'busy') && (
        <>
          <span>Aktifkan notifikasi agar pengumuman admin muncul di panel notifikasi HP kamu, seperti notifikasi biasa.</span>
          <button type="button" className="btn small" onClick={enable} disabled={state === 'busy'}>{state === 'busy' ? 'Memproses…' : 'Aktifkan notifikasi'}</button>
          {err && <span className="err">{err}</span>}
        </>
      )}
    </div>
  );
}
