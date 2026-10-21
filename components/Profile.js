'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import Avatar from './Avatar';
import Verified from './Verified';
import PersonRow from './PersonRow';

export default function Profile({ head, id, onProfile, onDm }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ name: '', bio: '', hideSeen: false });
  const [list, setList] = useState(null); // { kind, items }
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try { const r = await api(`/api/profile?id=${encodeURIComponent(id)}`); setP(r.profile); setErr(''); } catch (e) { setErr(e.message); }
  }, [id]);
  useEffect(() => { setP(null); setList(null); setEdit(false); setMsg(''); load(); }, [load]);

  const run = async (fn, ok) => {
    setBusy(true); setErr(''); setMsg('');
    try { await fn(); if (ok) setMsg(ok); await load(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const showList = async (kind) => {
    if (list?.kind === kind) { setList(null); return; }
    try { const r = await api(`/api/profile?id=${p.id}&list=${kind}`); setList({ kind, items: r.items || [] }); } catch (e) { setErr(e.message); }
  };
  const toggleRow = async (x) => {
    try {
      await api(x.isFollowing ? `/api/follow?id=${x.id}` : '/api/follow', x.isFollowing ? { method: 'DELETE' } : { method: 'POST', body: JSON.stringify({ id: x.id }) });
      setList((c) => ({ ...c, items: c.items.map((y) => (y.id === x.id ? { ...y, isFollowing: !x.isFollowing } : y)) }));
    } catch (e) { setErr(e.message); }
  };

  if (!p) return <section className="card fade">{head}{err ? <p className="note err" role="status">{err}</p> : <p className="muted">Memuat&hellip;</p>}</section>;

  const stat = (n, label, kind) => (
    <button type="button" onClick={() => showList(kind)} aria-pressed={list?.kind === kind} style={{ background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', textAlign: 'center' }}>
      <b style={{ display: 'block', fontSize: '1.3rem' }}>{n}</b><small className="muted" style={{ textDecoration: list?.kind === kind ? 'underline' : 'none' }}>{label}</small>
    </button>
  );

  return (
    <section className="card fade">
      {head}
      {err && <p className="note err" role="status">{err}</p>}
      {msg && <p className="note ok" role="status">{msg}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Avatar name={p.name} size={72} />
        <div style={{ minWidth: 0 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', margin: 0, overflowWrap: 'anywhere' }}>{p.name}{p.verified && <Verified size={22} />}</h2>
          {p.isMe && <small className="muted">Ini profilmu</small>}
        </div>
      </div>
      {p.bio && <p style={{ overflowWrap: 'anywhere' }}>{p.bio}</p>}
      <div style={{ display: 'flex', gap: 28 }}>{stat(p.followers, 'Pengikut', 'followers')}{stat(p.following, 'Mengikuti', 'following')}</div>

      {!p.isMe && (
        <div className="acts" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn small" disabled={busy} onClick={() => run(() => api(p.isFollowing ? `/api/follow?id=${p.id}` : '/api/follow', p.isFollowing ? { method: 'DELETE' } : { method: 'POST', body: JSON.stringify({ id: p.id }) }))}>{p.isFollowing ? 'Berhenti mengikuti' : 'Ikuti'}</button>
          <button type="button" className="btn small" style={{ background: 'var(--chip)', color: 'var(--text)', boxShadow: 'none' }} onClick={() => onDm(p.id)}>Kirim pesan</button>
        </div>
      )}

      {list && (
        <ul className="list">
          {list.items.length === 0 && <li className="empty">Belum ada.</li>}
          {list.items.map((x) => <PersonRow key={x.id} p={x} onOpen={onProfile} onToggleFollow={toggleRow} />)}
        </ul>
      )}

      {p.isMe && (
        <>
          {!edit ? <button type="button" className="chip" onClick={() => { setForm({ name: p.name, bio: p.bio, hideSeen: !!p.hideSeen }); setEdit(true); }}>Ubah profil</button> : (
            <form onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/api/profile', { method: 'PUT', body: JSON.stringify(form) }); setEdit(false); }, 'Profil disimpan.'); }}>
              <label>Nama<input required minLength={2} maxLength={30} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label>Bio<textarea rows={3} maxLength={160} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Ceritakan sedikit tentang dirimu" /></label>
              <label className="inline"><input type="checkbox" checked={form.hideSeen} onChange={(e) => setForm({ ...form, hideSeen: e.target.checked })} /> Sembunyikan &ldquo;terakhir dilihat&rdquo;</label>
              <button className="btn small" disabled={busy}>Simpan</button>
              <button type="button" className="chip" onClick={() => setEdit(false)}>Batal</button>
            </form>
          )}

          <h3>Centang biru</h3>
          {p.verified && <p className="note ok">Akunmu sudah bercentang biru.</p>}
          {!p.verified && p.verifyStatus === 'pending' && <p className="note ok">Permintaanmu sedang menunggu persetujuan admin.</p>}
          {!p.verified && p.verifyStatus === 'rejected' && <p className="note err">Permintaan sebelumnya belum disetujui{p.verifyNote ? `: ${p.verifyNote}` : '.'} Kamu boleh mengajukan lagi.</p>}
          {!p.verified && p.verifyStatus !== 'pending' && (
            <form onSubmit={(e) => { e.preventDefault(); run(() => api('/api/verify', { method: 'POST', body: JSON.stringify({ note }) }), 'Permintaan terkirim ke admin.'); setNote(''); }}>
              <label>Alasan (boleh dikosongkan)<input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mengapa akunmu perlu diverifikasi?" /></label>
              <button className="btn small" disabled={busy}>Ajukan centang biru</button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
