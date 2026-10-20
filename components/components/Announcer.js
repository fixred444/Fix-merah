'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/client';

const SHOW_MS = 7000;      // lama tampil notifikasi teks
const MAX_VOICE_MS = 90000; // batas aman untuk VN
const POLL_MS = 12000;
const KEY = 'fm_notif_seen';

// Notifikasi dari admin (teks atau VN) yang muncul di atas layar beberapa detik.
export default function Announcer() {
  const [cur, setCur] = useState(null);
  const [shown, setShown] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [mounted, setMounted] = useState(false);
  const audioRef = useRef(null);
  const hideT = useRef(null);
  const startedAt = useRef(0);

  useEffect(() => { setMounted(true); }, []);

  const hide = useCallback(() => {
    clearTimeout(hideT.current);
    setShown(false);
    setTimeout(() => setCur(null), 350);
  }, []);

  const check = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const r = await api('/api/announcements');
      const items = r.items || [];
      let seen = '';
      try { seen = localStorage.getItem(KEY) || ''; } catch {}
      const cutoff = seen ? new Date(seen).getTime() : Date.now() - 10 * 60e3;
      const fresh = items.filter((x) => new Date(x.createdAt).getTime() > cutoff);
      if (!fresh.length) return;
      const latest = fresh[0]; // daftar dari server: terbaru dulu
      try { localStorage.setItem(KEY, latest.createdAt); } catch {}
      setCur(latest);
    } catch { /* diam saja, dicoba lagi */ }
  }, []);

  useEffect(() => {
    const first = setTimeout(check, 1500);
    const t = setInterval(check, POLL_MS);
    const vis = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearTimeout(first); clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [check]);

  useEffect(() => {
    if (!cur) return undefined;
    setBlocked(false);
    startedAt.current = Date.now();
    const raf = requestAnimationFrame(() => setShown(true));
    hideT.current = setTimeout(hide, cur.audioUrl ? MAX_VOICE_MS : SHOW_MS);
    const a = audioRef.current;
    if (a) {
      const p = a.play();
      if (p && p.catch) p.catch(() => setBlocked(true));
    }
    return () => { cancelAnimationFrame(raf); clearTimeout(hideT.current); };
  }, [cur, hide]);

  // VN selesai: tutup setelah minimal 7 detik sejak muncul.
  const onEnded = () => {
    clearTimeout(hideT.current);
    const left = Math.max(1500, SHOW_MS - (Date.now() - startedAt.current));
    hideT.current = setTimeout(hide, left);
  };

  if (!mounted || !cur) return null;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', left: 10, right: 10, top: 'max(10px, env(safe-area-inset-top))', zIndex: 1100,
        maxWidth: 520, margin: '0 auto', background: '#111', color: '#fff', border: '3px solid #e63946',
        borderRadius: 16, padding: '12px 14px', boxShadow: '0 8px 24px rgba(0,0,0,.35)',
        transform: shown ? 'translateY(0)' : 'translateY(-130%)', opacity: shown ? 1 : 0,
        transition: 'transform .3s ease, opacity .3s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span aria-hidden="true" style={{ fontSize: 22 }}>{'\u{1F4E3}'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: 13, opacity: 0.8 }}>Pengumuman</b>
          {cur.text && <span style={{ display: 'block', overflowWrap: 'anywhere' }}>{cur.text}</span>}
          {cur.audioUrl && (
            <span style={{ display: 'block', fontSize: 14, opacity: 0.9 }}>
              {'\u{1F3A4}'} Pesan suara
              {blocked && (
                <button type="button" className="chip" style={{ marginLeft: 8 }} onClick={() => { const a = audioRef.current; if (a) a.play().then(() => setBlocked(false)).catch(() => {}); }}>Putar</button>
              )}
            </span>
          )}
        </div>
        <button type="button" onClick={hide} aria-label="Tutup notifikasi" style={{ background: 'none', border: 0, color: '#fff', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>&times;</button>
      </div>
      {cur.audioUrl && <audio key={cur.id} ref={audioRef} src={cur.audioUrl} preload="auto" onEnded={onEnded} />}
    </div>,
    document.body
  );
}
