'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import Avatar from './Avatar';
import Verified from './Verified';

const hhmm = (iso) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const day = (iso) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

function Inbox({ head, onPick, onFind }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    if (document.hidden) return;
    try { const r = await api('/api/dm'); setItems(r.items || []); setErr(''); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);
  return (
    <section className="card fade">
      {head}
      {err && <p className="note err" role="status">{err}</p>}
      <ul className="list">
        {items === null && <li className="empty">Memuat&hellip;</li>}
        {items && items.length === 0 && <li className="empty">Belum ada pesan. Cari orang lalu tekan Kirim pesan.</li>}
        {(items || []).map((c) => (
          <li key={c.userId} style={{ wordBreak: 'normal' }}>
            <button type="button" onClick={() => onPick(c.userId)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 0, color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer', flex: 1, minWidth: 0, padding: 0 }}>
              <Avatar name={c.name} size={42} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <b style={{ display: 'flex', alignItems: 'center' }}>{c.name}{c.verified && <Verified />}</b>
                <small className="muted" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: c.unread ? 700 : 400 }}>{c.mine ? 'Kamu: ' : ''}{c.last}</small>
              </span>
              <small className="muted">{day(c.lastAt)}</small>
              {c.unread > 0 && <span className="badge" style={{ position: 'static' }}>{c.unread}</span>}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn small" onClick={onFind}>Cari orang untuk dikirimi pesan</button>
    </section>
  );
}

function Thread({ head, peerId, onBack, onProfile }) {
  const [peer, setPeer] = useState(null);
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

  useEffect(() => { setMsgs([]); last.current = ''; stick.current = true; setPeer(null); }, [peerId]);

  const poll = useCallback(async () => {
    if (document.hidden) return;
    try {
      const r = await api(`/api/dm?with=${peerId}${last.current ? `&after=${encodeURIComponent(last.current)}` : ''}`);
      setPeer(r.peer); setErr(''); merge(r.items || []);
    } catch (e) { setErr(e.message); }
  }, [peerId, merge]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 3000);
    const vis = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [poll]);

  useEffect(() => { const el = boxRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [msgs]);
  const onScroll = () => { const el = boxRef.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; };

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setErr('');
    try { const r = await api('/api/dm', { method: 'POST', body: JSON.stringify({ to: peerId, body }) }); setText(''); stick.current = true; merge([r.item]); } catch (e2) { setErr(e2.message); }
    setSending(false);
  };
  const del = async (m) => {
    if (!window.confirm('Hapus pesan ini?')) return;
    try { await api(`/api/dm?id=${m.id}`, { method: 'DELETE' }); setMsgs((c) => c.filter((x) => x.id !== m.id)); } catch (e) { setErr(e.message); }
  };

  return (
    <section className="card fade">
      {head}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" className="chip" onClick={onBack}>&larr; Semua pesan</button>
        {peer && (
          <button type="button" onClick={() => onProfile(peerId)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', minWidth: 0 }}>
            <Avatar name={peer.name} size={32} /><b style={{ display: 'flex', alignItems: 'center' }}>{peer.name}{peer.verified && <Verified />}</b>
          </button>
        )}
      </div>
      <div ref={boxRef} onScroll={onScroll} role="log" aria-live="polite" aria-label="Pesan pribadi"
        style={{ height: 'min(55dvh, 460px)', overflowY: 'auto', display: 'grid', alignContent: 'start', gap: 8, padding: 10, borderRadius: 16, background: 'var(--field)' }}>
        {msgs.length === 0 && <p className="muted" style={{ textAlign: 'center', margin: 'auto' }}>Belum ada pesan. Mulai percakapan.</p>}
        {msgs.map((m) => (
          <div key={m.id} style={{ justifySelf: m.mine ? 'end' : 'start', maxWidth: '86%', padding: '8px 12px', borderRadius: 16, background: m.mine ? 'var(--accent)' : 'var(--chip)', color: m.mine ? 'var(--on-accent)' : 'var(--text)', overflowWrap: 'anywhere' }}>
            <span>{m.body}</span>
            <small style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', opacity: 0.7 }}>
              {hhmm(m.createdAt)}
              {m.mine && <button type="button" onClick={() => del(m)} aria-label="Hapus pesan" style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline' }}>hapus</button>}
            </small>
          </div>
        ))}
      </div>
      {err && <p className="note err" role="status">{err}</p>}
      <form onSubmit={send} style={{ gridTemplateColumns: '1fr auto', alignItems: 'center', marginTop: 4 }}>
        <input value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Tulis pesan…" aria-label="Tulis pesan" autoComplete="off" />
        <button className="btn small" style={{ marginTop: 0 }} disabled={sending || !text.trim()}>Kirim</button>
      </form>
    </section>
  );
}

export default function DirectMessages({ head, peerId, onPick, onFind, onProfile }) {
  return peerId
    ? <Thread head={head} peerId={peerId} onBack={() => onPick(null)} onProfile={onProfile} />
    : <Inbox head={head} onPick={onPick} onFind={onFind} />;
}
