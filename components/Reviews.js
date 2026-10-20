'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';

const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const when = (iso) => new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

export default function Reviews({ head }) {
  const [data, setData] = useState({ items: [], avg: 0, count: 0, isAdmin: false });
  const [loaded, setLoaded] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [replying, setReplying] = useState(null); // id ulasan yang sedang dibalas
  const [replyText, setReplyText] = useState('');

  const load = useCallback(async () => {
    try { setData(await api('/api/reviews')); setLoaded(true); } catch (e) { setMsg({ err: true, t: e.message }); }
  }, []);
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 20000); return () => clearInterval(t); }, [load]);

  const run = async (fn, ok) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (ok) setMsg({ t: ok }); await load(); } catch (e) { setMsg({ err: true, t: e.message }); }
    setBusy(false);
  };

  return (
    <section className="card fade">
      {head}
      <p className="muted">{data.count ? <>Rata-rata <b>{data.avg}</b> / 5 dari {data.count} ulasan.</> : 'Belum ada ulasan. Jadilah yang pertama.'}</p>
      {msg && <p className={msg.err ? 'note err' : 'note ok'} role="status">{msg.t}</p>}

      <form onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/api/reviews', { method: 'POST', body: JSON.stringify({ rating, body }) }); setRating(0); setBody(''); }, 'Ulasan terkirim. Terima kasih!'); }}>
        <div role="radiogroup" aria-label="Beri bintang" style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} bintang`} onClick={() => setRating(n)}
              style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 30, lineHeight: 1, padding: 2, color: n <= rating ? '#f5b301' : 'var(--muted)' }}>{n <= rating ? '★' : '☆'}</button>
          ))}
        </div>
        <label>Ulasanmu<textarea rows={3} maxLength={500} required value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ceritakan pengalamanmu memakai Fix Merah" /></label>
        <button className="btn small" disabled={busy || !rating || body.trim().length < 3}>Kirim ulasan</button>
      </form>

      <ul className="list" style={{ marginTop: 18 }}>
        {!loaded && <li className="empty">Memuat&hellip;</li>}
        {loaded && data.items.length === 0 && <li className="empty">Belum ada ulasan.</li>}
        {data.items.map((r) => (
          <li key={r.id} style={{ display: 'grid', gap: 6, wordBreak: 'normal', overflowWrap: 'anywhere' }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <b>{r.mine ? 'Kamu' : r.author}</b>
              <span style={{ color: '#f5b301' }} aria-label={`${r.rating} dari 5 bintang`}>{stars(r.rating)}</span>
            </span>
            <span>{r.body}</span>
            <small className="muted">{when(r.createdAt)}</small>
            {r.reply && (
              <span style={{ display: 'block', borderLeft: '4px solid #e63946', paddingLeft: 10, marginTop: 2 }}>
                <small style={{ display: 'block', fontWeight: 700 }}>Balasan admin <span className="muted" style={{ fontWeight: 400 }}>&middot; {when(r.repliedAt)}</span></small>
                {r.reply}
              </span>
            )}
            {replying === r.id && (
              <span style={{ display: 'grid', gap: 8 }}>
                <textarea rows={2} maxLength={500} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Tulis balasan sebagai admin" autoFocus />
                <span className="acts">
                  <button type="button" className="chip" disabled={busy} onClick={() => run(async () => { await api('/api/reviews', { method: 'PUT', body: JSON.stringify({ id: r.id, reply: replyText }) }); setReplying(null); setReplyText(''); }, replyText.trim() ? 'Balasan terkirim.' : 'Balasan dihapus.')}>Simpan balasan</button>
                  <button type="button" className="chip" onClick={() => setReplying(null)}>Batal</button>
                </span>
              </span>
            )}
            <span className="acts">
              {data.isAdmin && replying !== r.id && <button type="button" className="chip" onClick={() => { setReplying(r.id); setReplyText(r.reply); }}>{r.reply ? 'Ubah balasan' : 'Balas'}</button>}
              {r.canDelete && <button type="button" className="chip danger" onClick={() => { if (window.confirm('Hapus ulasan ini?')) run(() => api(`/api/reviews?id=${r.id}`, { method: 'DELETE' }), 'Ulasan dihapus.'); }}>Hapus</button>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
