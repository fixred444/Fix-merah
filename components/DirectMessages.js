'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, supabase } from '@/lib/client';
import Avatar from './Avatar';
import Verified from './Verified';

const hhmm = (iso) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
// Kecilkan foto (maks 1600px, JPEG) supaya cepat terkirim dan muat di batas 5 MB.
async function shrink(file) {
  if (file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    return blob ? new File([blob], 'foto.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

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

const dayKey = (iso) => new Date(iso).toDateString();
function dayLabel(iso) {
  const d = new Date(iso); const t = new Date();
  if (d.toDateString() === t.toDateString()) return 'Hari ini';
  const y = new Date(t); y.setDate(t.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Kemarin';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}
function seenText(iso, now) {
  if (!iso) return '';
  if (now - new Date(iso).getTime() < 90e3) return 'online';
  const d = new Date(iso); const t = new Date(now);
  const jam = hhmm(iso);
  if (d.toDateString() === t.toDateString()) return `terakhir dilihat hari ini ${jam}`;
  const y = new Date(t); y.setDate(t.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `terakhir dilihat kemarin ${jam}`;
  return `terakhir dilihat ${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} ${jam}`;
}

function Thread({ head, peerId, onBack, onProfile }) {
  const [peer, setPeer] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [readUpTo, setReadUpTo] = useState(0);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const [sel, setSel] = useState('');
  const [photo, setPhoto] = useState(null); // { file, url }
  const fileRef = useRef(null);
  const [now, setNow] = useState(() => Date.now());
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

  useEffect(() => { setMsgs([]); last.current = ''; stick.current = true; setPeer(null); setReadUpTo(0); setSel(''); }, [peerId]);

  const poll = useCallback(async () => {
    if (document.hidden) return;
    try {
      const r = await api(`/api/dm?with=${peerId}${last.current ? `&after=${encodeURIComponent(last.current)}` : ''}`);
      setPeer(r.peer); setErr(''); setNow(Date.now());
      if (r.readUpTo) setReadUpTo(new Date(r.readUpTo).getTime());
      merge(r.items || []);
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
    if ((!body && !photo) || sending) return;
    setSending(true); setErr('');
    try {
      let imagePath = null;
      if (photo) {
        const file = await shrink(photo.file);
        const slot = await api('/api/dm', { method: 'POST', body: JSON.stringify({ to: peerId, step: 'sign', image: { type: file.type, size: file.size } }) });
        const up = await supabase.storage.from('stories').uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type });
        if (up.error) throw new Error('Gagal mengunggah foto. Coba lagi.');
        imagePath = slot.path;
      }
      const r = await api('/api/dm', { method: 'POST', body: JSON.stringify({ to: peerId, body, imagePath }) });
      setText(''); clearPhoto(); stick.current = true; merge([r.item]);
    } catch (e2) { setErr(e2.message); }
    setSending(false);
  };
  const clearPhoto = () => { setPhoto((p) => { if (p) URL.revokeObjectURL(p.url); return null; }); if (fileRef.current) fileRef.current.value = ''; };
  const pick = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { setErr('Pilih file foto.'); return; }
    setErr(''); setPhoto((p) => { if (p) URL.revokeObjectURL(p.url); return { file: f, url: URL.createObjectURL(f) }; });
  };
  const del = async (m) => {
    if (!window.confirm('Hapus pesan ini?')) return;
    try { await api(`/api/dm?id=${m.id}`, { method: 'DELETE' }); setMsgs((c) => c.filter((x) => x.id !== m.id)); setSel(''); } catch (e) { setErr(e.message); }
  };

  const st = peer ? seenText(peer.lastSeenAt, now) : '';
  return (
    <section className="card fade">
      {head}
      <div className="dmhead">
        <button type="button" className="chip" onClick={onBack} aria-label="Kembali ke semua pesan">&larr;</button>
        {peer && (
          <button type="button" className="who" onClick={() => onProfile(peerId)}>
            <Avatar name={peer.name} size={38} />
            <span style={{ minWidth: 0 }}>
              <b style={{ display: 'flex', alignItems: 'center' }}>{peer.name}{peer.verified && <Verified />}</b>
              {st && <span className={st === 'online' ? 'st on' : 'st'}>{st === 'online' ? '● online' : st}</span>}
            </span>
          </button>
        )}
        {peer && <button type="button" className="chip callbtn" onClick={() => window.dispatchEvent(new CustomEvent('fm-call', { detail: { id: peerId, name: peer.name, verified: peer.verified } }))} aria-label={`Telepon ${peer.name}`}>{'\u{1F4DE}'}</button>}
      </div>
      <div ref={boxRef} onScroll={onScroll} className="dmbox" role="log" aria-live="polite" aria-label="Pesan pribadi">
        {msgs.length === 0 && <p className="muted" style={{ textAlign: 'center', margin: 'auto' }}>Belum ada pesan. Mulai percakapan.</p>}
        {msgs.map((m, i) => {
          const prev = msgs[i - 1];
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          const gap = !prev || prev.mine !== m.mine || newDay;
          const read = m.mine && (m.read || new Date(m.createdAt).getTime() <= readUpTo);
          return (
            <div key={m.id} style={{ display: 'contents' }}>
              {newDay && <span className="dmday">{dayLabel(m.createdAt)}</span>}
              <div className={`bub ${m.mine ? 'me' : 'them'}${gap ? ' gap' : ''}`} onClick={() => m.mine && setSel(sel === m.id ? '' : m.id)}>
                {m.image && <img src={m.image} alt="Foto kiriman" className="dmimg" loading="lazy" onClick={(ev) => { ev.stopPropagation(); window.open(m.image, '_blank', 'noopener'); }} />}
                {m.body && <span>{m.body}</span>}
                <span className="meta">
                  {hhmm(m.createdAt)}
                  {m.mine && <span className={read ? 'tick read' : 'tick'} aria-label={read ? 'Dibaca' : 'Terkirim'}>{'✓✓'}</span>}
                </span>
              </div>
              {sel === m.id && <button type="button" className="chip danger bubact" onClick={() => del(m)}>Hapus pesan</button>}
            </div>
          );
        })}
      </div>
      {err && <p className="note err" role="status">{err}</p>}
      {photo && (
        <div className="dmprev">
          <img src={photo.url} alt="Foto yang akan dikirim" />
          <button type="button" className="chip" onClick={clearPhoto}>Batalkan foto</button>
        </div>
      )}
      <form onSubmit={send} className="dmform">
        <input ref={fileRef} type="file" accept="image/*" onChange={pick} hidden />
        <button type="button" className="attach" onClick={() => fileRef.current && fileRef.current.click()} aria-label="Kirim foto" disabled={sending}>{'\u{1F4F7}'}</button>
        <input value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Tulis pesan…" aria-label="Tulis pesan" autoComplete="off" />
        <button className="send" disabled={sending || (!text.trim() && !photo)} aria-label="Kirim">&#10148;</button>
      </form>
    </section>
  );
}

export default function DirectMessages({ head, peerId, onPick, onFind, onProfile }) {
  return peerId
    ? <Thread head={head} peerId={peerId} onBack={() => onPick(null)} onProfile={onProfile} />
    : <Inbox head={head} onPick={onPick} onFind={onFind} />;
}
