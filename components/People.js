'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import PersonRow from './PersonRow';

export default function People({ head, onProfile }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (term) => {
    try { const r = await api(`/api/profile?q=${encodeURIComponent(term)}`); setItems(r.items || []); setErr(''); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { const t = setTimeout(() => load(q.trim()), 250); return () => clearTimeout(t); }, [q, load]);

  const toggle = async (p) => {
    setBusy(true);
    try {
      await api(p.isFollowing ? `/api/follow?id=${p.id}` : '/api/follow', p.isFollowing ? { method: 'DELETE' } : { method: 'POST', body: JSON.stringify({ id: p.id }) });
      setItems((c) => c.map((x) => (x.id === p.id ? { ...x, isFollowing: !p.isFollowing } : x)));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <section className="card fade">
      {head}
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama pengguna" aria-label="Cari pengguna" maxLength={30} />
      {err && <p className="note err" role="status">{err}</p>}
      <ul className="list">
        {items === null && <li className="empty">Memuat&hellip;</li>}
        {items && items.length === 0 && <li className="empty">{q ? 'Tidak ada yang cocok.' : 'Belum ada pengguna lain.'}</li>}
        {items && items.map((p) => <PersonRow key={p.id} p={p} onOpen={onProfile} onToggleFollow={toggle} busy={busy} />)}
      </ul>
    </section>
  );
}
