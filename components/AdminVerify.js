'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import Verified from './Verified';

const when = (iso) => (iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export default function AdminVerify({ onMsg }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => { setData(await api('/api/verify')); }, []);
  useEffect(() => { load().catch((e) => onMsg({ err: true, t: e.message })); }, [load, onMsg]);

  const act = async (u, action, okText) => {
    let note = '';
    if (action === 'reject') { const n = window.prompt('Alasan penolakan (boleh dikosongkan)', ''); if (n === null) return; note = n; }
    if (action === 'revoke' && !window.confirm(`Cabut centang biru ${u.name}?`)) return;
    setBusy(u.id); onMsg(null);
    try { await api('/api/verify', { method: 'PUT', body: JSON.stringify({ userId: u.id, action, note }) }); onMsg({ t: okText }); await load(); } catch (e) { onMsg({ err: true, t: e.message }); }
    setBusy('');
  };

  return (
    <section className="card fade">
      <h2>Centang biru</h2>
      <p className="muted">Akun admin otomatis bercentang biru. Akun pengguna baru bercentang setelah kamu setujui di sini.</p>
      <h3>Menunggu persetujuan</h3>
      <ul className="list">
        {!data && <li className="empty">Memuat&hellip;</li>}
        {data && data.pending.length === 0 && <li className="empty">Tidak ada permintaan.</li>}
        {data && data.pending.map((u) => (
          <li key={u.id} style={{ wordBreak: 'normal', alignItems: 'flex-start' }}>
            <span className="grow"><b>{u.name}</b>{u.bio && <small className="muted" style={{ display: 'block' }}>{u.bio}</small>}{u.note && <small style={{ display: 'block' }}>Alasan: {u.note}</small>}<small className="muted">{when(u.requestedAt)}</small></span>
            <span className="acts">
              <button type="button" className="chip" disabled={busy === u.id} onClick={() => act(u, 'approve', `${u.name} kini bercentang biru.`)}>Setujui</button>
              <button type="button" className="chip danger" disabled={busy === u.id} onClick={() => act(u, 'reject', 'Permintaan ditolak.')}>Tolak</button>
            </span>
          </li>
        ))}
      </ul>
      <h3>Sudah bercentang</h3>
      <ul className="list">
        {data && data.approved.length === 0 && <li className="empty">Belum ada.</li>}
        {data && data.approved.map((u) => (
          <li key={u.id} style={{ wordBreak: 'normal' }}>
            <span className="grow"><b style={{ display: 'flex', alignItems: 'center' }}>{u.name}<Verified /></b></span>
            <button type="button" className="chip danger" disabled={busy === u.id} onClick={() => act(u, 'revoke', 'Centang dicabut.')}>Cabut</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
