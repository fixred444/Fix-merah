'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import Verified from './Verified';

const POLL_MS = 3000;
const hhmm = (iso) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

export default function GlobalChat({ head, onProfile }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const boxRef = useRef(null);
  const stick = useRef(true);
  const last = useRef('');

  const merge = useCallback((incoming) => {
    if (!incoming.length) return;
    setMsgs((cur) => {
      const map = new Map(cur.map((m) => [m.id, m]));
      incoming.forEach((m) => map.set(m.id, m));
      const all = [...map.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      last.current = all.length ? all[all.length - 1].createdAt : '';
      return all.slice(-200);
    });
  }, []);

  const poll = useCallback(async () => {
    if (document.hidden) return;
    try {
      const r = await api(last.current ? `/api/chat?after=${encodeURIComponent(last.current)}` : '/api/chat');
      setErr('');
      merge(r.items || []);
    } catch (e) { setErr(e.message); }
  }, [merge]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, POLL_MS);
    const vis = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [poll]);

  // Gulir ke bawah hanya jika pengguna memang sedang di bawah.
  useEffect(() => {
    const el = boxRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);
  const onScroll = () => { const el = boxRef.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; };

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setErr('');
    try {
      const r = await api('/api/chat', { method: 'POST', body: JSON.stringify({ body }) });
      setText(''); stick.current = true; merge([r.item]);
    } catch (e2) { setErr(e2.message); }
    setSending(false);
  };

  const del = async (m) => {
    if (!window.confirm('Hapus pesan ini?')) return;
    try { await api(`/api/chat?id=${m.id}`, { method: 'DELETE' }); setMsgs((c) => c.filter((x) => x.id !== m.id)); } catch (e) { setErr(e.message); }
  };

  return (
    <section className="card fade">
      {head}
      <p className="muted">Ngobrol dengan semua pengguna. Pesan disimpan {7} hari. Jaga sopan santun dan jangan bagikan App Password.</p>
      <div ref={boxRef} onScroll={onScroll} role="log" aria-live="polite" aria-label="Pesan chat"
        style={{ height: 'min(55dvh, 460px)', overflowY: 'auto', display: 'grid', alignContent: 'start', gap: 8, padding: 10, borderRadius: 16, background: 'var(--field)' }}>
        {msgs.length === 0 && <p className="muted" style={{ textAlign: 'center', margin: 'auto' }}>Belum ada pesan. Sapa yang lain!</p>}
        {msgs.map((m) => (
          <div key={m.id} style={{ justifySelf: m.mine ? 'end' : 'start', maxWidth: '86%', padding: '8px 12px', borderRadius: 16, background: m.mine ? 'var(--accent)' : 'var(--chip)', color: m.mine ? 'var(--on-accent)' : 'var(--text)', overflowWrap: 'anywhere' }}>
            {!m.mine && (
              <b style={{ display: 'flex', alignItems: 'center', fontSize: '.8rem' }}>
                <button type="button" onClick={() => onProfile && onProfile(m.userId)} style={{ background: 'none', border: 0, color: 'inherit', font: 'inherit', fontWeight: 700, cursor: 'pointer', padding: 0, textAlign: 'left' }}>{m.author}</button>
                {m.verified && <Verified size={14} />}
                {m.isAdmin && <span className="tag ok" style={{ marginLeft: 6 }}>Admin</span>}
              </b>
            )}
            <span>{m.body}</span>
            <small style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', opacity: 0.7 }}>
              {hhmm(m.createdAt)}
              {m.canDelete && <button type="button" onClick={() => del(m)} aria-label="Hapus pesan" style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline' }}>hapus</button>}
            </small>
          </div>
        ))}
      </div>
      {err && <p className="note err" role="status">{err}</p>}
      <form onSubmit={send} style={{ gridTemplateColumns: '1fr auto', alignItems: 'center', marginTop: 4 }}>
        <input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="Tulis pesan…" aria-label="Tulis pesan" autoComplete="off" />
        <button className="btn small" style={{ marginTop: 0 }} disabled={sending || !text.trim()}>Kirim</button>
      </form>
    </section>
  );
}
